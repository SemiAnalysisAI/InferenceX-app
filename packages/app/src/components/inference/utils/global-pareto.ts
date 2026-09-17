export interface ParetoCoordinate {
  x: number;
  y: number;
}

const coordinates = (point: ParetoCoordinate) => `${point.x},${point.y}`;

/** Fill only beyond this boundary toward its own preferred (or worst) corner. */
export function paretoHighlightArea(
  points: readonly ParetoCoordinate[],
  cornerX: number,
  cornerY: number,
): string | null {
  if (points.length === 0) return null;
  const first = points[0];
  const last = points.at(-1)!;
  const polygon =
    cornerX === 0
      ? [{ x: cornerX, y: first.y }, ...points, { x: last.x, y: cornerY }]
      : [{ x: first.x, y: cornerY }, ...points, { x: cornerX, y: last.y }];
  polygon.push({ x: cornerX, y: cornerY });
  return `M${polygon.map(coordinates).join('L')}Z`;
}

/** Global, non-dominated observations. Never mutate the chart's bound data. */
export function globalParetoFrontier<T extends ParetoCoordinate>(
  points: readonly T[],
  maximizeX: boolean,
  maximizeY: boolean,
): T[] {
  const xSign = maximizeX ? -1 : 1;
  const ySign = maximizeY ? -1 : 1;
  const sorted = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .toSorted((a, b) => xSign * (a.x - b.x) || ySign * (a.y - b.y));
  let bestY = Infinity;
  return sorted
    .filter((point) => {
      const score = ySign * point.y;
      if (score >= bestY) return false;
      bestY = score;
      return true;
    })
    .toSorted((a, b) => a.x - b.x);
}

/**
 * Connect observed boundary points without extending to plot edges or filling
 * a region. Segments are linear in rendered coordinates, including log axes.
 */
export function paretoHighlightGeometry(
  frontier: readonly ParetoCoordinate[],
  xScale: (value: number) => number,
  yScale: (value: number) => number,
): { line: string | null; points: ParetoCoordinate[] } {
  const points = frontier
    .map((point) => ({ x: xScale(point.x), y: yScale(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .toSorted((a, b) => a.x - b.x);
  if (points.length === 0) return { line: null, points };
  const line = `M${points.map(coordinates).join('L')}`;
  return { line, points };
}
