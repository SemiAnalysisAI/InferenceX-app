'use client';

import { useCallback, useMemo } from 'react';

import {
  DB_MODEL_TO_DISPLAY,
  resolveFrameworkAlias,
  rowToSequence,
} from '@semianalysisai/inferencex-constants';

import type { AggDataEntry, HardwareConfig } from '@/components/inference/types';
import { useBenchmarks } from '@/hooks/api/use-benchmarks';
import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { getHardwareKey } from '@/lib/chart-utils';
import { getModelSortIndex, getHardwareConfig, getGpuSpecs } from '@/lib/constants';
import { Percentile, Sequence, type Model } from '@/lib/data-mappings';

import {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  maxInteractivityAtCost,
  monotoneSlopes,
  paretoFrontUpperLeft,
  sign,
} from './interpolation';
import { restrictAgenticPointsToE2eFrontier } from '@/lib/agentic-frontier';
import type { BarMetric, CostProvider, GPUDataPoint, InterpolatedResult } from './types';

// Re-export pure functions so existing imports from this module keep working.
export {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  maxInteractivityAtCost,
  monotoneSlopes,
  paretoFrontUpperLeft,
  sign,
};

/** Cost per million tokens: costPerHour / (tokPerSec * 3600 / 1_000_000) */
const computeGpuCost = (costPerHour: number, tps: number) =>
  costPerHour && tps > 0 ? costPerHour / ((tps * 3600) / 1_000_000) : 0;

/** Metadata describing what a group key stands for. */
export interface GroupMeta {
  hwKey: string;
  /** Set only when multiple precisions are selected, matching the group key. */
  precision?: string;
  framework?: string;
  /** Canonical framework key (e.g. `tilert`) for category filtering. */
  isTileRT?: boolean;
}

function getAgenticMetric(
  entry: AggDataEntry,
  percentile: Percentile,
  suffix: 'intvty' | 'e2el',
): number {
  const value = entry[`${percentile}_${suffix}` as keyof AggDataEntry];
  return typeof value === 'number' ? value : 0;
}

/**
 * Build `GPUDataPoint` groups from raw benchmark rows.
 *
 * Shared by the official and the unofficial-run overlay paths so both are
 * derived by identical logic — the only difference is how rows are keyed into
 * groups, which the caller controls via `classify`.
 */
export function buildGpuGroups<M extends GroupMeta>(
  rows: BenchmarkRow[],
  options: {
    sequence: Sequence;
    precisions: string[];
    /** Agentic x/e2e latency percentile. Fixed-sequence rows keep the median. */
    percentile?: Percentile;
    /** Derive a row's group key + metadata. Return null to drop the row. */
    classify: (hwKey: string, row: BenchmarkRow) => { key: string; meta: M } | null;
  },
): {
  grouped: Record<string, GPUDataPoint[]>;
  groupMeta: Record<string, M>;
  hwConfigMap: HardwareConfig;
} {
  const { sequence, precisions, percentile = Percentile.P90, classify } = options;
  const grouped: Record<string, GPUDataPoint[]> = {};
  const groupMeta: Record<string, M> = {};
  const hwConfigMap: HardwareConfig = {};

  for (const row of rows) {
    if (rowToSequence(row) !== sequence) continue;
    if (!precisions.includes(row.precision)) continue;

    const entry = rowToAggDataEntry(row);
    const hwKey = getHardwareKey(entry);
    const hwConfig = getHardwareConfig(hwKey, entry.model);
    if (!hwConfig) continue;

    const classified = classify(hwKey, row);
    if (!classified) continue;
    const { key: groupKey, meta } = classified;

    if (!hwConfigMap[hwKey]) hwConfigMap[hwKey] = { ...hwConfig, name: hwKey };

    const m = row.metrics;
    const tput = m.tput_per_gpu ?? 0;
    const outputTput = m.output_tput_per_gpu ?? tput;
    const inputTput = m.input_tput_per_gpu ?? 0;
    const specs = getGpuSpecs(hwKey);
    const power = specs.power;

    if (!grouped[groupKey]) grouped[groupKey] = [];
    groupMeta[groupKey] = meta;

    grouped[groupKey].push({
      hwKey,
      interactivity:
        sequence === Sequence.AgenticTraces
          ? getAgenticMetric(entry, percentile, 'intvty')
          : entry.median_intvty,
      ...(sequence === Sequence.AgenticTraces
        ? {
            e2eLatency: getAgenticMetric(entry, percentile, 'e2el'),
            date: row.date,
          }
        : {}),
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

  if (sequence === Sequence.AgenticTraces) {
    for (const groupKey of Object.keys(grouped)) {
      const restricted = restrictAgenticPointsToE2eFrontier(grouped[groupKey]);
      if (restricted.length === 0) {
        delete grouped[groupKey];
        delete groupMeta[groupKey];
      } else {
        grouped[groupKey] = restricted;
      }
    }
  }

  return { grouped, groupMeta, hwConfigMap };
}

/**
 * Optional unofficial-run inputs. When a run is loaded via
 * `?unofficialrun=…`, rows are merged into the official dataset so it behaves as
 * an ingested path for downstream table, CSV, and fleet calculations.
 */
export interface OverlayInput {
  /** Raw rows from the unofficial-run API — every model, unfiltered. */
  rows: BenchmarkRow[] | null;
  /** Kept for compatibility with existing call sites; not required for merged mode. */
  runIndexByUrl?: Record<string, number>;
}

export function useThroughputData(
  selectedModel: Model,
  selectedSequence: Sequence,
  selectedPrecisions: string[],
  selectedRunDate: string,
  overlay?: OverlayInput,
  selectedPercentile: Percentile = Percentile.P90,
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
  const overlayRows = overlay?.rows ?? null;

  const { gpuDataByGroupKey, gpuGroupMeta, hardwareConfig, hasData } = useMemo(() => {
    const empty = {
      gpuDataByGroupKey: {} as Record<string, GPUDataPoint[]>,
      gpuGroupMeta: {} as Record<string, GroupMeta>,
      hardwareConfig: {} as HardwareConfig,
      hasData: false,
    };
    if (!allRows) return empty;

    const multiPrecision = selectedPrecisions.length > 1;
    const shared = {
      sequence: selectedSequence,
      precisions: selectedPrecisions,
      percentile: selectedPercentile,
    };

    // Overlay rows arrive unfiltered by model (the official path gets model
    // filtering server-side from /api/v1/benchmarks), so scope them here.
    const overlayForModel = (overlayRows ?? []).filter(
      (row) => (DB_MODEL_TO_DISPLAY[row.model] ?? row.model) === selectedModel,
    );
    const mergedRows = [...allRows, ...overlayForModel];
    const merged = buildGpuGroups<GroupMeta>(mergedRows, {
      ...shared,
      classify: (hwKey, row) => ({
        key: multiPrecision ? `${hwKey}__${row.precision}` : hwKey,
        meta: {
          hwKey,
          framework: row.framework ? resolveFrameworkAlias(row.framework) : undefined,
          isTileRT: row.framework ? resolveFrameworkAlias(row.framework) === 'tilert' : false,
          precision: multiPrecision ? row.precision : undefined,
        },
      }),
    });

    // Hardware configs are sorted for stable legend/table ordering.
    const mergedConfig = merged.hwConfigMap;
    const sortedKeys = Object.keys(mergedConfig).toSorted(
      (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
    );
    const config: HardwareConfig = {};
    sortedKeys.forEach((key) => {
      config[key] = mergedConfig[key];
    });

    return {
      gpuDataByGroupKey: merged.grouped,
      gpuGroupMeta: merged.groupMeta,
      hardwareConfig: config,
      hasData: Object.keys(merged.grouped).length > 0,
    };
  }, [
    allRows,
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    selectedPercentile,
    overlayRows,
  ]);

  // All available GPU hardware keys from data, ordered by hardwareConfig (HARDWARE_CONFIG order)
  // This returns unique GPU-level hwKeys (not composite keys) for the legend
  const orderHwKeys = useCallback(
    (dataHwKeys: Set<string>) => {
      // Use hardwareConfig key order (already sorted by HARDWARE_CONFIG), then append any extras
      const ordered = Object.keys(hardwareConfig).filter((k) => dataHwKeys.has(k));
      // Add any keys in data but not in hardwareConfig at the end
      for (const k of dataHwKeys) {
        if (!hardwareConfig[k]) ordered.push(k);
      }
      return ordered;
    },
    [hardwareConfig],
  );

  const availableHwKeys = useMemo(
    () => orderHwKeys(new Set(Object.values(gpuGroupMeta).map((meta) => meta.hwKey))),
    [gpuGroupMeta, orderHwKeys],
  );

  // Compute global ranges from merged GPUDataPoints.
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
      barMetric: BarMetric = 'throughput',
      hideSkuAboveConfigLimit = false,
    ): InterpolatedResult[] => {
      const results: InterpolatedResult[] = [];

      for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
        const {
          hwKey,
          precision,
          isTileRT = false,
        } = gpuGroupMeta[groupKey] ?? { hwKey: groupKey };

        // Skip GPUs that are not visible (legend filters by hwKey)
        if (visibleHwKeys && !visibleHwKeys.has(hwKey)) continue;

        if (barMetric === 'maxInteractivityWithTileRT' && !isTileRT) continue;
        if (barMetric === 'maxInteractivityWithoutTileRT' && isTileRT) continue;

        let result: InterpolatedResult | null;

        if (
          barMetric === 'maxInteractivity' ||
          barMetric === 'maxInteractivityWithTileRT' ||
          barMetric === 'maxInteractivityWithoutTileRT'
        ) {
          const frontier = paretoFrontUpperLeft(
            points,
            (p) => p.interactivity,
            (p) => p.throughput,
          ).toSorted((a, b) => a.interactivity - b.interactivity);
          const frontierMaxInteractivity = frontier.at(-1);
          if (!frontierMaxInteractivity) {
            continue;
          }
          const frontierMax = interpolateForGPU(
            points,
            frontierMaxInteractivity.interactivity,
            'interactivity_to_throughput',
            costProvider,
          );
          if (!frontierMax) continue;
          result = {
            ...frontierMax,
            value: frontierMaxInteractivity.interactivity,
            clamped: false,
            clampedAbove: false,
            clampedBelow: false,
          };
        } else {
          result = interpolateForGPU(points, targetValue, mode, costProvider);
        }

        if (!result) continue;

        if (result.value > 0 && !(hideSkuAboveConfigLimit && result.clampedAbove)) {
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
    [gpuDataByGroupKey, gpuGroupMeta],
  );

  return {
    gpuDataByGroupKey,
    gpuGroupMeta,
    hardwareConfig,
    ranges,
    getResults,
    loading,
    error,
    hasData,
    availableHwKeys,
  };
}
