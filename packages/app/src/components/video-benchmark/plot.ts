import { deploymentKey, isQueueing, runtimeKey } from './deployment';
import { paretoFrontier } from './frontier';
import { hardwareLabel } from './hardware';
import { metricValue, VIDEO_METRICS, type VideoPoint } from './metrics';
import { latestVideoCells } from './points';
import { metricOptions, type VideoDashboardState } from './video-url-state';

interface PlottedVideoPoint extends VideoPoint {
  x: number;
  y: number;
  color: string;
  label: string;
  /** On its hardware and engine's Pareto frontier over deployments. */
  optimal: boolean;
}

export interface VideoPlot {
  /** Deployment cells to draw: the frontier cells, plus the dominated ones when Optimal Only is off. */
  plotted: PlottedVideoPoint[];
  /**
   * Pareto frontier over the deployment cells of each hardware and engine, keyed
   * `<hardware>:<engine>` (`na` when no engine was recorded), ascending x; lines need two or more.
   */
  frontiers: Record<string, PlottedVideoPoint[]>;
  /** True once any hardware and engine has more than one measured deployment. */
  multiLayout: boolean;
}

/**
 * The chart's data model. Each hardware and engine's curve is the Pareto frontier
 * over its measured deployments (GPUs per video and how they split the model), so
 * one engine's frontier never dominates another's points away. Client
 * concurrency above one request per replica only queues on the batch-one
 * server, so those cells stay in the evidence panel and never reach the chart.
 */
export function plotVideoPoints(
  points: VideoPoint[],
  state: VideoDashboardState,
  colorFor: (hardwareKey: string) => string,
  hidden: ReadonlySet<string>,
): VideoPlot {
  const options = metricOptions(state);
  const plotted: PlottedVideoPoint[] = latestVideoCells(points).flatMap((p) => {
    if (!p.hardwareKey || hidden.has(p.hardwareKey) || isQueueing(p)) return [];
    const x = metricValue(p, state.x, options);
    const y = metricValue(p, state.y, options);
    if (x === null || y === null) return [];
    return [
      {
        ...p,
        x,
        y,
        color: colorFor(p.hardwareKey),
        label: hardwareLabel(p.hardwareKey),
        optimal: false,
      },
    ];
  });
  const byRuntime = Map.groupBy(plotted, (p) => `${p.hardwareKey}:${runtimeKey(p)}`);
  const xBetter = VIDEO_METRICS[state.x].polarity;
  const yBetter = VIDEO_METRICS[state.y].polarity;
  const frontiers: Record<string, PlottedVideoPoint[]> = {};
  let multiLayout = false;
  for (const [key, list] of byRuntime) {
    frontiers[key] = paretoFrontier(list, xBetter, yBetter);
    for (const p of frontiers[key]) p.optimal = true;
    if (new Set(list.map(deploymentKey)).size > 1) multiLayout = true;
  }
  return {
    plotted: state.optimal ? plotted.filter((p) => p.optimal) : plotted,
    frontiers,
    multiLayout,
  };
}

/**
 * Cells the table and CSV list: what the chart draws. With Optimal Only on,
 * each hardware and runtime's frontier deployments for the selected axes; off, every
 * non-queued deployment, including cells without a value on an axis.
 */
export function listedVideoCells(
  points: VideoPoint[],
  state: VideoDashboardState,
  hidden: ReadonlySet<string>,
): VideoPoint[] {
  const rows = latestVideoCells(points).filter(
    (p) => p.hardwareKey && !hidden.has(p.hardwareKey) && !isQueueing(p),
  );
  if (!state.optimal) return rows;
  const optimal = new Set(
    plotVideoPoints(points, state, () => '', hidden).plotted.map((p) => p.id),
  );
  return rows.filter((p) => optimal.has(p.id));
}
