'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';

import {
  type CollectiveXKvChartPoint,
  type CollectiveXKvChartSelection,
  type CollectiveXKvRunCase,
  collectiveXKvChartPoints,
  collectiveXRunDasharray,
} from './data';

interface CollectiveXKvChartProps {
  chartId: string;
  cases: CollectiveXKvRunCase[];
  colors: Record<string, string>;
  selection: CollectiveXKvChartSelection;
  caption?: React.ReactNode;
  legendElement?: React.ReactNode;
  testId?: string;
}

const X_LABELS: Record<CollectiveXKvChartSelection['x'], string> = {
  batch: 'Requests per burst (log)',
  isl: 'Input sequence length, tokens (log)',
};

function yLabel(selection: CollectiveXKvChartSelection): string {
  return selection.y === 'bandwidth'
    ? `Aggregate ${selection.op} bandwidth at p50 (GB/s)`
    : 'Burst completion latency p50 (ms)';
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

export function CollectiveXKvChart({
  chartId,
  cases,
  colors,
  selection,
  caption,
  legendElement,
  testId,
}: CollectiveXKvChartProps) {
  const points = useMemo(() => collectiveXKvChartPoints(cases, selection), [cases, selection]);
  const runIndexBySeries = useMemo(
    () => new Map(cases.map((kase) => [`${kase.run_id}:${kase.case_id}`, kase.run_index])),
    [cases],
  );
  const lines = useMemo(() => {
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const point of points) {
      (result[point.seriesId] ??= []).push({ x: point.x, y: point.y });
    }
    for (const line of Object.values(result)) {
      line.sort((a, b) => a.x - b.x);
    }
    return result;
  }, [points]);
  const colorBySeries = useMemo(
    () => new Map(points.map((point) => [point.seriesId, point.colorKey])),
    [points],
  );

  const xDomain = useMemo(() => paddedDomain(points.map((point) => point.x)), [points]);
  const yDomain = useMemo(() => paddedDomain(points.map((point) => point.y)), [points]);
  const xTickValues = useMemo(
    () => [...new Set(points.map((point) => point.x))].toSorted((a, b) => a - b),
    [points],
  );

  const noDataOverlay =
    points.length === 0 ? (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p className="text-sm text-muted-foreground">
          No measured kv rows match the selected page size and direction.
        </p>
      </div>
    ) : undefined;

  return (
    <D3Chart<CollectiveXKvChartPoint>
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
        label: X_LABELS[selection.x],
        tickCount: 6,
        tickValues: xTickValues,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      yAxis={{
        label: yLabel(selection),
        tickCount: 5,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      layers={[
        {
          type: 'line',
          key: 'collectivex-kv-lines',
          lines,
          config: {
            getColor: (key) => colors[colorBySeries.get(key) ?? ''] ?? '#888',
            getStrokeDasharray: (key) => collectiveXRunDasharray(runIndexBySeries.get(key) ?? 0),
            strokeWidth: 2.25,
            curve: d3.curveLinear,
          },
        },
        {
          type: 'point',
          key: 'collectivex-kv-points',
          data: points,
          config: {
            getCx: () => 0,
            getCy: () => 0,
            getX: (point) => point.x,
            getY: (point) => point.y,
            getColor: (point) => colors[point.colorKey] ?? '#888',
            getRadius: () => 3.5,
            stroke: 'var(--background)',
            strokeWidth: 1,
            keyFn: (point) => `${point.seriesId}-${point.x}`,
            maxPoints: Infinity,
          },
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
          const value =
            selection.y === 'bandwidth'
              ? `${point.y.toFixed(point.y >= 100 ? 0 : 2)} GB/s`
              : `${point.y.toFixed(point.y >= 100 ? 0 : 1)} ms`;
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${row.op} · page ${row.page_tokens} · batch ${row.batch} · ISL ${row.isl.toLocaleString('en-US')}: <strong>${value}</strong></div>
            <div class="text-muted-foreground">Latency p50 / p95 / min / max: ${row.latency_ms.p50.toFixed(1)} / ${row.latency_ms.p95.toFixed(1)} / ${row.latency_ms.min.toFixed(1)} / ${row.latency_ms.max.toFixed(1)} ms</div>
            <div class="text-muted-foreground">${row.descs.toLocaleString('en-US')} descriptors/request · ${(row.req_bytes / 1e6).toFixed(1)} MB/request · prep ${row.prep_ms.toFixed(1)} ms</div>
            <div class="text-muted-foreground">verify: ${row.verify_passed ? 'passed' : 'FAILED'}</div>
          </div>`;
        },
        getRulerX: (point, scale) =>
          (scale as d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>)(point.x),
        getRulerY: (point, scale) => scale(point.y),
        onHoverStart: (selectionEl) => {
          selectionEl.attr('r', 6);
        },
        onHoverEnd: (selectionEl) => {
          selectionEl.attr('r', 3.5);
        },
      }}
      transitionDuration={200}
      legendElement={legendElement}
      noDataOverlay={noDataOverlay}
      caption={caption}
    />
  );
}
