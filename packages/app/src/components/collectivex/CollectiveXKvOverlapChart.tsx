'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/use-locale';

import {
  type CollectiveXKvChartPoint,
  type CollectiveXKvFrontierSelection,
  type CollectiveXKvRunCase,
  collectiveXKvOverlapPoints,
  collectiveXRunDasharray,
} from './data';

interface CollectiveXKvOverlapChartProps {
  chartId: string;
  cases: CollectiveXKvRunCase[];
  colors: Record<string, string>;
  selection: CollectiveXKvFrontierSelection;
  caption?: React.ReactNode;
  legendElement?: React.ReactNode;
  testId?: string;
}

/** Pseudo-series key for the dotted y = batch ideal-overlap reference. */
const IDEAL_KEY = '__collectivex-kv-overlap-ideal__';

const STRINGS = {
  en: {
    noData: 'No measured KV rows match the selected page size and direction.',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    xAxis: 'Requests per burst (log)',
    yAxis: 'Aggregate bandwidth relative to batch 1 (log)',
    dismiss: 'Click elsewhere to dismiss',
    pointContext: (row: CollectiveXKvChartPoint['row']) =>
      `${row.op} · page ${row.page_tokens} · batch ${row.batch} · ISL ${row.isl.toLocaleString('en-US')}`,
    pointMetrics: (point: CollectiveXKvChartPoint) =>
      `${point.y.toFixed(2)}x batch 1 (ideal ${point.row.batch}x) · ${point.row.gbps_p50.toFixed(point.row.gbps_p50 >= 100 ? 0 : 2)} GB/s`,
    latency: (row: CollectiveXKvChartPoint['row']) =>
      `Burst latency p50 / p95: ${row.latency_ms.p50.toFixed(1)} / ${row.latency_ms.p95.toFixed(1)} ms`,
    verify: (passed: boolean) => `verify: ${passed ? 'passed' : 'FAILED'}`,
  },
  zh: {
    noData: '没有与所选页大小和传输方向匹配的 KV 实测数据。',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    xAxis: '每次突发请求数（对数）',
    yAxis: '相对批大小 1 的聚合带宽（对数）',
    dismiss: '点击其他位置关闭',
    pointContext: (row: CollectiveXKvChartPoint['row']) =>
      `${row.op} · 页大小 ${row.page_tokens} · batch ${row.batch} · ISL ${row.isl.toLocaleString('en-US')}`,
    pointMetrics: (point: CollectiveXKvChartPoint) =>
      `批大小 1 的 ${point.y.toFixed(2)} 倍（理想 ${point.row.batch} 倍）· ${point.row.gbps_p50.toFixed(point.row.gbps_p50 >= 100 ? 0 : 2)} GB/s`,
    latency: (row: CollectiveXKvChartPoint['row']) =>
      `突发延迟 p50 / p95：${row.latency_ms.p50.toFixed(1)} / ${row.latency_ms.p95.toFixed(1)} ms`,
    verify: (passed: boolean) => `校验：${passed ? '通过' : '失败'}`,
  },
} as const;

function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [1, 10];
  const min = d3.min(values) ?? 1;
  const max = d3.max(values) ?? 1;
  return min === max ? [min / 2, max * 2] : [min / 1.15, max * 1.15];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function CollectiveXKvOverlapChart({
  chartId,
  cases,
  colors,
  selection,
  caption,
  legendElement,
  testId,
}: CollectiveXKvOverlapChartProps) {
  const locale = useLocale();
  const strings = STRINGS[locale === 'zh' ? 'zh' : 'en'];
  const points = useMemo(() => collectiveXKvOverlapPoints(cases, selection), [cases, selection]);
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
    // Dotted ideal: perfect request overlap is y = batch on both log axes.
    const maxBatch = Math.max(1, ...points.map((point) => point.x));
    if (maxBatch > 1) {
      result[IDEAL_KEY] = [
        { x: 1, y: 1 },
        { x: maxBatch, y: maxBatch },
      ];
    }
    return result;
  }, [points]);
  const colorBySeries = useMemo(
    () => new Map(points.map((point) => [point.seriesId, point.colorKey])),
    [points],
  );

  const xDomain = useMemo(() => paddedDomain(points.map((point) => point.x)), [points]);
  const yDomain = useMemo(
    () => paddedDomain(points.flatMap((point) => [point.y, point.x])),
    [points],
  );
  const xTickValues = useMemo(
    () => [...new Set(points.map((point) => point.x))].toSorted((a, b) => a - b),
    [points],
  );

  const noDataOverlay =
    points.length === 0 ? (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p className="text-sm text-muted-foreground">{strings.noData}</p>
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
      instructions={strings.instructions}
      xScale={{ type: 'log', domain: xDomain, nice: false }}
      yScale={{ type: 'log', domain: yDomain, nice: false }}
      xAxis={{
        label: strings.xAxis,
        tickCount: 6,
        tickValues: xTickValues,
        tickFormat: (value) => Number(value).toFixed(0),
      }}
      yAxis={{
        label: strings.yAxis,
        tickCount: 5,
        tickFormat: (value) => {
          const numeric = Number(value);
          return numeric >= 10 ? `${numeric.toFixed(0)}x` : `${numeric.toFixed(1)}x`;
        },
      }}
      layers={[
        {
          type: 'line',
          key: 'collectivex-kv-overlap-lines',
          lines,
          config: {
            getColor: (key) =>
              key === IDEAL_KEY
                ? 'var(--muted-foreground)'
                : (colors[colorBySeries.get(key) ?? ''] ?? '#888'),
            getStrokeDasharray: (key) =>
              key === IDEAL_KEY ? '2 4' : collectiveXRunDasharray(runIndexBySeries.get(key) ?? 0),
            strokeWidth: 2.25,
            curve: d3.curveLinear,
          },
        },
        {
          type: 'point',
          key: 'collectivex-kv-overlap-points',
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
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${strings.dismiss}</div>` : ''}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${strings.pointContext(point.row)}</div>
            <div>${strings.pointMetrics(point)}</div>
            <div class="text-muted-foreground">${strings.latency(point.row)}</div>
            <div class="text-muted-foreground">${strings.verify(point.row.verify_passed)}</div>
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
