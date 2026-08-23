import * as d3 from 'd3';

import { pointNearestX } from '@/components/inference/ui/line-label-anchor';

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

function lineCandidates<TPoint extends CartesianPoint>(points: readonly TPoint[]): TPoint[] {
  return [
    points[Math.min(1, points.length - 1)],
    points[Math.floor(points.length / 2)],
    points[Math.max(0, Math.floor((points.length * 2) / 3))],
    points.at(-1)!,
  ];
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

  for (const entry of sorted) {
    if (entry.points.length === 0) continue;
    const candidates = lineCandidates(entry.points);

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

export function placeEndpointLineLabels<TPoint extends CartesianPoint>(
  series: readonly LineLabelSeries<TPoint>[],
  xScale: (value: number) => number,
  yScale: (value: number) => number,
  options: { collisionHeight?: number; nudge?: boolean } = {},
): LineLabelPlacement[] {
  const collisionHeight = options.collisionHeight ?? 18;
  const labels = series.flatMap((entry) => {
    const point = entry.points.at(-1);
    return point
      ? [
          {
            key: entry.key,
            seriesId: entry.seriesId,
            label: entry.label,
            color: entry.color,
            x: xScale(point.x),
            y: yScale(point.y),
            visible: true,
          },
        ]
      : [];
  });

  if (labels.length < 2 || options.nudge === false) return labels;

  const range = yScaleRange(yScale);
  if (!range) return labels;
  const top = Math.min(range[0], range[1]) + collisionHeight;
  const bottom = Math.max(range[0], range[1]) - collisionHeight;
  labels.sort((a, b) => a.y - b.y);
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 1; i < labels.length; i++) {
      const overlap = labels[i - 1].y + collisionHeight - labels[i].y;
      if (overlap <= 0) continue;
      const half = overlap / 2;
      labels[i - 1].y -= half;
      labels[i].y += half;
    }
    for (const label of labels) label.y = Math.max(top, Math.min(bottom, label.y));
  }
  return labels;
}

function yScaleRange(scale: (value: number) => number): [number, number] | null {
  const withRange = scale as ((value: number) => number) & { range?: () => unknown[] };
  const range = withRange.range?.();
  return range && range.length >= 2 && typeof range[0] === 'number' && typeof range[1] === 'number'
    ? [range[0], range[1]]
    : null;
}

export function renderLineLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  labels: readonly LineLabelPlacement[],
  options: {
    seriesAttribute: string;
    opacity?: number;
    offsetX?: number;
    offsetY?: number;
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
    if (options.configureText) options.configureText(text, label);
    else text.text(label.label);
  });

  const measured: { node: SVGGElement; label: LineLabelPlacement; bbox: DOMRect }[] = [];
  selection.each(function (label) {
    const text = this.querySelector<SVGTextElement>('.ll-text');
    if (text) measured.push({ node: this, label, bbox: text.getBBox() });
  });
  for (const { node, label, bbox } of measured) {
    d3.select(node)
      .select('.ll-bg')
      .attr('x', bbox.x - 5)
      .attr('y', bbox.y - 3)
      .attr('width', bbox.width + 10)
      .attr('height', bbox.height + 6)
      .attr('fill', label.color);
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

export function avoidPointLabelCollisions(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
): void {
  interface LabelInfo {
    element: SVGTextElement;
    firstTspan: SVGTSpanElement;
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
    if (
      !label ||
      label.style.display === 'none' ||
      label.style.visibility === 'hidden' ||
      label.style.opacity === '0' ||
      this.style.opacity === '0'
    ) {
      return;
    }
    const tspans = label.querySelectorAll<SVGTSpanElement>('tspan');
    if (tspans.length === 0) return;
    const transform = this.getAttribute('transform') ?? '';
    const match = transform.match(/translate\((?<tx>[^,]+),(?<ty>[^)]+)\)/u);
    if (!match) return;
    const lineCount = tspans.length;
    const defaultFirstY = -(8 + (lineCount - 1) * lineHeight);
    tspans[0].setAttribute('dy', `${defaultFirstY}px`);
    label.style.opacity = '1';
    pending.push({
      element: label,
      firstTspan: tspans[0],
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
  const placed: RectBounds[] = pillObstacles(zoomGroup);

  for (const label of labels) {
    const blockHeight = (label.lineCount - 1) * lineHeight + ascent + descent;
    const firstBaselines = [
      label.defaultFirstY,
      14,
      label.defaultFirstY - blockHeight - 2,
      14 + blockHeight + 2,
    ];
    const boxes = firstBaselines.map((firstY) => ({
      left: label.centerX - label.width / 2 - padding,
      right: label.centerX + label.width / 2 + padding,
      top: label.centerY + firstY - ascent - padding,
      bottom: label.centerY + firstY + (label.lineCount - 1) * lineHeight + descent + padding,
    }));
    const index = firstNonCollidingRect(boxes, placed);
    if (index === null) {
      label.element.style.opacity = '0';
      continue;
    }
    label.firstTspan.setAttribute('dy', `${firstBaselines[index]}px`);
    label.element.style.opacity = '1';
    placed.push(boxes[index]);
  }
}
