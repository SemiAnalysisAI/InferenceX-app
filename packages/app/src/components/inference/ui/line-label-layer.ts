import * as d3 from 'd3';

import { pointNearestX } from '@/components/inference/ui/line-label-anchor';
import { plotClipSize } from '@/lib/d3-chart/plot-bounds';

export interface CartesianPoint {
  x: number;
  y: number;
}

export interface LineLabelSeries<TPoint extends CartesianPoint> {
  key: string;
  seriesId: string;
  label: string;
  color: string;
  points: readonly TPoint[];
  keepVisibleOnCollision?: boolean;
}

export interface LineLabelPlacement {
  key: string;
  seriesId: string;
  label: string;
  color: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface RectBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function rectsOverlap(a: RectBounds, b: RectBounds): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function firstNonCollidingRect(
  candidates: readonly RectBounds[],
  placed: readonly RectBounds[],
): number | null {
  for (let i = 0; i < candidates.length; i++) {
    if (!placed.some((other) => rectsOverlap(candidates[i], other))) return i;
  }
  return null;
}

/**
 * Horizontal shift that slides `rect` fully inside `bounds`, or `null` when it
 * is wider than the bounds and cannot fit at any offset. Zero when it already
 * fits; positive moves right, negative moves left.
 */
export function horizontalShiftIntoBounds(rect: RectBounds, bounds: RectBounds): number | null {
  if (rect.right - rect.left > bounds.right - bounds.left) return null;
  if (rect.left < bounds.left) return bounds.left - rect.left;
  if (rect.right > bounds.right) return bounds.right - rect.right;
  return 0;
}

/** Whether `rect` lies fully inside `bounds` on the vertical axis. */
export function fitsVertically(rect: RectBounds, bounds: RectBounds): boolean {
  return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
}

/**
 * The plot area in zoom-group coordinates — the strict bounding box every
 * point label must stay inside. Read from the clip rect `setupChart` puts on
 * the zoom group; `null` for charts that do not clip (`clipContent: false`),
 * where nothing is painted away and no constraint applies.
 */
export function plotAreaBounds(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
): RectBounds | null {
  const node = zoomGroup.node();
  const size = node ? plotClipSize(node) : null;
  return size ? { left: 0, top: 0, right: size.width, bottom: size.height } : null;
}

/** A drawn pill box, as centre point + half-width, for overlap tests. */
export interface PlacedBox {
  x: number;
  y: number;
  halfW: number;
}

/**
 * Centre + half-width of every visible parallelism pill inside `root`.
 *
 * Line labels are placed greedily against a list of boxes they must not sit on
 * top of. The pills are drawn before the label layers run, so seeding that
 * list from the DOM is what keeps a run name off a "TP8 / PP2" chip.
 */
export function parallelismLabelBoxes(root: SVGGElement | null): PlacedBox[] {
  const boxes: PlacedBox[] = [];
  if (!root) return boxes;
  for (const node of root.querySelectorAll<SVGGElement>('.parallelism-label')) {
    // Hidden pills stay in the DOM but must not push labels around.
    if (node.style.opacity === '0') continue;
    const match = /translate\((?<tx>[^,]+),(?<ty>[^)]+)\)/u.exec(
      node.getAttribute('transform') ?? '',
    );
    if (!match?.groups) continue;
    const x = Number(match.groups.tx);
    const y = Number(match.groups.ty);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const width = Number(node.querySelector('.pl-bg')?.getAttribute('width') ?? 0);
    boxes.push({ x, y, halfW: (Number.isFinite(width) ? width : 0) / 2 });
  }
  return boxes;
}

/**
 * Bounding boxes of the pills drawn over the plot: run-name labels
 * (`.line-label`) and parallelism labels (`.parallelism-label`).
 *
 * Both are positioned by the roofline layer, which always runs before point
 * label collision avoidance, so reading the DOM gives their final placement
 * for the current frame. The group carries a `translate(...)` and the
 * `.ll-bg`/`.pl-bg` rect carries an offset sized to its text; summing the two
 * puts the box in the same space as a point label's centre.
 */
function pillObstacles(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
): RectBounds[] {
  const boxes: RectBounds[] = [];
  zoomGroup.selectAll<SVGGElement, unknown>('.line-label, .parallelism-label').each(function () {
    // A hidden pill is still in the DOM but covers nothing.
    if (this.style.opacity === '0') return;
    const match = /translate\((?<tx>[^,]+),(?<ty>[^)]+)\)/u.exec(
      this.getAttribute('transform') ?? '',
    );
    const background = this.querySelector<SVGRectElement>('.ll-bg, .pl-bg');
    if (!match?.groups || !background) return;
    const tx = Number(match.groups.tx);
    const ty = Number(match.groups.ty);
    const x = Number(background.getAttribute('x'));
    const y = Number(background.getAttribute('y'));
    const width = Number(background.getAttribute('width'));
    const height = Number(background.getAttribute('height'));
    if (![tx, ty, x, y, width, height].every((value) => Number.isFinite(value))) return;
    boxes.push({ left: tx + x, top: ty + y, right: tx + x + width, bottom: ty + y + height });
  });
  return boxes;
}

/**
 * Preferred anchor fractions along a line, from left to right. Each series
 * starts at a different slot (rotated by its index) so labels spread across
 * the plot instead of all racing for the same spot, then falls back to the
 * remaining slots on collision.
 */
const ANCHOR_SLOTS = [0.25, 0.5, 0.75, 1] as const;

function lineCandidates<TPoint extends CartesianPoint>(
  points: readonly TPoint[],
  seriesIndex: number,
): TPoint[] {
  const last = points.length - 1;
  if (last <= 0) return [points[0]];
  // Clamp to index >= 1 so a label never sits on the line's first point,
  // which typically hugs the axis.
  const at = (fraction: number) => points[Math.max(1, Math.min(last, Math.round(fraction * last)))];
  const candidates: TPoint[] = [];
  for (let slot = 0; slot < ANCHOR_SLOTS.length; slot++) {
    const point = at(ANCHOR_SLOTS[(slot + seriesIndex) % ANCHOR_SLOTS.length]);
    if (!candidates.includes(point)) candidates.push(point);
  }
  return candidates;
}

export function placeLineLabels<TPoint extends CartesianPoint>(
  series: readonly LineLabelSeries<TPoint>[],
  xScale: (value: number) => number,
  yScale: (value: number) => number,
  options: {
    collisionWidth: number;
    collisionHeight?: number;
    anchors?: Map<string, number>;
    pinAnchors?: boolean;
    /** Pill boxes already on the plot that labels must not cover. */
    obstacles?: readonly PlacedBox[];
  },
): LineLabelPlacement[] {
  const collisionHeight = options.collisionHeight ?? 18;
  const placed: PlacedBox[] = [...(options.obstacles ?? [])];
  const result: LineLabelPlacement[] = [];
  const sorted = [...series].toSorted(
    (a, b) => yScale(a.points[0]?.y ?? 0) - yScale(b.points[0]?.y ?? 0),
  );

  const labelHalfWidth = options.collisionWidth / 2;
  const collides = (x: number, y: number) =>
    placed.some(
      (other) =>
        Math.abs(other.y - y) < collisionHeight &&
        Math.abs(other.x - x) < other.halfW + labelHalfWidth,
    );

  for (const [seriesIndex, entry] of sorted.entries()) {
    if (entry.points.length === 0) continue;
    const candidates = lineCandidates(entry.points, seriesIndex);

    if (options.pinAnchors && options.anchors) {
      let anchorX = options.anchors.get(entry.key);
      if (anchorX === undefined) {
        const candidate = candidates.find((point) => !collides(xScale(point.x), yScale(point.y)));
        anchorX = (candidate ?? candidates.at(-1)!).x;
        options.anchors.set(entry.key, anchorX);
      }
      const point = pointNearestX(entry.points, anchorX);
      const x = xScale(point.x);
      const y = yScale(point.y);
      placed.push({ x, y, halfW: labelHalfWidth });
      result.push({
        key: entry.key,
        seriesId: entry.seriesId,
        label: entry.label,
        color: entry.color,
        x,
        y,
        visible: true,
      });
      continue;
    }

    const candidate = candidates.find((point) => !collides(xScale(point.x), yScale(point.y)));
    if (candidate) {
      const x = xScale(candidate.x);
      const y = yScale(candidate.y);
      placed.push({ x, y, halfW: labelHalfWidth });
      result.push({
        key: entry.key,
        seriesId: entry.seriesId,
        label: entry.label,
        color: entry.color,
        x,
        y,
        visible: true,
      });
      continue;
    }

    const fallback = entry.points[0];
    const x = xScale(fallback.x);
    const y = yScale(fallback.y);
    const visible = entry.keepVisibleOnCollision === true;
    if (visible) placed.push({ x, y, halfW: labelHalfWidth });
    result.push({
      key: entry.key,
      seriesId: entry.seriesId,
      label: entry.label,
      color: entry.color,
      x,
      y,
      visible,
    });
  }

  return result;
}

/** Full-color icon rendered on a white chip at the left edge of a pill. */
export interface LineLabelIconSpec {
  href: string;
  width: number;
  height: number;
}

/** Gap between the icon and the label text. */
const ICON_TEXT_GAP = 4;

/** Horizontal space an icon occupies to the left of the label text. */
function iconSpace(icon: LineLabelIconSpec | undefined): number {
  return icon ? icon.width + ICON_TEXT_GAP : 0;
}

export function renderLineLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  labels: readonly LineLabelPlacement[],
  options: {
    seriesAttribute: string;
    opacity?: number;
    offsetX?: number;
    offsetY?: number;
    /** Optional full-color icon (e.g. vendor mark) per label. */
    iconFor?: (label: LineLabelPlacement) => LineLabelIconSpec | undefined;
    configureText?: (
      text: d3.Selection<SVGTextElement, LineLabelPlacement, null, undefined>,
      label: LineLabelPlacement,
    ) => void;
    configureGroup?: (
      labelGroup: d3.Selection<SVGGElement, LineLabelPlacement, null, undefined>,
      label: LineLabelPlacement,
    ) => void;
  },
): void {
  const opacity = options.opacity ?? 1;
  const offsetX = options.offsetX ?? 8;
  const offsetY = options.offsetY ?? -14;
  const selection = group
    .selectAll<SVGGElement, LineLabelPlacement>('.line-label')
    .data(labels, (label) => label.key)
    .join(
      (enter) => {
        const labelGroup = enter
          .append('g')
          .attr('class', 'line-label')
          .style('pointer-events', 'none');
        labelGroup.append('rect').attr('class', 'll-bg').attr('rx', 4).attr('ry', 4);
        labelGroup
          .append('text')
          .attr('class', 'll-text')
          .attr('text-anchor', 'start')
          .attr('dominant-baseline', 'central')
          .attr('fill', 'white')
          .attr('font-size', '10px')
          .attr('font-weight', '600');
        return labelGroup;
      },
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr('data-line-key', (label) => label.key)
    .attr(options.seriesAttribute, (label) => label.seriesId)
    .attr('transform', (label) => `translate(${label.x + offsetX},${label.y + offsetY})`)
    .style('transition', 'opacity 150ms ease')
    .style('opacity', (label) => (label.visible ? opacity : 0));

  selection.each(function (label) {
    const labelGroup = d3.select<SVGGElement, LineLabelPlacement>(this);
    options.configureGroup?.(labelGroup, label);
    const text = labelGroup.select<SVGTextElement>('.ll-text');
    // Shift the text right to leave room for the icon chip; the background
    // sizing pass below expands the pill back over that space.
    const space = iconSpace(options.iconFor?.(label));
    if (space > 0) text.attr('x', space);
    else text.attr('x', null);
    if (options.configureText) options.configureText(text, label);
    else text.text(label.label);
  });

  const measured: { node: SVGGElement; label: LineLabelPlacement; bbox: DOMRect }[] = [];
  selection.each(function (label) {
    const text = this.querySelector<SVGTextElement>('.ll-text');
    if (text) measured.push({ node: this, label, bbox: text.getBBox() });
  });
  for (const { node, label, bbox } of measured) {
    const labelGroup = d3.select(node);
    const icon = options.iconFor?.(label);
    const space = iconSpace(icon);
    labelGroup
      .select('.ll-bg')
      .attr('x', bbox.x - space - 5)
      .attr('y', bbox.y - 3)
      .attr('width', bbox.width + space + 10)
      .attr('height', bbox.height + 6)
      .attr('fill', label.color);

    // Full-color mark drawn directly on the pill — transparent background, so
    // the icon shares the label's own fill shade (including gradient fills).
    labelGroup
      .selectAll<SVGImageElement, LineLabelIconSpec>('.ll-logo')
      .data(icon ? [icon] : [])
      .join('image')
      .attr('class', 'll-logo')
      .attr('href', (d) => d.href)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('x', bbox.x - space)
      .attr('y', (d) => bbox.y + bbox.height / 2 - d.height / 2)
      .attr('width', (d) => d.width)
      .attr('height', (d) => d.height);
  }
}

export function updateRenderedLineLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  labels: readonly LineLabelPlacement[],
  options: { opacity?: number; offsetX?: number; offsetY?: number } = {},
): void {
  const byKey = new Map(labels.map((label) => [label.key, label]));
  const opacity = options.opacity ?? 1;
  const offsetX = options.offsetX ?? 8;
  const offsetY = options.offsetY ?? -14;
  group.selectAll<SVGGElement, unknown>('.line-label').each(function () {
    const element = d3.select(this);
    const label = byKey.get(element.attr('data-line-key'));
    if (!label) {
      element.style('opacity', 0);
      return;
    }
    element
      .attr('transform', `translate(${label.x + offsetX},${label.y + offsetY})`)
      .style('opacity', label.visible ? opacity : 0);
  });
}

/**
 * Marks a `.point-label` that {@link placePointLabels} hid because no slot fit
 * (as opposed to one hidden by the label toggle or a legend hover), so the
 * next pass knows it may un-hide it.
 */
export const PLACEMENT_HIDDEN_ATTR = 'data-placement-hidden';

export interface PointLabelPlacementOptions {
  /**
   * Strict bounding box, in zoom-group coordinates, that every label must lie
   * fully inside. Defaults to the plot's clip rect ({@link plotAreaBounds});
   * pass `null` to skip the constraint (charts that clip nothing).
   */
  bounds?: RectBounds | null;
  /**
   * Whether labels also avoid each other and the run-name / parallelism pills.
   * The single-run scatter keeps this on; the compare chart only needs the
   * bounding box.
   */
  avoidCollisions?: boolean;
}

/**
 * Lay out every visible `.point-label` inside `zoomGroup`.
 *
 * Each label tries a fixed ladder of vertical slots around its point (above,
 * below, further above, further below). A slot is only eligible when the label
 * fits inside `bounds` — sliding horizontally as far as needed to stay inside,
 * so labels near the left/right edge hug the edge instead of spilling past
 * it — and, with `avoidCollisions`, when it overlaps nothing placed so far.
 * A label with no eligible slot is hidden rather than drawn partly outside
 * the plot: the clip path would otherwise slice it in half.
 */
export function placePointLabels(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  options: PointLabelPlacementOptions = {},
): void {
  const bounds = options.bounds === undefined ? plotAreaBounds(zoomGroup) : options.bounds;
  const avoidCollisions = options.avoidCollisions ?? true;
  interface LabelInfo {
    element: SVGTextElement;
    tspans: SVGTSpanElement[];
    centerX: number;
    centerY: number;
    width: number;
    lineCount: number;
    defaultFirstY: number;
  }
  const pending: Omit<LabelInfo, 'width'>[] = [];
  const ascent = 9;
  const descent = 3;
  const lineHeight = 11;
  const padding = 2;

  zoomGroup.selectAll<SVGGElement, unknown>('.dot-group').each(function () {
    const label = this.querySelector<SVGTextElement>('.point-label');
    if (!label) return;
    // A label this pass hid on an earlier frame (no slot fit, or its point had
    // left the plot) is only provisionally hidden: give it back its opacity so
    // it is reconsidered now that the layout may have changed. Labels hidden
    // for any other reason (toggle off, legend hover, faded series) stay put.
    if (label.hasAttribute(PLACEMENT_HIDDEN_ATTR)) {
      label.removeAttribute(PLACEMENT_HIDDEN_ATTR);
      label.style.opacity = '1';
    }
    if (
      label.style.display === 'none' ||
      label.style.visibility === 'hidden' ||
      label.style.opacity === '0' ||
      this.style.opacity === '0'
    ) {
      return;
    }
    const tspans = [...label.querySelectorAll<SVGTSpanElement>('tspan')];
    if (tspans.length === 0) return;
    const transform = this.getAttribute('transform') ?? '';
    const match = transform.match(/translate\((?<tx>[^,]+),(?<ty>[^)]+)\)/u);
    if (!match) return;
    const lineCount = tspans.length;
    const defaultFirstY = -(8 + (lineCount - 1) * lineHeight);
    // Reset to the centred default before measuring so a shift applied on a
    // previous pass does not leak into this one.
    tspans[0].setAttribute('dy', `${defaultFirstY}px`);
    for (const tspan of tspans) tspan.setAttribute('x', '0');
    label.style.opacity = '1';
    pending.push({
      element: label,
      tspans,
      centerX: Number.parseFloat(match[1]),
      centerY: Number.parseFloat(match[2]),
      lineCount,
      defaultFirstY,
    });
  });

  const labels: LabelInfo[] = pending.map((label) => ({
    ...label,
    width: label.element.getBBox().width,
  }));
  labels.sort((a, b) => a.centerX - b.centerX);
  // Seed with the run-name and parallelism pills so a point label that would
  // sit underneath one is pushed to its next candidate slot (or hidden) rather
  // than being drawn through it. Point-label-vs-point-label behaviour below is
  // unchanged; the pills simply occupy space before the first label is placed.
  const placed: RectBounds[] = avoidCollisions ? pillObstacles(zoomGroup) : [];

  for (const label of labels) {
    const blockHeight = (label.lineCount - 1) * lineHeight + ascent + descent;
    const firstBaselines = [
      label.defaultFirstY,
      14,
      label.defaultFirstY - blockHeight - 2,
      14 + blockHeight + 2,
    ];
    const candidates: { firstY: number; dx: number; box: RectBounds }[] = [];
    for (const firstY of firstBaselines) {
      const box: RectBounds = {
        left: label.centerX - label.width / 2 - padding,
        right: label.centerX + label.width / 2 + padding,
        top: label.centerY + firstY - ascent - padding,
        bottom: label.centerY + firstY + (label.lineCount - 1) * lineHeight + descent + padding,
      };
      let dx = 0;
      if (bounds) {
        // The bounding box is strict: a slot that would leave any part of the
        // label outside the plot is not a slot at all.
        if (!fitsVertically(box, bounds)) continue;
        const shift = horizontalShiftIntoBounds(box, bounds);
        if (shift === null) continue;
        dx = shift;
      }
      candidates.push({
        firstY,
        dx,
        box: { left: box.left + dx, right: box.right + dx, top: box.top, bottom: box.bottom },
      });
    }
    const index = avoidCollisions
      ? firstNonCollidingRect(
          candidates.map((candidate) => candidate.box),
          placed,
        )
      : candidates.length > 0
        ? 0
        : null;
    if (index === null) {
      label.element.style.opacity = '0';
      label.element.setAttribute(PLACEMENT_HIDDEN_ATTR, '');
      continue;
    }
    const chosen = candidates[index];
    label.tspans[0].setAttribute('dy', `${chosen.firstY}px`);
    if (chosen.dx !== 0) {
      for (const tspan of label.tspans) tspan.setAttribute('x', String(chosen.dx));
    }
    label.element.style.opacity = '1';
    if (avoidCollisions) placed.push(chosen.box);
  }
}

/**
 * Point-label layout for the single-run scatter: strict plot bounding box
 * plus collision avoidance against other labels and the drawn pills.
 */
export function avoidPointLabelCollisions(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  bounds?: RectBounds | null,
): void {
  placePointLabels(zoomGroup, { bounds, avoidCollisions: true });
}

/**
 * Point-label layout for charts without collision avoidance (the GPU compare
 * chart): only the strict plot bounding box is enforced, so a label at the
 * top edge flips below its point and one at a side edge slides inward.
 */
export function keepPointLabelsInPlot(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  bounds?: RectBounds | null,
): void {
  placePointLabels(zoomGroup, { bounds, avoidCollisions: false });
}
