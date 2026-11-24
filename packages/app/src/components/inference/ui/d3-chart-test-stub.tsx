// Unit-test stand-in for D3Chart: jsdom has no measured layout, so this runs the chart's
// layers against fixed scales and wires the tooltip handlers onto a horizontal-bar layer.
// Use it with mock.module('@/lib/d3-chart/D3Chart', () => import('.../d3-chart-test-stub')).
import * as d3 from 'd3';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { renderHorizontalBars } from '@/lib/d3-chart/layers/horizontal-bars';

const PLOT_WIDTH = 600;

interface StubLayer {
  type?: string;
  data?: unknown[];
  config?: unknown;
  render?: (group: unknown, ctx: unknown) => unknown;
}
interface StubTooltip {
  content: (d: unknown, pinned: boolean) => string;
  attachToLayer?: number;
  onHoverStart?: (sel: unknown, d: unknown) => void;
  onHoverEnd?: (sel: unknown, d: unknown) => void;
  onPointClick?: (d: unknown) => void;
}
interface StubProps {
  data?: unknown[];
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  xScale: { domain: [number, number] };
  yScale: {
    type?: string;
    domain: unknown[];
    padding?: number;
    paddingOuter?: number;
    align?: number;
  };
  layers: StubLayer[];
  tooltip?: StubTooltip;
  legendElement?: ReactNode;
  watermark?: string;
  xAxis?: { tickValues?: (scale: unknown) => number[]; tickFormat?: (d: number) => string };
}

type Bars = d3.Selection<SVGRectElement, unknown, SVGGElement, unknown>;

export function D3Chart(props: StubProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const svg = d3.select(svgRef.current!);
    let g = svg.select<SVGGElement>('g.root');
    if (g.empty()) {
      g = svg.append('g').attr('class', 'root');
      g.append('g').attr('class', 'zoom');
    }
    const zoomGroup = g.select<SVGGElement>('g.zoom');
    const width = PLOT_WIDTH - props.margin.left - props.margin.right;
    const height = props.height - props.margin.top - props.margin.bottom;
    const xScale = d3.scaleLinear().domain(props.xScale.domain).range([0, width]);
    // Bar charts use a band y scale, line charts a linear one.
    const yScale =
      props.yScale.type === 'band'
        ? d3
            .scaleBand<string>()
            .domain(props.yScale.domain as string[])
            .range([0, height])
            .padding(props.yScale.padding ?? 0)
            .paddingOuter(props.yScale.paddingOuter ?? props.yScale.padding ?? 0)
            .align(props.yScale.align ?? 0.5)
        : d3
            .scaleLinear()
            .domain(props.yScale.domain as [number, number])
            .range([height, 0])
            .nice();
    const ctx = {
      layout: { svg, g, zoomGroup, width, height, margin: props.margin },
      tooltipElement: tooltipRef.current!,
      xScale,
      yScale,
      width,
      height,
    };
    const selections = props.layers.map((layer) =>
      layer.type === 'horizontalBar'
        ? renderHorizontalBars(
            zoomGroup,
            layer.data ?? [],
            yScale as d3.ScaleBand<string>,
            xScale,
            layer.config as never,
          )
        : layer.render?.(zoomGroup, ctx),
    );
    // The x axis as D3Chart draws it: the tick values for this scale, then their format.
    const ticks = props.xAxis?.tickValues?.(xScale) ?? [];
    g.selectAll('g.x-axis-stub')
      .data([null])
      .join('g')
      .attr('class', 'x-axis-stub')
      .selectAll('text')
      .data(ticks)
      .join('text')
      .attr('data-testid', 'x-tick')
      .text((d) => props.xAxis?.tickFormat?.(d) ?? String(d));
    const { tooltip } = props;
    const index = tooltip?.attachToLayer;
    if (tooltip && index !== undefined && props.layers[index]?.type === 'horizontalBar') {
      // Hover and click on the bars, as D3Chart's tooltip handlers do.
      (selections[index] as Bars)
        .on('mouseenter', function (_event, d) {
          tooltip.onHoverStart?.(d3.select(this), d);
          tooltipRef.current!.innerHTML = tooltip.content(d, false);
        })
        .on('mouseleave', function (_event, d) {
          tooltip.onHoverEnd?.(d3.select(this), d);
          tooltipRef.current!.innerHTML = '';
        })
        .on('click', (_event, d) => tooltip.onPointClick?.(d));
    } else if (tooltip && tooltipRef.current) {
      tooltipRef.current.innerHTML = tooltip.content(props.data?.[0], false);
    }
  });
  return (
    <div>
      <svg
        ref={svgRef}
        data-testid="d3-chart-stub"
        data-margin-right={props.margin.right}
        data-watermark={props.watermark}
      />
      <div ref={tooltipRef} data-testid="tooltip-probe" />
      {props.legendElement}
    </div>
  );
}
