'use client';

import { useCallback, useMemo } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import type { HardwareConfig } from '@/components/inference/types';
import { useBenchmarks } from '@/hooks/api/use-benchmarks';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { getHardwareKey } from '@/lib/chart-utils';
import { getModelSortIndex, getHardwareConfig, getGpuSpecs } from '@/lib/constants';
import type { Model, Sequence } from '@/lib/data-mappings';

import {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  monotoneSlopes,
  paretoFrontUpperLeft,
  sign,
} from './interpolation';
import type { CostProvider, GPUDataPoint, InterpolatedResult } from './types';

// Re-export pure functions so existing imports from this module keep working.
export {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  monotoneSlopes,
  paretoFrontUpperLeft,
  sign,
};

/** Cost per million tokens: costPerHour / (tokPerSec * 3600 / 1_000_000) */
const computeGpuCost = (costPerHour: number, tps: number) =>
  costPerHour && tps > 0 ? costPerHour / ((tps * 3600) / 1_000_000) : 0;

export function useThroughputData(
  selectedModel: Model,
  selectedSequence: Sequence,
  selectedPrecisions: string[],
  selectedRunDate: string,
) {
  // Reuse the same API + React Query cache as the inference charts
  const {
    data: allRows,
    isLoading: queryLoading,
    error: queryError,
  } = useBenchmarks(selectedModel, selectedRunDate);

  const loading = queryLoading || !allRows;
  const error = queryError ? queryError.message : null;

  // Build GPUDataPoints directly from raw rows, skipping transformBenchmarkRows.
  // This avoids the expensive roofline/chart-data pipeline that isn't needed for interpolation.
  const { gpuDataByGroupKey, hardwareConfig, hasData } = useMemo(() => {
    if (!allRows)
      return {
        gpuDataByGroupKey: {} as Record<string, GPUDataPoint[]>,
        hardwareConfig: {} as HardwareConfig,
        hasData: false,
      };
    const seqIslOsl = sequenceToIslOsl(selectedSequence);
    if (!seqIslOsl)
      return {
        gpuDataByGroupKey: {} as Record<string, GPUDataPoint[]>,
        hardwareConfig: {} as HardwareConfig,
        hasData: false,
      };

    const multiPrecision = selectedPrecisions.length > 1;
    const grouped: Record<string, GPUDataPoint[]> = {};
    const hwConfigMap: HardwareConfig = {};

    for (const row of allRows) {
      if (row.isl !== seqIslOsl.isl || row.osl !== seqIslOsl.osl) continue;
      if (!selectedPrecisions.includes(row.precision)) continue;

      const entry = rowToAggDataEntry(row);
      const hwKey = getHardwareKey(entry);
      const hwConfig = getHardwareConfig(hwKey);
      if (!hwConfig) continue;

      if (!hwConfigMap[hwKey]) hwConfigMap[hwKey] = { ...hwConfig, name: hwKey };

      const m = row.metrics;
      const tput = m.tput_per_gpu ?? 0;
      const outputTput = m.output_tput_per_gpu ?? tput;
      const inputTput = m.input_tput_per_gpu ?? 0;
      const specs = getGpuSpecs(hwKey);
      const power = specs.power;

      const groupKey = multiPrecision ? `${hwKey}__${row.precision}` : hwKey;
      if (!grouped[groupKey]) grouped[groupKey] = [];

      grouped[groupKey].push({
        hwKey,
        interactivity: m.median_intvty ?? 0,
        throughput: tput,
        outputThroughput: outputTput,
        inputThroughput: inputTput,
        concurrency: row.conc,
        tp: row.decode_tp,
        precision: row.precision,
        ep: row.decode_ep,
        dp_attention: row.decode_dp_attention,
        disagg: row.disagg,
        costh: computeGpuCost(specs.costh, tput),
        costn: computeGpuCost(specs.costn, tput),
        costr: computeGpuCost(specs.costr, tput),
        costhi: computeGpuCost(specs.costh, inputTput),
        costni: computeGpuCost(specs.costn, inputTput),
        costri: computeGpuCost(specs.costr, inputTput),
        costhOutput: computeGpuCost(specs.costh, outputTput),
        costnOutput: computeGpuCost(specs.costn, outputTput),
        costrOutput: computeGpuCost(specs.costr, outputTput),
        tpPerMw: power && power > 0 ? (tput * 1000) / power : 0,
        inputTpPerMw: power && power > 0 ? (inputTput * 1000) / power : 0,
        outputTpPerMw: power && power > 0 ? (outputTput * 1000) / power : 0,
      });
    }

    // Sort hardware config
    const sortedKeys = Object.keys(hwConfigMap).toSorted(
      (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
    );
    const config: HardwareConfig = {};
    sortedKeys.forEach((key) => {
      config[key] = hwConfigMap[key];
    });

    return {
      gpuDataByGroupKey: grouped,
      hardwareConfig: config,
      hasData: Object.keys(grouped).length > 0,
    };
  }, [allRows, selectedSequence, selectedPrecisions]);

  // All available GPU hardware keys from data, ordered by hardwareConfig (HARDWARE_CONFIG order)
  // This returns unique GPU-level hwKeys (not composite keys) for the legend
  const availableHwKeys = useMemo(() => {
    // Extract unique hwKeys from group keys (strip __precision suffix if present)
    const dataHwKeys = new Set<string>();
    for (const groupKey of Object.keys(gpuDataByGroupKey)) {
      const hwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
      dataHwKeys.add(hwKey);
    }
    // Use hardwareConfig key order (already sorted by HARDWARE_CONFIG), then append any extras
    const ordered = Object.keys(hardwareConfig).filter((k) => dataHwKeys.has(k));
    // Add any keys in data but not in hardwareConfig at the end
    for (const k of dataHwKeys) {
      if (!hardwareConfig[k]) ordered.push(k);
    }
    return ordered;
  }, [gpuDataByGroupKey, hardwareConfig]);

  // Compute global ranges from GPUDataPoints
  const ranges = useMemo(() => {
    const allPoints = Object.values(gpuDataByGroupKey).flat();
    if (allPoints.length === 0) {
      return {
        interactivity: { min: 0, max: 100 },
        throughput: { min: 0, max: 1000 },
      };
    }

    let minIntvty = Infinity,
      maxIntvty = -Infinity,
      minTput = Infinity,
      maxTput = -Infinity;
    for (const p of allPoints) {
      if (p.interactivity < minIntvty) minIntvty = p.interactivity;
      if (p.interactivity > maxIntvty) maxIntvty = p.interactivity;
      if (p.throughput < minTput) minTput = p.throughput;
      if (p.throughput > maxTput) maxTput = p.throughput;
    }

    return {
      interactivity: {
        min: Math.ceil(minIntvty),
        max: Math.floor(maxIntvty),
      },
      throughput: {
        min: Math.floor(minTput),
        max: Math.ceil(maxTput),
      },
    };
  }, [gpuDataByGroupKey]);

  // Interpolate results for all GPUs at a given target value
  const getResults = useCallback(
    (
      targetValue: number,
      mode: 'interactivity_to_throughput' | 'throughput_to_interactivity',
      costProvider: CostProvider,
      visibleHwKeys?: Set<string>,
    ): InterpolatedResult[] => {
      const results: InterpolatedResult[] = [];

      for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
        // Extract the base hwKey for visibility check and config lookup
        const hwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
        const precision = groupKey.includes('__') ? groupKey.split('__')[1] : undefined;

        // Skip GPUs that are not visible (legend filters by hwKey)
        if (visibleHwKeys && !visibleHwKeys.has(hwKey)) continue;

        const result = interpolateForGPU(points, targetValue, mode, costProvider);
        if (result && result.value > 0) {
          results.push({
            ...result,
            hwKey, // always the base hwKey for color/config lookup
            resultKey: groupKey, // unique key (hwKey or hwKey__precision)
            precision, // precision label when multi-precision
          });
        }
      }

      // Sort by value descending (highest throughput or interactivity first)
      results.sort((a, b) => b.value - a.value);

      return results;
    },
    [gpuDataByGroupKey],
  );

  return {
    gpuDataByGroupKey,
    hardwareConfig,
    ranges,
    getResults,
    loading,
    error,
    hasData,
    availableHwKeys,
  };
}
