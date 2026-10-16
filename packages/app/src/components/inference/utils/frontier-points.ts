import type { InferenceData } from '../types';
import { runAttemptFromUrl, runIdFromUrl } from './powerTimeline';
import { pointTopologyKey } from './topology-filter';

/**
 * CSV export of a cross-platform frontier (PowerX Figure 16): the chart's own
 * global non-dominated set, one row per observation with its provenance.
 * Stable export columns: identity first, then plotted coordinates and provenance.
 */
export const FRONTIER_EXPORT_HEADERS = [
  'hardware',
  'framework',
  'precision',
  'topology',
  'concurrency',
  'x',
  'y',
  'date',
  'run_url',
  'run_id',
  'run_attempt',
  'recipe_fingerprint',
  'image',
  'point_id',
] as const;

export function frontierExportRow(point: InferenceData): (string | number | null)[] {
  return [
    point.hwKey,
    point.framework ?? null,
    point.precision,
    pointTopologyKey(point),
    point.conc,
    point.x,
    point.y,
    point.actualDate ?? point.date,
    point.run_url ?? null,
    runIdFromUrl(point.run_url),
    runAttemptFromUrl(point.run_url),
    point.recipe_fingerprint ?? null,
    point.image ?? null,
    point.id ?? null,
  ];
}
