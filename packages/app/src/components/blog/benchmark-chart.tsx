'use client';

import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import * as d3 from 'd3';
import { D3Chart, type LayerConfig } from '@/lib/d3-chart/D3Chart';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { contrastColors } from '@/lib/d3-chart/contrast-colors';
import { twoRowYAxisLabels } from '@/lib/d3-chart/axis-labels';

interface BenchmarkEntry {
  gpu: string;
  value: number;
  vendor: 'nvidia' | 'amd' | 'other';
}

interface BenchmarkChartProps {
  children?: ReactNode;
  data: string;
  metric?: string;
}

const VENDOR_COLORS: Record<string, string> = {
  nvidia: 'oklch(0.72 0.17 145)',
  amd: 'oklch(0.68 0.19 25)',
  other: 'oklch(0.7 0.1 260)',
};

const CHART_MARGIN = { top: 24, right: 24, bottom: 48, left: 100 };

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function getBarColor(d: BenchmarkEntry): string {
  return VENDOR_COLORS[d.vendor] ?? VENDOR_COLORS.other;
}

const generateTooltipContent = (data: BenchmarkEntry, isPinned: boolean): string => `
  <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
    ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
    <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${data.gpu}</div>
    <div style="color: var(--muted-foreground); font-size: 11px;"><strong>Throughput/GPU:</strong> ${formatNumber(data.value)} tok/s</div>
  </div>
`;

/** Position value labels, flipping inside/outside bar based on space. */
function positionValueLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
) {
  group.selectAll<SVGTextElement, BenchmarkEntry>('.value-label').each(function (d) {
    const barEnd = xScale(d.value);
    const textWidth = this.getComputedTextLength();
    const fitsInside = barEnd > textWidth + 24;
    d3.select(this)
      .attr('x', fitsInside ? barEnd - 10 : barEnd + 6)
      .attr('text-anchor', fitsInside ? 'end' : 'start')
      .style('fill', fitsInside ? contrastColors(getBarColor(d)) : 'var(--foreground)');
  });
}

export function BenchmarkChart({
  data: dataJson,
  metric = 'Throughput/GPU (tok/s)',
}: BenchmarkChartProps) {
  const data = useMemo<BenchmarkEntry[]>(() => {
    try {
      const parsed = JSON.parse(dataJson) as BenchmarkEntry[];
      return parsed.toSorted((a, b) => b.value - a.value);
    } catch {
      return [];
    }
  }, [dataJson]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (data.length === 0) return null;

  const dynamicHeight = Math.max(250, data.length * 45 + 80);

  if (!mounted) {
    return <div className="my-6 not-prose" style={{ height: dynamicHeight }} />;
  }

  return <BenchmarkChartInner data={data} metric={metric} height={dynamicHeight} />;
}

function BenchmarkChartInner({
  data,
  metric,
  height,
}: {
  data: BenchmarkEntry[];
  metric: string;
  height: number;
}) {
  const hoveredBarXRef = useRef(0);

  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value)), [data]);
  const yDomain = useMemo(() => [...data].toReversed().map((d) => d.gpu), [data]);

  const layers = useMemo(
    (): LayerConfig<BenchmarkEntry>[] => [
      {
        type: 'horizontalBar',
        data,
        config: {
          getY: (d) => d.gpu,
          getX: (d) => d.value,
          getColor: getBarColor,
          rx: 2,
          opacity: 1,
          keyFn: (d) => d.gpu,
        },
      },
      {
        type: 'custom',
        key: 'bar-labels',
        render: (group, ctx) => {
          const yScale = ctx.yScale as d3.ScaleBand<string>;

          group
            .selectAll<SVGTextElement, BenchmarkEntry>('.value-label')
            .data(data, (d) => d.gpu)
            .join('text')
            .attr('class', 'value-label')
            .attr('y', (d) => (yScale(d.gpu) ?? 0) + yScale.bandwidth() / 2)
            .attr('dy', '0.35em')
            .attr('font-size', '12px')
            .attr('font-weight', '600')
            .style('pointer-events', 'none')
            .text((d) => `${formatNumber(d.value)} tok/s`);

          positionValueLabels(group, ctx.xScale as d3.ScaleLinear<number, number>);
        },
        onZoom: (group, ctx) => {
          positionValueLabels(group, ctx.newXScale as d3.ScaleLinear<number, number>);
        },
      },
    ],
    [data],
  );

  const xAxisConfig = useMemo(
    () => ({
      label: metric,
      tickFormat: (d: d3.AxisDomain) => formatNumber(d as number),
      tickCount: 5,
    }),
    [metric],
  );

  const yAxisConfig = useMemo(() => ({ customize: twoRowYAxisLabels(5) }), []);

  return (
    <div className="my-6 not-prose">
      <D3Chart<BenchmarkEntry>
        chartId="benchmark-bar"
        data={data}
        height={height}
        margin={CHART_MARGIN}
        watermark="logo"
        grabCursor
        clipContent={false}
        instructions=""
        xScale={{ type: 'linear', domain: [0, maxValue * 1.1], nice: true }}
        yScale={{ type: 'band', domain: yDomain, padding: 0.15 }}
        xAxis={xAxisConfig}
        yAxis={yAxisConfig}
        layers={layers}
        zoom={{
          enabled: true,
          axes: 'x',
          scaleExtent: [0.1, 1],
          rescaleX: (xScale, transform) =>
            xScale.copy().domain([0, (maxValue * 1.1) / transform.k]) as ContinuousScale,
          customTransformStorage: (transform) => d3.zoomIdentity.scale(transform.k),
        }}
        tooltip={{
          rulerType: 'vertical',
          content: generateTooltipContent,
          getRulerX: () => hoveredBarXRef.current,
          getRulerY: (d, ys) => {
            const bandScale = ys as unknown as d3.ScaleBand<string>;
            return (bandScale(d.gpu) ?? 0) + bandScale.bandwidth() / 2;
          },
          onHoverStart: (sel) => {
            hoveredBarXRef.current = Number.parseFloat(sel.attr('width') || '0');
            sel.attr('stroke', 'var(--foreground)').attr('stroke-width', 1.5);
          },
          onHoverEnd: (sel) => {
            sel.attr('stroke', 'none');
          },
          attachToLayer: 0,
        }}
      />
    </div>
  );
}
