import * as d3 from 'd3';

import type { ChartLayout, ContinuousScale } from './types';

export type AnyScale = ContinuousScale | d3.ScaleBand<string> | d3.ScaleTime<number, number>;

export interface AxisUpdateConfig {
  xTickFormat?: (d: d3.AxisDomain) => string;
  yTickFormat?: (d: d3.AxisDomain) => string;
  xTickCount?: number;
  yTickCount?: number;
  xTickValues?: (number | Date)[];
  yTickValues?: (number | Date)[];
  yTickSize?: number;
  transitionDuration?: number;
  axes?: 'x' | 'y' | 'both';
}

const X_TICK_SPACING_PX = 80;

function widthTickCount(width: number, requested = 10): number {
  return Math.min(requested, Math.max(2, Math.floor(width / X_TICK_SPACING_PX)));
}

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
    const band = 'bandwidth' in xScale;
    renderAxis(layout.xAxisGroup, 'bottom', xScale, dur, {
      tickSize: 6,
      tickArguments: band ? [] : [widthTickCount(layout.width, xTickCount)],
      tickValues: !band && xTickValues ? visibleTickValues(xScale, xTickValues) : null,
      tickFormat: xTickFormat ?? null,
    });
  }

  if (updateY) {
    const band = 'bandwidth' in yScale;
    renderAxis(layout.yAxisGroup, 'left', yScale, dur, {
      tickSize: yTickSize ?? (band ? 0 : 6),
      tickArguments: !band && yTickCount ? [yTickCount] : [],
      tickValues: !band && yTickValues ? visibleTickValues(yScale, yTickValues) : null,
      tickFormat: yTickFormat ?? null,
    });
  }
}

function renderAxis(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  orient: AxisOrient,
  scale: AnyScale,
  transitionDuration: number,
  options: AxisOptions,
): void {
  const axisScale = scale as d3.AxisScale<d3.AxisDomain>;
  if (transitionDuration > 0) {
    group
      .transition()
      .duration(transitionDuration)
      .call(axisGenerator(orient, axisScale, options));
  } else {
    drawAxis(group, orient, axisScale, options);
  }
}

type AxisOrient = 'bottom' | 'left';

interface AxisOptions {
  tickArguments: number[];
  tickValues: (number | Date)[] | null;
  tickFormat: ((domainValue: d3.AxisDomain, index: number) => string) | null;
  tickSize: number;
}

interface AxisScaleLike {
  (value: unknown): number | undefined;
  domain: () => unknown[];
  range: () => number[];
  copy: () => AxisScaleLike;
  ticks?: (...args: number[]) => unknown[];
  tickFormat?: (...args: number[]) => (value: unknown, index: number) => string;
  bandwidth?: () => number;
  round?: () => boolean;
}

const AXIS_TICK_PADDING = 3;

function axisGenerator(
  orient: AxisOrient,
  scale: d3.AxisScale<d3.AxisDomain>,
  options: AxisOptions,
): d3.Axis<d3.AxisDomain> {
  const generator = (orient === 'bottom' ? d3.axisBottom(scale) : d3.axisLeft(scale)).tickSize(
    options.tickSize,
  );
  generator.tickArguments(options.tickArguments);
  if (options.tickValues) generator.tickValues(options.tickValues);
  if (options.tickFormat) generator.tickFormat(options.tickFormat);
  return generator;
}

function drawAxis(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  orient: AxisOrient,
  axisScale: d3.AxisScale<d3.AxisDomain>,
  options: AxisOptions,
): void {
  const scale = axisScale as unknown as AxisScaleLike;
  const { tickArguments, tickValues, tickFormat, tickSize } = options;
  const offset = typeof window !== 'undefined' && window.devicePixelRatio > 1 ? 0 : 0.5;
  const k = orient === 'left' ? -1 : 1;
  const x = orient === 'left' ? 'x' : 'y';
  const values = tickValues ?? (scale.ticks ? scale.ticks(...tickArguments) : scale.domain());
  const format =
    tickFormat ??
    (scale.tickFormat ? scale.tickFormat(...tickArguments) : (value: unknown) => value);
  const spacing = Math.max(tickSize, 0) + AXIS_TICK_PADDING;
  const range = scale.range();
  const range0 = Number(range[0]) + offset;
  const range1 = Number(range.at(-1)) + offset;
  const positionScale = scale.copy();
  let bandOffset = 0;
  if (positionScale.bandwidth) {
    bandOffset = Math.max(0, positionScale.bandwidth() - offset * 2) / 2;
    if (positionScale.round?.()) bandOffset = Math.round(bandOffset);
  }
  const position = (value: unknown) => Number(positionScale(value)) + bandOffset;

  const path = group.selectAll<SVGPathElement, null>('.domain').data([null]);
  const tick = group
    .selectAll<SVGGElement, unknown>('.tick')
    .data(values, (value) => String(scale(value)))
    .order();
  const tickExit = tick.exit();
  const tickEnter = tick.enter().append('g').attr('class', 'tick');
  const line = tick.select<SVGLineElement>('line');
  const text = tick.select<SVGTextElement>('text');

  const domain = path.merge(
    path.enter().insert('path', '.tick').attr('class', 'domain').attr('stroke', 'currentColor'),
  );
  const ticks = tick.merge(tickEnter);
  const lines = line.merge(
    tickEnter
      .append('line')
      .attr('stroke', 'currentColor')
      .attr(`${x}2`, k * tickSize),
  );
  const texts = text.merge(
    tickEnter
      .append('text')
      .attr('fill', 'currentColor')
      .attr(x, k * spacing)
      .attr('dy', orient === 'bottom' ? '0.71em' : '0.32em'),
  );

  tickExit.remove();

  writeAttrs(domain, {
    d:
      orient === 'left'
        ? tickSize
          ? `M${k * tickSize},${range0}H${offset}V${range1}H${k * tickSize}`
          : `M${offset},${range0}V${range1}`
        : tickSize
          ? `M${range0},${k * tickSize}V${offset}H${range1}V${k * tickSize}`
          : `M${range0},${offset}H${range1}`,
  });
  writeAttrs(ticks, {
    opacity: 1,
    transform:
      orient === 'bottom'
        ? (value) => `translate(${position(value) + offset},0)`
        : (value) => `translate(0,${position(value) + offset})`,
  });
  writeAttrs(lines, { [`${x}2`]: k * tickSize });
  writeAttrs(texts, { [x]: k * spacing });
  writeText(texts, (value, index) => {
    const label = format(value as d3.AxisDomain, index);
    return label === null || label === undefined ? '' : String(label);
  });

  group
    .filter(function () {
      return !Reflect.get(this, '__axis');
    })
    .attr('fill', 'none')
    .attr('font-size', 10)
    .attr('font-family', 'sans-serif')
    .attr('text-anchor', orient === 'left' ? 'end' : 'middle');
  group.each(function () {
    Reflect.set(this, '__axis', position);
  });
}

export interface GridVisibility {
  x?: boolean;
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
    gridGroup.select('.grid-v').selectAll('line').remove();
  } else if (updateX) {
    let vGroup = gridGroup.select<SVGGElement>('.grid-v');
    if (vGroup.empty()) vGroup = gridGroup.append('g').attr('class', 'grid-v');

    if ('bandwidth' in xScale) {
      const bandScale = xScale as d3.ScaleBand<string>;
      writeAttrs(
        vGroup.selectAll<SVGLineElement, string>('line').data(bandScale.domain()).join('line'),
        {
          x1: (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2,
          x2: (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2,
          y1: 0,
          y2: height,
        },
      );
    } else {
      const tickScale = xScale as { ticks: (count?: number) => number[]; (v: number): number };
      const xTicks = xTickValues
        ? (visibleTickValues(xScale, xTickValues) as number[])
        : tickScale.ticks(widthTickCount(width));
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
      if (dur > 0) {
        vJoin
          .transition()
          .duration(dur)
          .attr('x1', (d) => tickScale(d))
          .attr('x2', (d) => tickScale(d))
          .attr('y1', 0)
          .attr('y2', height);
      } else {
        writeAttrs(vJoin, { x1: (d) => tickScale(d), x2: (d) => tickScale(d), y1: 0, y2: height });
      }
    }
  }

  if (updateY && !showY) {
    gridGroup.select('.grid-h').selectAll('line').remove();
  } else if (updateY) {
    let hGroup = gridGroup.select<SVGGElement>('.grid-h');
    if (hGroup.empty()) hGroup = gridGroup.append('g').attr('class', 'grid-h');

    if ('bandwidth' in yScale) {
      const bandScale = yScale as d3.ScaleBand<string>;
      writeAttrs(
        hGroup.selectAll<SVGLineElement, string>('line').data(bandScale.domain()).join('line'),
        {
          x1: 0,
          x2: width,
          y1: (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2,
          y2: (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2,
        },
      ).each(function () {
        setStyleIfChanged(this, 'stroke-width', '0.5');
      });
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
      if (dur > 0) {
        hJoin
          .transition()
          .duration(dur)
          .attr('x1', 0)
          .attr('x2', width)
          .attr('y1', (d) => yScale(d))
          .attr('y2', (d) => yScale(d));
      } else {
        writeAttrs(hJoin, { x1: 0, x2: width, y1: (d) => yScale(d), y2: (d) => yScale(d) });
      }
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

export function setAttrIfChanged(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

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

type AttrValue = string | number | null | undefined;

const TEXT_NODE = 3;

export function writeAttrs<E extends Element, D, P extends d3.BaseType, PD>(
  selection: d3.Selection<E, D, P, PD>,
  attrs: Record<string, AttrValue | ((datum: D, index: number) => AttrValue)>,
): d3.Selection<E, D, P, PD> {
  const entries = Object.entries(attrs);
  selection.each(function (datum, index) {
    for (const [name, value] of entries) {
      const next = typeof value === 'function' ? value(datum, index) : value;
      if (next === null || next === undefined) this.removeAttribute(name);
      else setAttrIfChanged(this, name, String(next));
    }
  });
  return selection;
}

export function writeText<E extends Element, D, P extends d3.BaseType, PD>(
  selection: d3.Selection<E, D, P, PD>,
  text: (datum: D, index: number) => string | null | undefined,
): d3.Selection<E, D, P, PD> {
  selection.each(function (datum, index) {
    const next = text(datum, index) ?? '';
    const only = this.firstChild;
    const unchanged =
      next === ''
        ? only === null
        : only !== null &&
          only === this.lastChild &&
          only.nodeType === TEXT_NODE &&
          only.nodeValue === next;
    if (!unchanged) this.textContent = next;
  });
  return selection;
}

export function raiseInOrder(
  root: { selectAll: (selector: string) => { nodes: () => Element[] } },
  selectors: readonly string[],
): void {
  const groups = selectors.map((selector) => root.selectAll(selector).nodes());
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
  for (const selector of selectors) {
    for (const node of root.selectAll(selector).nodes()) {
      if (node.nextSibling) node.parentNode?.append(node);
    }
  }
}
