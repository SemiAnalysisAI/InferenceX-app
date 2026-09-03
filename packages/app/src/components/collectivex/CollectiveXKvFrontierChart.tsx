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
  collectiveXKvWireCeilings,
  collectiveXRunDasharray,
} from './data';

/** Line-key suffix marking a series' bulk wire-ceiling line (not an envelope). */
const CEILING_SUFFIX = '__collectivex-kv-wire-ceiling';

interface CollectiveXKvFrontierChartProps {
  chartId: string;
  cases: CollectiveXKvRunCase[];
  colors: Record<string, string>;
  selection: CollectiveXKvFrontierSelection;
  xLogScale: boolean;
  yLogScale: boolean;
  showWireCeilings: boolean;
  caption?: React.ReactNode;
  legendElement?: React.ReactNode;
  testId?: string;
}

const STRINGS = {
  en: {
    noData: 'No measured KV rows match the selected page size and direction.',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    xAxis: (logScale: boolean) => `Sequence length (ISL tokens${logScale ? ', log' : ''})`,
    yAxis: (op: CollectiveXKvFrontierSelection['op'], logScale: boolean) =>
      `Aggregate ${op} bandwidth at p50 (GB/s${logScale ? ', log' : ''})`,
    dismiss: 'Click elsewhere to dismiss',
    skuFrontier: 'SKU-wide best at this ISL',
    backendFrontier: 'backend best at this ISL',
    dominated: 'below the envelope',
    pointContext: (row: CollectiveXKvFrontierPoint['row'], tier: string) =>
      `${row.op} · page ${row.page_tokens} · batch ${row.batch} · ISL ${row.isl.toLocaleString('en-US')} · <strong>${tier}</strong>`,
    pointMetrics: (point: CollectiveXKvFrontierPoint) => {
      const aggregate = `Aggregate ${point.y.toFixed(point.y >= 100 ? 0 : 2)} GB/s`;
      const req = point.row.request_ms;
      if (req) {
        return `${aggregate} · per-request p95 ${req.p95.toFixed(req.p95 >= 100 ? 0 : 1)} ms`;
      }
      const amortized = point.row.latency_ms.p95 / point.row.batch;
      return `${aggregate} · burst p95 ÷ batch ${amortized.toFixed(amortized >= 100 ? 0 : 1)} ms (amortized capacity, not per-request latency)`;
    },
    latency: (point: CollectiveXKvFrontierPoint) =>
      `Burst latency p50 / p95: ${point.row.latency_ms.p50.toFixed(1)} / ${point.row.latency_ms.p95.toFixed(1)} ms · ${point.row.descs.toLocaleString('en-US')} descriptors/request`,
    ceiling: (gbps: number, share: string) =>
      `Contiguous baseline ${gbps.toFixed(gbps >= 100 ? 0 : 1)} GB/s (dotted) · this rung reaches ${share} of it`,
    verify: (passed: boolean) => `verify: ${passed ? 'passed' : 'FAILED'}`,
  },
  zh: {
    noData: '没有与所选页大小和传输方向匹配的 KV 实测数据。',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    xAxis: (logScale: boolean) => `序列长度（ISL token${logScale ? '，对数' : ''}）`,
    yAxis: (op: CollectiveXKvFrontierSelection['op'], logScale: boolean) =>
      `p50 聚合 ${op} 带宽（GB/s${logScale ? '，对数' : ''}）`,
    dismiss: '点击其他位置关闭',
    skuFrontier: '该 ISL 下 SKU 级最优',
    backendFrontier: '该 ISL 下后端最优',
    dominated: '低于包络线',
    pointContext: (row: CollectiveXKvFrontierPoint['row'], tier: string) =>
      `${row.op} · 页大小 ${row.page_tokens} · batch ${row.batch} · ISL ${row.isl.toLocaleString('en-US')} · <strong>${tier}</strong>`,
    pointMetrics: (point: CollectiveXKvFrontierPoint) => {
      const aggregate = `聚合带宽 ${point.y.toFixed(point.y >= 100 ? 0 : 2)} GB/s`;
      const req = point.row.request_ms;
      if (req) {
        return `${aggregate} · 单请求 p95 ${req.p95.toFixed(req.p95 >= 100 ? 0 : 1)} ms`;
      }
      const amortized = point.row.latency_ms.p95 / point.row.batch;
      return `${aggregate} · 突发 p95 ÷ 批大小 ${amortized.toFixed(amortized >= 100 ? 0 : 1)} ms（摊销容量指标，非单请求延迟）`;
    },
    latency: (point: CollectiveXKvFrontierPoint) =>
      `突发延迟 p50 / p95：${point.row.latency_ms.p50.toFixed(1)} / ${point.row.latency_ms.p95.toFixed(1)} ms · ${point.row.descs.toLocaleString('en-US')} 个描述符/请求`,
    ceiling: (gbps: number, share: string) =>
      `单描述符连续传输基线 ${gbps.toFixed(gbps >= 100 ? 0 : 1)} GB/s（点状线）· 此组合达到其 ${share}`,
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
  xLogScale,
  yLogScale,
  showWireCeilings,
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
  // Roofline per series in the /inference style, drawn through the best batch
  // at every measured ISL: the full (ISL, batch) grid is plotted as points and
  // the per-ISL envelope is the achievable bandwidth curve for that backend.
  const lines = useMemo(() => {
    const bySeries: Record<string, CollectiveXKvFrontierPoint[]> = {};
    for (const point of points) {
      if (!point.onSeriesFrontier) continue;
      (bySeries[point.seriesId] ??= []).push(point);
    }
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const [seriesId, seriesPoints] of Object.entries(bySeries)) {
      result[seriesId] = seriesPoints
        .toSorted((a, b) => a.x - b.x)
        // Ties (two batches at the same peak) stay on the frontier as points
        // but the line only needs one vertex per ISL.
        .filter((point, index, sorted) => index === 0 || point.x !== sorted[index - 1].x)
        .map((point) => ({ x: point.x, y: point.y }));
    }
    return result;
  }, [points]);
  const colorBySeries = useMemo(
    () => new Map(points.map((point) => [point.seriesId, point.colorKey])),
    [points],
  );
  // Each series' bulk single-descriptor rows, drawn as a dotted line above the
  // envelope: what the fabric itself moves at that ISL. The gap from a paged
  // rung up to this line is per-descriptor software overhead, not the wire.
  const ceilings = useMemo(
    () => collectiveXKvWireCeilings(cases, selection.op),
    [cases, selection.op],
  );
  const allLines = useMemo(() => {
    const merged: Record<string, { x: number; y: number }[]> = { ...lines };
    if (!showWireCeilings) return merged;
    for (const [seriesId, ceiling] of ceilings) {
      // Only series that are actually plotted get a ceiling line.
      if (!(seriesId in lines) || ceiling.length < 2) continue;
      merged[`${seriesId}${CEILING_SUFFIX}`] = ceiling.map(({ x, y }) => ({ x, y }));
    }
    return merged;
  }, [lines, ceilings, showWireCeilings]);

  const xDomain = useMemo(() => paddedDomain(points.map((point) => point.x)), [points]);
  const yDomain = useMemo(() => {
    const values = points.map((point) => point.y);
    for (const key of Object.keys(allLines)) {
      if (!key.endsWith(CEILING_SUFFIX)) continue;
      for (const { y } of allLines[key]) values.push(y);
    }
    return paddedDomain(values);
  }, [points, allLines]);

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
      xScale={{ type: xLogScale ? 'log' : 'linear', domain: xDomain, nice: false }}
      yScale={{ type: yLogScale ? 'log' : 'linear', domain: yDomain, nice: false }}
      xAxis={{
        label: strings.xAxis(xLogScale),
        tickCount: 6,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      yAxis={{
        label: strings.yAxis(selection.op, yLogScale),
        tickCount: 5,
        tickFormat: (value) => formatCompact(Number(value)),
      }}
      layers={[
        {
          type: 'line',
          key: 'collectivex-kv-frontier-lines',
          lines: allLines,
          config: {
            getColor: (key) => {
              const seriesId = key.endsWith(CEILING_SUFFIX)
                ? key.slice(0, -CEILING_SUFFIX.length)
                : key;
              return colors[colorBySeries.get(seriesId) ?? ''] ?? '#888';
            },
            // Ceiling lines are dotted ('1 4' is used by no run dasharray) so
            // they read as reference lines, not another measured envelope.
            getStrokeDasharray: (key) =>
              key.endsWith(CEILING_SUFFIX)
                ? '1 4'
                : collectiveXRunDasharray(runIndexBySeries.get(key) ?? 0),
            strokeWidth: 2,
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
            keyFn: (point) => `${point.seriesId}-${point.row.isl}-${point.row.batch}`,
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
          const ceilingAtIsl = showWireCeilings
            ? ceilings.get(point.seriesId)?.find((ceiling) => ceiling.x === row.isl)
            : undefined;
          let ceilingLine = '';
          if (ceilingAtIsl && ceilingAtIsl.y > 0) {
            const fraction = point.y / ceilingAtIsl.y;
            const share = fraction < 0.001 ? '<0.1%' : `${(fraction * 100).toFixed(1)}%`;
            ceilingLine = `<div class="text-muted-foreground">${strings.ceiling(ceilingAtIsl.y, share)}</div>`;
          }
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${strings.dismiss}</div>` : ''}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${strings.pointContext(row, tier)}</div>
            <div>${strings.pointMetrics(point)}</div>
            <div class="text-muted-foreground">${strings.latency(point)}</div>
            ${ceilingLine}
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
