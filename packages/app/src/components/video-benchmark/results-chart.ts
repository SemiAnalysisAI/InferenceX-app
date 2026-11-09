import { frontierArea } from '@/components/inference/utils/best-series-per-sku';
import { chipConfigKey, runtimeKey } from './deployment';
import { engineSort } from './engines';
import { paretoFrontier } from './frontier';
import { hardwareSort, type CostTier } from './hardware';
import { isLossy, optimizationsOf } from './optimizations';
import type { ResultCell, ResultsState } from './results';

export type CostBasis = 'participating' | 'allocated';
export const COST_BASES: readonly CostBasis[] = ['participating', 'allocated'];

export interface ResultsMetricContext {
  basis: CostBasis;
  tier: CostTier;
}

/** The clip length and frame rate every plotted deployment generates. */
export interface ResultsClip {
  seconds: number;
  fps: number;
}

export interface ResultsChartMetric {
  label: { en: string; zh: string };
  /** The axis title once the plotted clip is known, so a latency names the clip it measures. */
  clipLabel?: (clip: ResultsClip) => { en: string; zh: string };
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
    label: { en: 'Median latency per clip', zh: '单条视频中位延迟' },
    clipLabel: ({ seconds, fps }) => ({
      en: `Median latency per ${seconds} s clip at ${fps} fps`,
      zh: `生成一段 ${seconds} 秒、${fps} fps 视频的中位延迟`,
    }),
    unit: 's',
    better: 'lower',
    digits: 1,
    value: (cell) => cell.point.p50,
  },
  p90: {
    label: { en: 'P90 latency per clip', zh: '单条视频 P90 延迟' },
    clipLabel: ({ seconds, fps }) => ({
      en: `P90 latency per ${seconds} s clip at ${fps} fps`,
      zh: `生成一段 ${seconds} 秒、${fps} fps 视频的 P90 延迟`,
    }),
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

export function resultsMetricLabel(
  metric: ResultsChartMetric,
  locale: 'en' | 'zh',
  clip: ResultsClip | null = null,
): string {
  const label = (clip && metric.clipLabel?.(clip)) ?? metric.label;
  return metric.unit ? `${label[locale]} (${metric.unit})` : label[locale];
}

/** The clip every cell generates, or null when a cell lacks it or the cells disagree. */
export function resultsClip(cells: readonly ResultCell[]): ResultsClip | null {
  const first = cells[0]?.metadata;
  const seconds = first?.duration ?? null,
    fps = first?.fps ?? null;
  if (seconds === null || fps === null || seconds <= 0 || fps <= 0) return null;
  return cells.every(({ metadata }) => metadata.duration === seconds && metadata.fps === fps)
    ? { seconds, fps }
    : null;
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
  /** Unique per hardware, runtime (engine and optimizations) and run channel. */
  key: string;
  hardwareKey: string;
  /** Serving engine; null when the cells did not record one. */
  engine: string | null;
  /** Declared runtime optimizations, sorted. */
  optimizations: readonly string[];
  /** Any optimization changes the generated video, so the series never ranks against exact ones. */
  lossy: boolean;
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
  compareEngines: boolean;
  lossy: boolean;
}

export const resultsSelection = (state: ResultsState): ResultsChartSelection => ({
  x: state.xMetric,
  y: state.yMetric,
  basis: state.costBasis,
  tier: state.costTier,
  optimal: state.optimal,
  hidden: state.hidden,
  compareEngines: state.compareEngines,
  lossy: state.lossy,
});

/** Series order: hardware, then engine, lossless before lossy, the named run after the official one. */
const seriesOrder = (a: ResultsChartSeries, b: ResultsChartSeries) =>
  hardwareSort(a.hardwareKey) - hardwareSort(b.hardwareKey) ||
  engineSort(a.engine) - engineSort(b.engine) ||
  Number(a.lossy) - Number(b.lossy) ||
  Number(a.overlay) - Number(b.overlay);

const seriesRuntime = (cell: ResultCell) => ({
  engine: cell.metadata.engine,
  optimizations: optimizationsOf(cell.point),
  lossy: isLossy(cell.point),
});

/** Points the chart can place: visible hardware with finite values on both axes. */
function plottedPoints(
  cells: readonly ResultCell[],
  selection: ResultsChartSelection,
): { hardwareKey: string; point: ResultsChartPoint }[] {
  const x = RESULTS_X_METRICS[selection.x],
    y = RESULTS_Y_METRICS[selection.y];
  return cells.flatMap((cell) => {
    const hardwareKey = cell.point.hardwareKey;
    if (hardwareKey === null || selection.hidden.includes(hardwareKey)) return [];
    const xValue = x.value(cell, selection),
      yValue = y.value(cell, selection);
    if (xValue === null || yValue === null || !Number.isFinite(xValue) || !Number.isFinite(yValue))
      return [];
    return [
      {
        hardwareKey,
        point: { key: resultsPointKey(cell), cell, x: xValue, y: yValue, optimal: false },
      },
    ];
  });
}

/**
 * Chip Config history: one series per selected deployment, its runs in measurement
 * order and joined by a line, and a separate series for the named overlay run.
 * Every run is plotted; nothing is dominated.
 */
export function resultsHistorySeries(
  cells: readonly ResultCell[],
  selection: ResultsChartSelection,
): ResultsChartSeries[] {
  const groups = new Map<string, ResultsChartPoint[]>();
  for (const { point } of plottedPoints(cells, selection)) {
    const key = `${chipConfigKey(point.cell.point)}${point.cell.overlay ? '-overlay' : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), { ...point, optimal: true }]);
  }
  return [...groups]
    .map(([key, points]) => {
      const ordered = points.toSorted((a, b) =>
        (a.cell.point.observedAt ?? '').localeCompare(b.cell.point.observedAt ?? ''),
      );
      return {
        key,
        hardwareKey: ordered[0].cell.point.hardwareKey!,
        ...seriesRuntime(ordered[0].cell),
        overlay: ordered[0].cell.overlay,
        points: ordered,
        frontier: ordered,
        measured: ordered.length,
      };
    })
    .toSorted(seriesOrder);
}

/** A hardware's official cells and a named run's cells are ranked apart. */
const channelKey = (hardwareKey: string | null, overlay: boolean) =>
  `${hardwareKey}${overlay ? '-overlay' : ''}`;

const seriesKey = ({ point, overlay }: Pick<ResultCell, 'point' | 'overlay'>) =>
  `${point.hardwareKey}:${runtimeKey(point)}${overlay ? '-overlay' : ''}`;

/**
 * Each hardware's lossless series with the largest frontier area, per run channel:
 * InferenceX's best-series rule, so one engine is the default line per hardware.
 * Ties keep the earlier series in display order.
 */
function bestPerHardware(
  series: readonly ResultsChartSeries[],
  selection: ResultsChartSelection,
): ResultsChartSeries[] {
  const maximizeX = RESULTS_X_METRICS[selection.x].better === 'higher',
    maximizeY = RESULTS_Y_METRICS[selection.y].better === 'higher';
  const best = new Map<string, { item: ResultsChartSeries; area: number }>();
  for (const item of series.toSorted(seriesOrder)) {
    const channel = channelKey(item.hardwareKey, item.overlay);
    const area = frontierArea(item.frontier, maximizeX, maximizeY);
    if (area > (best.get(channel)?.area ?? -1)) best.set(channel, { item, area });
  }
  return [...best.values()].map(({ item }) => item);
}

/**
 * Series to plot, one per hardware, runtime and run channel, each with its own
 * deployment frontier so Optimal Only never lets one runtime hide another's.
 * Lossless series compete for each hardware's default line; comparing engines
 * keeps all of them. Lossy series never compete and appear only when requested.
 */
export function resultsChartSeries(
  cells: readonly ResultCell[],
  selection: ResultsChartSelection,
): ResultsChartSeries[] {
  const x = RESULTS_X_METRICS[selection.x],
    y = RESULTS_Y_METRICS[selection.y];
  const groups = Map.groupBy(plottedPoints(cells, selection), ({ point }) => seriesKey(point.cell));
  const series = [...groups].map(([key, plotted]): ResultsChartSeries => {
    const points = plotted.map(({ point }) => point);
    const frontier = paretoFrontier(points, x.better, y.better);
    for (const point of frontier) point.optimal = true;
    return {
      key,
      hardwareKey: plotted[0].hardwareKey,
      ...seriesRuntime(points[0].cell),
      overlay: points[0].cell.overlay,
      points: selection.optimal ? frontier : points,
      frontier,
      measured: points.length,
    };
  });
  const lossless = series.filter((item) => !item.lossy);
  return [
    ...(selection.compareEngines ? lossless : bestPerHardware(lossless, selection)),
    ...(selection.lossy ? series.filter((item) => item.lossy) : []),
  ].toSorted(seriesOrder);
}

/**
 * Some hardware shows two engines in one run channel, which asks for the
 * engine-comparison consent first. A named run is ranked on its own, so its
 * engine differing from the official one is not a comparison.
 */
export function comparesEngines(series: readonly ResultsChartSeries[]): boolean {
  const engines = new Map<string, Set<string | null>>();
  for (const { hardwareKey, overlay, engine } of series) {
    const channel = channelKey(hardwareKey, overlay);
    const seen = engines.get(channel) ?? new Set();
    if (seen.add(engine).size > 1) return true;
    engines.set(channel, seen);
  }
  return false;
}

/**
 * Cells that may stand for their hardware in cards, profit bars and clips: those of
 * a runtime the chart draws for that hardware and run channel, so they name the
 * chart's engine. A channel the chart draws nothing for keeps every cell. The page,
 * its server seed and the overview API all pick clips from these cells.
 */
export function chartedCells(
  projection: Record<
    'cells' | 'overlayCells' | 'deploymentCells' | 'overlayDeploymentCells',
    readonly ResultCell[]
  >,
  state: ResultsState,
): ResultCell[] {
  const series = resultsChartSeries(
    [...projection.deploymentCells, ...projection.overlayDeploymentCells],
    { ...resultsSelection(state), hidden: [] },
  );
  const drawn = new Set(series.map((item) => item.key));
  const channels = new Set(series.map((item) => channelKey(item.hardwareKey, item.overlay)));
  return [...projection.cells, ...projection.overlayCells].filter(
    (cell) =>
      !channels.has(channelKey(cell.point.hardwareKey, cell.overlay)) || drawn.has(seriesKey(cell)),
  );
}
