import { useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import type { InferenceData, TrendDataPoint, YAxisMetricKey } from '@/components/inference/types';
import {
  hermiteInterpolate,
  monotoneSlopes,
  paretoFrontUpperLeft,
  recoverReciprocalNumerator,
  reciprocalMetricAt,
} from '@/components/calculator/useThroughputData';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { buildMeasuredPowerChartFields, getHardwareKey } from '@/lib/chart-utils';
import { getGpuSpecs, isKnownGpu } from '@/lib/constants';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import type { BenchmarkRow } from '@/lib/api';
import { benchmarkCurveDate, dedupeAgenticHistoryRuns } from '@/lib/benchmark-run-selection';
import { Sequence, type Model } from '@/lib/data-mappings';

// Trend points never sit on a roofline — they're synthetic per-(date, config)
// aggregates, not the per-load Pareto-frontier points the chart marks. Hardcode
// roof:false so the field shape lines up with InferenceData without a cast.
const wrapMetric = (n: number): { y: number; roof: boolean } => ({
  y: n,
  roof: false,
});

/**
 * Build a lightweight InferenceData-compatible point from a raw BenchmarkRow.
 * Skips the expensive transformBenchmarkRows pipeline (rooflines, cost derivations)
 * since the trend interpolation only needs x (interactivity), tpPerGpu, and metric values.
 */
function rowToLightweightPoint(row: BenchmarkRow): InferenceData | null {
  const entry = rowToAggDataEntry(row);
  const hwKey = getHardwareKey(entry);
  if (!isKnownGpu(hwKey)) return null;

  const m = row.metrics;
  const tput = m.tput_per_gpu ?? 0;
  const outputTput = m.output_tput_per_gpu ?? tput;
  const inputTput = m.input_tput_per_gpu ?? 0;
  const specs = getGpuSpecs(hwKey);
  const power = specs.power;

  const tokPerHr = tput * 3600;
  const outTokPerHr = outputTput * 3600;
  const inTokPerHr = inputTput * 3600;
  const millionTokPerHr = tokPerHr / 1_000_000;
  const millionOutTokPerHr = outTokPerHr / 1_000_000;
  const millionInTokPerHr = inTokPerHr / 1_000_000;

  // Build metric objects matching InferenceData shape. Measured-power keys are
  // only set when the runner-side aggregate_power.py emitted them — leaving the
  // field undefined lets extractMetric return null and the trend show a real
  // gap instead of a flat-zero line.
  const point: InferenceData = {
    x: m.median_intvty ?? 0,
    y: tput,
    hwKey,
    precision: row.precision,
    tp: row.decode_tp,
    conc: row.conc,
    date: benchmarkCurveDate(row),
    tpPerGpu: wrapMetric(tput),
    outputTputPerGpu: wrapMetric(outputTput),
    inputTputPerGpu: wrapMetric(inputTput),
    tpPerMw: wrapMetric(power > 0 ? (tput * 1000) / power : 0),
    // Cost per million tokens (total / output / input).
    costh: wrapMetric(millionTokPerHr ? specs.costh / millionTokPerHr : 0),
    costn: wrapMetric(millionTokPerHr ? specs.costn / millionTokPerHr : 0),
    costr: wrapMetric(millionTokPerHr ? specs.costr / millionTokPerHr : 0),
    costhOutput: wrapMetric(millionOutTokPerHr ? specs.costh / millionOutTokPerHr : 0),
    costnOutput: wrapMetric(millionOutTokPerHr ? specs.costn / millionOutTokPerHr : 0),
    costrOutput: wrapMetric(millionOutTokPerHr ? specs.costr / millionOutTokPerHr : 0),
    costhi: wrapMetric(millionInTokPerHr ? specs.costh / millionInTokPerHr : 0),
    costni: wrapMetric(millionInTokPerHr ? specs.costn / millionInTokPerHr : 0),
    costri: wrapMetric(millionInTokPerHr ? specs.costr / millionInTokPerHr : 0),
    // Tokens purchasable per $1 (total / output / input).
    tokensPerDollarH: wrapMetric(specs.costh ? tokPerHr / specs.costh : 0),
    tokensPerDollarN: wrapMetric(specs.costn ? tokPerHr / specs.costn : 0),
    tokensPerDollarR: wrapMetric(specs.costr ? tokPerHr / specs.costr : 0),
    outputTokensPerDollarH: wrapMetric(specs.costh ? outTokPerHr / specs.costh : 0),
    outputTokensPerDollarN: wrapMetric(specs.costn ? outTokPerHr / specs.costn : 0),
    outputTokensPerDollarR: wrapMetric(specs.costr ? outTokPerHr / specs.costr : 0),
    inputTokensPerDollarH: wrapMetric(specs.costh ? inTokPerHr / specs.costh : 0),
    inputTokensPerDollarN: wrapMetric(specs.costn ? inTokPerHr / specs.costn : 0),
    inputTokensPerDollarR: wrapMetric(specs.costr ? inTokPerHr / specs.costr : 0),
    // Energy: J/token = W / tok/s
    jTotal: wrapMetric(power > 0 && tput ? (power * 1000) / tput : 0),
    ...(outputTput ? { jOutput: wrapMetric(power > 0 ? (power * 1000) / outputTput : 0) } : {}),
    ...(inputTput ? { jInput: wrapMetric(power > 0 ? (power * 1000) / inputTput : 0) } : {}),
    ...buildMeasuredPowerChartFields(entry, specs.tdp),
  };
  return point;
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
 * Purchasing-power metrics mapped to the throughput they scale. Their Pareto
 * knots must come from this throughput too: choosing the total-throughput
 * frontier for output/input tokens can select a different serving envelope
 * from the corresponding tokens-per-dollar chart.
 */
const PROPORTIONAL_TO_THROUGHPUT: Partial<Record<YAxisMetricKey, YAxisMetricKey>> = {
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
): number | null {
  if (points.length === 0) return null;

  // Tokens/$ uses the corresponding total/output/input throughput frontier so
  // its knots exactly match the throughput/interactivity serving envelope.
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

  // Tokens/$ is `throughput * 3600 / hourlyCost`. Spline the matching
  // throughput and apply that constant multiplier so the purchasing-power
  // curve cannot drift from its throughput/interactivity Pareto curve.
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
  enabled: boolean;
}

interface UseInterpolatedTrendDataResult {
  trendLines: Map<string, TrendDataPoint[]>;
  hwKeysWithData: string[];
  loading: boolean;
  progress: number;
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
  enabled,
}: UseInterpolatedTrendDataParams): UseInterpolatedTrendDataResult {
  const seqIslOsl = useMemo(() => sequenceToIslOsl(selectedSequence), [selectedSequence]);

  const { data: allRows, isLoading } = useBenchmarkHistory(
    enabled ? selectedModel : '',
    seqIslOsl?.isl ?? 0,
    seqIslOsl?.osl ?? 0,
    selectedSequence === Sequence.AgenticTraces ? 'agentic_traces' : undefined,
  );

  // Build lightweight InferenceData points grouped by date and hwKey.
  // Skips the full transformBenchmarkRows pipeline (~100x faster for ~100 dates).
  const dateGroupedData = useMemo(() => {
    if (!allRows || allRows.length === 0) return new Map<string, Map<string, InferenceData[]>>();

    const result = new Map<string, Map<string, InferenceData[]>>();

    for (const row of dedupeAgenticHistoryRuns(allRows)) {
      if (!selectedPrecisions.includes(row.precision)) continue;

      const point = rowToLightweightPoint(row);
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
  }, [allRows, selectedPrecisions]);

  // Interpolation memo — instant when slider moves or metric changes
  const { trendLines, hwKeysWithData } = useMemo(() => {
    const resultMap = new Map<string, Map<string, TrendDataPoint>>();
    const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

    for (const [date, byGroupKey] of dateGroupedData) {
      for (const [groupKey, points] of byGroupKey) {
        const interpolated = interpolateMetricAtInteractivity(
          points,
          targetInteractivity,
          metricKey,
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
  }, [dateGroupedData, targetInteractivity, selectedYAxisMetric]);

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
    };
  }

  return { trendLines, hwKeysWithData, loading: isLoading, progress };
}
