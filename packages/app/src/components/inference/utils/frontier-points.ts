import type { InferenceData } from '../types';
import { equalServiceSourceKey } from './equal-service-comparison';
import { runAttemptFromUrl, runIdFromUrl } from './powerTimeline';
import { pointTopologyKey } from './topology-filter';

/**
 * Provenance of a cross-platform frontier (PowerX Figure 16). The frontier is
 * the chart's own global non-dominated set; this only makes the comparison
 * scope explicit: how many observations, sources, runs, topologies and images
 * competed, and which hardware owns the frontier.
 */
export interface FrontierScope {
  /** Observations that competed for the frontier. */
  eligible: number;
  sources: number;
  runs: number;
  topologies: number;
  images: number;
}

export function frontierScope(eligible: readonly InferenceData[]): FrontierScope {
  const distinct = (key: (point: InferenceData) => string | null | undefined) =>
    new Set(eligible.map(key).filter((value) => value !== null && value !== undefined)).size;
  return {
    eligible: eligible.length,
    sources: distinct(equalServiceSourceKey),
    runs: distinct((point) => point.run_url),
    topologies: distinct(pointTopologyKey),
    images: distinct((point) => point.image),
  };
}

/** Frontier points per hardware key, most first; ties keep hardware order. */
export function frontierHardwareCounts(
  frontier: readonly InferenceData[],
): { hwKey: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const point of frontier) counts.set(point.hwKey, (counts.get(point.hwKey) ?? 0) + 1);
  return [...counts]
    .map(([hwKey, count]) => ({ hwKey, count }))
    .toSorted((a, b) => b.count - a.count || a.hwKey.localeCompare(b.hwKey));
}

/** Stable export columns: identity first, then plotted coordinates and provenance. */
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
