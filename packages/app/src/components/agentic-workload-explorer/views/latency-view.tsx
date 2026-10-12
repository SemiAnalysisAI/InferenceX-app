'use client';

import { Suspense, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  formatNumber,
  formatDuration,
  formatPrefillSpeed,
  formatPrefillSpeedCompact,
} from '@/lib/agentic-workload-explorer/format';
import { useModelFilter } from '@/hooks/agentic-workload-explorer/use-model-filter';
import { ModelFilter } from '@/components/agentic-workload-explorer/model-filter';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  GraphHistogram,
  PerformancePercentileStats,
} from '@/lib/agentic-workload-explorer/api-types';
import { SNAPSHOT_RANGE_LABEL } from '@/lib/agentic-workload-explorer/snapshot';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { Expandable, ExpandTrigger } from '@/components/agentic-workload-explorer/expandable-chart';

// -- Types ------------------------------------------------------------------

interface StreamingStats {
  p50: number;
  p95: number;
  avg: number;
  count: number;
}

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  requestsToday: number;
  streaming: StreamingStats;
  nonStreaming: StreamingStats;
}

interface CacheReadBucket {
  bucket: number;
  count: number;
  p50: number;
  p95: number;
  p90: number;
  avg: number;
}

interface HeatmapCell {
  readBucket: number;
  writeBucket: number;
  count: number;
  p90: number;
}

interface HeatmapByOutputCell {
  readBucket: number;
  writeBucket: number;
  outputBucket: number;
  count: number;
  p90: number;
}

interface LatencyData {
  stats: LatencyStats;
  distribution: GraphHistogram;
  hourly: { hour: string; p50: number; p95: number; avg: number; count: number }[];
  byModel: { model: string; p50: number; p95: number; avg: number; count: number }[];
  cacheReadVsLatency: CacheReadBucket[];
  cacheHeatmap: HeatmapCell[];
  cacheHeatmapByOutput: HeatmapByOutputCell[];
  ttftDistribution: GraphHistogram;
  tpotDistribution: GraphHistogram;
  ttftStats: PerformancePercentileStats;
  tpotStats: PerformancePercentileStats;
  cacheHeatmapTTFT: HeatmapCell[];
  cacheHeatmapPrefillSpeed: HeatmapCell[];
  prefillSpeedDistribution: GraphHistogram;
  prefillSpeedStats: PerformancePercentileStats;
  cacheTotalVsOutputInteractivity: {
    cacheTotalBucket: number;
    outputBucket: number;
    count: number;
    p90Interactivity: number;
  }[];
  interactivityDistribution: GraphHistogram;
}

// -- Chart constants --------------------------------------------------------

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

// -- i18n -------------------------------------------------------------------

const STRINGS = {
  en: {
    stats: 'Stats',
    failedToLoad: 'Failed to load latency data.',
    e2eMedian: 'E2E Median (p50)',
    e2eP95: 'E2E P95',
    e2eP99: 'E2E P99',
    noE2eDistribution: 'No E2E latency distribution data available',
    noData: 'No data available',
    noHourlyData: 'No hourly E2E latency data available',
    noModelData: 'No model E2E latency data available',
    requests: 'requests',
    streaming: 'Streaming',
    nonStreaming: 'Non-Streaming',
    medianP50: 'Median (p50)',
    p95: 'P95',
    average: 'Average',
    requestsLabel: 'Requests',
    hideSmall: 'Hide n<5',
    exportPng: 'Export PNG',
    colorScale: 'Color scale:',
    global: 'Global',
    local: 'Local',
    cacheHeatmapLabel: 'Cache Read × Write → p90 E2E Latency',
    cacheHeatmapDetail: 'heatmap',
    facetedLabel: 'Cache × Output → p90 E2E Latency',
    facetedDetail: 'faceted by output tokens',
    cacheTtftLabel: 'Cache Read × Write → p90 TTFT',
    cacheTtftDetail: 'streaming requests only',
    cachePrefillLabel: 'Cache Read × Write → p90 Prefill Speed',
    cachePrefillDetail: 'streaming requests with cache · input tok/s/query',
    interactivityHeatmapLabel: 'Cache Total × Output → p90 Interactivity',
    interactivityHeatmapDetail: 'output tok/s/user · streaming requests',
    cacheReadLabel: 'Cache Read vs E2E Latency',
    cacheReadDetail: 'cache_write < 4k tokens',
    e2eDistLabel: 'E2E Latency Distribution',
    samples: (n: string) => `${n} samples`,
    ttftDistLabel: 'TTFT Distribution',
    streamingSamples: (n: string) => `${n} streaming samples`,
    tpotDistLabel: 'TPOT Distribution',
    prefillDistLabel: 'Prefill Speed Distribution',
    prefillDistDetail: (n: string) => `${n} streaming samples · input tok/s/query`,
    interactDistLabel: 'Interactivity Distribution',
    interactDistDetail: (n: string) => `${n} streaming samples · output tok/s/user`,
    hourlyLabel: 'E2E Latency Over Time',
    hourlyDetail: 'final 48h, hourly',
    modelLabel: 'E2E Latency by Model',
    modelDetail: (count: number) => `${count} model${count === 1 ? '' : 's'}`,
    streamVsNonLabel: 'Streaming vs Non-Streaming',
    cacheReadAxisTitle: 'cache_read tokens',
    cacheWriteAxisTitle: 'cache_write tokens',
    outputTokensAxis: 'output tokens',
    cacheReadWriteAxis: 'cacheRead + cacheWrite tokens',
    p90E2eLatencyAxis: 'p90 E2E latency (s)',
    cacheReadBarAxisLabel: 'cache_read tokens (cache_write < 4k)',
    sharedScale: 'shared scale',
    perFacetScale: 'per-facet scale',
    facetFooter: (scaleLabel: string) =>
      `x: cache_read · y: cache_write · color: p90 E2E latency (s) · ${scaleLabel}`,
    pngTitle: 'Cache Read × Write → p90 E2E Latency',
    pngDetail: (n: number, range: string) => `${n} buckets · snapshot ${range}`,
    outputLabels: {
      0: '0–1k out',
      1000: '1k–5k out',
      5000: '5k–20k out',
      20000: '20k+ out',
    } as Record<number, string>,
  },
  zh: {
    stats: '统计',
    failedToLoad: '延迟数据加载失败。',
    e2eMedian: '端到端中位数 (p50)',
    e2eP95: '端到端 P95',
    e2eP99: '端到端 P99',
    noE2eDistribution: '暂无端到端延迟分布数据',
    noData: '暂无数据',
    noHourlyData: '暂无逐小时端到端延迟数据',
    noModelData: '暂无模型端到端延迟数据',
    requests: '个请求',
    streaming: '流式',
    nonStreaming: '非流式',
    medianP50: '中位数 (p50)',
    p95: 'P95',
    average: '平均值',
    requestsLabel: '请求数',
    hideSmall: '隐藏 n<5',
    exportPng: '导出 PNG',
    colorScale: '色标：',
    global: '全局',
    local: '局部',
    cacheHeatmapLabel: 'Cache Read × Write → p90 端到端延迟',
    cacheHeatmapDetail: '热力图',
    facetedLabel: 'Cache × Output → p90 端到端延迟',
    facetedDetail: '按 output token 分面',
    cacheTtftLabel: 'Cache Read × Write → p90 TTFT',
    cacheTtftDetail: '仅限流式请求',
    cachePrefillLabel: 'Cache Read × Write → p90 Prefill Speed',
    cachePrefillDetail: '含缓存的流式请求 · input tok/s/query',
    interactivityHeatmapLabel: 'Cache Total × Output → p90 Interactivity',
    interactivityHeatmapDetail: 'output tok/s/user · 流式请求',
    cacheReadLabel: 'Cache Read vs 端到端延迟',
    cacheReadDetail: 'cache_write < 4k tokens',
    e2eDistLabel: '端到端延迟分布',
    samples: (n: string) => `${n} 个样本`,
    ttftDistLabel: 'TTFT 分布',
    streamingSamples: (n: string) => `${n} 个流式样本`,
    tpotDistLabel: 'TPOT 分布',
    prefillDistLabel: 'Prefill Speed 分布',
    prefillDistDetail: (n: string) => `${n} 个流式样本 · input tok/s/query`,
    interactDistLabel: 'Interactivity 分布',
    interactDistDetail: (n: string) => `${n} 个流式样本 · output tok/s/user`,
    hourlyLabel: '端到端延迟趋势',
    hourlyDetail: '最后 48 小时，按小时',
    modelLabel: '按模型的端到端延迟',
    modelDetail: (count: number) => `${count} 个模型`,
    streamVsNonLabel: '流式 vs 非流式',
    cacheReadAxisTitle: 'cache_read tokens',
    cacheWriteAxisTitle: 'cache_write tokens',
    outputTokensAxis: 'output tokens',
    cacheReadWriteAxis: 'cacheRead + cacheWrite tokens',
    p90E2eLatencyAxis: 'p90 端到端延迟 (s)',
    cacheReadBarAxisLabel: 'cache_read tokens (cache_write < 4k)',
    sharedScale: '统一色标',
    perFacetScale: '分面色标',
    facetFooter: (scaleLabel: string) =>
      `x: cache_read · y: cache_write · color: p90 端到端延迟 (s) · ${scaleLabel}`,
    pngTitle: 'Cache Read × Write → p90 端到端延迟',
    pngDetail: (n: number, range: string) => `${n} 个 bucket · 快照 ${range}`,
    outputLabels: {
      0: '0–1k 输出',
      1000: '1k–5k 输出',
      5000: '5k–20k 输出',
      20000: '20k+ 输出',
    } as Record<number, string>,
  },
};

// -- Helpers ----------------------------------------------------------------

function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

function generateTicks(min: number, max: number, targetCount: number): number[] {
  if (max <= min) return [min];
  const range = niceNum(max - min, false);
  const spacing = niceNum(range / (targetCount - 1), true);
  const niceMin = Math.floor(min / spacing) * spacing;
  const ticks: number[] = [];
  // Keep going until a tick reaches max, so the tallest bar is never clipped.
  for (let t = niceMin; t - spacing < max - spacing * 1e-9; t += spacing) {
    ticks.push(Math.round(t * 1e10) / 1e10);
  }
  return ticks;
}

function truncateModel(model: string, maxLen = 28): string {
  if (model.length <= maxLen) return model;
  return `${model.slice(0, maxLen - 1)}...`;
}

// -- Section header ---------------------------------------------------------

function SectionHeader({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" />
      {detail && <span className="text-3xs font-mono text-subtle">{detail}</span>}
    </div>
  );
}

// -- Stat card --------------------------------------------------------------

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-mono font-bold mt-0.5">{value}</div>
      {detail && <div className="text-3xs font-mono text-muted-foreground mt-0.5">{detail}</div>}
    </div>
  );
}

// -- E2E Latency Distribution Histogram -----------------------------------------

function DistributionHistogram({
  distribution,
  stats,
}: {
  distribution: GraphHistogram;
  stats: LatencyStats;
}) {
  const t = STRINGS[useLocale()];
  const bins = distribution.buckets;

  if (bins.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noE2eDistribution}
      </div>
    );
  }

  const minVal = bins[0].min;
  const maxVal = bins.at(-1)!.max;
  const range = maxVal - minVal || 1;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  // Percentile values from server stats
  const p50 = stats.p50;
  const p95 = stats.p95;
  const p99 = stats.p99;

  const sx = (v: number) => MARGIN.left + ((v - minVal) / range) * PLOT_W;
  const sy = (count: number) => MARGIN.top + PLOT_H - (count / maxCount) * PLOT_H;

  const barGap = 0.5;
  const barW = Math.max(0.5, PLOT_W / bins.length - barGap);

  // X-axis ticks
  const xTicks = generateTicks(minVal, maxVal, 6);

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: 240 }}>
        {/* Baseline */}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_H}
          x2={MARGIN.left + PLOT_W}
          y2={MARGIN.top + PLOT_H}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />

        {/* Bars */}
        {bins.map((b, i) => {
          const x = sx(b.min);
          const barH = (b.count / maxCount) * PLOT_H;
          return (
            <rect
              key={i}
              x={x}
              y={sy(b.count)}
              width={barW}
              height={Math.max(barH, 0)}
              fill="#6366f1"
              rx={0.5}
            >
              <title>
                {formatDuration(b.min)} - {formatDuration(b.max)}: {b.count} {t.requests}
              </title>
            </rect>
          );
        })}

        {/* Percentile lines */}
        {[
          { val: p50, color: '#06b6d4', label: 'p50' },
          { val: p95, color: '#f59e0b', label: 'p95' },
          { val: p99, color: '#f43f5e', label: 'p99' },
        ].map(({ val, color, label }) => {
          if (val < minVal || val > maxVal) return null;
          const x = sx(val);
          return (
            <g key={label}>
              <line
                x1={x}
                y1={MARGIN.top}
                x2={x}
                y2={MARGIN.top + PLOT_H}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text
                x={x}
                y={MARGIN.top - 1}
                textAnchor="middle"
                fill={color}
                style={{ fontSize: '8px', fontFamily: SVG_FONT }}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xTicks.map((tick) => {
          const x = sx(tick);
          if (x < MARGIN.left || x > MARGIN.left + PLOT_W) return null;
          return (
            <text
              key={tick}
              x={x}
              y={MARGIN.top + PLOT_H + 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
            >
              {formatDuration(tick)}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
        {[
          { label: 'p50', color: '#06b6d4', val: p50 },
          { label: 'p95', color: '#f59e0b', val: p95 },
          { label: 'p99', color: '#f43f5e', val: p99 },
        ].map(({ label, color, val }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-3xs font-mono text-muted-foreground">
              {label}: {formatDuration(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Generic Distribution Histogram (TTFT / TPOT) --------------------------

function GenericDistributionHistogram({
  histogram,
  stats,
  color = '#6366f1',
  formatLabel = formatDuration,
}: {
  histogram: GraphHistogram;
  stats: PerformancePercentileStats;
  color?: string;
  formatLabel?: (v: number) => string;
}) {
  const t = STRINGS[useLocale()];
  const bins = histogram.buckets;

  if (bins.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">{t.noData}</div>
    );
  }

  const minVal = bins[0].min;
  const maxVal = bins.at(-1)!.max;
  const range = maxVal - minVal || 1;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const sx = (v: number) => MARGIN.left + ((v - minVal) / range) * PLOT_W;
  const sy = (count: number) => MARGIN.top + PLOT_H - (count / maxCount) * PLOT_H;
  const barGap = 0.5;
  const barW = Math.max(0.5, PLOT_W / bins.length - barGap);
  const xTicks = generateTicks(minVal, maxVal, 6);

  const percentiles = [
    { val: stats.p50, color: '#06b6d4', label: 'p50' },
    { val: stats.p95, color: '#f59e0b', label: 'p95' },
    { val: stats.p99, color: '#f43f5e', label: 'p99' },
  ];

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: 240 }}>
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_H}
          x2={MARGIN.left + PLOT_W}
          y2={MARGIN.top + PLOT_H}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />
        {bins.map((b, i) => {
          const x = sx(b.min);
          const barH = (b.count / maxCount) * PLOT_H;
          return (
            <rect
              key={i}
              x={x}
              y={sy(b.count)}
              width={barW}
              height={Math.max(barH, 0)}
              fill={color}
              rx={0.5}
            >
              <title>
                {formatLabel(b.min)} – {formatLabel(b.max)}: {b.count} {t.requests}
              </title>
            </rect>
          );
        })}
        {percentiles.map(({ val, color: c, label }) => {
          if (val < minVal || val > maxVal) return null;
          const x = sx(val);
          return (
            <g key={label}>
              <line
                x1={x}
                y1={MARGIN.top}
                x2={x}
                y2={MARGIN.top + PLOT_H}
                stroke={c}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text
                x={x}
                y={MARGIN.top - 1}
                textAnchor="middle"
                fill={c}
                style={{ fontSize: '8px', fontFamily: SVG_FONT }}
              >
                {label}
              </text>
            </g>
          );
        })}
        {xTicks.map((tick) => {
          const x = sx(tick);
          if (x < MARGIN.left || x > MARGIN.left + PLOT_W) return null;
          return (
            <text
              key={tick}
              x={x}
              y={MARGIN.top + PLOT_H + 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
            >
              {formatLabel(tick)}
            </text>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
        {percentiles.map(({ label, color: c, val }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: c }} />
            <span className="text-3xs font-mono text-muted-foreground">
              {label}: {formatLabel(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- E2E Latency Over Time line chart -------------------------------------------

function HourlyLatencyChart({ hourly }: { hourly: LatencyData['hourly'] }) {
  const t = STRINGS[useLocale()];
  if (hourly.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noHourlyData}
      </div>
    );
  }

  const allVals = hourly.flatMap((h) => [h.p50, h.p95]);
  const yMax = Math.max(...allVals, 1);
  const yTicks = generateTicks(0, yMax, 5);
  const yTop = yTicks.at(-1) || yMax;

  const sx = (i: number) => MARGIN.left + (i / (hourly.length - 1 || 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yTop) * PLOT_H;

  // Build polyline points
  const p50Points = hourly.map((h, i) => `${sx(i)},${sy(h.p50)}`).join(' ');
  const p95Points = hourly.map((h, i) => `${sx(i)},${sy(h.p95)}`).join(' ');

  // X-axis labels: every 6h
  const xLabels: { idx: number; label: string }[] = [];
  for (let i = 0; i < hourly.length; i++) {
    if (i % 6 === 0) {
      const d = new Date(hourly[i].hour);
      const label = d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        hour12: true,
        timeZoneName: 'short',
      });
      xLabels.push({ idx: i, label });
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: 240 }}>
        {/* Y-axis grid lines and labels */}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            {tick > 0 && (
              <line
                x1={MARGIN.left}
                y1={sy(tick)}
                x2={MARGIN.left + PLOT_W}
                y2={sy(tick)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={MARGIN.left - 6}
              y={sy(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
            >
              {formatDuration(tick)}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_H}
          x2={MARGIN.left + PLOT_W}
          y2={MARGIN.top + PLOT_H}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />

        {/* Lines */}
        <polyline points={p50Points} fill="none" stroke="#06b6d4" strokeWidth={1.5} />
        <polyline points={p95Points} fill="none" stroke="#f59e0b" strokeWidth={1.5} />

        {/* Data point dots */}
        {hourly.map((h, i) => (
          <g key={h.hour}>
            <circle cx={sx(i)} cy={sy(h.p50)} r={1.5} fill="#06b6d4">
              <title>
                {h.hour}: p50 {formatDuration(h.p50)}, p95 {formatDuration(h.p95)}, {h.count} reqs
              </title>
            </circle>
            <circle cx={sx(i)} cy={sy(h.p95)} r={1.5} fill="#f59e0b">
              <title>
                {h.hour}: p95 {formatDuration(h.p95)}
              </title>
            </circle>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ idx, label }) => (
          <text
            key={idx}
            x={sx(idx)}
            y={MARGIN.top + PLOT_H + 14}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
          >
            {label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex gap-x-4 mt-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#06b6d4' }} />
          <span className="text-3xs font-mono text-muted-foreground">p50</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
          <span className="text-3xs font-mono text-muted-foreground">p95</span>
        </div>
      </div>
    </div>
  );
}

// -- E2E Latency by Model horizontal bars ---------------------------------------

function ModelLatencyChart({ byModel }: { byModel: LatencyData['byModel'] }) {
  const t = STRINGS[useLocale()];
  const sorted = [...byModel].toSorted((a, b) => b.p95 - a.p95);

  if (sorted.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noModelData}
      </div>
    );
  }

  const maxP95 = Math.max(...sorted.map((m) => m.p95), 1);

  return (
    <div className="space-y-1.5">
      {sorted.map((m) => {
        const p50Pct = (m.p50 / maxP95) * 100;
        const p95Pct = (m.p95 / maxP95) * 100;
        return (
          <div key={m.model} className="flex items-center gap-2">
            <span
              className="text-2xs font-mono text-foreground shrink-0 w-[180px] truncate"
              title={m.model}
            >
              {truncateModel(m.model)}
            </span>
            <div className="flex-1 h-5 bg-border/30 rounded-sm overflow-hidden relative">
              {/* p95 bar (wider, behind) */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: `${Math.max(p95Pct, 1)}%`,
                  backgroundColor: '#f59e0b',
                  opacity: 0.4,
                }}
              />
              {/* p50 bar (narrower, in front) */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${Math.max(p50Pct, 1)}%`, backgroundColor: '#6366f1' }}
              />
            </div>
            <span
              className="text-2xs font-mono text-foreground shrink-0 w-[80px] text-right"
              title={`p50: ${formatDuration(m.p50)}, p95: ${formatDuration(m.p95)}`}
            >
              {formatDuration(m.p50)} / {formatDuration(m.p95)}
            </span>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex gap-x-4 mt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#6366f1' }} />
          <span className="text-3xs font-mono text-muted-foreground">p50</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: '#f59e0b', opacity: 0.4 }}
          />
          <span className="text-3xs font-mono text-muted-foreground">p95</span>
        </div>
      </div>
    </div>
  );
}

// -- Streaming vs Non-Streaming comparison ----------------------------------

function StreamingComparison({ stats }: { stats: LatencyStats }) {
  const t = STRINGS[useLocale()];
  const { streaming, nonStreaming } = stats;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {/* Streaming */}
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground mb-2">
          {t.streaming}
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.medianP50}</span>
            <span className="text-2xs font-mono font-bold">{formatDuration(streaming.p50)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.p95}</span>
            <span className="text-2xs font-mono font-bold">{formatDuration(streaming.p95)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.average}</span>
            <span className="text-2xs font-mono font-bold">{formatDuration(streaming.avg)}</span>
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.requestsLabel}</span>
            <span className="text-2xs font-mono text-foreground">
              {formatNumber(streaming.count)}
            </span>
          </div>
        </div>
      </div>

      {/* Non-Streaming */}
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground mb-2">
          {t.nonStreaming}
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.medianP50}</span>
            <span className="text-2xs font-mono font-bold">{formatDuration(nonStreaming.p50)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.p95}</span>
            <span className="text-2xs font-mono font-bold">{formatDuration(nonStreaming.p95)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.average}</span>
            <span className="text-2xs font-mono font-bold">{formatDuration(nonStreaming.avg)}</span>
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.requestsLabel}</span>
            <span className="text-2xs font-mono text-foreground">
              {formatNumber(nonStreaming.count)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Cache Read vs P99 Latency chart ----------------------------------------

function formatBucketLabel(bucket: number): string {
  if (bucket >= 1_000_000) return `${(bucket / 1_000_000).toFixed(0)}M`;
  if (bucket >= 1_000) return `${(bucket / 1_000).toFixed(0)}k`;
  return String(bucket);
}

// -- Cache Read x Write Heatmap (p90 latency) --------------------------------

const HEATMAP_COLORS = [
  '#083344',
  '#0e4a5c',
  '#155e75',
  '#0e7490',
  '#06b6d4',
  '#22d3ee',
  '#67e8f9',
  '#fbbf24',
  '#f59e0b',
  '#ea580c',
  '#dc2626',
];

function interpolateHeat(t: number): string {
  const idx = Math.min(Math.floor(t * (HEATMAP_COLORS.length - 1)), HEATMAP_COLORS.length - 2);
  return HEATMAP_COLORS[idx];
}

function CacheHeatmap({
  data,
  formatValue,
  formatCellValue,
}: {
  data: HeatmapCell[];
  formatValue?: (v: number) => string;
  formatCellValue?: (v: number) => string;
}) {
  const t = STRINGS[useLocale()];
  const [hovered, setHovered] = useState<HeatmapCell | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hideSmall, setHideSmall] = useState(true);

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-4 text-center text-xs text-muted-foreground">
        {t.noData}
      </div>
    );
  }

  const readBuckets = [...new Set(data.map((d) => d.readBucket))].toSorted((a, b) => a - b);
  const writeBuckets = [...new Set(data.map((d) => d.writeBucket))].toSorted((a, b) => a - b);
  const cellMap = new Map(data.map((d) => [`${d.readBucket}-${d.writeBucket}`, d]));

  const filtered = hideSmall ? data.filter((d) => d.count >= 5) : data;
  const maxP90 = Math.max(...filtered.map((d) => d.p90));
  const minP90 = Math.min(...filtered.map((d) => d.p90));
  const range = maxP90 - minP90 || 1;

  const CELL = 52;
  const LABEL_W = 56;
  const LABEL_H = 28;
  const svgW = LABEL_W + readBuckets.length * CELL + 80;
  const svgH = LABEL_H + writeBuckets.length * CELL + 30;

  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;

    const titleHeight = 40;
    const padding = 16;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.addEventListener('load', () => {
      const scale = 2;
      const canvasW = (svgW + padding * 2) * scale;
      const canvasH = (svgH + titleHeight + padding * 2) * scale;
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Title
      ctx.fillStyle = '#ededed';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(t.pngTitle, padding, padding + 20);
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText(t.pngDetail(data.length, SNAPSHOT_RANGE_LABEL), padding, padding + 34);

      // SVG
      ctx.drawImage(img, padding, titleHeight + padding, svgW, svgH);
      URL.revokeObjectURL(url);

      // Download
      const a = document.createElement('a');
      a.download = 'cache-heatmap.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    });
    img.src = url;
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-end mb-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setHideSmall((h) => !h);
            track('agentic_workload_latency_heatmap_hide_small_toggled', { hideSmall: !hideSmall });
          }}
          className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
            hideSmall
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          {t.hideSmall}
        </button>
        <button
          type="button"
          onClick={() => {
            track('agentic_workload_latency_heatmap_export_png');
            exportPng();
          }}
          className="px-2 py-0.5 text-3xs font-mono rounded border border-border text-subtle hover:text-foreground hover:bg-surface-hover transition-colors"
        >
          {t.exportPng}
        </button>
        <ExpandTrigger />
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full"
        style={{ maxHeight: 400 }}
      >
        {/* X-axis labels (cacheRead) */}
        {readBuckets.map((rb, i) => (
          <text
            key={`xl-${rb}`}
            x={LABEL_W + i * CELL + CELL / 2}
            y={writeBuckets.length * CELL + LABEL_H + 14}
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="8px"
            fontFamily={SVG_FONT}
          >
            {formatBucketLabel(rb)}
          </text>
        ))}

        {/* Y-axis labels (cacheWrite) */}
        {writeBuckets.map((wb, j) => (
          <text
            key={`yl-${wb}`}
            x={LABEL_W - 6}
            y={LABEL_H + j * CELL + CELL / 2 + 3}
            textAnchor="end"
            fill="var(--muted)"
            fontSize="8px"
            fontFamily={SVG_FONT}
          >
            {formatBucketLabel(wb)}
          </text>
        ))}

        {/* Cells */}
        {readBuckets.map((rb, i) =>
          writeBuckets.map((wb, j) => {
            const cell = cellMap.get(`${rb}-${wb}`);
            if (!cell) return null;
            if (hideSmall && cell.count < 5) return null;
            const norm = (cell.p90 - minP90) / range;
            const isHovered = hovered === cell;
            return (
              <g key={`${rb}-${wb}`}>
                <rect
                  x={LABEL_W + i * CELL + 1}
                  y={LABEL_H + j * CELL + 1}
                  width={CELL - 2}
                  height={CELL - 2}
                  fill={interpolateHeat(norm)}
                  fillOpacity={isHovered ? 1 : 0.85}
                  rx={3}
                  stroke={isHovered ? 'var(--fg)' : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                />
                <text
                  x={LABEL_W + i * CELL + CELL / 2}
                  y={LABEL_H + j * CELL + CELL / 2 + 3}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="9px"
                  fontFamily={SVG_FONT}
                  fontWeight="bold"
                  style={{ pointerEvents: 'none' }}
                >
                  {(formatCellValue ?? formatValue)?.(cell.p90) ??
                    `${(cell.p90 / 1000).toFixed(1)}s`}
                </text>
              </g>
            );
          }),
        )}

        {/* X-axis title */}
        <text
          x={LABEL_W + (readBuckets.length * CELL) / 2}
          y={writeBuckets.length * CELL + LABEL_H + 26}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="10px"
          fontFamily={SVG_FONT}
        >
          {t.cacheReadAxisTitle}
        </text>

        {/* Y-axis title */}
        <text
          x={10}
          y={LABEL_H + (writeBuckets.length * CELL) / 2}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="10px"
          fontFamily={SVG_FONT}
          transform={`rotate(-90, 10, ${LABEL_H + (writeBuckets.length * CELL) / 2})`}
        >
          {t.cacheWriteAxisTitle}
        </text>

        {/* Color legend */}
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={`legend-${i}`}
            x={LABEL_W + readBuckets.length * CELL + 12}
            y={LABEL_H + i * ((writeBuckets.length * CELL) / 10)}
            width={12}
            height={(writeBuckets.length * CELL) / 10}
            fill={interpolateHeat(i / 9)}
          />
        ))}
        <text
          x={LABEL_W + readBuckets.length * CELL + 30}
          y={LABEL_H + 8}
          fill="var(--muted)"
          fontSize="7px"
          fontFamily={SVG_FONT}
        >
          {formatValue ? formatValue(minP90) : `${(minP90 / 1000).toFixed(1)}s`}
        </text>
        <text
          x={LABEL_W + readBuckets.length * CELL + 30}
          y={LABEL_H + writeBuckets.length * CELL}
          fill="var(--muted)"
          fontSize="7px"
          fontFamily={SVG_FONT}
        >
          {formatValue ? formatValue(maxP90) : `${(maxP90 / 1000).toFixed(1)}s`}
        </text>
      </svg>

      {/* Hover detail */}
      {hovered && (
        <div className="mt-2 flex items-center gap-4 text-3xs font-mono text-muted-foreground px-1">
          <span>
            read: {formatBucketLabel(hovered.readBucket)}+ · write:{' '}
            {formatBucketLabel(hovered.writeBucket)}+
          </span>
          <span className="font-bold text-foreground">
            p90: {formatValue ? formatValue(hovered.p90) : `${(hovered.p90 / 1000).toFixed(2)}s`}
          </span>
          <span>n={hovered.count}</span>
        </div>
      )}
    </div>
  );
}

// -- Cache Total x Output → p90 Interactivity heatmap -------------------------

function InteractivityHeatmap({
  data,
}: {
  data: {
    cacheTotalBucket: number;
    outputBucket: number;
    count: number;
    p90Interactivity: number;
  }[];
}) {
  const t = STRINGS[useLocale()];
  const [hovered, setHovered] = useState<(typeof data)[0] | null>(null);
  const [hideSmall, setHideSmall] = useState(true);

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-4 text-center text-xs text-muted-foreground">
        {t.noData}
      </div>
    );
  }

  const cacheBuckets = [...new Set(data.map((d) => d.cacheTotalBucket))].toSorted((a, b) => a - b);
  const outputBuckets = [...new Set(data.map((d) => d.outputBucket))].toSorted((a, b) => a - b);
  const cellMap = new Map(data.map((d) => [`${d.cacheTotalBucket}-${d.outputBucket}`, d]));

  // For interactivity, higher = better, so invert the color scale
  const filtered = hideSmall ? data.filter((d) => d.count >= 5) : data;
  const maxVal = Math.max(...filtered.map((d) => d.p90Interactivity));
  const minVal = Math.min(...filtered.map((d) => d.p90Interactivity));
  const range = maxVal - minVal || 1;

  const CELL = 52;
  const LABEL_W = 56;
  const LABEL_H = 28;
  const svgW = LABEL_W + cacheBuckets.length * CELL + 80;
  const svgH = LABEL_H + outputBuckets.length * CELL + 30;

  // Green = high interactivity (good), red = low (bad)
  const INTERACTIVITY_COLORS = [
    '#dc2626',
    '#ea580c',
    '#f59e0b',
    '#fbbf24',
    '#a3e635',
    '#22c55e',
    '#10b981',
    '#06b6d4',
    '#0ea5e9',
    '#3b82f6',
    '#6366f1',
  ];

  function interpolate(v: number): string {
    const idx = Math.min(
      Math.floor(v * (INTERACTIVITY_COLORS.length - 1)),
      INTERACTIVITY_COLORS.length - 2,
    );
    return INTERACTIVITY_COLORS[idx];
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={() => {
            setHideSmall((h) => !h);
            track('agentic_workload_latency_interactivity_hide_small_toggled', {
              hideSmall: !hideSmall,
            });
          }}
          className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
            hideSmall
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          {t.hideSmall}
        </button>
        <ExpandTrigger />
      </div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: 400 }}>
        {/* X-axis labels (cache total) */}
        {cacheBuckets.map((cb, i) => (
          <text
            key={`xl-${cb}`}
            x={LABEL_W + i * CELL + CELL / 2}
            y={outputBuckets.length * CELL + LABEL_H + 14}
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="8px"
            fontFamily={SVG_FONT}
          >
            {formatBucketLabel(cb)}
          </text>
        ))}

        {/* Y-axis labels (output tokens) */}
        {outputBuckets.map((ob, j) => (
          <text
            key={`yl-${ob}`}
            x={LABEL_W - 6}
            y={LABEL_H + j * CELL + CELL / 2 + 3}
            textAnchor="end"
            fill="var(--muted)"
            fontSize="8px"
            fontFamily={SVG_FONT}
          >
            {formatBucketLabel(ob)}
          </text>
        ))}

        {/* Cells */}
        {cacheBuckets.map((cb, i) =>
          outputBuckets.map((ob, j) => {
            const cell = cellMap.get(`${cb}-${ob}`);
            if (!cell) return null;
            if (hideSmall && cell.count < 5) return null;
            const norm = (cell.p90Interactivity - minVal) / range;
            const isHov = hovered === cell;
            return (
              <g key={`${cb}-${ob}`}>
                <rect
                  x={LABEL_W + i * CELL + 1}
                  y={LABEL_H + j * CELL + 1}
                  width={CELL - 2}
                  height={CELL - 2}
                  fill={interpolate(norm)}
                  fillOpacity={isHov ? 1 : 0.85}
                  rx={3}
                  stroke={isHov ? 'var(--fg)' : 'none'}
                  strokeWidth={isHov ? 1.5 : 0}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                />
                <text
                  x={LABEL_W + i * CELL + CELL / 2}
                  y={LABEL_H + j * CELL + CELL / 2 + 3}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="9px"
                  fontFamily={SVG_FONT}
                  fontWeight="bold"
                  style={{ pointerEvents: 'none' }}
                >
                  {cell.p90Interactivity.toFixed(0)}
                </text>
              </g>
            );
          }),
        )}

        {/* X-axis title */}
        <text
          x={LABEL_W + (cacheBuckets.length * CELL) / 2}
          y={outputBuckets.length * CELL + LABEL_H + 26}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="10px"
          fontFamily={SVG_FONT}
        >
          {t.cacheReadWriteAxis}
        </text>

        {/* Y-axis title */}
        <text
          x={10}
          y={LABEL_H + (outputBuckets.length * CELL) / 2}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="10px"
          fontFamily={SVG_FONT}
          transform={`rotate(-90, 10, ${LABEL_H + (outputBuckets.length * CELL) / 2})`}
        >
          {t.outputTokensAxis}
        </text>

        {/* Color legend */}
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={`legend-${i}`}
            x={LABEL_W + cacheBuckets.length * CELL + 12}
            y={LABEL_H + i * ((outputBuckets.length * CELL) / 10)}
            width={12}
            height={(outputBuckets.length * CELL) / 10}
            fill={interpolate(i / 9)}
          />
        ))}
        <text
          x={LABEL_W + cacheBuckets.length * CELL + 30}
          y={LABEL_H + 8}
          fill="var(--muted)"
          fontSize="7px"
          fontFamily={SVG_FONT}
        >
          {minVal.toFixed(0)} tok/s
        </text>
        <text
          x={LABEL_W + cacheBuckets.length * CELL + 30}
          y={LABEL_H + outputBuckets.length * CELL}
          fill="var(--muted)"
          fontSize="7px"
          fontFamily={SVG_FONT}
        >
          {maxVal.toFixed(0)} tok/s
        </text>
      </svg>

      {hovered && (
        <div className="mt-2 flex items-center gap-4 text-3xs font-mono text-muted-foreground px-1">
          <span>
            cache total: {formatBucketLabel(hovered.cacheTotalBucket)}+ · output:{' '}
            {formatBucketLabel(hovered.outputBucket)}+
          </span>
          <span className="font-bold text-foreground">
            p90: {hovered.p90Interactivity.toFixed(1)} output tok/s/user
          </span>
          <span>n={hovered.count}</span>
        </div>
      )}
    </div>
  );
}

// -- Faceted heatmap by output tokens (small multiples) ----------------------

function FacetedHeatmap({ data }: { data: HeatmapByOutputCell[] }) {
  const t = STRINGS[useLocale()];
  const [hovered, setHovered] = useState<HeatmapByOutputCell | null>(null);
  const [globalScale, setGlobalScale] = useState(true);
  const [hideSmall, setHideSmall] = useState(true);

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-4 text-center text-xs text-muted-foreground">
        {t.noData}
      </div>
    );
  }

  const outputBuckets = [...new Set(data.map((d) => d.outputBucket))].toSorted((a, b) => a - b);
  const readBuckets = [...new Set(data.map((d) => d.readBucket))].toSorted((a, b) => a - b);
  const writeBuckets = [...new Set(data.map((d) => d.writeBucket))].toSorted((a, b) => a - b);

  // Global color scale
  const filtered = hideSmall ? data.filter((d) => d.count >= 5) : data;
  const allP90 = filtered.map((d) => d.p90);
  const globalMin = Math.min(...allP90);
  const globalMax = Math.max(...allP90);
  const globalRange = globalMax - globalMin || 1;

  // Per-facet local scales
  const localScales = new Map<number, { min: number; max: number; range: number }>();
  for (const ob of outputBuckets) {
    const vals = filtered.filter((d) => d.outputBucket === ob).map((d) => d.p90);
    const min = vals.length > 0 ? Math.min(...vals) : 0;
    const max = vals.length > 0 ? Math.max(...vals) : 0;
    localScales.set(ob, { min, max, range: max - min || 1 });
  }

  const CELL = 36;
  const LABEL_W = 44;
  const LABEL_H = 20;
  const facetW = LABEL_W + readBuckets.length * CELL;
  const facetH = LABEL_H + writeBuckets.length * CELL + 24;

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      {/* Toggle */}
      <div className="flex items-center justify-end mb-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setHideSmall((h) => !h);
            track('agentic_workload_latency_faceted_hide_small_toggled', { hideSmall: !hideSmall });
          }}
          className={`px-2 py-0.5 text-3xs font-mono rounded border transition-colors ${
            hideSmall
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-subtle hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          {t.hideSmall}
        </button>
        <span className="text-3xs font-mono text-muted-foreground">{t.colorScale}</span>
        <div className="flex items-center border border-border rounded-md p-0.5">
          <button
            type="button"
            onClick={() => {
              setGlobalScale(true);
              track('agentic_workload_latency_faceted_scale_changed', { scale: 'global' });
            }}
            className={`px-2 py-0.5 text-3xs font-mono rounded-sm transition-colors ${
              globalScale ? 'bg-surface-hover text-foreground' : 'text-subtle hover:text-foreground'
            }`}
          >
            {t.global}
          </button>
          <button
            type="button"
            onClick={() => {
              setGlobalScale(false);
              track('agentic_workload_latency_faceted_scale_changed', { scale: 'local' });
            }}
            className={`px-2 py-0.5 text-3xs font-mono rounded-sm transition-colors ${
              globalScale ? 'text-subtle hover:text-foreground' : 'bg-surface-hover text-foreground'
            }`}
          >
            {t.local}
          </button>
        </div>
        <ExpandTrigger />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {outputBuckets.map((ob) => {
          const facetData = data.filter((d) => d.outputBucket === ob);
          const cellMap = new Map(facetData.map((d) => [`${d.readBucket}-${d.writeBucket}`, d]));
          const local = localScales.get(ob)!;

          return (
            <div key={ob}>
              <div className="text-3xs font-mono font-bold text-center mb-1 text-muted-foreground">
                {t.outputLabels[ob] || `${formatBucketLabel(ob)}+ out`}
              </div>
              <svg viewBox={`0 0 ${facetW} ${facetH}`} className="w-full">
                {/* X labels */}
                {readBuckets.map((rb, i) => (
                  <text
                    key={`x-${rb}`}
                    x={LABEL_W + i * CELL + CELL / 2}
                    y={writeBuckets.length * CELL + LABEL_H + 12}
                    textAnchor="middle"
                    fill="var(--subtle)"
                    fontSize="6px"
                    fontFamily={SVG_FONT}
                  >
                    {formatBucketLabel(rb)}
                  </text>
                ))}
                {/* Y labels */}
                {writeBuckets.map((wb, j) => (
                  <text
                    key={`y-${wb}`}
                    x={LABEL_W - 4}
                    y={LABEL_H + j * CELL + CELL / 2 + 2}
                    textAnchor="end"
                    fill="var(--subtle)"
                    fontSize="6px"
                    fontFamily={SVG_FONT}
                  >
                    {formatBucketLabel(wb)}
                  </text>
                ))}
                {/* Cells */}
                {readBuckets.map((rb, i) =>
                  writeBuckets.map((wb, j) => {
                    const cell = cellMap.get(`${rb}-${wb}`);
                    if (!cell) {
                      return (
                        <rect
                          key={`${rb}-${wb}`}
                          x={LABEL_W + i * CELL + 1}
                          y={LABEL_H + j * CELL + 1}
                          width={CELL - 2}
                          height={CELL - 2}
                          fill="var(--surface)"
                          rx={2}
                        />
                      );
                    }
                    if (hideSmall && cell.count < 5) return null;
                    const norm = globalScale
                      ? (cell.p90 - globalMin) / globalRange
                      : (cell.p90 - local.min) / local.range;
                    const isHovered = hovered === cell;
                    return (
                      <g key={`${rb}-${wb}`}>
                        <rect
                          x={LABEL_W + i * CELL + 1}
                          y={LABEL_H + j * CELL + 1}
                          width={CELL - 2}
                          height={CELL - 2}
                          fill={interpolateHeat(norm)}
                          fillOpacity={isHovered ? 1 : 0.85}
                          rx={2}
                          stroke={isHovered ? 'var(--fg)' : 'none'}
                          strokeWidth={isHovered ? 1 : 0}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHovered(cell)}
                          onMouseLeave={() => setHovered(null)}
                        />
                        <text
                          x={LABEL_W + i * CELL + CELL / 2}
                          y={LABEL_H + j * CELL + CELL / 2 + 3}
                          textAnchor="middle"
                          fill="#fff"
                          fontSize="7px"
                          fontFamily={SVG_FONT}
                          fontWeight="bold"
                          style={{ pointerEvents: 'none' }}
                        >
                          {(cell.p90 / 1000).toFixed(1)}
                        </text>
                      </g>
                    );
                  }),
                )}
              </svg>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 text-3xs font-mono text-muted-foreground px-1">
        <span>{t.facetFooter(globalScale ? t.sharedScale : t.perFacetScale)}</span>
        {hovered && (
          <span>
            read: {formatBucketLabel(hovered.readBucket)}+ · write:{' '}
            {formatBucketLabel(hovered.writeBucket)}+ · output:{' '}
            {t.outputLabels[hovered.outputBucket] || formatBucketLabel(hovered.outputBucket)} ·{' '}
            <span className="font-bold text-foreground">
              p90: {(hovered.p90 / 1000).toFixed(2)}s
            </span>{' '}
            · n={hovered.count}
          </span>
        )}
      </div>
    </div>
  );
}

function CacheReadLatencyChart({ data }: { data: CacheReadBucket[] }) {
  const t = STRINGS[useLocale()];
  if (data.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-4 text-center text-xs text-muted-foreground">
        {t.noData}
      </div>
    );
  }

  const maxP90 = Math.max(...data.map((d) => d.p90));
  const yMax = niceNum(maxP90, true);
  const yTicks = 5;
  const yStep = yMax / yTicks;

  const barW = Math.min(60, PLOT_W / data.length - 8);
  const gap = (PLOT_W - barW * data.length) / (data.length + 1);

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 20}`} className="w-full" style={{ maxHeight: 260 }}>
        {/* Y-axis grid + labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = i * yStep;
          const y = MARGIN.top + PLOT_H - (val / yMax) * PLOT_H;
          return (
            <g key={i}>
              <line
                x1={MARGIN.left}
                y1={y}
                x2={MARGIN.left + PLOT_W}
                y2={y}
                stroke="var(--border-color)"
                strokeWidth={0.5}
              />
              <text
                x={MARGIN.left - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--muted)"
                fontSize={SVG_FONT_SIZE}
                fontFamily={SVG_FONT}
              >
                {(val / 1000).toFixed(1)}s
              </text>
            </g>
          );
        })}

        {/* Bars: p90 only */}
        {data.map((d, i) => {
          const x = MARGIN.left + gap + i * (barW + gap);
          const p90H = (d.p90 / yMax) * PLOT_H;
          const baseY = MARGIN.top + PLOT_H;

          return (
            <g key={d.bucket}>
              <rect
                x={x}
                y={baseY - p90H}
                width={barW}
                height={p90H}
                fill="#22d3ee"
                fillOpacity={0.8}
                rx={2}
              />
              {/* X-axis label */}
              <text
                x={x + barW / 2}
                y={baseY + 14}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize={SVG_FONT_SIZE}
                fontFamily={SVG_FONT}
              >
                {formatBucketLabel(d.bucket)}
              </text>
              {/* Count label */}
              <text
                x={x + barW / 2}
                y={baseY + 26}
                textAnchor="middle"
                fill="var(--subtle)"
                fontSize="7px"
                fontFamily={SVG_FONT}
              >
                n={d.count}
              </text>
              {/* Value on top of bar */}
              <text
                x={x + barW / 2}
                y={baseY - p90H - 4}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="8px"
                fontFamily={SVG_FONT}
              >
                {(d.p90 / 1000).toFixed(1)}s
              </text>
              <title>
                {`cacheRead: ${formatBucketLabel(d.bucket)}+ tokens\np90: ${(d.p90 / 1000).toFixed(2)}s\ncount: ${d.count}`}
              </title>
            </g>
          );
        })}

        {/* X-axis label */}
        <text
          x={MARGIN.left + PLOT_W / 2}
          y={CHART_H + 16}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="10px"
          fontFamily={SVG_FONT}
        >
          {t.cacheReadBarAxisLabel}
        </text>

        {/* Y-axis label */}
        <text
          x={12}
          y={MARGIN.top + PLOT_H / 2}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="10px"
          fontFamily={SVG_FONT}
          transform={`rotate(-90, 12, ${MARGIN.top + PLOT_H / 2})`}
        >
          {t.p90E2eLatencyAxis}
        </text>
      </svg>
    </div>
  );
}

// -- Main page --------------------------------------------------------------

export default function LatencyPage() {
  return (
    <Suspense>
      <LatencyPageContent />
    </Suspense>
  );
}

function LatencyPageContent() {
  const t = STRINGS[useLocale()];
  const { models, selectedModel, setSelectedModel, buildUrl } = useModelFilter();
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading, error } = useDashboardData<LatencyData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion(
          buildUrl('/api/v1/agentic-workload-explorer/latency'),
          traceVersionParam,
        ),
        {
          signal,
        },
      );
      if (!r.ok) throw new Error('Failed to fetch latency data');
      return r.json();
    },
    key: `${selectedModel ?? ''}-${traceVersionParam}`,
  });

  return (
    <div className="space-y-6">
      {models.length > 0 && (
        <div className="flex items-center gap-2">
          <ModelFilter
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      )}
      {/* -- Stats --------------------------------------------------------- */}
      <div>
        <SectionHeader label={t.stats} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border bg-surface p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <div className="text-sm font-mono text-muted-foreground text-center py-8">
            {t.failedToLoad}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard
              label={t.e2eMedian}
              value={formatDuration(data.stats.p50)}
              detail={`avg ${formatDuration(data.stats.avg)}`}
            />
            <StatCard label={t.e2eP95} value={formatDuration(data.stats.p95)} />
            <StatCard label={t.e2eP99} value={formatDuration(data.stats.p99)} />
          </div>
        )}
      </div>

      {data && (
        <>
          {/* -- Cache Read x Write Heatmap ------------------------------------- */}
          <div>
            <SectionHeader label={t.cacheHeatmapLabel} detail={t.cacheHeatmapDetail} />
            <Expandable title={t.cacheHeatmapLabel} subtitle={t.cacheHeatmapDetail}>
              <CacheHeatmap data={data.cacheHeatmap} />
            </Expandable>
          </div>

          {/* -- Faceted by Output Tokens --------------------------------------- */}
          <div>
            <SectionHeader label={t.facetedLabel} detail={t.facetedDetail} />
            <Expandable title={t.facetedLabel} subtitle={t.facetedDetail}>
              <FacetedHeatmap data={data.cacheHeatmapByOutput} />
            </Expandable>
          </div>

          {/* -- Cache Read x Write → p90 TTFT ----------------------------------- */}
          <div>
            <SectionHeader label={t.cacheTtftLabel} detail={t.cacheTtftDetail} />
            <Expandable title={t.cacheTtftLabel} subtitle={t.cacheTtftDetail}>
              <CacheHeatmap data={data.cacheHeatmapTTFT} />
            </Expandable>
          </div>

          {/* -- Cache Read x Write → p90 Prefill Speed -------------------------- */}
          <div>
            <SectionHeader label={t.cachePrefillLabel} detail={t.cachePrefillDetail} />
            <Expandable title={t.cachePrefillLabel} subtitle={t.cachePrefillDetail}>
              <CacheHeatmap
                data={data.cacheHeatmapPrefillSpeed}
                formatValue={formatPrefillSpeed}
                formatCellValue={formatPrefillSpeedCompact}
              />
            </Expandable>
          </div>

          {/* -- Cache Total vs Output → p90 Interactivity ----------------------- */}
          <div>
            <SectionHeader
              label={t.interactivityHeatmapLabel}
              detail={t.interactivityHeatmapDetail}
            />
            <Expandable title={t.interactivityHeatmapLabel} subtitle={t.interactivityHeatmapDetail}>
              <InteractivityHeatmap data={data.cacheTotalVsOutputInteractivity} />
            </Expandable>
          </div>

          {/* -- Cache Read vs E2E Latency ----------------------------------------- */}
          <div>
            <SectionHeader label={t.cacheReadLabel} detail={t.cacheReadDetail} />
            <Expandable title={t.cacheReadLabel} subtitle={t.cacheReadDetail} corner>
              <CacheReadLatencyChart data={data.cacheReadVsLatency} />
            </Expandable>
          </div>

          {/* -- E2E Latency Distribution Histogram -------------------------------- */}
          <div>
            <SectionHeader
              label={t.e2eDistLabel}
              detail={t.samples(formatNumber(data.distribution.n))}
            />
            <Expandable
              title={t.e2eDistLabel}
              subtitle={t.samples(formatNumber(data.distribution.n))}
              corner
            >
              <DistributionHistogram distribution={data.distribution} stats={data.stats} />
            </Expandable>
          </div>

          {/* -- TTFT Distribution ---------------------------------------------- */}
          <div>
            <SectionHeader
              label={t.ttftDistLabel}
              detail={t.streamingSamples(formatNumber(data.ttftDistribution.n))}
            />
            <Expandable
              title={t.ttftDistLabel}
              subtitle={t.streamingSamples(formatNumber(data.ttftDistribution.n))}
              corner
            >
              <GenericDistributionHistogram
                histogram={data.ttftDistribution}
                stats={data.ttftStats}
                color="#10b981"
              />
            </Expandable>
          </div>

          {/* -- TPOT Distribution ---------------------------------------------- */}
          <div>
            <SectionHeader
              label={t.tpotDistLabel}
              detail={t.streamingSamples(formatNumber(data.tpotDistribution.n))}
            />
            <Expandable
              title={t.tpotDistLabel}
              subtitle={t.streamingSamples(formatNumber(data.tpotDistribution.n))}
              corner
            >
              <GenericDistributionHistogram
                histogram={data.tpotDistribution}
                stats={data.tpotStats}
                color="#8b5cf6"
                formatLabel={(v) => `${v.toFixed(1)}ms/tok`}
              />
            </Expandable>
          </div>

          {/* -- Prefill Speed Distribution ------------------------------------- */}
          <div>
            <SectionHeader
              label={t.prefillDistLabel}
              detail={t.prefillDistDetail(formatNumber(data.prefillSpeedDistribution.n))}
            />
            <Expandable
              title={t.prefillDistLabel}
              subtitle={t.prefillDistDetail(formatNumber(data.prefillSpeedDistribution.n))}
              corner
            >
              <GenericDistributionHistogram
                histogram={data.prefillSpeedDistribution}
                stats={data.prefillSpeedStats}
                color="#0ea5e9"
                formatLabel={formatPrefillSpeed}
              />
            </Expandable>
          </div>

          {/* -- Interactivity Distribution ------------------------------------ */}
          <div>
            <SectionHeader
              label={t.interactDistLabel}
              detail={t.interactDistDetail(formatNumber(data.interactivityDistribution.n))}
            />
            <Expandable
              title={t.interactDistLabel}
              subtitle={t.interactDistDetail(formatNumber(data.interactivityDistribution.n))}
              corner
            >
              <GenericDistributionHistogram
                histogram={data.interactivityDistribution}
                stats={{
                  p50: data.tpotStats.p50 > 0 ? 1000 / data.tpotStats.p50 : 0,
                  p90: data.tpotStats.p90 > 0 ? 1000 / data.tpotStats.p90 : 0,
                  p95: data.tpotStats.p95 > 0 ? 1000 / data.tpotStats.p95 : 0,
                  p99: data.tpotStats.p99 > 0 ? 1000 / data.tpotStats.p99 : 0,
                  avg: data.tpotStats.avg > 0 ? 1000 / data.tpotStats.avg : 0,
                  count: data.tpotStats.count,
                }}
                color="#f59e0b"
                formatLabel={(v) => `${v.toFixed(1)} tok/s`}
              />
            </Expandable>
          </div>

          {/* -- E2E Latency Over Time --------------------------------------------- */}
          <div>
            <SectionHeader label={t.hourlyLabel} detail={t.hourlyDetail} />
            <Expandable title={t.hourlyLabel} subtitle={t.hourlyDetail} corner>
              <HourlyLatencyChart hourly={data.hourly} />
            </Expandable>
          </div>

          {/* -- E2E Latency by Model ---------------------------------------------- */}
          <div>
            <SectionHeader label={t.modelLabel} detail={t.modelDetail(data.byModel.length)} />
            <div className="rounded-md border border-border bg-surface p-3">
              <ModelLatencyChart byModel={data.byModel} />
            </div>
          </div>

          {/* -- Streaming vs Non-Streaming ------------------------------------ */}
          <div>
            <SectionHeader label={t.streamVsNonLabel} />
            <StreamingComparison stats={data.stats} />
          </div>
        </>
      )}
    </div>
  );
}
