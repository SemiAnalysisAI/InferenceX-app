'use client';

import { useCallback, useMemo } from 'react';

import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import type { HardwareConfig } from '@/components/inference/types';
import { useBenchmarks } from '@/hooks/api/use-benchmarks';
import type { BenchmarkRow } from '@/lib/api/api';
import { DEFAULT_TCO_BASIS, getModelSortIndex, type TcoBasis } from '@/lib/catalog/constants';
import { type Sequence, Percentile, type Model } from '@/lib/catalog/data-mappings';

import { overlayRunIndex } from '@/lib/charts/overlay-run-style';

import {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  maxInteractivityAtCost,
  monotoneSlopes,
  paretoFrontUpperLeft,
  reciprocalMetricAt,
  recoverReciprocalNumerator,
  sign,
} from './interpolation';
import type { CostProvider, CostType, GPUDataPoint, InterpolatedResult } from './types';
import { interpolateProfitForGPU, type ProfitPowerBasis } from './profit-power';

export {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  maxInteractivityAtCost,
  monotoneSlopes,
  paretoFrontUpperLeft,
  reciprocalMetricAt,
  recoverReciprocalNumerator,
  sign,
};

import { buildGpuGroups, type GroupMeta, type OverlayGroupMeta } from './throughput-data';
export { buildGpuGroups, type GroupMeta, type OverlayGroupMeta } from './throughput-data';

export interface OverlayInput {
  rows: BenchmarkRow[] | null;
  runIndexByUrl: Record<string, number>;
}

export function useThroughputData(
  selectedModel: Model,
  selectedSequence: Sequence,
  selectedPrecisions: string[],
  selectedRunDate: string,
  overlay?: OverlayInput,
  selectedPercentile: Percentile = Percentile.P90,
  initialRows?: BenchmarkRow[],
  enabled = true,
  selectedTokenType: CostType = 'total',
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
  includePower = false,
) {
  const initialCacheScope = useMemo(
    () =>
      initialRows
        ? `compare-initial:${[...new Set(initialRows.map((row) => row.hardware))].toSorted().join(',')}`
        : undefined,
    [initialRows],
  );
  const {
    data: allRows,
    isLoading: queryLoading,
    error: queryError,
  } = useBenchmarks(
    selectedModel,
    selectedRunDate,
    enabled,
    undefined,
    undefined,
    includePower
      ? undefined
      : {
          type: 'calculator',
          sequence: selectedSequence,
          ...(initialCacheScope ? { cacheScope: initialCacheScope } : {}),
        },
    includePower ? undefined : initialRows,
  );

  const loading = queryLoading || !allRows;
  const error = queryError ? queryError.message : null;

  const overlayRows = overlay?.rows ?? null;
  const runIndexByUrl = overlay?.runIndexByUrl;

  const {
    gpuDataByGroupKey,
    gpuGroupMeta,
    overlayGpuDataByGroupKey,
    overlayGroupMeta,
    hardwareConfig,
    hasData,
    hasOverlayData,
  } = useMemo(() => {
    const empty = {
      gpuDataByGroupKey: {} as Record<string, GPUDataPoint[]>,
      gpuGroupMeta: {} as Record<string, GroupMeta>,
      overlayGpuDataByGroupKey: {} as Record<string, GPUDataPoint[]>,
      overlayGroupMeta: {} as Record<string, OverlayGroupMeta>,
      hardwareConfig: {} as HardwareConfig,
      hasData: false,
      hasOverlayData: false,
    };
    if (!allRows) return empty;

    const multiPrecision = selectedPrecisions.length > 1;
    const shared = {
      sequence: selectedSequence,
      precisions: selectedPrecisions,
      percentile: selectedPercentile,
      tokenType: selectedTokenType,
      tcoBasis,
    };

    const official = buildGpuGroups<GroupMeta>(allRows, {
      ...shared,
      classify: (hwKey, row) => ({
        key: multiPrecision ? `${hwKey}__${row.precision}` : hwKey,
        meta: { hwKey, precision: multiPrecision ? row.precision : undefined },
      }),
    });

    const overlayForModel = (overlayRows ?? []).filter(
      (row) => (DB_MODEL_TO_DISPLAY[row.model] ?? row.model) === selectedModel,
    );
    const overlayGroups = buildGpuGroups<OverlayGroupMeta>(overlayForModel, {
      ...shared,
      classify: (hwKey, row) => {
        const runIndex = overlayRunIndex(row.run_url, runIndexByUrl ?? {});
        const precision = multiPrecision ? row.precision : undefined;
        return {
          key: `${hwKey}${precision ? `__${precision}` : ''}__run${runIndex}`,
          meta: { hwKey, precision, runIndex },
        };
      },
    });

    const mergedConfig = { ...overlayGroups.hwConfigMap, ...official.hwConfigMap };
    const sortedKeys = Object.keys(mergedConfig).toSorted(
      (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
    );
    const config: HardwareConfig = {};
    sortedKeys.forEach((key) => {
      config[key] = mergedConfig[key];
    });

    return {
      gpuDataByGroupKey: official.grouped,
      gpuGroupMeta: official.groupMeta,
      overlayGpuDataByGroupKey: overlayGroups.grouped,
      overlayGroupMeta: overlayGroups.groupMeta,
      hardwareConfig: config,
      hasData: Object.keys(official.grouped).length > 0,
      hasOverlayData: Object.keys(overlayGroups.grouped).length > 0,
    };
  }, [
    allRows,
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    selectedPercentile,
    selectedTokenType,
    tcoBasis,
    overlayRows,
    runIndexByUrl,
  ]);

  const orderHwKeys = useCallback(
    (dataHwKeys: Set<string>) => {
      const ordered = Object.keys(hardwareConfig).filter((k) => dataHwKeys.has(k));
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

  const overlayAvailableHwKeys = useMemo(
    () => orderHwKeys(new Set(Object.values(overlayGroupMeta).map((meta) => meta.hwKey))),
    [overlayGroupMeta, orderHwKeys],
  );

  const ranges = useMemo(() => {
    const allPoints = [
      ...Object.values(gpuDataByGroupKey).flat(),
      ...Object.values(overlayGpuDataByGroupKey).flat(),
    ];
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
  }, [gpuDataByGroupKey, overlayGpuDataByGroupKey]);

  const getResults = useCallback(
    (
      targetValue: number,
      mode: 'interactivity_to_throughput' | 'throughput_to_interactivity',
      costProvider: CostProvider,
      visibleHwKeys?: Set<string>,
      hideSkuAboveConfigLimit = false,
      powerBasis: ProfitPowerBasis = 'provisioned',
    ): InterpolatedResult[] => {
      const results: InterpolatedResult[] = [];

      for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
        const { hwKey, precision } = gpuGroupMeta[groupKey] ?? { hwKey: groupKey };

        if (visibleHwKeys && !visibleHwKeys.has(hwKey)) continue;

        const result = interpolateProfitForGPU(points, targetValue, mode, costProvider, powerBasis);
        if (result && result.value > 0 && !(hideSkuAboveConfigLimit && result.clampedAbove)) {
          results.push({
            ...result,
            hwKey,
            resultKey: groupKey,
            precision,
          });
        }
      }

      results.sort((a, b) => b.value - a.value);

      return results;
    },
    [gpuDataByGroupKey, gpuGroupMeta],
  );

  const getOverlayResults = useCallback(
    (
      targetValue: number,
      mode: 'interactivity_to_throughput' | 'throughput_to_interactivity',
      costProvider: CostProvider,
      visibleHwKeys?: Set<string>,
      runInfoByIndex?: Record<number, { branch: string; url: string }>,
      hideSkuAboveConfigLimit = false,
      powerBasis: ProfitPowerBasis = 'provisioned',
    ): InterpolatedResult[] => {
      const results: InterpolatedResult[] = [];

      for (const [groupKey, points] of Object.entries(overlayGpuDataByGroupKey)) {
        const meta = overlayGroupMeta[groupKey];
        if (!meta) continue;
        if (visibleHwKeys && !visibleHwKeys.has(meta.hwKey)) continue;

        const result = interpolateProfitForGPU(points, targetValue, mode, costProvider, powerBasis);
        if (result && result.value > 0 && !(hideSkuAboveConfigLimit && result.clampedAbove)) {
          results.push({
            ...result,
            hwKey: meta.hwKey,
            resultKey: groupKey,
            precision: meta.precision,
            isOverlay: true,
            runIndex: meta.runIndex,
            runLabel: runInfoByIndex?.[meta.runIndex]?.branch,
            runUrl: runInfoByIndex?.[meta.runIndex]?.url,
          });
        }
      }

      results.sort((a, b) => b.value - a.value);

      return results;
    },
    [overlayGpuDataByGroupKey, overlayGroupMeta],
  );

  return {
    gpuDataByGroupKey,
    gpuGroupMeta,
    overlayGpuDataByGroupKey,
    overlayGroupMeta,
    hardwareConfig,
    ranges,
    getResults,
    getOverlayResults,
    loading,
    error,
    hasData,
    hasOverlayData,
    availableHwKeys,
    overlayAvailableHwKeys,
  };
}
