import * as d3 from 'd3';

import type { ChartLayout, ContinuousScale } from './types';

/** A scale that can be either continuous (linear/log), banded, or time-based. */
export type AnyScale = ContinuousScale | d3.ScaleBand<string> | d3.ScaleTime<number, number>;

export interface AxisUpdateConfig {
  xTickFormat?: (d: d3.AxisDomain) => string;
  yTickFormat?: (d: d3.AxisDomain) => string;
  xTickCount?: number;
  yTickCount?: number;
  xTickValues?: (number | Date)[];
  yTickValues?: (number | Date)[];
  /** Override tick size for Y axis (default: 6, use 0 for band scales). */
  yTickSize?: number;
  /** When set, axes animate to new positions over this duration (ms). */
  transitionDuration?: number;
  /** Limit the update to axes that actually changed. Defaults to both. */
  axes?: 'x' | 'y' | 'both';
}

/** Render or update axes with current scales. */
export function renderAxes(
  layout: ChartLayout,
  xScale: AnyScale,
  yScale: ContinuousScale | d3.ScaleBand<string>,
  config: AxisUpdateConfig,
): void {
  const {
    xTickFormat,
    yTickFormat,
    xTickCount,
    yTickCount,
    xTickValues,
    yTickValues,
    yTickSize,
    transitionDuration,
    axes = 'both',
  } = config;
  const dur = transitionDuration ?? 0;
  const updateX = axes === 'x' || axes === 'both';
  const updateY = axes === 'y' || axes === 'both';

  if (updateX) {
    let xAxisGen: d3.Axis<d3.AxisDomain>;
    if ('bandwidth' in xScale) {
      const bandGen = d3.axisBottom(xScale as d3.ScaleBand<string>).tickSize(6);
      if (xTickFormat) bandGen.tickFormat(xTickFormat as any);
      xAxisGen = bandGen as unknown as d3.Axis<d3.AxisDomain>;
    } else {
      const gen = d3.axisBottom(xScale as ContinuousScale).tickSize(6);
      if (xTickCount) gen.ticks(xTickCount);
      if (xTickValues) {
        gen.tickValues(visibleTickValues(xScale, xTickValues) as Iterable<d3.NumberValue>);
      }
      if (xTickFormat) gen.tickFormat(xTickFormat as any);
      xAxisGen = gen as unknown as d3.Axis<d3.AxisDomain>;
    }

    const xTarget = dur > 0 ? layout.xAxisGroup.transition().duration(dur) : layout.xAxisGroup;
    (xTarget as any).call(xAxisGen as any);
  }

  if (updateY) {
    if ('bandwidth' in yScale) {
      const bandAxisGen = d3
        .axisLeft(yScale as d3.ScaleBand<string>)
        .tickSize(yTickSize ?? 0) as unknown as d3.Axis<d3.AxisDomain>;
      if (yTickFormat) bandAxisGen.tickFormat(yTickFormat as any);
      const yBandTarget =
        dur > 0 ? layout.yAxisGroup.transition().duration(dur) : layout.yAxisGroup;
      (yBandTarget as any).call(bandAxisGen as any);
    } else {
      const yAxisGen = d3.axisLeft(yScale as ContinuousScale).tickSize(yTickSize ?? 6);
      if (yTickCount) yAxisGen.ticks(yTickCount);
      if (yTickValues) {
        yAxisGen.tickValues(visibleTickValues(yScale, yTickValues) as Iterable<d3.NumberValue>);
      }
      if (yTickFormat) yAxisGen.tickFormat(yTickFormat as any);
      const yTarget = dur > 0 ? layout.yAxisGroup.transition().duration(dur) : layout.yAxisGroup;
      (yTarget as any).call(yAxisGen as any);
    }
  }
}

/** Render or update grid lines with current scales. */
/** Which grid line sets to draw; each defaults to true when omitted. */
export interface GridVisibility {
  /** Vertical lines at x-axis ticks. */
  x?: boolean;
  /** Horizontal lines at y-axis ticks. */
  y?: boolean;
}

export function renderGrid(
  layout: ChartLayout,
  xScale: AnyScale,
  yScale: ContinuousScale | d3.ScaleBand<string>,
  yTickCount?: number,
  transitionDuration = 0,
  xTickValues?: (number | Date)[],
  yTickValues?: (number | Date)[],
  axes: 'x' | 'y' | 'both' = 'both',
  visible: GridVisibility = {},
): void {
  const { width, height, gridGroup } = layout;
  const dur = transitionDuration;
  const updateX = axes === 'x' || axes === 'both';
  const updateY = axes === 'y' || axes === 'both';
  const showX = visible.x ?? true;
  const showY = visible.y ?? true;

  if (updateX && !showX) {
    // Vertical grid lines disabled: drop any lines from a previous render so
    // toggling the flag at runtime does not leave stale lines behind.
    gridGroup.select('.grid-v').selectAll('line').remove();
  } else if (updateX) {
    let vGroup = gridGroup.select<SVGGElement>('.grid-v');
    if (vGroup.empty()) vGroup = gridGroup.append('g').attr('class', 'grid-v');

    if ('bandwidth' in xScale) {
      const bandScale = xScale as d3.ScaleBand<string>;
      vGroup
        .selectAll<SVGLineElement, string>('line')
        .data(bandScale.domain())
        .join('line')
        .attr('x1', (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2)
        .attr('x2', (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2)
        .attr('y1', 0)
        .attr('y2', height);
    } else {
      const tickScale = xScale as { ticks: (count?: number) => number[]; (v: number): number };
      const xTicks = xTickValues
        ? (visibleTickValues(xScale, xTickValues) as number[])
        : tickScale.ticks();
      const vJoin = vGroup
        .selectAll<SVGLineElement, number>('line')
        .data(xTicks)
        .join(
          (enter) =>
            enter
              .append('line')
              .attr('y1', 0)
              .attr('y2', height)
              .attr('x1', (d) => tickScale(d))
              .attr('x2', (d) => tickScale(d)),
          (update) => update,
          (exit) => exit.remove(),
        );
      const vTarget = dur > 0 ? (vJoin as any).transition().duration(dur) : vJoin;
      vTarget
        .attr('x1', (d: number) => tickScale(d))
        .attr('x2', (d: number) => tickScale(d))
        .attr('y1', 0)
        .attr('y2', height);
    }
  }

  if (updateY && !showY) {
    gridGroup.select('.grid-h').selectAll('line').remove();
  } else if (updateY) {
    let hGroup = gridGroup.select<SVGGElement>('.grid-h');
    if (hGroup.empty()) hGroup = gridGroup.append('g').attr('class', 'grid-h');

    if ('bandwidth' in yScale) {
      const bandScale = yScale as d3.ScaleBand<string>;
      hGroup
        .selectAll<SVGLineElement, string>('line')
        .data(bandScale.domain())
        .join('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2)
        .attr('y2', (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2)
        .style('stroke-width', 0.5);
    } else {
      const yTicks = yTickValues
        ? (visibleTickValues(yScale, yTickValues) as number[])
        : yScale.ticks(yTickCount ?? 5);
      const hJoin = hGroup
        .selectAll<SVGLineElement, number>('line')
        .data(yTicks)
        .join(
          (enter) =>
            enter
              .append('line')
              .attr('x1', 0)
              .attr('x2', width)
              .attr('y1', (d) => yScale(d))
              .attr('y2', (d) => yScale(d)),
          (update) => update,
          (exit) => exit.remove(),
        );
      const hTarget = dur > 0 ? (hJoin as any).transition().duration(dur) : hJoin;
      hTarget
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', (d: number) => yScale(d))
        .attr('y2', (d: number) => yScale(d));
    }
  }
}

function visibleTickValues(
  scale: ContinuousScale | d3.ScaleTime<number, number>,
  values: (number | Date)[],
): (number | Date)[] {
  const domain = scale.domain();
  const start = Number(domain[0]);
  const end = Number(domain.at(-1));
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  return values.filter((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= min && numeric <= max;
  });
}

/**
 * Write-if-changed DOM helpers for hot chart paths.
 *
 * A MutationObserver receives a record for every `setAttribute` / style write,
 * even when the value is unchanged. Session replay (rrweb) serializes each
 * record and the coach mark rescans on them, so blind rewrites of hundreds of
 * point labels on every legend toggle or rescale cost far more than the DOM
 * write itself. Reading an attribute or inline style never forces layout.
 */

export function setAttrIfChanged(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** `''` clears the property, matching `selection.style(name, '')`. */
export function setStyleIfChanged(
  element: HTMLElement | SVGElement,
  name: string,
  value: string,
): void {
  if (element.style.getPropertyValue(name) === value) return;
  if (value === '') element.style.removeProperty(name);
  else element.style.setProperty(name, value);
}

export function setTextIfChanged(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

/**
 * `selection.raise()` for each selector in turn, skipped when the DOM is
 * already in the resulting order.
 *
 * `raise()` re-appends every node even when it is already last, and each move
 * is a remove + add record that session replay re-serializes with the node's
 * whole subtree. Renders and zoom frames raise hundreds of point groups to keep
 * z-order stable, which is almost always already correct.
 */
export function raiseInOrder(
  root: { selectAll: (selector: string) => { nodes: () => Element[] } },
  selectors: readonly string[],
): void {
  const groups = selectors.map((selector) => root.selectAll(selector).nodes());
  // Each parent's children must already end with its raised nodes, in the
  // order the sequential raises would leave them.
  const tails = new Map<Node, Element[]>();
  for (const nodes of groups) {
    for (const node of nodes) {
      const parent = node.parentNode;
      if (!parent) continue;
      let tail = tails.get(parent);
      if (!tail) tails.set(parent, (tail = []));
      tail.push(node);
    }
  }
  let ordered = true;
  for (const [parent, tail] of tails) {
    let child = parent.lastChild;
    for (let index = tail.length - 1; index >= 0; index--) {
      if (child !== tail[index]) {
        ordered = false;
        break;
      }
      child = child.previousSibling;
    }
    if (!ordered) break;
  }
  if (ordered) return;
  // Exactly the sequential raises: re-query each selector after the previous
  // moves, and move only nodes that are not already last (d3's own rule).
  for (const selector of selectors) {
    for (const node of root.selectAll(selector).nodes()) {
      if (node.nextSibling) node.parentNode?.append(node);
    }
  }
}
