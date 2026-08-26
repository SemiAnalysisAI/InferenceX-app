import type * as d3 from 'd3';

/**
 * Perf ruler layer — an ISO-X (iso-interactivity) measurement ruler between
 * two curves. The user clicks two curves; the ruler is a vertical line at a
 * freely chosen iso-x whose BOTH ends are interpolated on the two curves'
 * rendered roofline paths at that x (neither end needs to be a data point).
 * The ruler is draggable horizontally to fine-tune the iso-x. Short
 * horizontal end caps mark both ends and a big annotation-style label
 * (e.g. "2.03x") sits in open chart space with a curved arrow pointing at
 * the ruler line; the ratio compares the two RAW y-values at that x.
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
}

/** Format a performance multiple like "2.03x" (fewer decimals as it grows). */
export function formatPerfRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  if (ratio >= 100) return `${Math.round(ratio)}x`;
  if (ratio >= 10) return `${ratio.toFixed(1)}x`;
  return `${ratio.toFixed(2)}x`;
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
  };
}

/**
 * Whether a rendered curve is visible given its inline `opacity` style.
 * Legend and precision toggles hide curves with `opacity: 0` while leaving
 * the path in the DOM (so it can fade back in) — those curves must be
 * neither clickable nor measurable. Hover dimming uses small non-zero
 * values and stays measurable; a missing/empty opacity means fully visible.
 */
export function isPerfRulerCurveVisible(opacity: string | null | undefined): boolean {
  if (opacity === null || opacity === undefined) return true;
  const trimmed = opacity.trim();
  if (trimmed === '') return true;
  const value = Number(trimmed);
  return Number.isNaN(value) ? true : value > 0;
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
  /** Stroke for the ruler line, caps, arrow, and label (accent color). */
  color: string;
  /**
   * Halo stroke painted behind the big label (paint-order: stroke) so it
   * stays readable over chart content. Default `var(--background)`.
   */
  halo?: string;
  /** Chart inner width; lets the label flip sides instead of clipping. */
  chartWidth?: number;
  /** Chart inner height; lets the label drop below near the top edge. */
  chartHeight?: number;
  /** Half-length of the horizontal end caps in px. Default 6. */
  capHalfWidth?: number;
  /** Big ratio label font size in px. Default 32. */
  labelFontSize?: number;
}

export const DEFAULT_LABEL_FONT_SIZE = 32;
const LABEL_OFFSET_X = 46;
const LABEL_OFFSET_Y = 46;
const ARROW_TIP_GAP = 5;
const ARROW_HEAD_LENGTH = 9;
const ARROW_HEAD_HALF_WIDTH = 4.5;

export interface PerfRulerLabelLayoutOptions {
  /** Chart inner width; the label flips to the left side when clipping. */
  chartWidth?: number;
  /** Chart inner height; keeps the below-placement inside the chart. */
  chartHeight?: number;
  /** Label font size in px. Default {@link DEFAULT_LABEL_FONT_SIZE}. */
  fontSize?: number;
}

export interface PerfRulerLabelLayout {
  /** Text anchor-point x (near edge of the label, facing the line). */
  labelX: number;
  /** Text center y (render with dominant-baseline: central). */
  labelY: number;
  /** 'start' when the label sits right of the line, 'end' when left. */
  textAnchor: 'start' | 'end';
  /** +1 = label right of the ruler line, -1 = left. */
  side: 1 | -1;
  /** Curved arrow from under the label to the ruler-line midpoint. */
  arrowPath: string;
  /** Filled arrowhead triangle pointing at the ruler-line midpoint. */
  arrowHeadPath: string;
}

/**
 * Lay out the big annotation label and its arrow (mock-up: a large "2x"
 * next to the ruler with a curved arrow pointing at the vertical line).
 * The label prefers the upper-right of the line midpoint (open chart
 * space), flips horizontally when it would clip the right edge with more
 * room on the left, and drops below the midpoint when it would clip the
 * top. The arrow is a quarter-curve whose end tangent is horizontal, so
 * the arrowhead points squarely at the line's midpoint. Pure — unit
 * testable without a DOM (text width is estimated from the label length).
 */
export function computePerfRulerLabelLayout(
  geometry: Pick<PerfRulerGeometry, 'x' | 'y1' | 'y2' | 'ratioLabel'>,
  opts?: PerfRulerLabelLayoutOptions,
): PerfRulerLabelLayout {
  const fontSize = opts?.fontSize ?? DEFAULT_LABEL_FONT_SIZE;
  const midY = (geometry.y1 + geometry.y2) / 2;
  const estimatedWidth = geometry.ratioLabel.length * fontSize * 0.6;
  const requiredRoom = LABEL_OFFSET_X + estimatedWidth + 8;

  let side: 1 | -1 = 1;
  if (opts?.chartWidth !== undefined) {
    const roomRight = opts.chartWidth - geometry.x;
    if (roomRight < requiredRoom && geometry.x > roomRight) side = -1;
  }

  let above = true;
  let labelY = midY - LABEL_OFFSET_Y;
  if (labelY - fontSize / 2 < 4) {
    above = false;
    labelY = midY + LABEL_OFFSET_Y;
    if (opts?.chartHeight !== undefined && labelY + fontSize / 2 > opts.chartHeight - 4) {
      // No room below either — clamp the above-placement inside the chart.
      above = true;
      labelY = Math.max(fontSize / 2 + 4, midY - LABEL_OFFSET_Y);
    }
  }

  const labelX = geometry.x + side * LABEL_OFFSET_X;
  // Quarter-curve: leaves the label vertically, ends horizontally at the
  // back of the arrowhead so the head points straight at the line.
  const startX = labelX + side * 4;
  const startY = labelY + (above ? 1 : -1) * (fontSize / 2 + 6);
  const tipX = geometry.x + side * ARROW_TIP_GAP;
  const backX = tipX + side * ARROW_HEAD_LENGTH;
  const arrowPath = `M ${startX} ${startY} Q ${startX} ${midY} ${backX} ${midY}`;
  const arrowHeadPath =
    `M ${tipX} ${midY} ` +
    `L ${backX} ${midY - ARROW_HEAD_HALF_WIDTH} ` +
    `L ${backX} ${midY + ARROW_HEAD_HALF_WIDTH} Z`;

  return {
    labelX,
    labelY,
    textAnchor: side === 1 ? 'start' : 'end',
    side,
    arrowPath,
    arrowHeadPath,
  };
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
  // Curved annotation arrow + filled head pointing at the line midpoint.
  // The head is a plain filled triangle (no <marker>), so it needs no defs
  // ids, inherits nothing chart-specific, and PNG-exports like any path.
  entered
    .append('path')
    .attr('class', 'pr-arrow')
    .attr('fill', 'none')
    .attr('stroke-width', 2.5)
    .attr('stroke-linecap', 'round');
  entered.append('path').attr('class', 'pr-arrow-head').attr('stroke', 'none');
  // Big annotation-style ratio label with a halo stroke painted UNDER the
  // glyph fill (paint-order) so it reads over dense chart content without a
  // chip rect.
  entered
    .append('text')
    .attr('class', 'pr-text pr-text-ratio')
    .attr('dominant-baseline', 'central')
    .attr('font-weight', '800')
    .attr('paint-order', 'stroke')
    .attr('stroke-linejoin', 'round');
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

  const fontSize = opts.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE;
  const layout = computePerfRulerLabelLayout(geometry, {
    chartWidth: opts.chartWidth,
    chartHeight: opts.chartHeight,
    fontSize,
  });

  merged.select('.pr-arrow').attr('d', layout.arrowPath).attr('stroke', opts.color);
  merged.select('.pr-arrow-head').attr('d', layout.arrowHeadPath).attr('fill', opts.color);
  merged
    .select('.pr-text-ratio')
    .attr('x', layout.labelX)
    .attr('y', layout.labelY)
    .attr('text-anchor', layout.textAnchor)
    .attr('font-size', `${fontSize}px`)
    .attr('fill', opts.color)
    .attr('stroke', opts.halo ?? 'var(--background)')
    .attr('stroke-width', 5)
    .text(geometry.ratioLabel);
}
