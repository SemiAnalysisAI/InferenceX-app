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
  },
): LineLabelPlacement[] {
  const collisionHeight = options.collisionHeight ?? 18;
  const placed: { x: number; y: number }[] = [];
  const result: LineLabelPlacement[] = [];
  const sorted = [...series].toSorted(
    (a, b) => yScale(a.points[0]?.y ?? 0) - yScale(b.points[0]?.y ?? 0),
  );

  const collides = (x: number, y: number) =>
    placed.some(
      (other) =>
        Math.abs(other.y - y) < collisionHeight && Math.abs(other.x - x) < options.collisionWidth,
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
      placed.push({ x, y });
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
      placed.push({ x, y });
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
    if (visible) placed.push({ x, y });
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
  const placed: RectBounds[] = [];

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
