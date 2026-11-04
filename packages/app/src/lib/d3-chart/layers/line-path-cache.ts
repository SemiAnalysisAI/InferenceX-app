import * as d3 from 'd3';

interface Point {
  x: number;
  y: number;
}
type Project = (value: number) => number;

interface ProjectedPath {
  curve: d3.CurveFactory;
  defined: Uint8Array | null;
  xs: Float64Array;
  ys: Float64Array;
  path: string | null;
}

const pathsByElement = new WeakMap<Element, ProjectedPath>();

function sameValues(a: Float64Array | Uint8Array, b: Float64Array | Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    if (!Object.is(a[index], b[index])) return false;
  }
  return true;
}

export function projectedLinePath<T extends Point>(
  element: Element,
  points: T[],
  xScale: Project,
  yScale: Project,
  curve: d3.CurveFactory,
  isDefined?: (point: T, index: number, data: T[]) => boolean,
): string | null {
  const count = points.length;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const defined = isDefined ? new Uint8Array(count) : null;
  for (let index = 0; index < count; index++) {
    const point = points[index];
    if (defined) defined[index] = isDefined!(point, index, points) ? 1 : 0;
    xs[index] = xScale(point.x);
    ys[index] = yScale(point.y);
  }
  const previous = pathsByElement.get(element);
  if (
    previous &&
    previous.curve === curve &&
    (previous.defined === null) === (defined === null) &&
    (defined === null || sameValues(previous.defined!, defined)) &&
    sameValues(previous.xs, xs) &&
    sameValues(previous.ys, ys)
  ) {
    return previous.path;
  }
  const generator = d3
    .line<T>()
    .x((_, index) => xs[index])
    .y((_, index) => ys[index])
    .curve(curve);
  if (defined) generator.defined((_, index) => defined[index] === 1);
  const path = generator(points);
  pathsByElement.set(element, { curve, defined, xs, ys, path });
  return path;
}
