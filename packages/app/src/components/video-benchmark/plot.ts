import { deploymentKey, isQueueing } from './deployment';
import { paretoFrontier } from './frontier';
import { hardwareLabel } from './hardware';
import { metricValue, VIDEO_METRICS, type VideoPoint } from './metrics';
import { latestVideoCells } from './points';
import { metricOptions, type VideoDashboardState } from './video-url-state';

export interface PlottedVideoPoint extends VideoPoint {
  x: number;
  y: number;
  color: string;
  label: string;
  /** Client concurrency above one request per replica: the same deployment under load. */
  queued: boolean;
  /** On its hardware's Pareto frontier (deployment cells only). */
  optimal: boolean;
}

export interface VideoPlot {
  /** Cells to draw: deployments (dominated ones unless `optimal`), plus queued cells when `queue`. */
  plotted: PlottedVideoPoint[];
  /** Per-hardware Pareto frontier over its deployment cells, ascending x; lines need two or more. */
  frontiers: Record<string, PlottedVideoPoint[]>;
  /** Cross-hardware Pareto frontier over every deployment cell. */
  global: PlottedVideoPoint[];
  /** True once any hardware has more than one measured deployment. */
  multiLayout: boolean;
}

/**
 * The chart's data model. A hardware's curve is the Pareto frontier over its
 * measured deployments (GPUs per video and how they split the model); client
 * concurrency on a batch-one server only queues requests, so queued cells are
 * plotted as evidence but never join a frontier.
 */
export function plotVideoPoints(
  points: VideoPoint[],
  state: VideoDashboardState,
  colorFor: (hardwareKey: string) => string,
  hidden: ReadonlySet<string>,
): VideoPlot {
  const options = metricOptions(state);
  const cells: PlottedVideoPoint[] = latestVideoCells(points).flatMap((p) => {
    if (!p.hardwareKey || hidden.has(p.hardwareKey)) return [];
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
        queued: isQueueing(p),
        optimal: false,
      },
    ];
  });
  const deployments = cells.filter((p) => !p.queued);
  const byHardware = new Map<string, PlottedVideoPoint[]>();
  for (const p of deployments) {
    const list = byHardware.get(p.hardwareKey!) ?? [];
    list.push(p);
    byHardware.set(p.hardwareKey!, list);
  }
  const xBetter = VIDEO_METRICS[state.x].polarity;
  const yBetter = VIDEO_METRICS[state.y].polarity;
  const frontiers: Record<string, PlottedVideoPoint[]> = {};
  let multiLayout = false;
  for (const [key, list] of byHardware) {
    frontiers[key] = paretoFrontier(list, xBetter, yBetter);
    for (const p of frontiers[key]) p.optimal = true;
    if (new Set(list.map(deploymentKey)).size > 1) multiLayout = true;
  }
  const shown = state.optimal ? deployments.filter((p) => p.optimal) : deployments;
  const queued = state.queue && !state.optimal ? cells.filter((p) => p.queued) : [];
  return {
    plotted: [...shown, ...queued],
    frontiers,
    global: paretoFrontier(deployments, xBetter, yBetter),
    multiLayout,
  };
}
