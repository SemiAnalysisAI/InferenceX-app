'use client';

import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import * as d3 from 'd3';
import { D3Chart, type LayerConfig } from '@/lib/d3-chart/D3Chart';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { contrastColors } from '@/lib/d3-chart/contrast-colors';
import { twoRowYAxisLabels } from '@/lib/d3-chart/axis-labels';
import { formatLargeNumber } from '@/lib/chart-rendering';

// ---------------------------------------------------------------------------
// Shared types and constants
// ---------------------------------------------------------------------------

interface BarEntry {
  gpu: string;
  value: number;
  vendor: 'nvidia' | 'amd' | 'other';
}

interface LineEntry {
  x: number;
  y: number;
  key: string;
}

interface BenchmarkChartProps {
  children?: ReactNode;
  data: string;
  metric?: string;
  /** "bar" (default) = horizontal bars, "line" = time-series, "scatter" = XY scatter+lines */
  variant?: 'bar' | 'line' | 'scatter';
}

const VENDOR_COLORS: Record<string, string> = {
  nvidia: 'oklch(0.72 0.17 145)',
  amd: 'oklch(0.68 0.19 25)',
  other: 'oklch(0.7 0.1 260)',
};

const SERIES_COLORS = [
  'oklch(0.72 0.17 145)',
  'oklch(0.68 0.19 25)',
  'oklch(0.65 0.15 260)',
  'oklch(0.70 0.15 60)',
  'oklch(0.65 0.18 320)',
  'oklch(0.75 0.12 200)',
  'oklch(0.60 0.16 350)',
  'oklch(0.70 0.14 90)',
];

function getBarColor(d: BarEntry): string {
  return VENDOR_COLORS[d.vendor] ?? VENDOR_COLORS.other;
}

function tooltipShell(inner: string, isPinned: boolean): string {
  return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 140px; user-select: ${isPinned ? 'text' : 'none'};">
    ${isPinned ? '<div class="text-muted-foreground text-[10px] mb-1 italic">Click elsewhere to dismiss</div>' : ''}
    ${inner}
  </div>`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function BenchmarkChart({
  data: dataJson,
  metric = 'Throughput/GPU (tok/s)',
  variant = 'bar',
}: BenchmarkChartProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (variant === 'line')
    return <LineVariant dataJson={dataJson} metric={metric} mounted={mounted} />;
  if (variant === 'scatter')
    return <ScatterVariant dataJson={dataJson} metric={metric} mounted={mounted} />;
  return <BarVariant dataJson={dataJson} metric={metric} mounted={mounted} />;
}

// ---------------------------------------------------------------------------
// Bar variant — copied from reliability/ui/BarChartD3.tsx
// ---------------------------------------------------------------------------

function positionValueLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
) {
  group.selectAll<SVGTextElement, BarEntry>('.value-label').each(function (d) {
    const barEnd = xScale(d.value);
    const textWidth = this.getComputedTextLength();
    const fitsInside = barEnd > textWidth + 24;
    d3.select(this)
      .attr('x', fitsInside ? barEnd - 10 : barEnd + 6)
      .attr('text-anchor', fitsInside ? 'end' : 'start')
      .style('fill', fitsInside ? contrastColors(getBarColor(d)) : 'var(--foreground)');
  });
}

function BarVariant({
  dataJson,
  metric,
  mounted,
}: {
  dataJson: string;
  metric: string;
  mounted: boolean;
}) {
  const hoveredBarXRef = useRef(0);

  const data = useMemo<BarEntry[]>(() => {
    try {
      return (JSON.parse(dataJson) as BarEntry[]).toSorted((a, b) => b.value - a.value);
    } catch {
      return [];
    }
  }, [dataJson]);

  if (data.length === 0) return null;
  const height = Math.max(250, data.length * 45 + 80);
  if (!mounted) return <div className="my-6 not-prose" style={{ height }} />;

  const maxValue = Math.max(...data.map((d) => d.value));
  const yDomain = [...data].toReversed().map((d) => d.gpu);

  const layers: LayerConfig<BarEntry>[] = [
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
          .selectAll<SVGTextElement, BarEntry>('.value-label')
          .data(data, (d) => d.gpu)
          .join('text')
          .attr('class', 'value-label')
          .attr('y', (d) => (yScale(d.gpu) ?? 0) + yScale.bandwidth() / 2)
          .attr('dy', '0.35em')
          .attr('font-size', '12px')
          .attr('font-weight', '600')
          .style('pointer-events', 'none')
          .text((d) => `${formatLargeNumber(d.value)} tok/s`);
        positionValueLabels(group, ctx.xScale as d3.ScaleLinear<number, number>);
      },
      onZoom: (group, ctx) =>
        positionValueLabels(group, ctx.newXScale as d3.ScaleLinear<number, number>),
    },
  ];

  return (
    <div className="my-6 not-prose">
      <D3Chart<BarEntry>
        chartId="benchmark-bar"
        data={data}
        height={height}
        margin={{ top: 24, right: 24, bottom: 48, left: 100 }}
        watermark="logo"
        grabCursor
        clipContent={false}
        instructions=""
        xScale={{ type: 'linear', domain: [0, maxValue * 1.1], nice: true }}
        yScale={{ type: 'band', domain: yDomain, padding: 0.15 }}
        xAxis={{
          label: metric,
          tickFormat: (d: d3.AxisDomain) => formatLargeNumber(d as number),
          tickCount: 5,
        }}
        yAxis={{ customize: twoRowYAxisLabels(5) }}
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
          content: (d, isPinned) =>
            tooltipShell(
              `<div class="font-semibold mb-1">${d.gpu}</div><div class="text-muted-foreground">${metric}: ${formatLargeNumber(d.value)}</div>`,
              isPinned,
            ),
          getRulerX: () => hoveredBarXRef.current,
          getRulerY: (d, ys) => {
            const bs = ys as unknown as d3.ScaleBand<string>;
            return (bs(d.gpu) ?? 0) + bs.bandwidth() / 2;
          },
          onHoverStart: (sel) => {
            hoveredBarXRef.current = Number.parseFloat(sel.attr('width') || '0');
            sel.attr('stroke', 'var(--foreground)').attr('stroke-width', 1.5);
          },
          onHoverEnd: (sel) => sel.attr('stroke', 'none'),
          attachToLayer: 0,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line variant — copied from inference/ui/TrendChart.tsx
// ---------------------------------------------------------------------------

interface LineParsed {
  lines: Record<string, { x: number; y: number }[]>;
  points: LineEntry[];
  keys: string[];
  colorMap: Record<string, string>;
  /** safeKey → original display name */
  labelMap: Record<string, string>;
  minDate: Date;
  maxDate: Date;
  minValue: number;
  maxValue: number;
}

function parseLine(dataJson: string): LineParsed | null {
  try {
    const parsed = JSON.parse(dataJson) as {
      series: Record<string, ({ date: string; value: number } | [string, number])[]>;
    };
    const lines: Record<string, { x: number; y: number }[]> = {};
    const points: LineEntry[] = [];
    const keys: string[] = [];

    for (const [key, entries] of Object.entries(parsed.series)) {
      const safeKey = key.replaceAll(/[^a-zA-Z0-9-]/g, '_');
      keys.push(key);
      const mapped = entries
        .map((e) => {
          const [dateStr, value] = Array.isArray(e) ? e : [e.date, e.value];
          return { x: new Date(dateStr).getTime(), y: value };
        })
        .toSorted((a, b) => a.x - b.x);
      lines[safeKey] = mapped;
      for (const pt of mapped) points.push({ ...pt, key: safeKey });
    }

    if (keys.length === 0) return null;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const pad = (Math.max(...xs) - Math.min(...xs)) * 0.05 || 86400000;
    const yRange = Math.max(...ys) - Math.min(...ys);

    const colorMap: Record<string, string> = {};
    const labelMap: Record<string, string> = {};
    for (const [i, key] of keys.entries()) {
      const safe = key.replaceAll(/[^a-zA-Z0-9-]/g, '_');
      colorMap[safe] = SERIES_COLORS[i % SERIES_COLORS.length];
      labelMap[safe] = key;
    }

    return {
      lines,
      points,
      keys,
      colorMap,
      labelMap,
      minDate: new Date(Math.min(...xs) - pad),
      maxDate: new Date(Math.max(...xs) + pad),
      minValue: Math.max(0, Math.min(...ys) - yRange * 0.05),
      maxValue: Math.max(...ys) + yRange * 0.05,
    };
  } catch {
    return null;
  }
}

function LineVariant({
  dataJson,
  metric,
  mounted,
}: {
  dataJson: string;
  metric: string;
  mounted: boolean;
}) {
  const parsed = useMemo(() => parseLine(dataJson), [dataJson]);
  if (!parsed) return null;
  const height = 350;
  if (!mounted) return <div className="my-6 not-prose" style={{ height }} />;

  const layers: LayerConfig<LineEntry>[] = [
    {
      type: 'line',
      key: 'blog-lines',
      lines: parsed.lines,
      config: {
        getColor: (key: string) => parsed.colorMap[key] ?? SERIES_COLORS[0],
        strokeWidth: 2,
        curve: d3.curveMonotoneX,
      },
    },
    {
      type: 'scatter',
      key: 'blog-points',
      data: parsed.points,
      config: {
        getColor: (d: LineEntry) => parsed.colorMap[d.key] ?? SERIES_COLORS[0],
      },
    },
  ];

  const legend = (
    <div className="flex flex-wrap gap-4 mt-2 ml-16">
      {parsed.keys.map((key, i) => (
        <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
          />
          {key}
        </div>
      ))}
    </div>
  );

  return (
    <div className="my-6 not-prose">
      <D3Chart<LineEntry>
        chartId="benchmark-line"
        data={parsed.points}
        height={height}
        margin={{ top: 20, right: 30, bottom: 50, left: 60 }}
        watermark="logo"
        grabCursor
        instructions=""
        xScale={{ type: 'time', domain: [parsed.minDate, parsed.maxDate], nice: true }}
        yScale={{ type: 'linear', domain: [parsed.minValue, parsed.maxValue], nice: true }}
        xAxis={{
          tickFormat: d3.timeFormat('%b %d') as (d: d3.AxisDomain) => string,
          tickCount: 8,
          customize: (g) =>
            g.selectAll('.tick text').attr('transform', 'rotate(-30)').attr('text-anchor', 'end'),
        }}
        yAxis={{
          label: metric,
          tickFormat: (d: d3.AxisDomain) => formatLargeNumber(d as number),
          tickCount: 8,
        }}
        layers={layers}
        zoom={{ enabled: true, axes: 'x', scaleExtent: [1, 10] }}
        tooltip={{
          rulerType: 'crosshair',
          content: (d: LineEntry, isPinned: boolean) => {
            const date = new Date(d.x).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            return tooltipShell(
              `<div class="font-semibold mb-1" style="color: ${parsed.colorMap[d.key] ?? '#888'}">${parsed.labelMap[d.key] ?? d.key}</div>
               <div class="text-muted-foreground">${date}</div>
               <div class="mt-1 font-medium">${metric}: ${formatLargeNumber(d.y)}</div>`,
              isPinned,
            );
          },
          attachToLayer: 1,
        }}
      />
      {legend}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scatter variant — copied from inference/ui/ScatterGraph.tsx patterns
// ---------------------------------------------------------------------------

interface ScatterParsed {
  lines: Record<string, { x: number; y: number }[]>;
  points: LineEntry[];
  keys: string[];
  colorMap: Record<string, string>;
  labelMap: Record<string, string>;
  maxX: number;
  maxY: number;
}

function parseScatter(dataJson: string): ScatterParsed | null {
  try {
    const parsed = JSON.parse(dataJson) as {
      series: Record<string, { interactivity: number; throughput: number }[]>;
    };
    const lines: Record<string, { x: number; y: number }[]> = {};
    const points: LineEntry[] = [];
    const keys: string[] = [];

    for (const [key, entries] of Object.entries(parsed.series)) {
      const safeKey = key.replaceAll(/[^a-zA-Z0-9-]/g, '_');
      keys.push(key);
      const mapped = entries
        .map((e) => ({ x: e.interactivity, y: e.throughput }))
        .toSorted((a, b) => a.x - b.x);
      lines[safeKey] = mapped;
      for (const pt of mapped) points.push({ ...pt, key: safeKey });
    }

    if (keys.length === 0) return null;

    const colorMap: Record<string, string> = {};
    const labelMap: Record<string, string> = {};
    for (const [i, key] of keys.entries()) {
      const safe = key.replaceAll(/[^a-zA-Z0-9-]/g, '_');
      colorMap[safe] = SERIES_COLORS[i % SERIES_COLORS.length];
      labelMap[safe] = key;
    }

    return {
      lines,
      points,
      keys,
      colorMap,
      labelMap,
      maxX: Math.max(...points.map((p) => p.x)),
      maxY: Math.max(...points.map((p) => p.y)),
    };
  } catch {
    return null;
  }
}

function ScatterVariant({
  dataJson,
  metric,
  mounted,
}: {
  dataJson: string;
  metric: string;
  mounted: boolean;
}) {
  const parsed = useMemo(() => parseScatter(dataJson), [dataJson]);
  if (!parsed) return null;
  const height = 350;
  if (!mounted) return <div className="my-6 not-prose" style={{ height }} />;

  const layers: LayerConfig<LineEntry>[] = [
    {
      type: 'line',
      key: 'scatter-lines',
      lines: parsed.lines,
      config: {
        getColor: (key: string) => parsed.colorMap[key] ?? SERIES_COLORS[0],
        strokeWidth: 2,
        curve: d3.curveMonotoneX,
      },
    },
    {
      type: 'scatter',
      key: 'scatter-points',
      data: parsed.points,
      config: {
        getColor: (d: LineEntry) => parsed.colorMap[d.key] ?? SERIES_COLORS[0],
      },
    },
  ];

  const legend = (
    <div className="flex flex-wrap gap-4 mt-2 ml-16">
      {parsed.keys.map((key, i) => (
        <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
          />
          {key}
        </div>
      ))}
    </div>
  );

  return (
    <div className="my-6 not-prose">
      <D3Chart<LineEntry>
        chartId="benchmark-scatter"
        data={parsed.points}
        height={height}
        margin={{ top: 20, right: 30, bottom: 50, left: 70 }}
        watermark="logo"
        grabCursor
        instructions=""
        xScale={{ type: 'linear', domain: [0, parsed.maxX * 1.15], nice: true }}
        yScale={{ type: 'linear', domain: [0, parsed.maxY * 1.15], nice: true }}
        xAxis={{
          label: 'Interactivity (tok/s/user)',
          tickFormat: (d: d3.AxisDomain) => formatLargeNumber(d as number),
          tickCount: 6,
        }}
        yAxis={{ label: metric, tickFormat: (d: d3.AxisDomain) => formatLargeNumber(d as number) }}
        layers={layers}
        zoom={{ enabled: true, axes: 'both', scaleExtent: [1, 10] }}
        tooltip={{
          rulerType: 'crosshair',
          content: (d: LineEntry, isPinned: boolean) =>
            tooltipShell(
              `<div class="font-semibold mb-1" style="color: ${parsed.colorMap[d.key] ?? '#888'}">${parsed.labelMap[d.key] ?? d.key}</div>
             <div class="text-muted-foreground">Interactivity: ${formatLargeNumber(d.x)} tok/s/user</div>
             <div class="mt-1 font-medium">${metric}: ${formatLargeNumber(d.y)}</div>`,
              isPinned,
            ),
          attachToLayer: 1,
        }}
      />
      {legend}
    </div>
  );
}
