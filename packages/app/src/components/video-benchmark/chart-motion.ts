import { select } from 'd3';

import { renderAxes, type AnyScale, type AxisUpdateConfig } from '@/lib/d3-chart/chart-update';
import type { ChartLayout } from '@/lib/d3-chart/types';

import { EASE, MOTION, cssEase } from './motion';

/**
 * What the results chart animates beside the shared plot's own point glide: points and lines
 * that appear fade in, those that leave fade out where they were, and the axes and grid ease to
 * a new domain in step with the points. Everything here is skipped under reduced motion; the
 * caller decides that once.
 */

const POINT = '.dot-group';
const LINE = '.line-path';
const EXITS = 'plot-exits';

/** The drawn points and lines, by key, as they were before a render replaced them. */
export interface PlotBefore {
  points: Map<string, SVGGElement>;
  lines: Map<string, SVGPathElement>;
}

/** Reads the plot before the shared layers redraw it. The nodes are kept, not copied. */
export function capturePlot(root: Element): PlotBefore {
  const points = new Map<string, SVGGElement>();
  for (const node of root.querySelectorAll<SVGGElement>(POINT))
    if (node.dataset.point) points.set(node.dataset.point, node);
  const lines = new Map<string, SVGPathElement>();
  for (const node of root.querySelectorAll<SVGPathElement>(LINE))
    if (node.dataset.lineKey) lines.set(node.dataset.lineKey, node);
  return { points, lines };
}

/** A mark that left the plot, stripped of everything that made it a point or a line. */
function ghost(node: SVGElement) {
  select(node).interrupt('data-update');
  for (const name of node.getAttributeNames())
    if (name.startsWith('data-')) node.removeAttribute(name);
  node.setAttribute('class', 'plot-exit');
  for (const part of node.querySelectorAll('.video-clip-pulse, .point-label')) part.remove();
  for (const part of node.querySelectorAll('[class]')) part.removeAttribute('class');
}

/**
 * After a render: a point or line the render removed fades out where it was, and one it added
 * fades in. `enter` is false for the first plot, which appears with the page.
 */
export function settlePlot(root: Element, before: PlotBefore, enter: boolean): void {
  const left = [...before.points.values(), ...before.lines.values()].filter(
    (node) => !node.isConnected && typeof node.animate === 'function',
  );
  if (left.length > 0) {
    let layer = root.querySelector<SVGGElement>(`:scope > .${EXITS}`);
    if (!layer) {
      layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.setAttribute('class', EXITS);
      layer.setAttribute('pointer-events', 'none');
      layer.setAttribute('aria-hidden', 'true');
      // Under the plot's own marks, so nothing that stays is covered by something that leaves.
      root.prepend(layer);
    }
    for (const node of left) {
      ghost(node);
      layer.append(node);
      const gone = () => node.remove();
      const fade = node.animate([{ opacity: 0 }], {
        duration: MOTION.fast,
        easing: cssEase(EASE.exit),
        fill: 'forwards',
      });
      fade.addEventListener('finish', gone);
      fade.addEventListener('cancel', gone);
    }
  }
  if (!enter) return;
  const fresh = [
    ...[...root.querySelectorAll<SVGGElement>(POINT)].filter(
      (node) => !before.points.has(node.dataset.point ?? ''),
    ),
    ...[...root.querySelectorAll<SVGPathElement>(LINE)].filter(
      (node) => !before.lines.has(node.dataset.lineKey ?? ''),
    ),
  ];
  for (const node of fresh)
    node.animate?.([{ opacity: 0, offset: 0 }], {
      duration: MOTION.base,
      easing: cssEase(EASE.enter),
    });
}

/** The axes of one render: its scales, the plot's size and how the ticks are chosen. */
export interface AxisState {
  x: AnyScale;
  y: AnyScale;
  width: number;
  height: number;
  config: AxisUpdateConfig;
}

type Numeric = (value: number) => number;
const ends = (scale: AnyScale) => (scale.domain() as number[]).map(Number);
const at = (scale: AnyScale, value: number): number => (scale as unknown as Numeric)(value);
const linear = (scale: AnyScale): boolean => !('base' in scale) && !('bandwidth' in scale);

/** Whether two scales put the ends of both their domains in the same places. */
const sameScale = (p: AnyScale, q: AnyScale) =>
  [...ends(p), ...ends(q)].every((value) => Math.abs(at(p, value) - at(q, value)) < 0.01);

/** Whether two renders put every value in the same place, so the axes have nowhere to go. */
export function sameAxes(a: AxisState, b: AxisState): boolean {
  if (linear(a.x) !== linear(b.x)) return false;
  return sameScale(a.x, b.x) && sameScale(a.y, b.y);
}

/**
 * The axes as they stand part of the way from one render to the next, for a change that arrives
 * while they are still easing. Two linear scales blend into a linear scale; any other pair has
 * no scale in between, so the move then starts from where the last one was going.
 */
export function axesBetween(from: AxisState, to: AxisState, eased: number): AxisState {
  if (![from.x, from.y, to.x, to.y].every(linear)) return to;
  const mix = (p: AnyScale, q: AnyScale): AnyScale => {
    const offset = at(p, 0) + (at(q, 0) - at(p, 0)) * eased;
    const slope = at(p, 1) - at(p, 0) + (at(q, 1) - at(q, 0) - (at(p, 1) - at(p, 0))) * eased;
    if (!Number.isFinite(offset) || !Number.isFinite(slope) || slope === 0) return q;
    const [start, end] = q.range() as number[];
    const copy = q.copy() as AnyScale & { domain: (domain: number[]) => unknown };
    copy.domain([(start - offset) / slope, (end - offset) / slope]);
    return copy;
  };
  return { ...to, x: mix(from.x, to.x), y: mix(from.y, to.y) };
}

const draw = (layout: ChartLayout, state: AxisState, duration = 0) =>
  renderAxes(layout, state.x, state.y as Parameters<typeof renderAxes>[2], {
    ...state.config,
    transitionDuration: duration,
  });

/** Stops the axes where they are. The shared plot redraws them at once on every render and zoom. */
export function stopAxes(layout: ChartLayout): void {
  for (const group of [layout.xAxisGroup, layout.yAxisGroup]) {
    group.interrupt();
    group.selectAll('*').interrupt();
  }
}

/**
 * Starts the axes from `from` on their way to `to`. Ticks both renders share slide to their new
 * place, new ones come in from where the old scale puts them, and old ones leave the same way:
 * each moves exactly as a point at that value does.
 */
export function easeAxes(layout: ChartLayout, from: AxisState, to: AxisState): void {
  stopAxes(layout);
  draw(layout, from);
  draw(layout, to, MOTION.glide);
}

/** Puts the axes at rest on `state`, with the label adjustments only a still axis gets. */
export function restAxes(layout: ChartLayout, state: AxisState): void {
  stopAxes(layout);
  draw(layout, state);
}

/**
 * Places the grid `eased` of the way from one render to the next. A line the old scale puts
 * outside the plot stays hidden until it is inside.
 */
export function placeGrid(
  layout: ChartLayout,
  from: AxisState,
  to: AxisState,
  eased: number,
): void {
  const place = (
    group: string,
    start: AnyScale,
    end: AnyScale,
    names: readonly [string, string],
    limit: number,
  ) =>
    layout.gridGroup
      .select(group)
      .selectAll<SVGLineElement, number>('line')
      .each(function (value) {
        const target = at(end, value);
        const origin = at(start, value);
        const now = Number.isFinite(origin) ? origin + (target - origin) * eased : target;
        const text = String(eased >= 1 ? target : now);
        this.setAttribute(names[0], text);
        this.setAttribute(names[1], text);
        this.style.visibility = eased < 1 && (now < -0.5 || now > limit + 0.5) ? 'hidden' : '';
      });
  place('.grid-v', from.x, to.x, ['x1', 'x2'], to.width);
  place('.grid-h', from.y, to.y, ['y1', 'y2'], to.height);
}
