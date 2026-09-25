import type * as d3 from 'd3';

import type { CustomLayerConfig } from '@/lib/d3-chart/D3Chart';

type Linear = d3.ScaleContinuousNumeric<number, number>;
type Band = d3.ScaleBand<string>;

/** Horizontal bars on a band y-axis that grow from `origin` on a continuous x-axis. */
export function originBarsLayer<T>(opts: {
  key: string;
  data: T[];
  band: (d: T) => string;
  value: (d: T) => number;
  color: (d: T) => string;
  label: (d: T) => string;
  origin: number;
}): CustomLayerConfig {
  return {
    type: 'custom',
    key: opts.key,
    render: (group, ctx) => {
      const x = ctx.xScale as Linear;
      const y = ctx.yScale as Band;
      const x0 = x(opts.origin);
      group
        .selectAll<SVGTextElement, T>('.bar-note')
        .data(opts.data)
        .join('text')
        .attr('class', 'bar-note')
        .attr('x', (d) =>
          opts.value(d) >= opts.origin ? x(opts.value(d)) + 6 : x(opts.value(d)) - 6,
        )
        .attr('y', (d) => (y(opts.band(d)) ?? 0) + y.bandwidth() / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', (d) => (opts.value(d) >= opts.origin ? 'start' : 'end'))
        .attr('font-size', '11px')
        .style('fill', 'var(--muted-foreground)')
        .style('pointer-events', 'none')
        .text(opts.label);
      return group
        .selectAll<SVGRectElement, T>('.bar')
        .data(opts.data)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', (d) => Math.min(x0, x(opts.value(d))))
        .attr('y', (d) => y(opts.band(d)) ?? 0)
        .attr('width', (d) => Math.max(1, Math.abs(x(opts.value(d)) - x0)))
        .attr('height', y.bandwidth())
        .attr('rx', 2)
        .attr('fill', opts.color)
        .attr('cursor', 'pointer');
    },
  };
}

export interface GroupedDatum {
  group: string;
  series: string;
  value: number;
}

/** Vertical bars: one cluster per x band, one bar per series, growing from `origin`. */
export function groupedBarsLayer(opts: {
  key: string;
  data: GroupedDatum[];
  series: string[];
  colors: Record<string, string>;
  origin: number;
}): CustomLayerConfig {
  return {
    type: 'custom',
    key: opts.key,
    render: (group, ctx) => {
      const x = ctx.xScale as Band;
      const y = ctx.yScale as Linear;
      const inner = x.bandwidth() / opts.series.length;
      const base = y(opts.origin);
      return group
        .selectAll<SVGRectElement, GroupedDatum>('.bar')
        .data(opts.data, (d) => `${d.group}|${d.series}`)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', (d) => (x(d.group) ?? 0) + opts.series.indexOf(d.series) * inner + 1)
        .attr('width', Math.max(1, inner - 2))
        .attr('y', (d) => Math.min(base, y(d.value)))
        .attr('height', (d) => Math.max(1, Math.abs(y(d.value) - base)))
        .attr('rx', 2)
        .attr('fill', (d) => opts.colors[d.series])
        .attr('cursor', 'pointer');
    },
  };
}

export interface BoxDatum {
  band: string;
  color: string;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

/** Box plots on a band x-axis: box p25–p75, median bar, whiskers p5–p95. */
export function boxLayer(opts: { key: string; data: BoxDatum[] }): CustomLayerConfig {
  return {
    type: 'custom',
    key: opts.key,
    render: (group, ctx) => {
      const x = ctx.xScale as Band;
      const y = ctx.yScale as Linear;
      const w = x.bandwidth();
      const boxes = group
        .selectAll<SVGGElement, BoxDatum>('.box')
        .data(opts.data, (d) => d.band)
        .join((enter) => {
          const g = enter.append('g').attr('class', 'box').attr('cursor', 'pointer');
          g.append('rect').attr('class', 'hit').attr('fill', 'transparent');
          g.append('line').attr('class', 'whisker').attr('stroke-width', 2);
          g.append('rect')
            .attr('class', 'iqr')
            .attr('rx', 2)
            .attr('stroke-width', 2)
            .attr('fill-opacity', 0.3);
          g.append('line').attr('class', 'median').attr('stroke-width', 3);
          return g;
        })
        .attr('transform', (d) => `translate(${x(d.band) ?? 0},0)`);
      boxes
        .select('.hit')
        .attr('width', w)
        .attr('y', (d) => y(d.p95))
        .attr('height', (d) => Math.max(1, y(d.p5) - y(d.p95)));
      boxes
        .select('.whisker')
        .attr('x1', w / 2)
        .attr('x2', w / 2)
        .attr('y1', (d) => y(d.p5))
        .attr('y2', (d) => y(d.p95))
        .attr('stroke', (d) => d.color);
      boxes
        .select('.iqr')
        .attr('width', w)
        .attr('y', (d) => y(d.p75))
        .attr('height', (d) => Math.max(1, y(d.p25) - y(d.p75)))
        .attr('fill', (d) => d.color)
        .attr('stroke', (d) => d.color);
      boxes
        .select('.median')
        .attr('x2', w)
        .attr('y1', (d) => y(d.p50))
        .attr('y2', (d) => y(d.p50))
        .attr('stroke', (d) => d.color);
      return boxes;
    },
  };
}
