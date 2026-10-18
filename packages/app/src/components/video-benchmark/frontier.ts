import { paretoFrontUpperLeft } from '@/components/calculator/interpolation';

type Better = 'lower' | 'higher';

/**
 * Non-dominated set for two axes with declared directions. `paretoFrontUpperLeft`
 * keeps the points no other point beats on both a larger x and a larger y, so a
 * lower-is-better axis is fed negated. The same hull code therefore serves
 * time-to-video vs efficiency and time-to-video
 * vs cost. Result is sorted by ascending x.
 */
export function paretoFrontier<T extends { x: number; y: number }>(
  points: T[],
  xBetter: Better,
  yBetter: Better,
): T[] {
  const sx = xBetter === 'higher' ? 1 : -1;
  const sy = yBetter === 'higher' ? 1 : -1;
  const measured = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const frontier = paretoFrontUpperLeft(
    measured,
    (p) => sx * p.x,
    (p) => sy * p.y,
  );
  // The shared calculator keeps one point per coordinate. Distinct measured
  // deployments at that same nondominated coordinate must retain their identities.
  const coordinates = new Set(frontier.map((p) => JSON.stringify([p.x, p.y])));
  return measured
    .filter((p) => coordinates.has(JSON.stringify([p.x, p.y])))
    .toSorted((a, b) => a.x - b.x);
}
