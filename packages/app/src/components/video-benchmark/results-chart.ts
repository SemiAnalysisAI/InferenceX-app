import { paretoFrontier } from './frontier';
import { hardwareSort, type CostTier } from './hardware';
import type { ResultCell } from './results';

export type CostBasis = 'participating' | 'allocated';
export const COST_BASES: readonly CostBasis[] = ['participating', 'allocated'];

export interface ResultsMetricContext {
  basis: CostBasis;
  tier: CostTier;
}

export interface ResultsChartMetric {
  label: { en: string; zh: string };
  /** Empty when the label already names the unit. */
  unit: string;
  better: 'lower' | 'higher';
  digits: number;
  value: (cell: ResultCell, context: ResultsMetricContext) => number | null;
}

export const RESULTS_X_METRIC_KEYS = ['p50', 'p90'] as const;
export const RESULTS_Y_METRIC_KEYS = [
  'videoSecondsPerDollar',
  'videosPerGpuHour',
  'kjPerClip',
] as const;
export type ResultsXMetric = (typeof RESULTS_X_METRIC_KEYS)[number];
export type ResultsYMetric = (typeof RESULTS_Y_METRIC_KEYS)[number];

export const RESULTS_X_METRICS: Record<ResultsXMetric, ResultsChartMetric> = {
  p50: {
    label: { en: 'P50 latency per clip', zh: '单条视频 P50 延迟' },
    unit: 's',
    better: 'lower',
    digits: 1,
    value: (cell) => cell.point.p50,
  },
  p90: {
    label: { en: 'P90 latency per clip', zh: '单条视频 P90 延迟' },
    unit: 's',
    better: 'lower',
    digits: 1,
    value: (cell) => cell.point.p90,
  },
};

export const RESULTS_Y_METRICS: Record<ResultsYMetric, ResultsChartMetric> = {
  videoSecondsPerDollar: {
    label: { en: 'Video-seconds per $1 TCO', zh: '每 1 美元 TCO 生成的视频秒数' },
    unit: '',
    better: 'higher',
    digits: 1,
    value: (cell, { basis }) => {
      const cost = cell.cost[basis]?.perVideoSecond ?? null;
      return cost === null || cost <= 0 ? null : 1 / cost;
    },
  },
  videosPerGpuHour: {
    label: { en: 'Videos per GPU-hour', zh: '每 GPU 小时生成视频数' },
    unit: '',
    better: 'higher',
    digits: 2,
    value: (cell, { basis }) => {
      const gpus = cell.point[basis];
      return cell.clipsPerSecond !== null && gpus !== null && Number.isSafeInteger(gpus) && gpus > 0
        ? (cell.clipsPerSecond * 3600) / gpus
        : null;
    },
  },
  kjPerClip: {
    label: { en: 'GPU energy per valid clip', zh: '每条有效视频的 GPU 能耗' },
    unit: 'kJ',
    better: 'lower',
    digits: 1,
    value: (cell) => (cell.joulesPerClip === null ? null : cell.joulesPerClip / 1000),
  },
};

export const isResultsXMetric = (value: string | null): value is ResultsXMetric =>
  value !== null && Object.hasOwn(RESULTS_X_METRICS, value);
export const isResultsYMetric = (value: string | null): value is ResultsYMetric =>
  value !== null && Object.hasOwn(RESULTS_Y_METRICS, value);

export function resultsMetricLabel(metric: ResultsChartMetric, locale: 'en' | 'zh'): string {
  return metric.unit ? `${metric.label[locale]} (${metric.unit})` : metric.label[locale];
}

/** Run-qualified so a re-exported observation ID in a named run never opens the official cell. */
export const resultsPointKey = (cell: Pick<ResultCell, 'point'>): string =>
  `${cell.point.runId}:${cell.point.id}`;

export interface ResultsChartPoint {
  key: string;
  cell: ResultCell;
  x: number;
  y: number;
  /** On its series' Pareto frontier for the selected axes. */
  optimal: boolean;
}

export interface ResultsChartSeries {
  /** Hardware key, suffixed `-overlay` for the named run. */
  key: string;
  hardwareKey: string;
  overlay: boolean;
  /** Plotted points: the frontier only when Optimal Only is on. */
  points: ResultsChartPoint[];
  /** Ascending x; a curve needs two or more. */
  frontier: ResultsChartPoint[];
  /** Deployments with both axis values, before Optimal Only. */
  measured: number;
}

export interface ResultsChartSelection extends ResultsMetricContext {
  x: ResultsXMetric;
  y: ResultsYMetric;
  optimal: boolean;
  hidden: readonly string[];
}

/** One series per hardware and per named run, each with its own deployment frontier. */
export function resultsChartSeries(
  cells: readonly ResultCell[],
  selection: ResultsChartSelection,
): ResultsChartSeries[] {
  const x = RESULTS_X_METRICS[selection.x],
    y = RESULTS_Y_METRICS[selection.y];
  const groups = new Map<
    string,
    { hardwareKey: string; overlay: boolean; points: ResultsChartPoint[] }
  >();
  for (const cell of cells) {
    const hardwareKey = cell.point.hardwareKey;
    if (hardwareKey === null || selection.hidden.includes(hardwareKey)) continue;
    const xValue = x.value(cell, selection),
      yValue = y.value(cell, selection);
    if (xValue === null || yValue === null || !Number.isFinite(xValue) || !Number.isFinite(yValue))
      continue;
    const key = cell.overlay ? `${hardwareKey}-overlay` : hardwareKey;
    const group = groups.get(key) ?? { hardwareKey, overlay: cell.overlay, points: [] };
    group.points.push({ key: resultsPointKey(cell), cell, x: xValue, y: yValue, optimal: false });
    groups.set(key, group);
  }
  return [...groups]
    .map(([key, { hardwareKey, overlay, points }]) => {
      const frontier = paretoFrontier(points, x.better, y.better);
      for (const point of frontier) point.optimal = true;
      return {
        key,
        hardwareKey,
        overlay,
        points: selection.optimal ? frontier : points,
        frontier,
        measured: points.length,
      };
    })
    .toSorted(
      (a, b) =>
        hardwareSort(a.hardwareKey) - hardwareSort(b.hardwareKey) ||
        Number(a.overlay) - Number(b.overlay),
    );
}
