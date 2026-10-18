import { comparisonCohortKey, deploymentEligible, deploymentKey } from './deployment';
import { paretoFrontier } from './frontier';
import { hardwareLabel } from './hardware';
import { metricValue, VIDEO_METRICS, type VideoPoint } from './metrics';
import { latestVideoCells } from './points';
import { qualityCohortKey, qualityEligibility } from './quality';
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
  /** Deployment cells to draw: the frontier cells, plus the dominated ones when Optimal Only is off. */
  plotted: PlottedVideoPoint[];
  /** Per-hardware, comparable-cohort frontiers, ascending x; lines need two or more. */
  frontiers: Record<string, PlottedVideoPoint[]>;
  /** True once a comparable cohort has more than one measured deployment. */
  multiLayout: boolean;
}

/** Shared chart/table/CSV admission, before any dominance calculation. */
function selectedQualityEligible(point: VideoPoint, state: VideoDashboardState): boolean {
  if (state.y !== 'quality' && state.qualityThreshold === null) return true;
  return qualityEligibility(point, {
    metric: state.qualityMetric,
    threshold: state.qualityThreshold,
  }).eligible;
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
    if (
      !p.hardwareKey ||
      hidden.has(p.hardwareKey) ||
      !deploymentEligible(p) ||
      !selectedQualityEligible(p, state)
    )
      return [];
    const x = metricValue(p, state.x, options);
    const y = metricValue(p, state.y, options);
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return [];
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
  for (const [hardware, list] of byHardware) {
    const cohorts = new Map<string, PlottedVideoPoint[]>();
    for (const point of list) {
      // Missing canonical identity may still be shown, but never joined or
      // used to dominate another observation, even from the same source.
      const comparison = comparisonCohortKey(point) ?? `unknown:${point.id}`;
      const cohort =
        state.y === 'quality' || state.qualityThreshold !== null
          ? JSON.stringify([comparison, qualityCohortKey(point, state.qualityMetric)])
          : comparison;
      cohorts.set(cohort, [...(cohorts.get(cohort) ?? []), point]);
    }
    let index = 0;
    for (const cohort of cohorts.values()) {
      const key = cohorts.size === 1 ? hardware : `${hardware}:${index++}`;
      const frontier = paretoFrontier(cohort, xBetter, yBetter);
      for (const point of frontier) point.optimal = true;
      // Repeated measurements of one deployment can trade latency for capacity
      // below its replica/batch limit. They are observations, not a deployment sweep.
      if (new Set(frontier.map(deploymentKey)).size < frontier.length) {
        for (const [measurement, point] of frontier.entries())
          frontiers[`${key}:observation${measurement}`] = [point];
      } else {
        frontiers[key] = frontier;
      }
      if (new Set(cohort.map(deploymentKey)).size > 1) multiLayout = true;
    }
  }
  return {
    plotted: state.optimal ? plotted.filter((p) => p.optimal) : plotted,
    frontiers,
    multiLayout,
  };
}

/**
 * Cells the table and CSV list: what the chart draws. With Optimal Only on,
 * each hardware's frontier deployments for the selected axes; off, every
 * non-queued deployment, including cells without a value on an axis.
 */
export function listedVideoCells(
  points: VideoPoint[],
  state: VideoDashboardState,
  hidden: ReadonlySet<string>,
): VideoPoint[] {
  const rows = latestVideoCells(points).filter(
    (p) =>
      p.hardwareKey &&
      !hidden.has(p.hardwareKey) &&
      deploymentEligible(p) &&
      selectedQualityEligible(p, state),
  );
  if (!state.optimal) return rows;
  const optimal = new Set(
    plotVideoPoints(points, state, () => '', hidden).plotted.map((p) => p.id),
  );
  return rows.filter((p) => optimal.has(p.id));
}
