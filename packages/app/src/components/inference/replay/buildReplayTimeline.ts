import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { createChartDataPoint, getHardwareKey } from '@/lib/chart-utils';

import type {
  AggDataEntry,
  ChartDefinition,
  InferenceData,
  YAxisMetricKey,
} from '@/components/inference/types';

import type { PerStepValue } from './interpolateAtTime';

export interface ReplayConfigSeries {
  configId: string;
  hwKey: string;
  precision: string;
  template: InferenceData;
  /**
   * One entry per `dates[i]`. `visible=false` for steps before the config's
   * first observation; sticky-last carries the final observation forward.
   */
  stepValues: PerStepValue[];
}

export interface ReplayTimeline {
  dates: string[];
  configs: ReplayConfigSeries[];
  /** Global bounding box across all observations, all steps. */
  domain: { x: [number, number]; y: [number, number] };
}

export interface StepDomain {
  x: [number, number];
  y: [number, number];
}

/**
 * Compute a tight bounding box at a given step from the configs whose hwKey
 * passes `hwFilter`. The replay panel calls this with `activeHwTypes` so axes
 * shrink to fit the currently-selected GPU(s) rather than the full timeline
 * fleet.
 *
 * Pass `() => true` to disable filtering and get the full visible domain.
 */
export function computeStepDomain(
  timeline: ReplayTimeline,
  stepIndex: number,
  hwFilter: (hwKey: string) => boolean,
): StepDomain {
  if (timeline.configs.length === 0) return { x: [0, 1], y: [0, 1] };
  const i = Math.max(0, Math.min(timeline.dates.length - 1, stepIndex));
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const c of timeline.configs) {
    if (!hwFilter(c.hwKey)) continue;
    const v = c.stepValues[i];
    if (!v?.visible) continue;
    if (v.x < xMin) xMin = v.x;
    if (v.x > xMax) xMax = v.x;
    if (v.y < yMin) yMin = v.y;
    if (v.y > yMax) yMax = v.y;
  }
  return { x: safeDomain(xMin, xMax), y: safeDomain(yMin, yMax) };
}

const buildPointConfigId = (point: InferenceData): string => {
  let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}|${point.decode_ep ?? 0}|${point.prefill_tp ?? 0}|${point.prefill_ep ?? 0}`;
  if (point.disagg) key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
  return key;
};

const safeDomain = (lo: number, hi: number): [number, number] => {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    // Pad degenerate single-point domains so axes don't collapse to a line.
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    return [lo - pad, hi + pad];
  }
  return lo < hi ? [lo, hi] : [hi, lo];
};

/**
 * Resolve which x-axis field a chart definition + selected metric should use.
 * Mirrors the logic in `useChartData` and `processOverlayChartData` so replay
 * frames sit on the same axes the static chart shows.
 */
function resolveXAxisField(
  chartDef: ChartDefinition,
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
): string {
  const metricTitle =
    (chartDef[`${selectedYAxisMetric}_title` as keyof ChartDefinition] as string) || '';
  const isInputMetric = metricTitle.toLowerCase().includes('input');
  const isTtftOverride =
    selectedXAxisMetric === 'p99_ttft' || selectedXAxisMetric === 'median_ttft';

  if (selectedXAxisMetric && chartDef.chartType === 'interactivity' && isInputMetric) {
    return selectedXAxisMetric;
  }
  if (chartDef.chartType === 'interactivity' && isInputMetric) {
    const xOverrideKey = `${selectedYAxisMetric}_x` as keyof ChartDefinition;
    return (chartDef[xOverrideKey] as string) || chartDef.x;
  }
  if (chartDef.chartType === 'e2e' && isTtftOverride) {
    return selectedXAxisMetric!;
  }
  return chartDef.x;
}

/**
 * Build the per-config history timeline for a replay session.
 *
 * For every (config_id) seen in `rows`, produce a sorted observation list of
 * (dateMs, x, y) using the same metric resolution the live chart uses. Returns
 * the list of distinct dates (ascending) and a global x/y domain spanning the
 * whole history so axes can stay pinned during playback.
 *
 * Filtering matches the chart: rows whose precision is not in
 * `selectedPrecisions` are dropped, and rows missing the requested metric on
 * the `InferenceData` shape are dropped. Empty input → empty timeline.
 */
export function buildReplayTimeline(
  rows: BenchmarkRow[],
  chartDef: ChartDefinition,
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
  selectedPrecisions: readonly string[],
): ReplayTimeline {
  if (rows.length === 0) {
    return {
      dates: [],
      configs: [],
      domain: { x: [0, 1], y: [0, 1] },
    };
  }

  const xAxisField = resolveXAxisField(chartDef, selectedYAxisMetric, selectedXAxisMetric);
  const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;
  const isDefaultY = selectedYAxisMetric === 'y' || !selectedYAxisMetric;

  const grouped = new Map<
    string,
    {
      hwKey: string;
      precision: string;
      observations: { point: InferenceData; dateMs: number }[];
    }
  >();
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const dateSet = new Set<string>();

  for (const row of rows) {
    if (!selectedPrecisions.includes(row.precision)) continue;

    const entry = rowToAggDataEntry(row);
    entry.hwKey = getHardwareKey(entry);
    const point = createChartDataPoint(
      row.date,
      entry,
      chartDef.x as keyof AggDataEntry,
      chartDef.y as keyof AggDataEntry,
      entry.hwKey,
    );

    const yMetric = isDefaultY
      ? point.y
      : ((point[metricKey] as { y: number } | undefined)?.y ?? null);
    if (yMetric === null) continue;

    const xVal =
      xAxisField === chartDef.x ? point.x : ((point as any)[xAxisField] as number | undefined);
    if (typeof xVal !== 'number' || !Number.isFinite(xVal) || !Number.isFinite(yMetric)) continue;
    if (xVal <= 0 || yMetric <= 0) continue;

    const finalPoint: InferenceData = { ...point, x: xVal, y: yMetric };
    const configId = buildPointConfigId(finalPoint);
    const dateMs = Date.parse(`${row.date}T00:00:00Z`);
    if (Number.isNaN(dateMs)) continue;

    let bucket = grouped.get(configId);
    if (!bucket) {
      bucket = {
        hwKey: String(finalPoint.hwKey ?? ''),
        precision: finalPoint.precision,
        observations: [],
      };
      grouped.set(configId, bucket);
    }
    bucket.observations.push({ point: finalPoint, dateMs });
    dateSet.add(row.date);
    if (xVal < xMin) xMin = xVal;
    if (xVal > xMax) xMax = xVal;
    if (yMetric < yMin) yMin = yMetric;
    if (yMetric > yMax) yMax = yMetric;
  }

  const dates = [...dateSet].toSorted();
  const dateMsList = dates.map((d) => Date.parse(`${d}T00:00:00Z`));

  const configs: ReplayConfigSeries[] = [];
  for (const [configId, bucket] of grouped) {
    bucket.observations.sort((a, b) => a.dateMs - b.dateMs);

    const byDate = new Map<number, { point: InferenceData; dateMs: number }>();
    for (const o of bucket.observations) byDate.set(o.dateMs, o);
    const dedup = [...byDate.values()].toSorted((a, b) => a.dateMs - b.dateMs);

    if (dedup.length === 0) continue;

    // Build per-step values: at step i, the config's value is its latest
    // observation with dateMs <= dates[i]. Sticky-last carries forward.
    const stepValues: PerStepValue[] = [];
    let obsIdx = 0;
    let latest: { x: number; y: number } | null = null;
    for (const stepMs of dateMsList) {
      while (obsIdx < dedup.length && dedup[obsIdx].dateMs <= stepMs) {
        const p = dedup[obsIdx].point;
        latest = { x: p.x, y: p.y };
        obsIdx++;
      }
      stepValues.push(
        latest === null
          ? { visible: false, x: 0, y: 0 }
          : { visible: true, x: latest.x, y: latest.y },
      );
    }

    configs.push({
      configId,
      hwKey: bucket.hwKey,
      precision: bucket.precision,
      template: dedup[0].point,
      stepValues,
    });
  }

  return {
    dates,
    configs,
    domain: { x: safeDomain(xMin, xMax), y: safeDomain(yMin, yMax) },
  };
}
