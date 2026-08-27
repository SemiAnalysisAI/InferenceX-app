'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { RenderContext, ZoomContext } from '@/lib/d3-chart/D3Chart/types';

import {
  type CollectiveXKvFrontierPoint,
  type CollectiveXKvFrontierSelection,
  type CollectiveXKvRunCase,
  collectiveXKvFrontierPoints,
  collectiveXRunDasharray,
} from './data';

interface CollectiveXKvFrontierChartProps {
  chartId: string;
  cases: CollectiveXKvRunCase[];
  colors: Record<string, string>;
  selection: CollectiveXKvFrontierSelection;
  caption?: React.ReactNode;
  legendElement?: React.ReactNode;
  testId?: string;
}

function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [1, 10];
  const min = d3.min(values) ?? 1;
  const max = d3.max(values) ?? 1;
  return min === max ? [min / 2, max * 2] : [min / 1.15, max * 1.15];
}

function formatCompact(value: number): string {
  if (value >= 1e3) return `${(value / 1e3).toFixed(value < 1e4 ? 1 : 0)}k`;
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function faded(color: string): string {
  return `color-mix(in srgb, ${color} 35%, transparent)`;
}

function renderFrontierRings(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  points: CollectiveXKvFrontierPoint[],
  xScale: RenderContext['xScale'],
  yScale: RenderContext['yScale'],
): void {
  const x = xScale as d3.ScaleLogarithmic<number, number>;
  const y = yScale as d3.ScaleLogarithmic<number, number>;
  group
    .selectAll<SVGCircleElement, CollectiveXKvFrontierPoint>('.frontier-ring')
    .data(points, (point) => `${point.seriesId}-${point.row.batch}`)
    .join('circle')
    .attr('class', 'frontier-ring')
    .attr('cx', (point) => x(point.x))
    .attr('cy', (point) => y(point.y))
    .attr('r', 8)
    .attr('fill', 'none')
    .attr('stroke', 'var(--foreground)')
    .attr('stroke-width', 1.25)
    .attr('pointer-events', 'none');
}

export function CollectiveXKvFrontierChart({
  chartId,
  cases,
  colors,
  selection,
  caption,
  legendElement,
  testId,
}: CollectiveXKvFrontierChartProps) {
  const points = useMemo(() => collectiveXKvFrontierPoints(cases, selection), [cases, selection]);
  const skuFrontierPoints = useMemo(() => points.filter((point) => point.onSkuFrontier), [points]);
  const runIndexBySeries = useMemo(
    () => new Map(cases.map((kase) => [`${kase.run_id}:${kase.case_id}`, kase.run_index])),
    [cases],
  );
  // Batch-ladder walk per series: sorted by requests in flight, so a
  // serializing backend draws a stub and an overlapping one a curve.
  const lines = useMemo(() => {
    const bySeries: Record<string, CollectiveXKvFrontierPoint[]> = {};
    for (const point of points) {
      (bySeries[point.seriesId] ??= []).push(point);
    }
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const [seriesId, seriesPoints] of Object.entries(bySeries)) {
      result[seriesId] = seriesPoints
        .toSorted((a, b) => a.row.batch - b.row.batch)
        .map((point) => ({ x: point.x, y: point.y }));
    }
    return result;
  }, [points]);
  const colorBySeries = useMemo(
    () => new Map(points.map((point) => [point.seriesId, point.colorKey])),
    [points],
  );

  const xDomain = useMemo(() => paddedDomain(points.map((point) => point.x)), [points]);
  const yDomain = useMemo(() => paddedDomain(points.map((point) => point.y)), [points]);

  const noDataOverlay =
    points.length === 0 ? (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p className="text-sm text-muted-foreground">
          No measured kv rows match the selected page size and direction.
        </p>
      </div>
    ) : undefined;

  return (
    <D3Chart<CollectiveXKvFrontierPoint>
      chartId={chartId}
      data={points}
      height={420}
      margin={{ top: 24, right: 20, bottom: 62, left: 78 }}
      watermark="logo"
      testId={testId}
      grabCursor
      instructions="Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip"
      xScale={{ type: 'log', domain: xDomain, nice: false }}
      yScale={{ type: 'log', domain: yDomain, nice: false }}
      xAxis={{
        label: `Aggregate ${selection.op} bandwidth at p50 (GB/s, log)`,
        tickCount: 6,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      yAxis={{
        label: 'Burst p95 latency per in-flight request (ms, log)',
        tickCount: 5,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      layers={[
        {
          type: 'line',
          key: 'collectivex-kv-frontier-lines',
          lines,
          config: {
            getColor: (key) => faded(colors[colorBySeries.get(key) ?? ''] ?? '#888'),
            getStrokeDasharray: (key) => collectiveXRunDasharray(runIndexBySeries.get(key) ?? 0),
            strokeWidth: 1.75,
            curve: d3.curveLinear,
          },
        },
        {
          type: 'point',
          key: 'collectivex-kv-frontier-points',
          data: points,
          config: {
            getCx: () => 0,
            getCy: () => 0,
            getX: (point) => point.x,
            getY: (point) => point.y,
            getColor: (point) => {
              const color = colors[point.colorKey] ?? '#888';
              return point.onSeriesFrontier ? color : faded(color);
            },
            getRadius: (point) => (point.onSeriesFrontier ? 4.5 : 3),
            stroke: 'var(--background)',
            strokeWidth: 1,
            keyFn: (point) => `${point.seriesId}-${point.row.batch}`,
            maxPoints: Infinity,
          },
        },
        // A custom layer rather than a second point layer: renderPoints joins
        // on the shared `.point` class inside the one zoom group, so two point
        // layers would rebind each other's circles.
        {
          type: 'custom',
          key: 'collectivex-kv-frontier-rings',
          render: (group, ctx: RenderContext) =>
            renderFrontierRings(group, skuFrontierPoints, ctx.xScale, ctx.yScale),
          onZoom: (group, ctx: ZoomContext) =>
            renderFrontierRings(group, skuFrontierPoints, ctx.newXScale, ctx.newYScale),
        },
      ]}
      zoom={{
        enabled: true,
        axes: 'both',
        scaleExtent: [1, 20],
        resetEventName: `collectivex_zoom_reset_${chartId}`,
      }}
      tooltip={{
        rulerType: 'crosshair',
        attachToLayer: 1,
        content: (point, isPinned) => {
          const color = colors[point.colorKey] ?? '#888';
          const { row } = point;
          const tier = point.onSkuFrontier
            ? 'SKU-wide frontier'
            : point.onSeriesFrontier
              ? 'backend frontier'
              : 'dominated';
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${row.op} · page ${row.page_tokens} · batch ${row.batch} · ISL ${row.isl.toLocaleString('en-US')} · <strong>${tier}</strong></div>
            <div>Aggregate ${point.x.toFixed(point.x >= 100 ? 0 : 2)} GB/s · p95 ÷ in-flight ${point.y.toFixed(point.y >= 100 ? 0 : 1)} ms</div>
            <div class="text-muted-foreground">Burst latency p50 / p95: ${row.latency_ms.p50.toFixed(1)} / ${row.latency_ms.p95.toFixed(1)} ms · ${row.descs.toLocaleString('en-US')} descriptors/request</div>
            <div class="text-muted-foreground">verify: ${row.verify_passed ? 'passed' : 'FAILED'}</div>
          </div>`;
        },
        getRulerX: (point, scale) =>
          (scale as d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>)(point.x),
        getRulerY: (point, scale) => scale(point.y),
        onHoverStart: (selectionEl) => {
          selectionEl.attr('r', 6);
        },
        onHoverEnd: (selectionEl, point) => {
          selectionEl.attr('r', point.onSeriesFrontier ? 4.5 : 3);
        },
      }}
      transitionDuration={200}
      legendElement={legendElement}
      noDataOverlay={noDataOverlay}
      caption={caption}
    />
  );
}
