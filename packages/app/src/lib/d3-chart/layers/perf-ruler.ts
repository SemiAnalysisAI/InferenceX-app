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
 * Multiple rulers can coexist (capped at {@link MAX_PERF_RULERS}); each is
 * individually draggable and deletable via a hover × button.
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

/** One completed measurement: a curve pair plus its iso-x in DATA space. */
export interface PerfRulerMeasurement {
  /** Stable id — render join key, drag identity, and delete target. */
  id: number;
  curveA: string;
  curveB: string;
  /** Iso-x in DATA space, so it survives zoom and metric changes. */
  isoX: number;
}

/**
 * Multi-ruler state: completed measurements accumulate in `rulers` while at
 * most one in-progress `draft` (curve A + iso-x, awaiting curve B) exists.
 * `nextId` is a monotonic counter so deleted ids are never reused.
 */
export interface PerfRulerState {
  rulers: PerfRulerMeasurement[];
  draft: PerfRulerCurveClick | null;
  nextId: number;
}

/**
 * Ruler cap — completing a measurement beyond this silently drops the
 * OLDEST ruler (keeps the chart readable while never rejecting the newest
 * measurement the user just placed).
 */
export const MAX_PERF_RULERS = 8;

export const EMPTY_PERF_RULER_STATE: PerfRulerState = { rulers: [], draft: null, nextId: 1 };

/**
 * Click-transition table for multi-ruler mode (clicks land on CURVES,
 * either on a widened curve hit stroke or via a data point standing in for
 * its curve at that point's x):
 *
 * | State      | Click on…              | Result                             |
 * |------------|------------------------|------------------------------------|
 * | no draft   | any curve              | new draft: curve A, iso-x = click  |
 * | draft on A | curve A again          | MOVE the draft iso-x to the click  |
 * | draft on A | a different curve B    | measurement COMPLETE at the draft  |
 * |            |                        | iso-x — appended to `rulers`, the  |
 * |            |                        | next click starts a fresh draft    |
 *
 * Completed rulers are never retargeted by clicks — clicking any curve
 * after completion starts a NEW ruler (move/reset semantics apply only to
 * the in-progress draft). Dragging a completed ruler moves its own iso-x
 * (see {@link movePerfRulerIsoX}); toggling the mode off clears everything.
 * Returns `prev` (same reference) for no-ops so React state can bail out.
 */
export function nextPerfRulerState(
  prev: PerfRulerState,
  click: PerfRulerCurveClick,
): PerfRulerState {
  if (!Number.isFinite(click.isoX)) return prev;
  if (!prev.draft) return { ...prev, draft: { curve: click.curve, isoX: click.isoX } };
  if (click.curve === prev.draft.curve) {
    return prev.draft.isoX === click.isoX
      ? prev
      : { ...prev, draft: { curve: prev.draft.curve, isoX: click.isoX } };
  }
  const measurement: PerfRulerMeasurement = {
    id: prev.nextId,
    curveA: prev.draft.curve,
    curveB: click.curve,
    isoX: prev.draft.isoX,
  };
  const rulers = [...prev.rulers, measurement];
  while (rulers.length > MAX_PERF_RULERS) rulers.shift();
  return { rulers, draft: null, nextId: prev.nextId + 1 };
}

/** Move one completed ruler's iso-x (drag commit). No-ops return `prev`. */
export function movePerfRulerIsoX(prev: PerfRulerState, id: number, isoX: number): PerfRulerState {
  if (!Number.isFinite(isoX)) return prev;
  const index = prev.rulers.findIndex((ruler) => ruler.id === id);
  if (index === -1 || prev.rulers[index].isoX === isoX) return prev;
  const rulers = [...prev.rulers];
  rulers[index] = { ...rulers[index], isoX };
  return { ...prev, rulers };
}

/** Delete one ruler by id. Unknown ids return `prev` (same reference). */
export function deletePerfRuler(prev: PerfRulerState, id: number): PerfRulerState {
  const rulers = prev.rulers.filter((ruler) => ruler.id !== id);
  return rulers.length === prev.rulers.length ? prev : { ...prev, rulers };
}

/** Clear all rulers and the draft. Already-empty state returns `prev`. */
export function clearPerfRulers(prev: PerfRulerState): PerfRulerState {
  if (prev.rulers.length === 0 && prev.draft === null) return prev;
  return { rulers: [], draft: null, nextId: prev.nextId };
}

/**
 * Prune rulers whose curves left the underlying data entirely (per-ruler:
 * a ruler survives while BOTH its curves still exist). Hidden-but-present
 * curves are the caller's visibility concern, not pruning — pass an
 * existence predicate, not a visibility one. Returns `prev` on no-ops.
 */
export function prunePerfRulers(
  prev: PerfRulerState,
  curveExists: (curve: string) => boolean,
): PerfRulerState {
  const rulers = prev.rulers.filter(
    (ruler) => curveExists(ruler.curveA) && curveExists(ruler.curveB),
  );
  const draft = prev.draft && curveExists(prev.draft.curve) ? prev.draft : null;
  if (rulers.length === prev.rulers.length && draft === prev.draft) return prev;
  return { ...prev, rulers, draft };
}

/** Every curve referenced by any ruler or the draft (hit-halo styling). */
export function perfRulerCurveSet(state: PerfRulerState): Set<string> {
  const curves = new Set<string>();
  for (const ruler of state.rulers) {
    curves.add(ruler.curveA);
    curves.add(ruler.curveB);
  }
  if (state.draft) curves.add(state.draft.curve);
  return curves;
}

export interface PerfRulerRenderOptions {
  /** Stroke for the ruler line, caps, arrow, and label (accent color). */
  color: string;
  /**
   * Halo stroke painted behind the big label (paint-order: stroke) so it
   * stays readable over chart content. Default `var(--background)`.
   */
  halo?: string;
  /** Half-length of the horizontal end caps in px. Default 6. */
  capHalfWidth?: number;
  /** Big ratio label font size in px. Default 32. */
  labelFontSize?: number;
  /** Called with the ruler's id when its hover × button is clicked. */
  onDelete?: (id: number) => void;
}

export const DEFAULT_LABEL_FONT_SIZE = 32;
const LABEL_OFFSET_X = 46;
const LABEL_OFFSET_Y = 46;
const ARROW_TIP_GAP = 5;
const ARROW_HEAD_LENGTH = 9;
const ARROW_HEAD_HALF_WIDTH = 4.5;
const DELETE_GAP = 18;
const LABEL_COLLISION_NUDGE_TRIES = 4;

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
  /** Center of the × delete button, just past the label's far end. */
  deleteX: number;
  deleteY: number;
}

/** Estimated label width without a DOM (unit-testable placement math). */
function estimateLabelWidth(label: string, fontSize: number): number {
  return label.length * fontSize * 0.6;
}

/** Build the arrow + delete positions for a chosen label placement. */
function buildLabelLayout(
  geometry: Pick<PerfRulerGeometry, 'x' | 'y1' | 'y2' | 'ratioLabel'>,
  side: 1 | -1,
  labelY: number,
  fontSize: number,
): PerfRulerLabelLayout {
  const midY = (geometry.y1 + geometry.y2) / 2;
  const labelX = geometry.x + side * LABEL_OFFSET_X;
  const above = labelY < midY;
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
  const estimatedWidth = estimateLabelWidth(geometry.ratioLabel, fontSize);
  return {
    labelX,
    labelY,
    textAnchor: side === 1 ? 'start' : 'end',
    side,
    arrowPath,
    arrowHeadPath,
    deleteX: labelX + side * (estimatedWidth + DELETE_GAP),
    deleteY: labelY,
  };
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
  const estimatedWidth = estimateLabelWidth(geometry.ratioLabel, fontSize);
  const requiredRoom = LABEL_OFFSET_X + estimatedWidth + 8;

  let side: 1 | -1 = 1;
  if (opts?.chartWidth !== undefined) {
    const roomRight = opts.chartWidth - geometry.x;
    if (roomRight < requiredRoom && geometry.x > roomRight) side = -1;
  }

  let labelY = midY - LABEL_OFFSET_Y;
  if (labelY - fontSize / 2 < 4) {
    labelY = midY + LABEL_OFFSET_Y;
    if (opts?.chartHeight !== undefined && labelY + fontSize / 2 > opts.chartHeight - 4) {
      // No room below either — clamp the above-placement inside the chart.
      labelY = Math.max(fontSize / 2 + 4, midY - LABEL_OFFSET_Y);
    }
  }

  return buildLabelLayout(geometry, side, labelY, fontSize);
}

/** Horizontal pixel span of a laid-out label (estimated, no DOM). */
function labelSpan(
  layout: PerfRulerLabelLayout,
  label: string,
  fontSize: number,
): { x0: number; x1: number } {
  const width = estimateLabelWidth(label, fontSize);
  return layout.textAnchor === 'start'
    ? { x0: layout.labelX, x1: layout.labelX + width }
    : { x0: layout.labelX - width, x1: layout.labelX };
}

/**
 * Lay out labels for MULTIPLE rulers at once with cheap collision handling:
 * each label after the first is nudged vertically (away from its ruler's
 * midpoint, up to a few steps) while its estimated box overlaps an already
 * placed label. Best-effort — after the nudge budget, residual overlap is
 * accepted. Null geometries pass through as null (hidden rulers keep their
 * slot so results align with the input array).
 */
export function computePerfRulerLabelLayouts(
  geometries: (Pick<PerfRulerGeometry, 'x' | 'y1' | 'y2' | 'ratioLabel'> | null)[],
  opts?: PerfRulerLabelLayoutOptions,
): (PerfRulerLabelLayout | null)[] {
  const fontSize = opts?.fontSize ?? DEFAULT_LABEL_FONT_SIZE;
  const placed: { x0: number; x1: number; y: number }[] = [];
  return geometries.map((geometry) => {
    if (!geometry) return null;
    let layout = computePerfRulerLabelLayout(geometry, opts);
    const midY = (geometry.y1 + geometry.y2) / 2;
    const overlapsPlaced = (candidate: PerfRulerLabelLayout): boolean => {
      const span = labelSpan(candidate, geometry.ratioLabel, fontSize);
      return placed.some(
        (box) =>
          span.x0 < box.x1 && box.x0 < span.x1 && Math.abs(candidate.labelY - box.y) < fontSize + 8,
      );
    };
    for (
      let attempt = 0;
      attempt < LABEL_COLLISION_NUDGE_TRIES && overlapsPlaced(layout);
      attempt++
    ) {
      // Nudge away from the midpoint in the label's current direction; when
      // that would clip the top, restart below the midpoint instead.
      const direction = layout.labelY < midY ? -1 : 1;
      let nudgedY = layout.labelY + direction * (fontSize + 10);
      if (direction === -1 && nudgedY - fontSize / 2 < 4) nudgedY = midY + LABEL_OFFSET_Y;
      layout = buildLabelLayout(geometry, layout.side, nudgedY, fontSize);
    }
    const span = labelSpan(layout, geometry.ratioLabel, fontSize);
    placed.push({ x0: span.x0, x1: span.x1, y: layout.labelY });
    return layout;
  });
}

/** One ruler ready to render: id (join key) + geometry + label layout. */
export interface PerfRulerRenderEntry {
  id: number;
  geometry: PerfRulerGeometry;
  layout: PerfRulerLabelLayout;
}

/** Delay before the hover × hides — bridges the label → × pointer gap. */
const DELETE_HIDE_DELAY_MS = 250;
const hideTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Toggle one ruler group's hover affordances (× button + line emphasis). */
function setPerfRulerHover(node: Element, hovered: boolean): void {
  const deleteButton = node.querySelector<SVGGElement>('.pr-delete');
  if (deleteButton) deleteButton.style.display = hovered ? '' : 'none';
  const line = node.querySelector<SVGLineElement>('.pr-line');
  line?.setAttribute('stroke-width', hovered ? '3' : '2');
}

/**
 * Render ALL perf rulers inside `group` as one keyed join (join key: ruler
 * id), so rulers enter/exit independently and drags stay bound to the right
 * ruler. Idempotent — safe to call from render, zoom, and display passes.
 *
 * Each ruler group is pointer-events: none so it never intercepts point
 * clicks; only its drag handle, its big label, and its × button opt back in.
 * Hovering the label (or drag handle) reveals a circular × delete button
 * next to the label — the × carries the `no-export` class, which
 * useChartExport strips from PNG exports.
 */
export function renderPerfRulers(
  group: GroupSelection,
  entries: PerfRulerRenderEntry[],
  opts: PerfRulerRenderOptions,
): void {
  const selection = group
    .selectAll<SVGGElement, PerfRulerRenderEntry>('.perf-ruler')
    .data(entries, (entry) => String(entry.id));

  selection.exit().remove();

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
  // chip rect. It is hoverable (pointer-events overrides the group's none)
  // so it can reveal this ruler's × delete button.
  entered
    .append('text')
    .attr('class', 'pr-text pr-text-ratio')
    .attr('dominant-baseline', 'central')
    .attr('font-weight', '800')
    .attr('paint-order', 'stroke')
    .attr('stroke-linejoin', 'round')
    .style('pointer-events', 'auto')
    .style('cursor', 'default');
  // Wide invisible drag handle over the line — the caller attaches d3.drag
  // to it to move this ruler's iso-x. Its own pointer-events overrides the
  // group's `none` (pointer-events inherits).
  entered
    .append('line')
    .attr('class', 'pr-drag')
    .attr('stroke', 'transparent')
    .attr('stroke-width', 16)
    .style('pointer-events', 'stroke')
    .style('cursor', 'ew-resize');
  // Circular × delete button, revealed on hover. `no-export` keeps it out
  // of PNG exports (useChartExport hides/filters that class).
  const enteredDelete = entered
    .append('g')
    .attr('class', 'pr-delete no-export')
    .style('display', 'none')
    .style('pointer-events', 'all')
    .style('cursor', 'pointer');
  enteredDelete.append('circle').attr('class', 'pr-delete-bg').attr('r', 10);
  enteredDelete
    .append('text')
    .attr('class', 'pr-delete-x')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', '12px')
    .attr('font-weight', '700')
    .text('×');

  const merged = entered.merge(selection).style('pointer-events', 'none');

  const capHalfWidth = opts.capHalfWidth ?? 6;
  const fontSize = opts.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE;

  merged
    .select<SVGLineElement>('.pr-line')
    .attr('x1', (entry) => entry.geometry.x)
    .attr('x2', (entry) => entry.geometry.x)
    .attr('y1', (entry) => entry.geometry.y1)
    .attr('y2', (entry) => entry.geometry.y2)
    .attr('stroke', opts.color);
  merged
    .select<SVGLineElement>('.pr-cap-top')
    .attr('x1', (entry) => entry.geometry.x - capHalfWidth)
    .attr('x2', (entry) => entry.geometry.x + capHalfWidth)
    .attr('y1', (entry) => entry.geometry.y1)
    .attr('y2', (entry) => entry.geometry.y1)
    .attr('stroke', opts.color);
  merged
    .select<SVGLineElement>('.pr-cap-bottom')
    .attr('x1', (entry) => entry.geometry.x - capHalfWidth)
    .attr('x2', (entry) => entry.geometry.x + capHalfWidth)
    .attr('y1', (entry) => entry.geometry.y2)
    .attr('y2', (entry) => entry.geometry.y2)
    .attr('stroke', opts.color);
  merged
    .select<SVGLineElement>('.pr-drag')
    .attr('x1', (entry) => entry.geometry.x)
    .attr('x2', (entry) => entry.geometry.x)
    .attr('y1', (entry) => entry.geometry.y1)
    .attr('y2', (entry) => entry.geometry.y2);

  merged
    .select<SVGPathElement>('.pr-arrow')
    .attr('d', (entry) => entry.layout.arrowPath)
    .attr('stroke', opts.color);
  merged
    .select<SVGPathElement>('.pr-arrow-head')
    .attr('d', (entry) => entry.layout.arrowHeadPath)
    .attr('fill', opts.color);
  merged
    .select<SVGTextElement>('.pr-text-ratio')
    .attr('x', (entry) => entry.layout.labelX)
    .attr('y', (entry) => entry.layout.labelY)
    .attr('text-anchor', (entry) => entry.layout.textAnchor)
    .attr('font-size', `${fontSize}px`)
    .attr('fill', opts.color)
    .attr('stroke', opts.halo ?? 'var(--background)')
    .attr('stroke-width', 5)
    .text((entry) => entry.geometry.ratioLabel);

  merged
    .select<SVGGElement>('.pr-delete')
    .attr('transform', (entry) => `translate(${entry.layout.deleteX}, ${entry.layout.deleteY})`)
    .on('click', (event: MouseEvent, entry: PerfRulerRenderEntry) => {
      event.stopPropagation();
      opts.onDelete?.(entry.id);
    });
  merged.select<SVGCircleElement>('.pr-delete-bg').attr('fill', opts.color);
  merged.select<SVGTextElement>('.pr-delete-x').attr('fill', opts.halo ?? 'var(--background)');

  // Hover reveal: the group itself is not hit-testable, but mouseenter /
  // mouseleave fire on it when the pointer enters/leaves its interactive
  // children (label, drag handle, ×). The pointer crosses dead space
  // between the label and the ×, so hide on a short delay and cancel the
  // timer when hover resumes.
  merged
    .on('mouseenter', (event: MouseEvent) => {
      const node = event.currentTarget as Element;
      const timer = hideTimers.get(node);
      if (timer !== undefined) {
        clearTimeout(timer);
        hideTimers.delete(node);
      }
      setPerfRulerHover(node, true);
    })
    .on('mouseleave', (event: MouseEvent) => {
      const node = event.currentTarget as Element;
      const timer = setTimeout(() => {
        hideTimers.delete(node);
        setPerfRulerHover(node, false);
      }, DELETE_HIDE_DELAY_MS);
      hideTimers.set(node, timer);
    });
}
