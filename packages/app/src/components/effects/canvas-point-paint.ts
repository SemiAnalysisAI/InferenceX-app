/**
 * Lets an optional theme paint the charts' canvas scatter points in its own style without
 * touching chart code. The chart draws every point with `context.fill(path)` on its own canvas,
 * after moving the context to the point. Wrapping that one call on that one context instance
 * lets the theme paint in the chart's own draw loop: same frame, same animated position, same
 * colour, opacity and fade. If the chart ever draws differently the wrapper never matches and
 * the points stay as the chart drew them.
 */

/** The point shapes the charts use; they carry an encoding, so themes keep them apart. */
export type PointShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** A measured extent at or above this is the shape's enlarged (hovered or pinned) form. */
export const POINT_HOVER_EXTENT: Record<PointShape, number> = {
  circle: 5,
  square: 5,
  triangle: 4,
  diamond: 6,
};

/** True when the context only scales and moves, the same in both directions. */
export function isPlainTransform(t: DOMMatrix): boolean {
  return t.b === 0 && t.c === 0 && t.a === t.d && t.a > 0;
}

/**
 * How far the chart's point shape reaches from its centre, in the chart's own units. Zero when
 * it cannot be measured, which includes a canvas that has no size yet: do not cache a zero.
 */
export function measurePointExtent(
  context: CanvasRenderingContext2D,
  path: Path2D,
  t: DOMMatrix,
): number {
  let extent = 0;
  for (let reach = 0.5; reach <= 14; reach += 0.5) {
    if (!context.isPointInPath(path, t.e + reach * t.a, t.f)) break;
    extent = reach;
  }
  return extent;
}

/** Which of the chart's point shapes a path with that extent is. */
export function classifyPointShape(
  context: CanvasRenderingContext2D,
  path: Path2D,
  t: DOMMatrix,
  extent: number,
): PointShape {
  const inside = (dx: number, dy: number) =>
    context.isPointInPath(path, t.e + dx * extent * t.a, t.f + dy * extent * t.d);
  if (inside(0.9, 0.9)) return 'square';
  if (inside(0.65, 0.65)) return 'circle';
  return inside(0, 0.9) ? 'diamond' : 'triangle';
}

/**
 * Routes the point fills of a chart canvas through `paint`, which receives the chart's own
 * `fill` to draw with. Whatever `paint` throws falls back to the chart's drawing. Returns a
 * function that removes the wrappers again, or null when the canvas has no 2D context.
 */
export function hookPointFill(
  surface: HTMLCanvasElement,
  paint: (context: CanvasRenderingContext2D, path: Path2D, fill: (path: Path2D) => void) => void,
): (() => void) | null {
  const context = surface.getContext('2d');
  if (!context) return null;
  const fill = context.fill.bind(context) as (path: Path2D) => void;
  const save = context.save.bind(context);
  const restore = context.restore.bind(context);
  // Shapes the chart paints under the points are wrapped in save()/restore(); points are not.
  let depth = 0;
  context.save = () => {
    depth++;
    save();
  };
  context.restore = () => {
    depth = Math.max(0, depth - 1);
    restore();
  };
  context.fill = (...args: unknown[]) => {
    const [path] = args;
    if (depth === 0 && args.length === 1 && path instanceof Path2D) {
      try {
        paint(context, path, fill);
        return;
      } catch {
        // Fall through to the chart's own drawing.
      }
    }
    Reflect.apply(CanvasRenderingContext2D.prototype.fill, context, args);
  };
  return () => {
    // Drop the instance wrappers so the prototype methods show through again.
    Reflect.deleteProperty(context, 'fill');
    Reflect.deleteProperty(context, 'save');
    Reflect.deleteProperty(context, 'restore');
  };
}
