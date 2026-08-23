'use client';

import { useCallback, useMemo } from 'react';

import { DB_MODEL_TO_DISPLAY, rowToSequence } from '@semianalysisai/inferencex-constants';

import type { AggDataEntry, HardwareConfig } from '@/components/inference/types';
import { useBenchmarks } from '@/hooks/api/use-benchmarks';
import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { getHardwareKey } from '@/lib/chart-utils';
import { getModelSortIndex, getHardwareConfig, getGpuSpecs } from '@/lib/constants';
import { Percentile, Sequence, type Model } from '@/lib/data-mappings';
import { overlayRunIndex } from '@/lib/overlay-run-style';

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
import type { CostProvider, GPUDataPoint, InterpolatedResult } from './types';

// Re-export pure functions so existing imports from this module keep working.
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

/** Cost per million tokens: costPerHour / (tokPerSec * 3600 / 1_000_000) */
const computeGpuCost = (costPerHour: number, tps: number) =>
  costPerHour && tps > 0 ? costPerHour / ((tps * 3600) / 1_000_000) : 0;

/** Metadata describing what a group key stands for. */
export interface GroupMeta {
  hwKey: string;
  /** Set only when multiple precisions are selected, matching the group key. */
  precision?: string;
}

/** Group metadata for an unofficial-run overlay group. */
export interface OverlayGroupMeta extends GroupMeta {
  /** Index of the run in the loaded set — drives the overlay palette color. */
  runIndex: number;
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
 * Fraction of a row's input tokens served from cache, or null when the row
 * carries no cache metric at all — which is every fixed-sequence row.
 *
 * Three tiers are reported and they do not all stack. Measured across 326
 * production agentic rows, checked against each row's own
 * `theoretical_cache_hit_rate` ceiling:
 *
 * - **GPU + external are disjoint.** Their sum never exceeds 1 nor the ceiling
 *   on any row carrying both, so they add.
 * - **The CPU-offload tier double-counts external where both are reported.**
 *   `gpu + external + cpu` breaches the ceiling on 56 of the 132 rows with a
 *   non-zero CPU rate, and *every* breach is a row that also reports an
 *   external rate — the router-side external figure already contains the
 *   offload tier there.
 * - **Where no external rate is reported, the CPU tier is real and disjoint.**
 *   On the 26 offload-on rows with no external figure, `gpu + cpu` breaches the
 *   ceiling 0 times, median CPU rate 0.055.
 *
 * Hence the conditional: external when present, CPU only in its absence. Adding
 * CPU unconditionally would overstate the cached share; dropping it entirely —
 * which this did before — understated it by a median 5.54pp on those 26 rows,
 * and an understated cached share bills more input at the fresh-token price and
 * so *overstates* revenue (by a median 27% on the input leg there). That is the
 * direction worth spending a branch to avoid.
 *
 * A reported external `0` suppresses CPU rather than counting as an absence: a
 * router reporting no external hits has still accounted for the offload tier. No
 * production row currently has that shape, so that arm is a deliberate choice
 * about unobserved data, pinned by a test rather than measured.
 *
 * The clamp is not decorative — the GPU figure alone reaches 1.185 on some rows.
 */
function cacheHitRateOf(m: Record<string, number>): number | null {
  const gpu = m.server_gpu_cache_hit_rate;
  const external = m.server_external_cache_hit_rate;
  const cpu = m.server_cpu_cache_hit_rate;
  const hasExternal = typeof external === 'number';
  // Only the tier that is not already counted by `external` is added.
  const secondary = hasExternal ? external : typeof cpu === 'number' ? cpu : undefined;
  if (typeof gpu !== 'number' && secondary === undefined) return null;
  const sum = (typeof gpu === 'number' ? gpu : 0) + (secondary ?? 0);
  return Math.max(0, Math.min(1, sum));
}

/**
 * Fraction of a config's tokens that are input tokens.
 *
 * The obvious formula — `input / (input + output)` off the per-GPU rates — is
 * wrong for disaggregated runs, and wrong by a lot. Those rows report
 * `input_tput_per_gpu` per *prefill* chip and `output_tput_per_gpu` per *decode*
 * chip, while `tput_per_gpu` is per chip overall. Across production history the
 * two rates sum to between 1.0x and 16.1x the total, exactly tracking
 * `(prefill + decode) x (isl/prefill + osl/decode) / (isl + osl)`. Aggregated
 * rows sum to 1.0000x on all 937 of them.
 *
 * So: trust the measured rates when they are self-consistent, and fall back to
 * the structural mix when they are not. For a fixed sequence the structural mix
 * is exactly ISL:OSL — every request has that shape, so no config can change it.
 * For agentic traces it is the run's own prompt:generation token counts.
 *
 * Returns null when nothing in the row pins the mix down.
 */
function inputTokenShare(row: BenchmarkRow, inputTput: number, outputTput: number): number | null {
  const tput = row.metrics.tput_per_gpu ?? 0;
  const sum = inputTput + outputTput;
  // Self-consistent: the rates share the denominator `tput_per_gpu` uses, so the
  // split they imply is the measured one. 1% covers float noise, not a
  // prefill/decode mismatch (the smallest of those in production is 1.63x).
  if (tput > 0 && sum > 0 && Math.abs(sum / tput - 1) <= 0.01) return inputTput / sum;

  const { isl, osl } = row;
  if (typeof isl === 'number' && typeof osl === 'number' && isl + osl > 0) {
    return isl / (isl + osl);
  }
  const prompt = row.metrics.total_prompt_tokens;
  const generated = row.metrics.total_generation_tokens;
  if (typeof prompt === 'number' && typeof generated === 'number' && prompt + generated > 0) {
    return prompt / (prompt + generated);
  }
  return sum > 0 ? inputTput / sum : null;
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
    const cacheHitRate = cacheHitRateOf(m);
    const tokenShare = inputTokenShare(row, inputTput, outputTput);
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
      ...(cacheHitRate === null ? {} : { cacheHitRate }),
      ...(tokenShare === null ? {} : { inputTokenShare: tokenShare }),
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

  return { grouped, groupMeta, hwConfigMap };
}

/**
 * Optional unofficial-run overlay inputs. When a run is loaded via
 * `?unofficialrun=…`, its raw rows are interpolated into a *separate* set of
 * results so official bars keep their own Pareto frontier untouched.
 */
export interface OverlayInput {
  /** Raw rows from the unofficial-run API — every model, unfiltered. */
  rows: BenchmarkRow[] | null;
  /** `run.url`/id → position in the loaded set, from the provider. */
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
) {
  const initialCacheScope = useMemo(
    () =>
      initialRows
        ? `compare-initial:${[...new Set(initialRows.map((row) => row.hardware))].toSorted().join(',')}`
        : undefined,
    [initialRows],
  );
  // Reuse the same API + React Query cache as the inference charts
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
    {
      type: 'calculator',
      sequence: selectedSequence,
      ...(initialCacheScope ? { cacheScope: initialCacheScope } : {}),
    },
    initialRows,
  );

  const loading = queryLoading || !allRows;
  const error = queryError ? queryError.message : null;

  // Build GPUDataPoints directly from raw rows, skipping transformBenchmarkRows.
  // This avoids the expensive roofline/chart-data pipeline that isn't needed for interpolation.
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
    };

    const official = buildGpuGroups<GroupMeta>(allRows, {
      ...shared,
      classify: (hwKey, row) => ({
        key: multiPrecision ? `${hwKey}__${row.precision}` : hwKey,
        meta: { hwKey, precision: multiPrecision ? row.precision : undefined },
      }),
    });

    // Overlay rows arrive unfiltered by model (the official path gets model
    // filtering server-side from /api/v1/benchmarks), so scope them here.
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

    // Sort hardware config. Overlay-only hardware is merged in so its bars and
    // legend entries can resolve a display label.
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
    overlayRows,
    runIndexByUrl,
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

  /** Hardware present in the loaded unofficial run(s) for the current selection. */
  const overlayAvailableHwKeys = useMemo(
    () => orderHwKeys(new Set(Object.values(overlayGroupMeta).map((meta) => meta.hwKey))),
    [overlayGroupMeta, orderHwKeys],
  );

  // Compute global ranges from GPUDataPoints. Overlay points are included so
  // the target-interactivity slider can reach operating points that only an
  // unofficial run covers.
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

  // Interpolate results for all GPUs at a given target value
  const getResults = useCallback(
    (
      targetValue: number,
      mode: 'interactivity_to_throughput' | 'throughput_to_interactivity',
      costProvider: CostProvider,
      visibleHwKeys?: Set<string>,
      hideSkuAboveConfigLimit = false,
    ): InterpolatedResult[] => {
      const results: InterpolatedResult[] = [];

      for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
        const { hwKey, precision } = gpuGroupMeta[groupKey] ?? { hwKey: groupKey };

        // Skip GPUs that are not visible (legend filters by hwKey)
        if (visibleHwKeys && !visibleHwKeys.has(hwKey)) continue;

        const result = interpolateForGPU(points, targetValue, mode, costProvider);
        if (result && result.value > 0 && !(hideSkuAboveConfigLimit && result.clampedAbove)) {
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

  /**
   * Interpolate the unofficial-run overlay groups at the same target value.
   * Kept separate from `getResults` so official bars keep their own Pareto
   * frontier — overlay points never enter the official interpolation.
   *
   * `visibleHwKeys` is the same legend selection `getResults` is filtered by,
   * so one legend entry governs a GPU's official and overlay bars together.
   */
  const getOverlayResults = useCallback(
    (
      targetValue: number,
      mode: 'interactivity_to_throughput' | 'throughput_to_interactivity',
      costProvider: CostProvider,
      visibleHwKeys?: Set<string>,
      runInfoByIndex?: Record<number, { branch: string; url: string }>,
      hideSkuAboveConfigLimit = false,
    ): InterpolatedResult[] => {
      const results: InterpolatedResult[] = [];

      for (const [groupKey, points] of Object.entries(overlayGpuDataByGroupKey)) {
        const meta = overlayGroupMeta[groupKey];
        if (!meta) continue;
        if (visibleHwKeys && !visibleHwKeys.has(meta.hwKey)) continue;

        const result = interpolateForGPU(points, targetValue, mode, costProvider);
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
