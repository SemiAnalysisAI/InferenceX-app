import * as d3 from 'd3';

import {
  applyHoverState,
  applyNormalState,
  SHAPE_CONFIG,
  type ShapeKey,
} from '@/lib/charts/chart-rendering';

const pinReleases = new WeakMap<Element, () => void>();

export function showPinRing(host: Element, x: number | undefined, y: number | undefined): void {
  if (x === undefined && y === undefined) return;
  const parent = d3.select(host);
  const rulers = parent.select<SVGGElement>(':scope > .ruler-group').style('display', 'block');
  if (x !== undefined) rulers.select('.vertical-ruler').attr('x1', x).attr('x2', x);
  if (y !== undefined) rulers.select('.horizontal-ruler').attr('y1', y).attr('y2', y);
  if (x === undefined || y === undefined) return;
  let ring = parent.select<SVGGElement>(':scope > .pin-ring');
  if (ring.empty()) {
    ring = parent
      .append('g')
      .attr('class', 'pin-ring')
      .attr('data-testid', 'chart-pin-ring')
      .style('pointer-events', 'none');
    ring
      .append('circle')
      .attr('r', 11)
      .attr('fill', 'none')
      .attr('stroke', 'var(--background)')
      .attr('stroke-width', 2);
    ring
      .append('circle')
      .attr('r', 9)
      .attr('fill', 'none')
      .attr('stroke', 'var(--foreground)')
      .attr('stroke-width', 2);
  }
  ring.attr('transform', `translate(${x},${y})`).raise();
}

export function pinMark(host: Element, enlarge: () => void, release: () => void): void {
  const owner = (host as SVGElement).ownerSVGElement ?? host;
  pinReleases.get(owner)?.();
  enlarge();
  pinReleases.set(owner, release);
}

export function setDotHovered(group: Element | null, hovered: boolean): void {
  const shape = group?.querySelector<SVGCircleElement | SVGRectElement | SVGPathElement>(
    ':scope > .visible-shape',
  );
  const key = shape?.dataset.shapeKey;
  if (!shape || !key || !(key in SHAPE_CONFIG)) return;
  (hovered ? applyHoverState : applyNormalState)(d3.select(shape), key as ShapeKey);
}

export function clearPinRing(svg: SVGSVGElement | null): void {
  if (!svg) return;
  pinReleases.get(svg)?.();
  pinReleases.delete(svg);
  const root = d3.select(svg);
  root.selectAll('.pin-ring').remove();
  root.select('.ruler-group').style('display', 'none');
}
