import type { InferenceData } from '../types';
import { pointTopologyKey } from './topology-filter';

/** Observed load sweeps, never a Pareto frontier or an envelope. */
export function groupConcurrencySeries(
  points: readonly InferenceData[],
): Map<string, InferenceData[]> {
  const groups = new Map<string, InferenceData[]>();
  for (const [index, point] of points.entries()) {
    // Unknown provenance cannot establish a controlled sweep. Keep its marker.
    const run = point.run_url || `unknown-run-${index}`;
    const key = JSON.stringify([
      point.hwKey,
      point.precision,
      point.date,
      run,
      pointTopologyKey(point),
      point.recipe_fingerprint ?? null,
      point.powerVariant?.id ?? null,
    ]);
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }
  const segments = new Map<string, InferenceData[]>();
  for (const [key, group] of groups) {
    const sorted = group.toSorted((a, b) => a.x - b.x);
    if (new Set(sorted.map((point) => point.x)).size === sorted.length) {
      segments.set(key, sorted);
    } else {
      // Repeats at the same load are distinct observations, not a fitted mean.
      sorted.forEach((point, index) => segments.set(`${key}:${index}`, [point]));
    }
  }
  return segments;
}
