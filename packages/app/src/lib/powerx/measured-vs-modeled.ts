import { globalParetoFrontier } from '@/lib/charts/pareto-frontier';

import { snapTo } from './widget-hash';
import { type TutorialViewResponse, viewsInferenceUrl } from './views-api';

/**
 * The measured-vs-modeled chart: the same validated points on two metrics, energy per token
 * (input + output) from GPU telemetry and the facility-level energy the power model derives from it.
 */

export const MM_GPUS = ['b200', 'mi355x'] as const;
export const MM_VIEWS = ['measured', 'modeled'] as const;
export type MmView = (typeof MM_VIEWS)[number];
export const DEFAULT_MM_VIEW: MmView = 'measured';

export const MM_METRIC_KEYS: Record<MmView, string> = {
  measured: 'y_measuredJPerTotalToken',
  modeled: 'y_utilityModeledJPerTotalToken',
};

export const mmViewUrl = (view: MmView): string => viewsInferenceUrl(MM_METRIC_KEYS[view], MM_GPUS);

export function mmDashboardUrl(view: MmView): string {
  return `/inference?${new URLSearchParams({ i_metric: MM_METRIC_KEYS[view] }).toString()}`;
}

export interface PairedPoint {
  id: number | null;
  x: number;
  concurrency: number;
  date: string;
  measured: number;
  /** Null when the model declined the point (unsupported topology or telemetry). */
  modeled: number | null;
}

export interface PairedSeries {
  hwKey: string;
  gpu: string;
  label: string;
  points: PairedPoint[];
}

/** Joins the two responses by series key and point id; points are sorted by interactivity. */
export function pairSeries(
  measured: TutorialViewResponse,
  modeled: TutorialViewResponse,
): PairedSeries[] {
  const modeledById = new Map<string, number>();
  for (const series of modeled.series) {
    for (const point of series.points) modeledById.set(`${series.hwKey}:${point.id}`, point.y);
  }
  return measured.series
    .map((series) => ({
      hwKey: series.hwKey,
      gpu: series.gpu,
      label: series.label,
      points: series.points
        .filter((point) => Number.isFinite(point.x) && point.y > 0)
        .map((point) => ({
          id: point.id,
          x: point.x,
          concurrency: point.concurrency,
          date: point.date,
          measured: point.y,
          modeled: modeledById.get(`${series.hwKey}:${point.id}`) ?? null,
        }))
        .toSorted((a, b) => a.x - b.x),
    }))
    .filter((series) => series.points.length > 0);
}

/**
 * The frontier the dashboard draws for energy per token (direction `lower_right`: higher
 * interactivity and lower joules are both better), on one series' measured or modeled values.
 * Dominated points stay as dots; only the line follows the frontier.
 */
export function frontierLine(series: PairedSeries, key: 'measured' | 'modeled'): PairedPoint[] {
  const candidates = series.points
    .filter((point) => point[key] !== null)
    .map((point) => ({ point, x: point.x, y: point[key]! }));
  return globalParetoFrontier(candidates, true, false).map((entry) => entry.point);
}

export const encodeMmView = (view: MmView): string => view;
export const decodeMmView = (raw: string | null): MmView =>
  snapTo(raw ?? undefined, MM_VIEWS, DEFAULT_MM_VIEW);
