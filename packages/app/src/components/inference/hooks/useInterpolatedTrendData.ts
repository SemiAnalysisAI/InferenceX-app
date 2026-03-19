import { useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { InferenceData, TrendDataPoint, YAxisMetricKey } from '@/components/inference/types';
import {
  hermiteInterpolate,
  monotoneSlopes,
  paretoFrontUpperLeft,
} from '@/components/calculator/useThroughputData';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { getHardwareKey } from '@/lib/chart-utils';
import { HARDWARE_CONFIG, getGpuSpecs } from '@/lib/constants';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import type { BenchmarkRow } from '@/lib/api';
import { Model, Sequence } from '@/lib/data-mappings';

/**
 * Build a lightweight InferenceData-compatible point from a raw BenchmarkRow.
 * Skips the expensive transformBenchmarkRows pipeline (rooflines, cost derivations)
 * since the trend interpolation only needs x (interactivity), tpPerGpu, and metric values.
 */
function rowToLightweightPoint(row: BenchmarkRow): InferenceData | null {
  const entry = rowToAggDataEntry(row);
  const hwKey = getHardwareKey(entry);
  if (!HARDWARE_CONFIG[hwKey]) return null;

  const m = row.metrics;
  const tput = m.tput_per_gpu ?? 0;
  const outputTput = m.output_tput_per_gpu ?? tput;
  const inputTput = m.input_tput_per_gpu ?? 0;
  const specs = getGpuSpecs(hwKey);
  const power = specs.power;

  const tokPerHr = (tput * 3600) / 1_000_000;
  const outTokPerHr = (outputTput * 3600) / 1_000_000;
  const inTokPerHr = (inputTput * 3600) / 1_000_000;

  const v = (n: number): { y: number } => ({ y: n });

  // Build metric objects matching InferenceData shape
  return {
    x: m.median_intvty ?? 0,
    y: tput,
    hwKey,
    precision: row.precision,
    tp: row.decode_tp,
    conc: row.conc,
    date: row.date,
    tpPerGpu: v(tput),
    outputTputPerGpu: v(outputTput),
    inputTputPerGpu: v(inputTput),
    tpPerMw: v(power > 0 ? (tput * 1000) / power : 0),
    // Cost per million tokens (total / output / input)
    costh: v(tokPerHr ? specs.costh / tokPerHr : 0),
    costn: v(tokPerHr ? specs.costn / tokPerHr : 0),
    costr: v(tokPerHr ? specs.costr / tokPerHr : 0),
    costhOutput: v(outTokPerHr ? specs.costh / outTokPerHr : 0),
    costnOutput: v(outTokPerHr ? specs.costn / outTokPerHr : 0),
    costrOutput: v(outTokPerHr ? specs.costr / outTokPerHr : 0),
    costhi: v(inTokPerHr ? specs.costh / inTokPerHr : 0),
    costni: v(inTokPerHr ? specs.costn / inTokPerHr : 0),
    costri: v(inTokPerHr ? specs.costr / inTokPerHr : 0),
    // Energy: J/token = W / tok/s
    jTotal: v(power > 0 && tput ? (power * 1000) / tput : 0),
    ...(outputTput ? { jOutput: v(power > 0 ? (power * 1000) / outputTput : 0) } : {}),
    ...(inputTput ? { jInput: v(power > 0 ? (power * 1000) / inputTput : 0) } : {}),
  } as unknown as InferenceData;
}

/**
 * Interpolate a selected metric at a target interactivity for a set of InferenceData points
 * from a single GPU. Uses Pareto front (throughput-based frontier) + monotone cubic Hermite spline.
 *
 * Exported for unit testing.
 */
export function interpolateMetricAtInteractivity(
  points: InferenceData[],
  targetInteractivity: number,
  metricKey: YAxisMetricKey,
): number | null {
  if (points.length === 0) return null;

  // Build Pareto front on interactivity(x) vs throughput(y)
  const frontier = paretoFrontUpperLeft<InferenceData>(
    points,
    (p) => p.x,
    (p) => p.tpPerGpu.y,
  );
  if (frontier.length === 0) return null;

  // Sort frontier by interactivity ascending
  const sorted = [...frontier].sort((a, b) => a.x - b.x);

  // No extrapolation — target must be within frontier range
  if (targetInteractivity < sorted[0].x || targetInteractivity > sorted[sorted.length - 1].x) {
    return null;
  }

  // Single point — only return if target matches exactly
  if (sorted.length === 1) {
    return Math.abs(targetInteractivity - sorted[0].x) < 1e-6
      ? extractMetric(sorted[0], metricKey)
      : null;
  }

  // Extract metric values from frontier points
  const xs = sorted.map((p) => p.x);
  const metricYs = sorted.map((p) => extractMetric(p, metricKey) ?? 0);

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
  );

  // Build lightweight InferenceData points grouped by date and hwKey.
  // Skips the full transformBenchmarkRows pipeline (~100x faster for ~100 dates).
  const dateGroupedData = useMemo(() => {
    if (!allRows || allRows.length === 0) return new Map<string, Map<string, InferenceData[]>>();

    const result = new Map<string, Map<string, InferenceData[]>>();

    for (const row of allRows) {
      if (!selectedPrecisions.includes(row.precision)) continue;

      const point = rowToLightweightPoint(row);
      if (!point) continue;

      let dateMap = result.get(row.date);
      if (!dateMap) {
        dateMap = new Map();
        result.set(row.date, dateMap);
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
    const trendLines = new Map<string, TrendDataPoint[]>();
    const hwKeysWithData: string[] = [];

    for (const [groupKey, dateMap] of resultMap) {
      const points = Array.from(dateMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      if (points.length > 0) {
        // Extend line to today if the last point is before today
        const last = points[points.length - 1];
        if (last.date < today) {
          points.push({ date: today, value: last.value, x: last.x, synthetic: true });
        }
        trendLines.set(groupKey, points);
        // Return base hwKey for legend filtering
        const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
        if (!hwKeysWithData.includes(baseHwKey)) {
          hwKeysWithData.push(baseHwKey);
        }
      }
    }

    return { trendLines, hwKeysWithData };
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
    return { trendLines: new Map(), hwKeysWithData: [], loading: false, progress: 0 };
  }

  return { trendLines, hwKeysWithData, loading: isLoading, progress };
}
