'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/use-locale';

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

const STRINGS = {
  en: {
    noData: 'No measured KV rows match the selected page size and direction.',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    xAxis: (op: CollectiveXKvFrontierSelection['op']) =>
      `Aggregate ${op} bandwidth at p50 (GB/s, log)`,
    yAxis: 'Burst p95 latency per in-flight request (ms, log)',
    dismiss: 'Click elsewhere to dismiss',
    skuFrontier: 'SKU-wide frontier',
    backendFrontier: 'backend frontier',
    dominated: 'dominated',
    pointContext: (row: CollectiveXKvFrontierPoint['row'], tier: string) =>
      `${row.op} · page ${row.page_tokens} · batch ${row.batch} · ISL ${row.isl.toLocaleString('en-US')} · <strong>${tier}</strong>`,
    pointMetrics: (point: CollectiveXKvFrontierPoint) =>
      `Aggregate ${point.x.toFixed(point.x >= 100 ? 0 : 2)} GB/s · p95 ÷ in-flight ${point.y.toFixed(point.y >= 100 ? 0 : 1)} ms`,
    latency: (point: CollectiveXKvFrontierPoint) =>
      `Burst latency p50 / p95: ${point.row.latency_ms.p50.toFixed(1)} / ${point.row.latency_ms.p95.toFixed(1)} ms · ${point.row.descs.toLocaleString('en-US')} descriptors/request`,
    verify: (passed: boolean) => `verify: ${passed ? 'passed' : 'FAILED'}`,
  },
  zh: {
    noData: '没有与所选页大小和传输方向匹配的 KV 实测数据。',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    xAxis: (op: CollectiveXKvFrontierSelection['op']) => `p50 聚合 ${op} 带宽（GB/s，对数）`,
    yAxis: '每个在途请求的突发 p95 延迟（ms，对数）',
    dismiss: '点击其他位置关闭',
    skuFrontier: 'SKU 级帕累托前沿',
    backendFrontier: '后端帕累托前沿',
    dominated: '被支配',
    pointContext: (row: CollectiveXKvFrontierPoint['row'], tier: string) =>
      `${row.op} · 页大小 ${row.page_tokens} · batch ${row.batch} · ISL ${row.isl.toLocaleString('en-US')} · <strong>${tier}</strong>`,
    pointMetrics: (point: CollectiveXKvFrontierPoint) =>
      `聚合带宽 ${point.x.toFixed(point.x >= 100 ? 0 : 2)} GB/s · p95 ÷ 在途请求数 ${point.y.toFixed(point.y >= 100 ? 0 : 1)} ms`,
    latency: (point: CollectiveXKvFrontierPoint) =>
      `突发延迟 p50 / p95：${point.row.latency_ms.p50.toFixed(1)} / ${point.row.latency_ms.p95.toFixed(1)} ms · ${point.row.descs.toLocaleString('en-US')} 个描述符/请求`,
    verify: (passed: boolean) => `校验：${passed ? '通过' : '失败'}`,
  },
} as const;

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

export function CollectiveXKvFrontierChart({
  chartId,
  cases,
  colors,
  selection,
  caption,
  legendElement,
  testId,
}: CollectiveXKvFrontierChartProps) {
  const locale = useLocale();
  const strings = STRINGS[locale === 'zh' ? 'zh' : 'en'];
  const points = useMemo(() => collectiveXKvFrontierPoints(cases, selection), [cases, selection]);
  const runIndexBySeries = useMemo(
    () => new Map(cases.map((kase) => [`${kase.run_id}:${kase.case_id}`, kase.run_index])),
    [cases],
  );
  // Roofline per series in the /inference style, drawn through the full batch
  // ladder: because raising the batch improves both axes until the backend
  // saturates, the strict Pareto set is usually a single point, so the ladder
  // itself is the achievable curve and its endpoint the frontier.
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
        <p className="text-sm text-muted-foreground">{strings.noData}</p>
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
      instructions={strings.instructions}
      xScale={{ type: 'log', domain: xDomain, nice: false }}
      yScale={{ type: 'log', domain: yDomain, nice: false }}
      xAxis={{
        label: strings.xAxis(selection.op),
        tickCount: 6,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      yAxis={{
        label: strings.yAxis,
        tickCount: 5,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      layers={[
        {
          type: 'line',
          key: 'collectivex-kv-frontier-lines',
          lines,
          config: {
            getColor: (key) => colors[colorBySeries.get(key) ?? ''] ?? '#888',
            getStrokeDasharray: (key) => collectiveXRunDasharray(runIndexBySeries.get(key) ?? 0),
            strokeWidth: 2.5,
            curve: d3.curveMonotoneX,
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
            getColor: (point) => colors[point.colorKey] ?? '#888',
            getRadius: () => 3.5,
            keyFn: (point) => `${point.seriesId}-${point.row.batch}`,
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
          const tier = point.onSkuFrontier
            ? strings.skuFrontier
            : point.onSeriesFrontier
              ? strings.backendFrontier
              : strings.dominated;
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${strings.dismiss}</div>` : ''}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${strings.pointContext(row, tier)}</div>
            <div>${strings.pointMetrics(point)}</div>
            <div class="text-muted-foreground">${strings.latency(point)}</div>
            <div class="text-muted-foreground">${strings.verify(row.verify_passed)}</div>
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
