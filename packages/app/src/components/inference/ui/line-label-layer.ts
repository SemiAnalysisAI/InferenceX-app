import * as d3 from 'd3';

import { pointNearestX } from '@/components/inference/ui/line-label-anchor';
import { whiteTextFill } from '@/lib/charts/dynamic-colors';
import { setAttrIfChanged, setStyleIfChanged } from '@/lib/d3-chart/chart-update';
import { POINT_LABEL_ANCHOR_CLASS } from '@/lib/d3-chart/layers/canvas-point-registry';
import { plotClipSize } from '@/lib/d3-chart/plot-bounds';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';

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

export function rectsStrictlyOverlap(a: RectBounds, b: RectBounds): boolean {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
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

export function horizontalShiftIntoBounds(rect: RectBounds, bounds: RectBounds): number | null {
  if (rect.right - rect.left > bounds.right - bounds.left) return null;
  if (rect.left < bounds.left) return bounds.left - rect.left;
  if (rect.right > bounds.right) return bounds.right - rect.right;
  return 0;
}

export function verticalShiftIntoBounds(rect: RectBounds, bounds: RectBounds): number | null {
  if (rect.bottom - rect.top > bounds.bottom - bounds.top) return null;
  if (rect.top < bounds.top) return bounds.top - rect.top;
  if (rect.bottom > bounds.bottom) return bounds.bottom - rect.bottom;
  return 0;
}

export function fitsVertically(rect: RectBounds, bounds: RectBounds): boolean {
  return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
}

export function pillShiftIntoBounds(rect: RectBounds, bounds: RectBounds): CartesianPoint {
  return {
    x: horizontalShiftIntoBounds(rect, bounds) ?? bounds.left - rect.left,
    y: verticalShiftIntoBounds(rect, bounds) ?? bounds.top - rect.top,
  };
}

function pillLocalBox(node: SVGGElement): RectBounds | null {
  const background = node.querySelector<SVGRectElement>('.ll-bg');
  if (!background) return null;
  const x = Number(background.getAttribute('x'));
  const y = Number(background.getAttribute('y'));
  const width = Number(background.getAttribute('width'));
  const height = Number(background.getAttribute('height'));
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return null;
  if (!(width > 0) || !(height > 0)) return null;
  return { left: x, top: y, right: x + width, bottom: y + height };
}

function pillBoxAt(local: RectBounds, tx: number, ty: number): RectBounds {
  return {
    left: tx + local.left,
    right: tx + local.right,
    top: ty + local.top,
    bottom: ty + local.bottom,
  };
}

interface PillLayoutItem {
  node: SVGGElement;
  label: LineLabelPlacement;
}

export interface PillOccluder {
  key: string;
  points: readonly CartesianPoint[];
}

const NARROW_PLOT_WIDTH = 360;
const NARROW_PILL_LIMIT = 3;
const NARROW_PILL_SHARE = 0.45;

export function pillWidthBudget(plotWidth: number): number {
  return plotWidth < NARROW_PLOT_WIDTH ? plotWidth * NARROW_PILL_SHARE : Infinity;
}

export function fitPillSegments<TSegment extends { text: string; weight: string }>(
  segments: readonly TSegment[],
  maxWidth: number,
  measure: (text: string, weight: string) => number,
): TSegment[] {
  if (segments.length === 0 || !Number.isFinite(maxWidth)) return [...segments];
  const fitted = [segments[0]];
  let used = measure(segments[0].text, segments[0].weight);
  for (const segment of segments.slice(1)) {
    const width = measure(segment.text, segment.weight);
    if (used + width <= maxWidth) {
      fitted.push(segment);
      used += width;
      continue;
    }
    const wrapped = /^(?<lead>\s*\()(?<body>.*)\)$/u.exec(segment.text)?.groups;
    const lead = wrapped?.lead ?? '';
    const body = wrapped?.body ?? segment.text;
    const close = wrapped ? ')' : '';
    for (let length = body.length - 1; length > 0; length--) {
      const prefix = body.slice(0, length).trimEnd();
      if (!prefix.trim()) break;
      const text = `${lead}${prefix}…${close}`;
      if (used + measure(text, segment.weight) <= maxWidth) {
        fitted.push({ ...segment, text });
        break;
      }
    }
    break;
  }
  return fitted;
}

function segmentHitsRect(a: CartesianPoint, b: CartesianPoint, rect: RectBounds): boolean {
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return (
    clip(-dx, a.x - rect.left) &&
    clip(dx, rect.right - a.x) &&
    clip(-dy, a.y - rect.top) &&
    clip(dy, rect.bottom - a.y)
  );
}

interface BoundedOccluder extends PillOccluder {
  bounds: RectBounds;
}

function boundOccluder(occluder: PillOccluder): BoundedOccluder {
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const { x, y } of occluder.points) {
    bounds.left = Math.min(bounds.left, x);
    bounds.right = Math.max(bounds.right, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.bottom = Math.max(bounds.bottom, y);
  }
  return { ...occluder, bounds };
}

function coversOtherPath(
  box: RectBounds,
  key: string,
  occluders: readonly BoundedOccluder[],
): boolean {
  for (const { key: occluderKey, points, bounds } of occluders) {
    if (occluderKey === key || !rectsOverlap(box, bounds)) continue;
    if (points.length === 1) return true;
    for (let i = 1; i < points.length; i++) {
      if (segmentHitsRect(points[i - 1], points[i], box)) return true;
    }
  }
  return false;
}

const LEADER_MIN_SHIFT = 12;
const LEADER_MIN_GAP = 6;
const LEADER_MAX_LENGTH = 40;
const NARROW_LEADER_MAX_LENGTH = 32;
const LEADER_OPACITY = 0.5;

function turn(p: CartesianPoint, q: CartesianPoint, r: CartesianPoint): number {
  return Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
}

function segmentsCross(
  a: CartesianPoint,
  b: CartesianPoint,
  c: CartesianPoint,
  d: CartesianPoint,
): boolean {
  return turn(c, d, a) * turn(c, d, b) < 0 && turn(a, b, c) * turn(a, b, d) < 0;
}

function leaderCrossesOtherPath(
  anchor: CartesianPoint,
  end: CartesianPoint,
  key: string,
  occluders: readonly BoundedOccluder[],
): boolean {
  const reach = {
    left: Math.min(anchor.x, end.x),
    right: Math.max(anchor.x, end.x),
    top: Math.min(anchor.y, end.y),
    bottom: Math.max(anchor.y, end.y),
  };
  for (const { key: occluderKey, points, bounds } of occluders) {
    if (occluderKey === key || !rectsOverlap(reach, bounds)) continue;
    for (let i = 1; i < points.length; i++) {
      if (segmentsCross(anchor, end, points[i - 1], points[i])) return true;
    }
  }
  return false;
}

function syncLeader(
  node: SVGGElement,
  anchor: CartesianPoint,
  color: string,
  local: RectBounds,
  tx: number,
  ty: number,
  show: boolean,
): void {
  const leader = node.querySelector<SVGLineElement>('.ll-leader');
  if (!leader) return;
  const ax = anchor.x - tx;
  const ay = anchor.y - ty;
  const ex = Math.min(Math.max(ax, local.left), local.right);
  const ey = Math.min(Math.max(ay, local.top), local.bottom);
  if (!show || Math.hypot(ax - ex, ay - ey) < LEADER_MIN_GAP) {
    leader.setAttribute('display', 'none');
    return;
  }
  leader.setAttribute('x1', String(ax));
  leader.setAttribute('y1', String(ay));
  leader.setAttribute('x2', String(ex));
  leader.setAttribute('y2', String(ey));
  leader.setAttribute('stroke', color);
  leader.removeAttribute('display');
}

const ALTERNATE_ANCHORS = 4;

function alternateAnchors(
  key: string,
  primary: CartesianPoint,
  lines: readonly BoundedOccluder[],
  bounds: RectBounds,
): CartesianPoint[] {
  const inside = lines
    .filter((line) => line.key === key)
    .flatMap((line) => line.points)
    .filter(
      (point) =>
        point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom &&
        (point.x !== primary.x || point.y !== primary.y),
    );
  const step = Math.max(1, inside.length / ALTERNATE_ANCHORS);
  const picked: CartesianPoint[] = [];
  for (let index = step / 2; index < inside.length; index += step) {
    picked.push(inside[Math.floor(index)]);
  }
  return picked.sort(
    (a, b) =>
      Math.hypot(a.x - primary.x, a.y - primary.y) - Math.hypot(b.x - primary.x, b.y - primary.y),
  );
}

function layoutPills(
  items: readonly PillLayoutItem[],
  offsetX: number,
  offsetY: number,
  bounds: RectBounds | null,
  obstacles: readonly RectBounds[],
  occluders: readonly PillOccluder[],
): void {
  const placed: RectBounds[] = [...obstacles];
  const narrow = bounds !== null && bounds.right - bounds.left < NARROW_PLOT_WIDTH;
  const limit = narrow ? NARROW_PILL_LIMIT : Infinity;
  const maxLeader = narrow ? NARROW_LEADER_MAX_LENGTH : LEADER_MAX_LENGTH;
  const lines = occluders.filter((occluder) => occluder.points.length > 0).map(boundOccluder);
  let shown = 0;

  for (const { node, label } of items) {
    const primary = { x: label.x, y: label.y };
    const tx0 = label.x + offsetX;
    const ty0 = label.y + offsetY;
    const local = bounds ? pillLocalBox(node) : null;
    if (!bounds || !local || !label.visible) {
      node.setAttribute('transform', `translate(${tx0},${ty0})`);
      if (local) syncLeader(node, primary, label.color, local, tx0, ty0, false);
      continue;
    }

    const rowHeight = local.bottom - local.top + 4;
    const clampAt = ([cx, cy]: [number, number]) => {
      const shift = pillShiftIntoBounds(pillBoxAt(local, cx, cy), bounds);
      const tx = cx + shift.x;
      const ty = cy + shift.y;
      return { tx, ty, box: pillBoxAt(local, tx, ty) };
    };
    const placeNear = (anchor: CartesianPoint) => {
      const ax = anchor.x + offsetX;
      const ay = anchor.y + offsetY;
      const mirrorX = 2 * anchor.x - ax - local.left - local.right;
      const mirrorY = 2 * anchor.y - ay - local.top - local.bottom;
      const candidates: [number, number][] = [
        [ax, ay],
        [ax, mirrorY],
        [mirrorX, ay],
        [mirrorX, mirrorY],
      ];
      for (let row = 1; row <= 3; row++) {
        for (const cx of [ax, mirrorX]) {
          candidates.push([cx, ay - row * rowHeight], [cx, ay + row * rowHeight]);
        }
      }
      const farSlots = () => {
        const columnStep = (local.right - local.left) / 2;
        const colReach = Math.ceil((maxLeader + local.right - local.left) / columnStep);
        const rowReach = Math.ceil((maxLeader + local.bottom - local.top) / rowHeight);
        const colMin = Math.max(
          -colReach,
          Math.floor((bounds.left - ax - local.left) / columnStep),
        );
        const colMax = Math.min(
          colReach,
          Math.ceil((bounds.right - ax - local.right) / columnStep),
        );
        const rowMin = Math.max(-rowReach, Math.floor((bounds.top - ay - local.top) / rowHeight));
        const rowMax = Math.min(
          rowReach,
          Math.ceil((bounds.bottom - ay - local.bottom) / rowHeight),
        );
        const far: { slot: [number, number]; distance: number }[] = [];
        for (let col = colMin; col <= colMax; col++) {
          for (let row = rowMin; row <= rowMax; row++) {
            far.push({
              slot: [ax + col * columnStep, ay + row * rowHeight],
              distance: Math.hypot(col * columnStep, row * rowHeight),
            });
          }
        }
        return far.sort((a, b) => a.distance - b.distance).map(({ slot }) => slot);
      };
      const firstClean = (slots: readonly [number, number][]) => {
        for (const slot of slots) {
          const candidate = clampAt(slot);
          const { box } = candidate;
          const end = {
            x: Math.min(Math.max(anchor.x, box.left), box.right),
            y: Math.min(Math.max(anchor.y, box.top), box.bottom),
          };
          const length = Math.hypot(end.x - anchor.x, end.y - anchor.y);
          if (length > maxLeader) continue;
          if (placed.some((other) => rectsStrictlyOverlap(box, other))) continue;
          if (coversOtherPath(box, label.key, lines)) continue;
          const moved = Math.hypot(candidate.tx - ax, candidate.ty - ay) > LEADER_MIN_SHIFT;
          if (
            moved &&
            length >= LEADER_MIN_GAP &&
            leaderCrossesOtherPath(anchor, end, label.key, lines)
          ) {
            continue;
          }
          return { ...candidate, anchor, moved };
        }
        return undefined;
      };
      return firstClean(candidates) ?? firstClean(farSlots());
    };

    let chosen = shown < limit ? placeNear(primary) : undefined;
    if (shown < limit && !chosen) {
      for (const anchor of alternateAnchors(label.key, primary, lines, bounds)) {
        chosen = placeNear(anchor);
        if (chosen) break;
      }
    }
    if (!chosen) {
      const fallback = clampAt([tx0, ty0]);
      node.setAttribute('transform', `translate(${fallback.tx},${fallback.ty})`);
      node.style.opacity = '0';
      node.dataset.visible = '0';
      node.setAttribute(PLACEMENT_HIDDEN_ATTR, '');
      syncLeader(node, primary, label.color, local, fallback.tx, fallback.ty, false);
      continue;
    }
    if (node.hasAttribute(PLACEMENT_HIDDEN_ATTR)) {
      node.removeAttribute(PLACEMENT_HIDDEN_ATTR);
      node.dataset.visible = '1';
    }

    node.setAttribute('transform', `translate(${chosen.tx},${chosen.ty})`);
    syncLeader(node, chosen.anchor, label.color, local, chosen.tx, chosen.ty, chosen.moved);
    placed.push(chosen.box);
    shown++;
  }
}

export function plotAreaBounds(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
): RectBounds | null {
  const node = zoomGroup.node();
  const size = node ? plotClipSize(node) : null;
  return size ? { left: 0, top: 0, right: size.width, bottom: size.height } : null;
}

export interface PlacedBox {
  x: number;
  y: number;
  halfW: number;
}

export function parallelismLabelBoxes(root: SVGGElement | null): PlacedBox[] {
  const boxes: PlacedBox[] = [];
  if (!root) return boxes;
  for (const node of root.querySelectorAll<SVGGElement>('.parallelism-label')) {
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

function pillObstacles(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  selector = '.line-label, .parallelism-label',
): RectBounds[] {
  const boxes: RectBounds[] = [];
  zoomGroup.selectAll<SVGGElement, unknown>(selector).each(function () {
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

const ANCHOR_SLOTS = [0.25, 0.5, 0.75, 1] as const;

function lineCandidates<TPoint extends CartesianPoint>(
  points: readonly TPoint[],
  seriesIndex: number,
): TPoint[] {
  const last = points.length - 1;
  if (last <= 0) return [points[0]];
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
    obstacles?: readonly PlacedBox[];
  },
): LineLabelPlacement[] {
  const collisionHeight = options.collisionHeight ?? CHART_TYPE.lineLabel + 8;
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
  const collisionCost = (x: number, y: number) =>
    placed.reduce((cost, other) => {
      const dx = other.halfW + labelHalfWidth - Math.abs(other.x - x);
      const dy = collisionHeight - Math.abs(other.y - y);
      return dx > 0 && dy > 0 ? cost + dx * dy : cost;
    }, 0);

  const emit = (entry: LineLabelSeries<TPoint>, point: TPoint) => {
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
  };

  const crowded: { entry: LineLabelSeries<TPoint>; candidates: TPoint[] }[] = [];

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
      emit(entry, candidate);
      continue;
    }

    crowded.push({ entry, candidates });
  }

  for (const { entry, candidates } of crowded) {
    emit(
      entry,
      candidates.reduce((best, point) =>
        collisionCost(xScale(point.x), yScale(point.y)) <
        collisionCost(xScale(best.x), yScale(best.y))
          ? point
          : best,
      ),
    );
  }

  return result;
}

export interface LineLabelIconSpec {
  href: string;
  width: number;
  height: number;
}

const ICON_TEXT_GAP = 4;

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
    iconFor?: (label: LineLabelPlacement) => LineLabelIconSpec | undefined;
    configureText?: (
      text: d3.Selection<SVGTextElement, LineLabelPlacement, null, undefined>,
      label: LineLabelPlacement,
    ) => void;
    configureGroup?: (
      labelGroup: d3.Selection<SVGGElement, LineLabelPlacement, null, undefined>,
      label: LineLabelPlacement,
    ) => void;
    bounds?: RectBounds | null;
    occluders?: readonly PillOccluder[];
  },
): void {
  const opacity = options.opacity ?? 1;
  const offsetX = options.offsetX ?? 8;
  const offsetY = options.offsetY ?? -14;
  const bounds = options.bounds === undefined ? plotAreaBounds(group) : options.bounds;
  const selection = group
    .selectAll<SVGGElement, LineLabelPlacement>('.line-label')
    .data(labels, (label) => label.key)
    .join(
      (enter) => {
        const labelGroup = enter
          .append('g')
          .attr('class', 'line-label')
          .style('pointer-events', 'none');
        labelGroup
          .append('line')
          .attr('class', 'll-leader')
          .attr('stroke-width', 1)
          .attr('stroke-opacity', LEADER_OPACITY)
          .attr('display', 'none');
        labelGroup.append('rect').attr('class', 'll-bg').attr('rx', 4).attr('ry', 4);
        labelGroup
          .append('text')
          .attr('class', 'll-text')
          .attr('text-anchor', 'start')
          .attr('dominant-baseline', 'central')
          .attr('fill', 'white')
          .attr('font-size', px(CHART_TYPE.lineLabel))
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
      .attr('fill', whiteTextFill(label.color));

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

  layoutPills(
    measured.map(({ node, label }) => ({ node, label })),
    offsetX,
    offsetY,
    bounds,
    bounds ? pillObstacles(group, '.parallelism-label') : [],
    options.occluders ?? [],
  );
}

export function updateRenderedLineLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  labels: readonly LineLabelPlacement[],
  options: {
    opacity?: number;
    offsetX?: number;
    offsetY?: number;
    bounds?: RectBounds | null;
    occluders?: readonly PillOccluder[];
  } = {},
): void {
  const byKey = new Map(labels.map((label) => [label.key, label]));
  const opacity = options.opacity ?? 1;
  const offsetX = options.offsetX ?? 8;
  const offsetY = options.offsetY ?? -14;
  const bounds = options.bounds === undefined ? plotAreaBounds(group) : options.bounds;
  const items: PillLayoutItem[] = [];
  group.selectAll<SVGGElement, unknown>('.line-label').each(function () {
    const element = d3.select(this);
    const label = byKey.get(element.attr('data-line-key'));
    if (!label) {
      element.style('opacity', 0);
      return;
    }
    element.style('opacity', label.visible ? opacity : 0);
    items.push({ node: this, label });
  });
  const order = new Map(labels.map((label, index) => [label.key, index]));
  items.sort((a, b) => (order.get(a.label.key) ?? 0) - (order.get(b.label.key) ?? 0));
  layoutPills(
    items,
    offsetX,
    offsetY,
    bounds,
    bounds ? pillObstacles(group, '.parallelism-label') : [],
    options.occluders ?? [],
  );
}

export const PLACEMENT_HIDDEN_ATTR = 'data-placement-hidden';

export interface PointLabelPlacementOptions {
  bounds?: RectBounds | null;
  avoidCollisions?: boolean;
}

const POINT_LABEL_HOSTS = `.dot-group, .${POINT_LABEL_ANCHOR_CLASS}`;

export function placePointLabels(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  options: PointLabelPlacementOptions = {},
): void {
  const bounds = options.bounds === undefined ? plotAreaBounds(zoomGroup) : options.bounds;
  const avoidCollisions = options.avoidCollisions ?? true;
  interface LabelInfo {
    element: SVGTextElement;
    tspans: Element[];
    centerX: number;
    centerY: number;
    width: number;
    lineCount: number;
    defaultFirstY: number;
    placementHidden: boolean;
  }
  const pending: Omit<LabelInfo, 'width'>[] = [];
  const ascent = 9;
  const descent = 3;
  const lineHeight = 11;
  const padding = 2;

  zoomGroup.selectAll<SVGGElement, unknown>(POINT_LABEL_HOSTS).each(function () {
    const label = this.querySelector<SVGTextElement>('.point-label');
    if (!label) return;
    const placementHidden = label.hasAttribute(PLACEMENT_HIDDEN_ATTR);
    const release = () => {
      if (!placementHidden) return;
      label.removeAttribute(PLACEMENT_HIDDEN_ATTR);
      label.style.opacity = '1';
    };
    if (
      label.style.display === 'none' ||
      label.style.visibility === 'hidden' ||
      (!placementHidden && label.style.opacity === '0') ||
      this.style.opacity === '0'
    ) {
      release();
      return;
    }
    const tspans: Element[] = [];
    for (let tspan = label.firstElementChild; tspan; tspan = tspan.nextElementSibling) {
      tspans.push(tspan);
    }
    const transform = this.getAttribute('transform') ?? '';
    const match = transform.match(/translate\((?<tx>[^,]+),(?<ty>[^)]+)\)/u);
    if (tspans.length === 0 || !match) {
      release();
      return;
    }
    const lineCount = tspans.length;
    pending.push({
      element: label,
      tspans,
      centerX: Number.parseFloat(match[1]),
      centerY: Number.parseFloat(match[2]),
      lineCount,
      defaultFirstY: -(8 + (lineCount - 1) * lineHeight),
      placementHidden,
    });
  });

  const labels: LabelInfo[] = pending.map((label) => ({
    ...label,
    width: label.element.getBBox().width,
  }));
  labels.sort((a, b) => a.centerX - b.centerX);
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
      setAttrIfChanged(label.tspans[0], 'dy', `${label.defaultFirstY}px`);
      for (const tspan of label.tspans) setAttrIfChanged(tspan, 'x', '0');
      setStyleIfChanged(label.element, 'opacity', '0');
      if (!label.placementHidden) label.element.setAttribute(PLACEMENT_HIDDEN_ATTR, '');
      continue;
    }
    const chosen = candidates[index];
    setAttrIfChanged(label.tspans[0], 'dy', `${chosen.firstY}px`);
    for (const tspan of label.tspans) setAttrIfChanged(tspan, 'x', String(chosen.dx));
    if (label.placementHidden) label.element.removeAttribute(PLACEMENT_HIDDEN_ATTR);
    setStyleIfChanged(label.element, 'opacity', '1');
    if (avoidCollisions) placed.push(chosen.box);
  }
}

export function avoidPointLabelCollisions(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  bounds?: RectBounds | null,
): void {
  placePointLabels(zoomGroup, { bounds, avoidCollisions: true });
}

export function keepPointLabelsInPlot(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  bounds?: RectBounds | null,
): void {
  placePointLabels(zoomGroup, { bounds, avoidCollisions: false });
}
