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
  /** On its hardware's Pareto frontier over deployments. */
  optimal: boolean;
}

export interface VideoPlot {
  /** Deployment cells to draw, one per hardware until a GPUs-per-video sweep lands. */
  plotted: PlottedVideoPoint[];
  /** Per-hardware Pareto frontier over its deployment cells, ascending x; lines need two or more. */
  frontiers: Record<string, PlottedVideoPoint[]>;
  /** True once any hardware has more than one measured deployment. */
  multiLayout: boolean;
}

/**
 * The chart's data model. A hardware's curve is the Pareto frontier over its
 * measured deployments (GPUs per video and how they split the model). Client
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
  const byHardware = new Map<string, PlottedVideoPoint[]>();
  for (const p of plotted) {
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
  return { plotted, frontiers, multiLayout };
}
