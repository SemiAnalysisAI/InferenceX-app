import type * as d3 from 'd3';

import type { CustomLayerConfig } from '@/lib/d3-chart/D3Chart';

type Linear = d3.ScaleContinuousNumeric<number, number>;
type Band = d3.ScaleBand<string>;

export function originBarsLayer<T>(opts: {
  key: string;
  data: T[];
  band: (d: T) => string;
  sub?: { of: (d: T) => string; domain: string[] };
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
      const n = opts.sub?.domain.length ?? 1;
      const h = y.bandwidth() / n;
      const top = (d: T) =>
        (y(opts.band(d)) ?? 0) + (opts.sub ? opts.sub.domain.indexOf(opts.sub.of(d)) * h : 0);
      group
        .selectAll<SVGTextElement, T>('.bar-note')
        .data(opts.data)
        .join('text')
        .attr('class', 'bar-note')
        .attr('x', (d) =>
          opts.value(d) >= opts.origin ? x(opts.value(d)) + 6 : x(opts.value(d)) - 6,
        )
        .attr('y', (d) => top(d) + h / 2)
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
        .attr('y', (d) => top(d) + (n > 1 ? 1 : 0))
        .attr('width', (d) => Math.max(1, Math.abs(x(opts.value(d)) - x0)))
        .attr('height', n > 1 ? Math.max(1, h - 2) : h)
        .attr('rx', 2)
        .attr('fill', opts.color)
        .attr('cursor', 'pointer');
    },
  };
}
