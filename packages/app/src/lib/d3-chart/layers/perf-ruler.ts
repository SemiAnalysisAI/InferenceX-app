import type * as d3 from 'd3';

/**
 * Perf ruler layer — an ISO-X (iso-interactivity) measurement ruler between
 * two curves. The user clicks two curves; the ruler is a vertical line at a
 * freely chosen iso-x whose BOTH ends are interpolated on the two curves'
 * rendered roofline paths at that x (neither end needs to be a data point).
 * The ruler is draggable horizontally to fine-tune the iso-x. Short
 * horizontal end caps mark both ends and a label chip shows the performance
 * multiple between the two RAW y-values at that x (e.g. "2.03x",
 * optionally "+103%").
 *
 * Pure module: intersection search and geometry math are separated from
 * rendering so all three are unit testable (see perf-ruler.test.ts).
 * Rendering follows the narrow-mutation rules from docs/d3-charts.md — a
 * single keyed join, texts written before any measurement, rects sized last.
 */

type GroupSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

/** One end of the ruler: a curve's interpolated position at the iso-x. */
export interface PerfRulerEndInput {
  /** Pixel y of the curve at the iso-x (from the rendered path). */
  py: number;
  /** Raw data-space y at that intersection (yScale.invert of `py`). */
  rawY: number;
}

export interface PerfRulerGeometry {
  /** Ruler line x pixel position: the iso-x through the x scale. */
  x: number;
  /** Top pixel y of the ruler span. */
  y1: number;
  /** Bottom pixel y of the ruler span. */
  y2: number;
  /** Performance multiple: higher raw y over lower raw y (>= 1). */
  ratio: number;
  /** Formatted ratio, e.g. "2.03x". */
  ratioLabel: string;
  /** Formatted relative gain, e.g. "+103%". */
  percentLabel: string;
}

/** Format a performance multiple like "2.03x" (fewer decimals as it grows). */
export function formatPerfRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  if (ratio >= 100) return `${Math.round(ratio)}x`;
  if (ratio >= 10) return `${ratio.toFixed(1)}x`;
  return `${ratio.toFixed(2)}x`;
}

/** Format the relative gain of a multiple like "+103%". */
export function formatPerfPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  return `+${Math.round((ratio - 1) * 100)}%`;
}

/**
 * Minimal path interface needed by {@link intersectPathAtX}. Satisfied by a
 * real `SVGPathElement`; unit tests supply a synthetic polyline
 * implementation, since jsdom has no path-length support.
 */
export interface PerfRulerPathLike {
  getTotalLength: () => number;
  getPointAtLength: (length: number) => { x: number; y: number };
}

/**
 * Find the point on `path` at horizontal pixel position `x` via binary search
 * over the path-length parameter. Valid for paths whose x is monotonic along
 * their length — true for every roofline: they are Pareto frontiers sorted by
 * x and rendered with `d3.curveMonotoneX`, which preserves x-monotonicity.
 *
 * Works in RENDERED pixel space: the roofline `d` attribute is rewritten with
 * the current scales on every zoom/metric pass before this layer runs, so the
 * intersection matches the drawn curve exactly at any zoom level. Returns
 * null when `x` lies outside the path's x extent (curve B does not span the
 * anchor's x) or the path is degenerate.
 */
export function intersectPathAtX(
  path: PerfRulerPathLike,
  x: number,
  opts?: { tolerance?: number; maxIterations?: number },
): { x: number; y: number } | null {
  if (!Number.isFinite(x)) return null;
  const total = path.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) return null;

  const start = path.getPointAtLength(0);
  const end = path.getPointAtLength(total);
  const ascending = end.x >= start.x;
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  // Half-pixel slack so an anchor sitting exactly on a curve endpoint (a
  // shared frontier point) still intersects despite float noise.
  const slack = 0.5;
  if (x < minX - slack || x > maxX + slack) return null;

  const tolerance = opts?.tolerance ?? 0.25;
  const maxIterations = opts?.maxIterations ?? 48;
  let lo = 0;
  let hi = total;
  let best = Math.abs(start.x - x) <= Math.abs(end.x - x) ? start : end;
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const p = path.getPointAtLength(mid);
    if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    if (Math.abs(p.x - x) <= tolerance) return { x: p.x, y: p.y };
    if (ascending === p.x < x) lo = mid;
    else hi = mid;
  }
  // Interval exhausted without hitting tolerance (extremely steep segment) —
  // the closest sample seen is still visually on the curve.
  return { x: best.x, y: best.y };
}

/**
 * Compute iso-x ruler geometry from the two curves' interpolated positions
 * at the iso-x pixel `x`. Returns null for degenerate inputs: non-finite
 * coordinates or non-positive raw y values (a ratio over a zero/negative
 * value is meaningless, and log scales cannot place them). The ratio is
 * symmetric: higher raw y over lower raw y, regardless of click order.
 */
export function computeIsoXRulerGeometry(
  x: number,
  a: PerfRulerEndInput,
  b: PerfRulerEndInput,
): PerfRulerGeometry | null {
  const inputs = [x, a.py, a.rawY, b.py, b.rawY];
  if (!inputs.every((value) => Number.isFinite(value))) return null;
  if (a.rawY <= 0 || b.rawY <= 0) return null;

  const hi = Math.max(a.rawY, b.rawY);
  const lo = Math.min(a.rawY, b.rawY);
  const ratio = hi / lo;

  return {
    x,
    y1: Math.min(a.py, b.py),
    y2: Math.max(a.py, b.py),
    ratio,
    ratioLabel: formatPerfRatio(ratio),
    percentLabel: formatPerfPercent(ratio),
  };
}

/** Inclusive pixel x range, e.g. the horizontal extent of a rendered path. */
export interface PerfRulerXRange {
  min: number;
  max: number;
}

/**
 * Horizontal pixel extent of a rendered path. Valid for paths whose x is
 * monotonic along the length parameter (rooflines: pareto frontiers sorted
 * by x). Returns null for empty/degenerate paths.
 */
export function pathXExtent(path: PerfRulerPathLike): PerfRulerXRange | null {
  const total = path.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) return null;
  const start = path.getPointAtLength(0);
  const end = path.getPointAtLength(total);
  if (!Number.isFinite(start.x) || !Number.isFinite(end.x)) return null;
  return { min: Math.min(start.x, end.x), max: Math.max(start.x, end.x) };
}

/**
 * Clamp an iso-x pixel position to the overlapping x range of two curves so
 * a drag can never leave the span where both intersections exist. Returns
 * null when the ranges do not overlap (no valid iso-x at all) or the input
 * is not finite.
 */
export function clampIsoX(
  x: number,
  a: PerfRulerXRange,
  b?: PerfRulerXRange | null,
): number | null {
  if (!Number.isFinite(x)) return null;
  const min = b ? Math.max(a.min, b.min) : a.min;
  const max = b ? Math.min(a.max, b.max) : a.max;
  if (min > max) return null;
  return Math.min(Math.max(x, min), max);
}

/** One perf-ruler click: a curve identity plus the click's data-space x. */
export interface PerfRulerCurveClick {
  curve: string;
  isoX: number;
}

/**
 * Perf-ruler selection: up to two curve identities plus the iso-x (in DATA
 * space, so it survives zoom and metric changes). Neither end is a data
 * point — both are interpolated on the curves' rendered paths at the iso-x.
 */
export interface PerfRulerCurveSelection {
  curves: string[];
  isoX: number | null;
}

export const EMPTY_PERF_RULER_SELECTION: PerfRulerCurveSelection = { curves: [], isoX: null };

/**
 * Selection-transition table for perf-ruler clicks (curve-to-curve
 * semantics — clicks land on CURVES, either directly on a widened curve hit
 * stroke or via a data point standing in for its curve at that point's x):
 *
 * | State           | Click on…                | Result                          |
 * |-----------------|--------------------------|---------------------------------|
 * | empty           | any curve                | curve A selected, iso-x = click |
 * | any             | an already-selected curve| MOVE iso-x to the click's x     |
 * | A only          | a different curve        | curve B selected — measurement  |
 * |                 |                          | complete at the existing iso-x  |
 * | A + B           | a third curve            | new measurement: that curve is  |
 * |                 |                          | the new A, iso-x = click        |
 *
 * Dragging the ruler (not handled here) also moves the iso-x; toggling the
 * mode off clears the selection. Returns `prev` (same reference) for
 * invalid clicks so React state updates can bail out without re-rendering.
 */
export function nextPerfRulerSelection(
  prev: PerfRulerCurveSelection,
  click: PerfRulerCurveClick,
): PerfRulerCurveSelection {
  if (!Number.isFinite(click.isoX)) return prev;
  const [a, b] = prev.curves;
  if (!a) return { curves: [click.curve], isoX: click.isoX };
  if (click.curve === a || click.curve === b) {
    return prev.isoX === click.isoX ? prev : { curves: prev.curves, isoX: click.isoX };
  }
  if (!b) return { curves: [a, click.curve], isoX: prev.isoX ?? click.isoX };
  return { curves: [click.curve], isoX: click.isoX };
}

export interface PerfRulerRenderOptions {
  /** Stroke for the ruler line and end caps (e.g. `var(--primary)`). */
  color: string;
  /** Label chip background (readability over chart marks). */
  labelBg: string;
  /** Label text color, paired with `labelBg`. */
  labelText: string;
  /** Chart inner width; lets the label flip sides instead of clipping. */
  chartWidth?: number;
  /** Half-length of the horizontal end caps in px. Default 6. */
  capHalfWidth?: number;
  /**
   * Minimum vertical pixel span before the secondary "+NN%" line is shown.
   * Below this the chip only fits the ratio cleanly. Default 34.
   */
  minSpanForPercent?: number;
}

const LABEL_GAP = 10;
const CHIP_PAD_X = 6;
const CHIP_PAD_Y = 4;
const RATIO_FONT_SIZE = 11;
const PERCENT_FONT_SIZE = 9;
const LINE_HEIGHT = 13;
export const DEFAULT_MIN_SPAN_FOR_PERCENT = 34;

/**
 * Estimate text width via getBBox when a real DOM is available, falling back
 * to a character-count estimate in non-DOM environments (unit tests).
 */
function measureTextWidth(node: unknown, text: string, fontSize: number): number {
  const maybe = node as { getBBox?: () => { width: number } } | null;
  if (maybe && typeof maybe.getBBox === 'function') {
    const width = maybe.getBBox().width;
    if (width > 0) return width;
  }
  return text.length * fontSize * 0.62;
}

/**
 * Render (or clear, when `geometry` is null) the perf ruler inside `group`.
 * Idempotent keyed join — safe to call from render, zoom, and display passes.
 * The whole layer is pointer-events: none so it never intercepts point clicks.
 */
export function renderPerfRuler(
  group: GroupSelection,
  geometry: PerfRulerGeometry | null,
  opts: PerfRulerRenderOptions,
): void {
  const selection = group
    .selectAll<SVGGElement, PerfRulerGeometry>('.perf-ruler')
    .data(geometry ? [geometry] : []);

  selection.exit().remove();
  if (!geometry) return;

  const entered = selection.enter().append('g').attr('class', 'perf-ruler');
  entered
    .append('line')
    .attr('class', 'pr-line')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5 4');
  entered.append('line').attr('class', 'pr-cap pr-cap-top').attr('stroke-width', 2);
  entered.append('line').attr('class', 'pr-cap pr-cap-bottom').attr('stroke-width', 2);
  entered.append('rect').attr('class', 'pr-bg').attr('rx', 4).attr('ry', 4).attr('opacity', 0.92);
  entered
    .append('text')
    .attr('class', 'pr-text pr-text-ratio')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', `${RATIO_FONT_SIZE}px`)
    .attr('font-weight', '700');
  entered
    .append('text')
    .attr('class', 'pr-text pr-text-percent')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', `${PERCENT_FONT_SIZE}px`)
    .attr('font-weight', '600');
  // Wide invisible drag handle over the line — the caller attaches d3.drag
  // to it to move the iso-x. Its own pointer-events overrides the group's
  // `none` (pointer-events inherits), so only this element is interactive.
  entered
    .append('line')
    .attr('class', 'pr-drag')
    .attr('stroke', 'transparent')
    .attr('stroke-width', 16)
    .style('pointer-events', 'stroke')
    .style('cursor', 'ew-resize');

  const merged = entered.merge(selection).style('pointer-events', 'none');

  const { x, y1, y2 } = geometry;
  const capHalfWidth = opts.capHalfWidth ?? 6;
  const midY = (y1 + y2) / 2;

  merged
    .select('.pr-line')
    .attr('x1', x)
    .attr('x2', x)
    .attr('y1', y1)
    .attr('y2', y2)
    .attr('stroke', opts.color);
  merged
    .select('.pr-cap-top')
    .attr('x1', x - capHalfWidth)
    .attr('x2', x + capHalfWidth)
    .attr('y1', y1)
    .attr('y2', y1)
    .attr('stroke', opts.color);
  merged
    .select('.pr-cap-bottom')
    .attr('x1', x - capHalfWidth)
    .attr('x2', x + capHalfWidth)
    .attr('y1', y2)
    .attr('y2', y2)
    .attr('stroke', opts.color);
  merged.select('.pr-drag').attr('x1', x).attr('x2', x).attr('y1', y1).attr('y2', y2);

  const showPercent =
    Math.abs(y2 - y1) >= (opts.minSpanForPercent ?? DEFAULT_MIN_SPAN_FOR_PERCENT) &&
    geometry.percentLabel !== '';

  // Two passes per docs/d3-charts.md "Batched Label Measurement": write both
  // texts first, then measure, then position the chip and texts.
  merged.select('.pr-text-ratio').attr('fill', opts.labelText).text(geometry.ratioLabel);
  merged
    .select('.pr-text-percent')
    .attr('fill', opts.labelText)
    .style('display', showPercent ? '' : 'none')
    .text(showPercent ? geometry.percentLabel : '');

  const ratioWidth = measureTextWidth(
    merged.select('.pr-text-ratio').node(),
    geometry.ratioLabel,
    RATIO_FONT_SIZE,
  );
  const percentWidth = showPercent
    ? measureTextWidth(
        merged.select('.pr-text-percent').node(),
        geometry.percentLabel,
        PERCENT_FONT_SIZE,
      )
    : 0;
  const chipWidth = Math.max(ratioWidth, percentWidth) + CHIP_PAD_X * 2;
  const chipHeight = (showPercent ? 2 : 1) * LINE_HEIGHT + CHIP_PAD_Y * 2;

  // Prefer the right side of the line; flip left when the chip would clip.
  const flipLeft = opts.chartWidth !== undefined && x + LABEL_GAP + chipWidth > opts.chartWidth;
  const chipX = flipLeft ? x - LABEL_GAP - chipWidth : x + LABEL_GAP;
  const chipY = midY - chipHeight / 2;
  const textX = chipX + chipWidth / 2;

  merged
    .select('.pr-bg')
    .attr('x', chipX)
    .attr('y', chipY)
    .attr('width', chipWidth)
    .attr('height', chipHeight)
    .attr('fill', opts.labelBg);
  merged
    .select('.pr-text-ratio')
    .attr('x', textX)
    .attr('y', chipY + CHIP_PAD_Y + LINE_HEIGHT / 2);
  merged
    .select('.pr-text-percent')
    .attr('x', textX)
    .attr('y', chipY + CHIP_PAD_Y + LINE_HEIGHT * 1.5);
}
