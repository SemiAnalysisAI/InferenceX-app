import { useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import type {
  InferenceData,
  TokenRevenuePricing,
  TrendDataPoint,
  YAxisMetricKey,
} from '@/components/inference/types';
import {
  applyTokenRevenuePricing,
  inputTokenShareForRevenue,
  NORMALIZED_TOKEN_REVENUE_PRICING,
  tokenRevenueFromRatesPerGpuHour,
} from '@/components/inference/token-revenue';
import {
  isBenchmarkMetricKey,
  resolveMetricConfigKey,
  tokenMetricTypeForConfigKey,
} from '@/components/inference/metric-registry';
import {
  hermiteInterpolate,
  monotoneSlopes,
  paretoFrontUpperLeft,
  recoverReciprocalNumerator,
  reciprocalMetricAt,
} from '@/components/calculator/useThroughputData';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { buildDerivedChartFields, getHardwareKey, type DerivedMetricKey } from '@/lib/chart-utils';
import { isKnownGpu } from '@/lib/constants';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import type { BenchmarkRow } from '@/lib/api';
import { benchmarkCurveDate, dedupeAgenticHistoryRuns } from '@/lib/benchmark-run-selection';
import { pricingCacheHitRate } from '@/lib/cache-pricing';
import { Sequence, type Model } from '@/lib/data-mappings';
import { supportsTokenMetric } from '@/lib/supplemental-benchmarks';

/** Snapshot-scoped token metric support for raw historical rows. */
export function rowSupportsTrendMetric(row: BenchmarkRow, selectedYAxisMetric: string): boolean {
  return supportsTokenMetric(row, tokenMetricTypeForConfigKey(selectedYAxisMetric));
}

/**
 * Build a lightweight InferenceData-compatible point from a raw BenchmarkRow.
 * This deliberately skips full chart transformation and derives only the
 * selected trend metric plus its frontier/interpolation dependencies.
 */
export function rowToLightweightPoint(
  row: BenchmarkRow,
  requestedMetrics: readonly DerivedMetricKey[],
  tokenRevenuePricing: TokenRevenuePricing | null = NORMALIZED_TOKEN_REVENUE_PRICING,
): InferenceData | null {
  const entry = rowToAggDataEntry(row);
  const hwKey = getHardwareKey(entry);
  // Historical rows predating explicit output-throughput telemetry used total
  // throughput as output throughput. Preserve that production fallback for
  // output cost, purchasing-power, and energy trend metrics.
  const derivedEntry =
    row.metrics.output_tput_per_gpu === null || row.metrics.output_tput_per_gpu === undefined
      ? { ...entry, output_tput_per_gpu: entry.tput_per_gpu }
      : entry;
  if (!isKnownGpu(hwKey)) return null;

  const point = {
    x: row.metrics.median_intvty ?? 0,
    y: row.metrics.tput_per_gpu ?? 0,
    hw: row.hardware,
    hwKey,
    precision: row.precision,
    tp: row.decode_tp,
    conc: row.conc,
    date: benchmarkCurveDate(row),
    tput_per_gpu: entry.tput_per_gpu,
    input_tput_per_gpu: entry.input_tput_per_gpu,
    output_tput_per_gpu: entry.output_tput_per_gpu,
    isl: entry.isl,
    osl: entry.osl,
    total_prompt_tokens: entry.total_prompt_tokens,
    total_generation_tokens: entry.total_generation_tokens,
    server_gpu_cache_hit_rate: entry.server_gpu_cache_hit_rate,
    server_external_cache_hit_rate: entry.server_external_cache_hit_rate,
    server_cpu_cache_hit_rate: entry.server_cpu_cache_hit_rate,
    theoretical_cache_hit_rate: entry.theoretical_cache_hit_rate,
    ...buildDerivedChartFields(derivedEntry, hwKey, requestedMetrics),
  } as InferenceData;

  return requestedMetrics.includes('tokenRevenuePerGpuHour')
    ? applyTokenRevenuePricing([point], tokenRevenuePricing)[0]!
    : point;
}

/**
 * Metrics defined as a per-chip constant divided by a throughput, mapped to the
 * throughput metric they divide. These are interpolated by splining that
 * throughput and re-deriving, never by splining the metric independently, so
 * the interpolated pair preserves `metric x throughput = constant`. See
 * `recoverReciprocalNumerator` and docs/tco-calculator.md.
 *
 * The `measured*` energy keys are deliberately absent: their numerator is
 * measured per point rather than a constant, so the identity does not hold and
 * splining them directly remains correct.
 */
const RECIPROCAL_OF_THROUGHPUT: Partial<Record<YAxisMetricKey, YAxisMetricKey>> = {
  // $/M tok = $/GPU-hr x 1e6 / (tok/s x 3600)
  costh: 'tpPerGpu',
  costn: 'tpPerGpu',
  costr: 'tpPerGpu',
  costhOutput: 'outputTputPerGpu',
  costnOutput: 'outputTputPerGpu',
  costrOutput: 'outputTputPerGpu',
  costhi: 'inputTputPerGpu',
  costni: 'inputTputPerGpu',
  costri: 'inputTputPerGpu',
  // J/token = W / (tok/s)
  jTotal: 'tpPerGpu',
  jOutput: 'outputTputPerGpu',
  jInput: 'inputTputPerGpu',
};

/**
 * Business metrics mapped to the throughput they scale. When the multiplier is
 * constant, interpolation preserves that identity. OpenRouter revenue can use
 * a point-specific input/output mix; in that case multiplier recovery fails
 * safely and the metric itself is splined on the total-throughput frontier.
 */
const PROPORTIONAL_TO_THROUGHPUT: Partial<Record<YAxisMetricKey, YAxisMetricKey>> = {
  tokenRevenuePerGpuHour: 'tpPerGpu',
  tokensPerDollarH: 'tpPerGpu',
  tokensPerDollarN: 'tpPerGpu',
  tokensPerDollarR: 'tpPerGpu',
  outputTokensPerDollarH: 'outputTputPerGpu',
  outputTokensPerDollarN: 'outputTputPerGpu',
  outputTokensPerDollarR: 'outputTputPerGpu',
  inputTokensPerDollarH: 'inputTputPerGpu',
  inputTokensPerDollarN: 'inputTputPerGpu',
  inputTokensPerDollarR: 'inputTputPerGpu',
};

export function trendMetricDependencies(metricKey: YAxisMetricKey): DerivedMetricKey[] {
  const dependencies = new Set<DerivedMetricKey>(['tpPerGpu']);
  if (!isBenchmarkMetricKey(metricKey)) return [...dependencies];
  dependencies.add(metricKey);
  const throughputKey =
    RECIPROCAL_OF_THROUGHPUT[metricKey] ?? PROPORTIONAL_TO_THROUGHPUT[metricKey];
  if (throughputKey && isBenchmarkMetricKey(throughputKey)) dependencies.add(throughputKey);
  return [...dependencies];
}

function recoverProportionalMultiplier(
  values: readonly number[],
  throughputs: readonly number[],
): number | null {
  const RELATIVE_TOLERANCE = 1e-3;
  let multiplier: number | null = null;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const throughput = throughputs[i];
    if (value === undefined || throughput === undefined) continue;
    if (!(value > 0) || !(throughput > 0)) continue;

    const candidate = value / throughput;
    if (multiplier === null) {
      multiplier = candidate;
    } else if (Math.abs(candidate - multiplier) > Math.abs(multiplier) * RELATIVE_TOLERANCE) {
      return null;
    }
  }

  return multiplier;
}

/**
 * Interpolate a selected metric at a target interactivity for a set of InferenceData points
 * from a single GPU. Uses a throughput-based Pareto front + monotone cubic Hermite spline.
 *
 * Exported for unit testing.
 */
export function interpolateMetricAtInteractivity(
  points: InferenceData[],
  targetInteractivity: number,
  metricKey: YAxisMetricKey,
  tokenRevenuePricing?: TokenRevenuePricing | null,
): number | null {
  if (points.length === 0) return null;

  // Proportional business metrics use the corresponding total/output/input
  // throughput frontier so their knots exactly match the serving envelope.
  const proportionalThroughputKey = PROPORTIONAL_TO_THROUGHPUT[metricKey];
  const frontierThroughputKey = proportionalThroughputKey ?? 'tpPerGpu';
  for (const point of points) {
    if (extractMetric(point, frontierThroughputKey) === null) return null;
  }

  // Build Pareto front on interactivity(x) vs the applicable throughput(y).
  const frontier = paretoFrontUpperLeft<InferenceData>(
    points,
    (p) => p.x,
    (p) => extractMetric(p, frontierThroughputKey)!,
  );
  if (frontier.length === 0) return null;

  // Sort frontier by interactivity ascending
  const sorted = [...frontier].toSorted((a, b) => a.x - b.x);

  // No extrapolation — target must be within frontier range
  if (targetInteractivity < sorted[0].x || targetInteractivity > sorted.at(-1)!.x) {
    return null;
  }

  // Single point — only return if target matches exactly
  if (sorted.length === 1) {
    return Math.abs(targetInteractivity - sorted[0].x) < 1e-6
      ? extractMetric(sorted[0], metricKey)
      : null;
  }

  // Extract metric values from frontier points. If ANY point is missing the
  // metric (e.g. measured-power keys on a row that predates aggregate_power.py),
  // bail out — silently coercing nulls to zero would render a flat-zero trend
  // line that looks like real data.
  const xs = sorted.map((p) => p.x);
  const metricYs: number[] = [];
  for (const p of sorted) {
    const v = extractMetric(p, metricKey);
    if (v === null) return null;
    metricYs.push(v);
  }

  // Fleet Lifecycle interpolates the physical throughput, measured cache hit
  // fraction, and compatible input-token share independently, then prices that
  // operating point. Do the same for Historical Trends instead of splining
  // already-multiplied dollar values. A partly measured cache frontier opts out
  // of the discount as a whole rather than inventing a zero-hit knot.
  if (metricKey === 'tokenRevenuePerGpuHour' && tokenRevenuePricing) {
    const interpolateBounded = (ys: number[]) => {
      const slopes = monotoneSlopes(xs, ys);
      const raw = hermiteInterpolate(xs, ys, slopes, targetInteractivity);
      return Math.max(Math.min(...ys), Math.min(Math.max(...ys), raw));
    };
    const throughputYs = sorted.map((p) => extractMetric(p, 'tpPerGpu')!);
    const inputShares = sorted.map(inputTokenShareForRevenue);
    const cacheHitRates = sorted.map(pricingCacheHitRate);
    const inputShare = inputShares.every((share): share is number => share !== null)
      ? interpolateBounded(inputShares)
      : null;
    const cacheHitRate = cacheHitRates.every((hit): hit is number => hit !== null)
      ? interpolateBounded(cacheHitRates)
      : null;

    const throughput = interpolateBounded(throughputYs);
    return tokenRevenueFromRatesPerGpuHour(
      throughput,
      inputShare,
      cacheHitRate,
      tokenRevenuePricing,
    );
  }

  // When a business metric is a fixed multiple of throughput, spline the
  // matching throughput and apply that multiplier so the derived curve cannot
  // drift from its throughput/interactivity Pareto curve. Metrics whose ratio
  // varies across the frontier fall through to a direct metric spline.
  if (proportionalThroughputKey) {
    const tputYs = sorted.map((p) => extractMetric(p, proportionalThroughputKey)!);
    const multiplier = recoverProportionalMultiplier(metricYs, tputYs);
    if (multiplier !== null) {
      const tputSlopes = monotoneSlopes(xs, tputYs);
      const tput = hermiteInterpolate(xs, tputYs, tputSlopes, targetInteractivity);
      return Math.max(0, tput) * multiplier;
    }
  }

  // Cost and energy per token are `constant / throughput`. Spline that
  // throughput and re-derive rather than splining the metric, preserving the identity.
  const throughputKey = RECIPROCAL_OF_THROUGHPUT[metricKey];
  if (throughputKey) {
    const tputYs: number[] = [];
    for (const p of sorted) {
      const v = extractMetric(p, throughputKey);
      if (v === null) return null;
      tputYs.push(v);
    }
    const numerator = recoverReciprocalNumerator(metricYs, tputYs);
    // null means these points do not obey the identity — fall through and spline
    // the metric directly rather than rewrite it from one point's ratio.
    if (numerator !== null) {
      const tputSlopes = monotoneSlopes(xs, tputYs);
      const tput = hermiteInterpolate(xs, tputYs, tputSlopes, targetInteractivity);
      return reciprocalMetricAt(numerator, Math.max(0, tput));
    }
  }

  // Monotone cubic Hermite spline interpolation
  const slopes = monotoneSlopes(xs, metricYs);
  const interpolated = hermiteInterpolate(xs, metricYs, slopes, targetInteractivity);

  // Clamp to prevent negative values from cubic spline overshoots
  return Math.max(0, interpolated);
}

function extractMetric(point: InferenceData, metricKey: YAxisMetricKey): number | null {
  const metricObj = point[metricKey];
  if (metricObj && typeof metricObj === 'object' && 'y' in metricObj) {
    return (metricObj as { y: number }).y;
  }
  return null;
}

interface UseInterpolatedTrendDataParams {
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  selectedYAxisMetric: string;
  targetInteractivity: number;
  availableDates: string[];
  tokenRevenuePricing?: TokenRevenuePricing | null;
  enabled: boolean;
}

interface UseInterpolatedTrendDataResult {
  trendLines: Map<string, TrendDataPoint[]>;
  hwKeysWithData: string[];
  loading: boolean;
  progress: number;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

/**
 * Hook that loads historical benchmark data, groups by GPU per date, and interpolates
 * the selected metric at a user-specified interactivity level for each date.
 *
 * Uses the /api/v1/benchmarks/history endpoint which returns all dates in one query.
 * The interpolation memo re-computes instantly when targetInteractivity or metric changes.
 */
export function useInterpolatedTrendData({
  selectedModel,
  selectedSequence,
  selectedPrecisions,
  selectedYAxisMetric,
  targetInteractivity,
  tokenRevenuePricing = NORMALIZED_TOKEN_REVENUE_PRICING,
  enabled,
}: UseInterpolatedTrendDataParams): UseInterpolatedTrendDataResult {
  const seqIslOsl = useMemo(() => sequenceToIslOsl(selectedSequence), [selectedSequence]);

  const {
    data: allRows,
    isLoading,
    error,
    refetch,
  } = useBenchmarkHistory(
    enabled ? selectedModel : '',
    seqIslOsl?.isl ?? 0,
    seqIslOsl?.osl ?? 0,
    selectedSequence === Sequence.AgenticTraces ? { benchmarkType: 'agentic_traces' } : undefined,
  );
  const trendMetricKey = resolveMetricConfigKey(selectedYAxisMetric).slice(2) as YAxisMetricKey;
  const requestedMetrics = useMemo(() => trendMetricDependencies(trendMetricKey), [trendMetricKey]);

  // Build lightweight InferenceData points grouped by date and hwKey.
  // Skips the full transformBenchmarkRows pipeline (~100x faster for ~100 dates).
  const dateGroupedData = useMemo(() => {
    if (!allRows || allRows.length === 0) return new Map<string, Map<string, InferenceData[]>>();

    const result = new Map<string, Map<string, InferenceData[]>>();

    for (const row of dedupeAgenticHistoryRuns(allRows)) {
      if (!selectedPrecisions.includes(row.precision)) continue;
      if (!rowSupportsTrendMetric(row, selectedYAxisMetric)) continue;

      const point = rowToLightweightPoint(row, requestedMetrics, tokenRevenuePricing);
      if (!point) continue;

      const curveDate = benchmarkCurveDate(row);
      let dateMap = result.get(curveDate);
      if (!dateMap) {
        dateMap = new Map();
        result.set(curveDate, dateMap);
      }

      const hwKey = point.hwKey as string;
      const multiPrecision = selectedPrecisions.length > 1;
      const groupKey = multiPrecision ? `${hwKey}__${row.precision}` : hwKey;
      let groupPoints = dateMap.get(groupKey);
      if (!groupPoints) {
        groupPoints = [];
        dateMap.set(groupKey, groupPoints);
      }
      groupPoints.push(point);
    }

    return result;
  }, [allRows, selectedPrecisions, requestedMetrics, selectedYAxisMetric, tokenRevenuePricing]);

  // Interpolation memo — instant when slider moves or metric changes
  const { trendLines, hwKeysWithData } = useMemo(() => {
    const resultMap = new Map<string, Map<string, TrendDataPoint>>();
    const metricKey = trendMetricKey;

    for (const [date, byGroupKey] of dateGroupedData) {
      for (const [groupKey, points] of byGroupKey) {
        const interpolated = interpolateMetricAtInteractivity(
          points,
          targetInteractivity,
          metricKey,
          tokenRevenuePricing,
        );
        if (interpolated === null) continue;
        if (!resultMap.has(groupKey)) resultMap.set(groupKey, new Map());
        resultMap.get(groupKey)!.set(date, {
          date,
          value: interpolated,
          x: targetInteractivity,
        });
      }
    }

    // Build sorted trend lines, extending each to today with last known value
    const today = new Date().toISOString().split('T')[0];
    const lines = new Map<string, TrendDataPoint[]>();
    const keysWithData: string[] = [];

    for (const [groupKey, dateMap] of resultMap) {
      const points = [...dateMap.values()].toSorted(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      if (points.length > 0) {
        // Extend line to today if the last point is before today
        const last = points.at(-1)!;
        if (last.date < today) {
          points.push({
            date: today,
            value: last.value,
            x: last.x,
            synthetic: true,
          });
        }
        lines.set(groupKey, points);
        // Return base hwKey for legend filtering
        const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
        if (!keysWithData.includes(baseHwKey)) {
          keysWithData.push(baseHwKey);
        }
      }
    }

    return { trendLines: lines, hwKeysWithData: keysWithData };
  }, [dateGroupedData, targetInteractivity, trendMetricKey, tokenRevenuePricing]);

  // Artificial progress that ramps up while the API call is in flight
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    if (isLoading) {
      setProgress(0);
      intervalRef.current = setInterval(() => {
        setProgress((p) => Math.min(p + 0.08 + Math.random() * 0.12, 0.95));
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(1);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoading]);

  if (!enabled) {
    return {
      trendLines: new Map(),
      hwKeysWithData: [],
      loading: false,
      progress: 0,
      error: null,
      refetch,
    };
  }

  return { trendLines, hwKeysWithData, loading: isLoading, progress, error, refetch };
}
