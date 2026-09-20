import type { ParetoCoordinate } from './global-pareto';

/** Include every hardware series tied at a frontier coordinate. */
export function frontierHardwareKeys(
  visiblePoints: readonly (ParetoCoordinate & { hwKey: string })[],
  frontier: readonly ParetoCoordinate[],
): Set<string> {
  const coordinates = new Set(frontier.map(({ x, y }) => JSON.stringify([x, y])));
  return new Set(
    visiblePoints
      .filter(({ x, y }) => coordinates.has(JSON.stringify([x, y])))
      .map(({ hwKey }) => hwKey),
  );
}
