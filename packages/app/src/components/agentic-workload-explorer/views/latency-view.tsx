'use client';

import { Suspense, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  formatNumber,
  formatDuration,
  formatExplorerDateTime,
  formatPrefillSpeed,
  formatPrefillSpeedCompact,
  formatZoneLabel,
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
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import {
  ChartActions,
  Expandable,
  ExpandTrigger,
} from '@/components/agentic-workload-explorer/expandable-chart';

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

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

const STRINGS = {
  en: {
    stats: 'Stats',
    failedToLoad: 'Failed to load latency data',
    e2eMedian: 'E2E median (p50)',
    e2eP95: 'E2E p95',
    e2eP99: 'E2E p99',
    noE2eDistribution: 'No E2E latency distribution data available',
    noData: 'No data available',
    noHourlyData: 'No hourly E2E latency data available',
    noModelData: 'No model E2E latency data available',
    requests: 'requests',
    streaming: 'Streaming',
    nonStreaming: 'Non-streaming',
    medianP50: 'Median (p50)',
    p95: 'P95',
    average: 'Average',
    requestsLabel: 'Requests',
    hideSmall: 'Hide n<5',
    colorScale: 'Color scale:',
    hoverRead: 'read',
    hoverWrite: 'write',
    hoverOutput: 'output',
    hoverCacheTotal: 'cache total',
    global: 'Global',
    local: 'Local',
    cacheHeatmapLabel: 'Cache read × write → p90 E2E latency',
    cacheHeatmapDetail: 'heatmap',
    facetedLabel: 'Cache × output → p90 E2E latency',
    facetedDetail: 'faceted by output tokens',
    cacheTtftLabel: 'Cache read × write → p90 TTFT',
    cacheTtftDetail: 'streaming requests only',
    cachePrefillLabel: 'Cache read × write → p90 prefill speed',
    cachePrefillDetail: 'streaming requests with cache · input tok/s/query',
    interactivityHeatmapLabel: 'Cache total × output → p90 interactivity',
    interactivityHeatmapDetail: 'output tok/s/user · streaming requests',
    cacheReadLabel: 'Cache read vs E2E latency',
    cacheReadDetail: 'cache_write < 4k tokens',
    e2eDistLabel: 'E2E latency distribution',
    samples: (n: string) => `${n} samples`,
    ttftDistLabel: 'TTFT distribution',
    streamingSamples: (n: string) => `${n} streaming samples`,
    tpotDistLabel: 'TPOT distribution',
    prefillDistLabel: 'Prefill speed distribution',
    prefillDistDetail: (n: string) => `${n} streaming samples · input tok/s/query`,
    interactDistLabel: 'Interactivity distribution',
    interactDistDetail: (n: string) => `${n} streaming samples · output tok/s/user`,
    hourlyLabel: 'E2E latency over time',
    hourlyDetail: 'final 48h, hourly',
    modelLabel: 'E2E latency by model',
    modelDetail: (count: number) => `${count} model${count === 1 ? '' : 's'}`,
    streamVsNonLabel: 'Streaming vs non-streaming',
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
    outputLabels: {
      0: '0–1k out',
      1000: '1k–5k out',
      5000: '5k–20k out',
      20000: '20k+ out',
    } as Record<number, string>,
  },
  zh: {
    stats: '统计',
    failedToLoad: '延迟数据加载失败',
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
    colorScale: '色标：',
    hoverRead: '读取',
    hoverWrite: '写入',
    hoverOutput: '输出',
    hoverCacheTotal: '缓存总量',
    global: '全局',
    local: '局部',
    cacheHeatmapLabel: '缓存读取 × 写入 → p90 端到端延迟',
    cacheHeatmapDetail: '热力图',
    facetedLabel: '缓存 × 输出 → p90 端到端延迟',
    facetedDetail: '按 output token 分面',
    cacheTtftLabel: '缓存读取 × 写入 → p90 TTFT',
    cacheTtftDetail: '仅限流式请求',
    cachePrefillLabel: '缓存读取 × 写入 → p90 Prefill 速度',
    cachePrefillDetail: '含缓存的流式请求 · input tok/s/query',
    interactivityHeatmapLabel: '缓存总量 × 输出 → p90 交互性',
    interactivityHeatmapDetail: 'output tok/s/user · 流式请求',
    cacheReadLabel: '缓存读取 vs 端到端延迟',
    cacheReadDetail: 'cache_write < 4k token',
    e2eDistLabel: '端到端延迟分布',
    samples: (n: string) => `${n} 个样本`,
    ttftDistLabel: 'TTFT 分布',
    streamingSamples: (n: string) => `${n} 个流式样本`,
    tpotDistLabel: 'TPOT 分布',
    prefillDistLabel: 'Prefill 速度分布',
    prefillDistDetail: (n: string) => `${n} 个流式样本 · input tok/s/query`,
    interactDistLabel: '交互性分布',
    interactDistDetail: (n: string) => `${n} 个流式样本 · output tok/s/user`,
    hourlyLabel: '端到端延迟趋势',
    hourlyDetail: '最后 48 小时，按小时',
    modelLabel: '按模型的端到端延迟',
    modelDetail: (count: number) => `${count} 个模型`,
    streamVsNonLabel: '流式 vs 非流式',
    cacheReadAxisTitle: '缓存读取 token（cache_read）',
    cacheWriteAxisTitle: '缓存写入 token（cache_write）',
    outputTokensAxis: '输出 token',
    cacheReadWriteAxis: '缓存读取 + 写入 token',
    p90E2eLatencyAxis: 'p90 端到端延迟 (s)',
    cacheReadBarAxisLabel: '缓存读取 token（cache_write < 4k）',
    sharedScale: '统一色标',
    perFacetScale: '分面色标',
    facetFooter: (scaleLabel: string) =>
      `x：缓存读取 · y：缓存写入 · 颜色：p90 端到端延迟 (s) · ${scaleLabel}`,
    outputLabels: {
      0: '0–1k 输出',
      1000: '1k–5k 输出',
      5000: '5k–20k 输出',
      20000: '20k+ 输出',
    } as Record<number, string>,
  },
};

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
  for (let t = niceMin; t - spacing < max - spacing * 1e-9; t += spacing) {
    ticks.push(Math.round(t * 1e10) / 1e10);
  }
  return ticks;
}

function truncateModel(model: string, maxLen = 28): string {
  if (model.length <= maxLen) return model;
  return `${model.slice(0, maxLen - 1)}...`;
}

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
      <EmptyState bare className="py-8">
        {t.noE2eDistribution}
      </EmptyState>
    );
  }

  const minVal = bins[0].min;
  const maxVal = bins.at(-1)!.max;
  const range = maxVal - minVal || 1;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  const p50 = stats.p50;
  const p95 = stats.p95;
  const p99 = stats.p99;

  const sx = (v: number) => MARGIN.left + ((v - minVal) / range) * PLOT_W;
  const sy = (count: number) => MARGIN.top + PLOT_H - (count / maxCount) * PLOT_H;

  const barGap = 0.5;
  const barW = Math.max(0.5, PLOT_W / bins.length - barGap);

  const xTicks = generateTicks(minVal, maxVal, 6);

  return (
    <Card>
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
              fill="#6366f1"
              rx={0.5}
            >
              <title>
                {formatDuration(b.min)} - {formatDuration(b.max)}: {b.count} {t.requests}
              </title>
            </rect>
          );
        })}

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
    </Card>
  );
}

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
      <EmptyState bare className="py-8">
        {t.noData}
      </EmptyState>
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
    <Card>
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
    </Card>
  );
}

function HourlyLatencyChart({ hourly }: { hourly: LatencyData['hourly'] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  if (hourly.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noHourlyData}
      </EmptyState>
    );
  }

  const allVals = hourly.flatMap((h) => [h.p50, h.p95]);
  const yMax = Math.max(...allVals, 1);
  const yTicks = generateTicks(0, yMax, 5);
  const yTop = yTicks.at(-1) || yMax;

  const sx = (i: number) => MARGIN.left + (i / (hourly.length - 1 || 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yTop) * PLOT_H;

  const p50Points = hourly.map((h, i) => `${sx(i)},${sy(h.p50)}`).join(' ');
  const p95Points = hourly.map((h, i) => `${sx(i)},${sy(h.p95)}`).join(' ');

  const labelStep = Math.max(1, Math.ceil(hourly.length / 6));
  const xLabels: { idx: number; label: string }[] = [];
  for (let i = 0; i < hourly.length; i += labelStep) {
    const label = formatExplorerDateTime(
      hourly[i].hour,
      locale,
      { month: 'short', day: 'numeric', hour: 'numeric', hour12: true },
      { axisTick: true },
    );
    xLabels.push({ idx: i, label });
  }
  const timeZone = formatZoneLabel(hourly[0].hour);

  return (
    <Card>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: 240 }}>
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

        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_H}
          x2={MARGIN.left + PLOT_W}
          y2={MARGIN.top + PLOT_H}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />

        <polyline points={p50Points} fill="none" stroke="#06b6d4" strokeWidth={1.5} />
        <polyline points={p95Points} fill="none" stroke="#f59e0b" strokeWidth={1.5} />

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

      <div className="flex items-center gap-x-4 mt-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#06b6d4' }} />
          <span className="text-3xs font-mono text-muted-foreground">p50</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
          <span className="text-3xs font-mono text-muted-foreground">p95</span>
        </div>
        <span className="ml-auto text-3xs font-mono text-muted-foreground">{timeZone}</span>
      </div>
    </Card>
  );
}

function ModelLatencyChart({ byModel }: { byModel: LatencyData['byModel'] }) {
  const t = STRINGS[useLocale()];
  const sorted = [...byModel].toSorted((a, b) => b.p95 - a.p95);

  if (sorted.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noModelData}
      </EmptyState>
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
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: `${Math.max(p95Pct, 1)}%`,
                  backgroundColor: '#f59e0b',
                  opacity: 0.4,
                }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${Math.max(p50Pct, 1)}%`, backgroundColor: '#6366f1' }}
              />
            </div>
            <span
              className="text-2xs font-mono tabular-nums whitespace-nowrap text-foreground shrink-0 min-w-28 text-right"
              title={`p50: ${formatDuration(m.p50)}, p95: ${formatDuration(m.p95)}`}
            >
              {formatDuration(m.p50)} / {formatDuration(m.p95)}
            </span>
          </div>
        );
      })}

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

function StreamingComparison({ stats }: { stats: LatencyStats }) {
  const t = STRINGS[useLocale()];
  const { streaming, nonStreaming } = stats;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Card>
        <div className="text-xs font-medium text-muted-foreground mb-2">{t.streaming}</div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.medianP50}</span>
            <span className="text-2xs font-mono font-medium">{formatDuration(streaming.p50)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.p95}</span>
            <span className="text-2xs font-mono font-medium">{formatDuration(streaming.p95)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.average}</span>
            <span className="text-2xs font-mono font-medium">{formatDuration(streaming.avg)}</span>
          </div>
          <div className="h-px bg-border/30 my-1" />
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.requestsLabel}</span>
            <span className="text-2xs font-mono text-foreground">
              {formatNumber(streaming.count)}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-xs font-medium text-muted-foreground mb-2">{t.nonStreaming}</div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.medianP50}</span>
            <span className="text-2xs font-mono font-medium">
              {formatDuration(nonStreaming.p50)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.p95}</span>
            <span className="text-2xs font-mono font-medium">
              {formatDuration(nonStreaming.p95)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.average}</span>
            <span className="text-2xs font-mono font-medium">
              {formatDuration(nonStreaming.avg)}
            </span>
          </div>
          <div className="h-px bg-border/30 my-1" />
          <div className="flex justify-between">
            <span className="text-2xs font-mono text-muted-foreground">{t.requestsLabel}</span>
            <span className="text-2xs font-mono text-foreground">
              {formatNumber(nonStreaming.count)}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function formatBucketLabel(bucket: number): string {
  if (bucket >= 1_000_000) return `${(bucket / 1_000_000).toFixed(0)}M`;
  if (bucket >= 1_000) return `${(bucket / 1_000).toFixed(0)}k`;
  return String(bucket);
}

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
  const [hideSmall, setHideSmall] = useState(true);

  if (data.length === 0) {
    return <EmptyState>{t.noData}</EmptyState>;
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

  return (
    <Card>
      <div className="flex items-center mb-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-pressed={hideSmall}
          onClick={() => {
            setHideSmall((h) => !h);
            track('agentic_workload_latency_heatmap_hide_small_toggled', { enabled: !hideSmall });
          }}
        >
          {t.hideSmall}
        </Button>
        <ChartActions
          fileName="cache-heatmap"
          onExportPng={() => track('agentic_workload_latency_heatmap_export_png')}
        />
      </div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: 400 }}>
        {readBuckets.map((rb, i) => (
          <text
            key={`xl-${rb}`}
            x={LABEL_W + i * CELL + CELL / 2}
            y={writeBuckets.length * CELL + LABEL_H + 14}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize="8px"
            fontFamily={SVG_FONT}
          >
            {formatBucketLabel(rb)}
          </text>
        ))}

        {writeBuckets.map((wb, j) => (
          <text
            key={`yl-${wb}`}
            x={LABEL_W - 6}
            y={LABEL_H + j * CELL + CELL / 2 + 3}
            textAnchor="end"
            fill="var(--muted-foreground)"
            fontSize="8px"
            fontFamily={SVG_FONT}
          >
            {formatBucketLabel(wb)}
          </text>
        ))}

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
                  stroke={isHovered ? 'var(--foreground)' : 'none'}
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

        <text
          x={LABEL_W + (readBuckets.length * CELL) / 2}
          y={writeBuckets.length * CELL + LABEL_H + 26}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10px"
          fontFamily={SVG_FONT}
        >
          {t.cacheReadAxisTitle}
        </text>

        <text
          x={10}
          y={LABEL_H + (writeBuckets.length * CELL) / 2}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10px"
          fontFamily={SVG_FONT}
          transform={`rotate(-90, 10, ${LABEL_H + (writeBuckets.length * CELL) / 2})`}
        >
          {t.cacheWriteAxisTitle}
        </text>

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
          fill="var(--muted-foreground)"
          fontSize="7px"
          fontFamily={SVG_FONT}
        >
          {formatValue ? formatValue(minP90) : `${(minP90 / 1000).toFixed(1)}s`}
        </text>
        <text
          x={LABEL_W + readBuckets.length * CELL + 30}
          y={LABEL_H + writeBuckets.length * CELL}
          fill="var(--muted-foreground)"
          fontSize="7px"
          fontFamily={SVG_FONT}
        >
          {formatValue ? formatValue(maxP90) : `${(maxP90 / 1000).toFixed(1)}s`}
        </text>
      </svg>

      {hovered && (
        <div className="mt-2 flex items-center gap-4 text-3xs font-mono text-muted-foreground px-1">
          <span>
            {t.hoverRead}: {formatBucketLabel(hovered.readBucket)}+ · {t.hoverWrite}:{' '}
            {formatBucketLabel(hovered.writeBucket)}+
          </span>
          <span className="font-medium text-foreground">
            p90: {formatValue ? formatValue(hovered.p90) : `${(hovered.p90 / 1000).toFixed(2)}s`}
          </span>
          <span>n={hovered.count}</span>
        </div>
      )}
    </Card>
  );
}

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
    return <EmptyState>{t.noData}</EmptyState>;
  }

  const cacheBuckets = [...new Set(data.map((d) => d.cacheTotalBucket))].toSorted((a, b) => a - b);
  const outputBuckets = [...new Set(data.map((d) => d.outputBucket))].toSorted((a, b) => a - b);
  const cellMap = new Map(data.map((d) => [`${d.cacheTotalBucket}-${d.outputBucket}`, d]));

  const filtered = hideSmall ? data.filter((d) => d.count >= 5) : data;
  const maxVal = Math.max(...filtered.map((d) => d.p90Interactivity));
  const minVal = Math.min(...filtered.map((d) => d.p90Interactivity));
  const range = maxVal - minVal || 1;

  const CELL = 52;
  const LABEL_W = 56;
  const LABEL_H = 28;
  const svgW = LABEL_W + cacheBuckets.length * CELL + 80;
  const svgH = LABEL_H + outputBuckets.length * CELL + 30;

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
    <Card>
      <div className="flex items-center justify-between mb-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-pressed={hideSmall}
          onClick={() => {
            setHideSmall((h) => !h);
            track('agentic_workload_latency_interactivity_hide_small_toggled', {
              enabled: !hideSmall,
            });
          }}
        >
          {t.hideSmall}
        </Button>
        <ExpandTrigger />
      </div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: 400 }}>
        {cacheBuckets.map((cb, i) => (
          <text
            key={`xl-${cb}`}
            x={LABEL_W + i * CELL + CELL / 2}
            y={outputBuckets.length * CELL + LABEL_H + 14}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize="8px"
            fontFamily={SVG_FONT}
          >
            {formatBucketLabel(cb)}
          </text>
        ))}

        {outputBuckets.map((ob, j) => (
          <text
            key={`yl-${ob}`}
            x={LABEL_W - 6}
            y={LABEL_H + j * CELL + CELL / 2 + 3}
            textAnchor="end"
            fill="var(--muted-foreground)"
            fontSize="8px"
            fontFamily={SVG_FONT}
          >
            {formatBucketLabel(ob)}
          </text>
        ))}

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
                  stroke={isHov ? 'var(--foreground)' : 'none'}
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

        <text
          x={LABEL_W + (cacheBuckets.length * CELL) / 2}
          y={outputBuckets.length * CELL + LABEL_H + 26}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10px"
          fontFamily={SVG_FONT}
        >
          {t.cacheReadWriteAxis}
        </text>

        <text
          x={10}
          y={LABEL_H + (outputBuckets.length * CELL) / 2}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10px"
          fontFamily={SVG_FONT}
          transform={`rotate(-90, 10, ${LABEL_H + (outputBuckets.length * CELL) / 2})`}
        >
          {t.outputTokensAxis}
        </text>

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
          fill="var(--muted-foreground)"
          fontSize="7px"
          fontFamily={SVG_FONT}
        >
          {minVal.toFixed(0)} tok/s
        </text>
        <text
          x={LABEL_W + cacheBuckets.length * CELL + 30}
          y={LABEL_H + outputBuckets.length * CELL}
          fill="var(--muted-foreground)"
          fontSize="7px"
          fontFamily={SVG_FONT}
        >
          {maxVal.toFixed(0)} tok/s
        </text>
      </svg>

      {hovered && (
        <div className="mt-2 flex items-center gap-4 text-3xs font-mono text-muted-foreground px-1">
          <span>
            {t.hoverCacheTotal}: {formatBucketLabel(hovered.cacheTotalBucket)}+ · {t.hoverOutput}:{' '}
            {formatBucketLabel(hovered.outputBucket)}+
          </span>
          <span className="font-medium text-foreground">
            p90: {hovered.p90Interactivity.toFixed(1)} output tok/s/user
          </span>
          <span>n={hovered.count}</span>
        </div>
      )}
    </Card>
  );
}

function FacetedHeatmap({ data }: { data: HeatmapByOutputCell[] }) {
  const t = STRINGS[useLocale()];
  const [hovered, setHovered] = useState<HeatmapByOutputCell | null>(null);
  const [globalScale, setGlobalScale] = useState(true);
  const [hideSmall, setHideSmall] = useState(true);

  if (data.length === 0) {
    return <EmptyState>{t.noData}</EmptyState>;
  }

  const outputBuckets = [...new Set(data.map((d) => d.outputBucket))].toSorted((a, b) => a - b);
  const readBuckets = [...new Set(data.map((d) => d.readBucket))].toSorted((a, b) => a - b);
  const writeBuckets = [...new Set(data.map((d) => d.writeBucket))].toSorted((a, b) => a - b);

  const filtered = hideSmall ? data.filter((d) => d.count >= 5) : data;
  const allP90 = filtered.map((d) => d.p90);
  const globalMin = Math.min(...allP90);
  const globalMax = Math.max(...allP90);
  const globalRange = globalMax - globalMin || 1;

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
    <Card>
      <div className="flex flex-wrap items-center mb-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-pressed={hideSmall}
          onClick={() => {
            setHideSmall((h) => !h);
            track('agentic_workload_latency_faceted_hide_small_toggled', { enabled: !hideSmall });
          }}
        >
          {t.hideSmall}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.colorScale}</span>
          <SegmentedToggle
            role="group"
            ariaLabel={t.colorScale}
            value={globalScale ? 'global' : 'local'}
            onValueChange={(scale) => {
              setGlobalScale(scale === 'global');
              track('agentic_workload_latency_faceted_scale_changed', { scale });
            }}
            options={[
              { value: 'global', label: t.global },
              { value: 'local', label: t.local },
            ]}
          />
        </div>
        <div className="ml-auto flex items-center">
          <ExpandTrigger />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {outputBuckets.map((ob) => {
          const facetData = data.filter((d) => d.outputBucket === ob);
          const cellMap = new Map(facetData.map((d) => [`${d.readBucket}-${d.writeBucket}`, d]));
          const local = localScales.get(ob)!;

          return (
            <div key={ob}>
              <div className="text-3xs font-mono font-medium text-center mb-1 text-muted-foreground">
                {t.outputLabels[ob] || `${formatBucketLabel(ob)}+ out`}
              </div>
              <svg viewBox={`0 0 ${facetW} ${facetH}`} className="w-full">
                {readBuckets.map((rb, i) => (
                  <text
                    key={`x-${rb}`}
                    x={LABEL_W + i * CELL + CELL / 2}
                    y={writeBuckets.length * CELL + LABEL_H + 12}
                    textAnchor="middle"
                    fill="var(--muted-foreground)"
                    fontSize="6px"
                    fontFamily={SVG_FONT}
                  >
                    {formatBucketLabel(rb)}
                  </text>
                ))}
                {writeBuckets.map((wb, j) => (
                  <text
                    key={`y-${wb}`}
                    x={LABEL_W - 4}
                    y={LABEL_H + j * CELL + CELL / 2 + 2}
                    textAnchor="end"
                    fill="var(--muted-foreground)"
                    fontSize="6px"
                    fontFamily={SVG_FONT}
                  >
                    {formatBucketLabel(wb)}
                  </text>
                ))}
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
                          fill="var(--border-alt)"
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
                          stroke={isHovered ? 'var(--foreground)' : 'none'}
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

      <div className="flex items-center justify-between mt-2 text-3xs font-mono text-muted-foreground px-1">
        <span>{t.facetFooter(globalScale ? t.sharedScale : t.perFacetScale)}</span>
        {hovered && (
          <span>
            {t.hoverRead}: {formatBucketLabel(hovered.readBucket)}+ · {t.hoverWrite}:{' '}
            {formatBucketLabel(hovered.writeBucket)}+ · {t.hoverOutput}:{' '}
            {t.outputLabels[hovered.outputBucket] || formatBucketLabel(hovered.outputBucket)} ·{' '}
            <span className="font-medium text-foreground">
              p90: {(hovered.p90 / 1000).toFixed(2)}s
            </span>{' '}
            · n={hovered.count}
          </span>
        )}
      </div>
    </Card>
  );
}

function CacheReadLatencyChart({ data }: { data: CacheReadBucket[] }) {
  const t = STRINGS[useLocale()];
  if (data.length === 0) {
    return <EmptyState>{t.noData}</EmptyState>;
  }

  const maxP90 = Math.max(...data.map((d) => d.p90));
  const yMax = niceNum(maxP90, true);
  const yTicks = 5;
  const yStep = yMax / yTicks;

  const barW = Math.min(60, PLOT_W / data.length - 8);
  const gap = (PLOT_W - barW * data.length) / (data.length + 1);

  return (
    <Card>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 20}`} className="w-full" style={{ maxHeight: 260 }}>
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
                fill="var(--muted-foreground)"
                fontSize={SVG_FONT_SIZE}
                fontFamily={SVG_FONT}
              >
                {(val / 1000).toFixed(1)}s
              </text>
            </g>
          );
        })}

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
              <text
                x={x + barW / 2}
                y={baseY + 14}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize={SVG_FONT_SIZE}
                fontFamily={SVG_FONT}
              >
                {formatBucketLabel(d.bucket)}
              </text>
              <text
                x={x + barW / 2}
                y={baseY + 26}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="7px"
                fontFamily={SVG_FONT}
              >
                n={d.count}
              </text>
              <text
                x={x + barW / 2}
                y={baseY - p90H - 4}
                textAnchor="middle"
                fill="var(--muted-foreground)"
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

        <text
          x={MARGIN.left + PLOT_W / 2}
          y={CHART_H + 16}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10px"
          fontFamily={SVG_FONT}
        >
          {t.cacheReadBarAxisLabel}
        </text>

        <text
          x={12}
          y={MARGIN.top + PLOT_H / 2}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10px"
          fontFamily={SVG_FONT}
          transform={`rotate(-90, 12, ${MARGIN.top + PLOT_H / 2})`}
        >
          {t.p90E2eLatencyAxis}
        </text>
      </svg>
    </Card>
  );
}

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
      <div>
        <SectionHeader label={t.stats} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <EmptyState>{t.failedToLoad}</EmptyState>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat
              boxed
              label={t.e2eMedian}
              value={formatDuration(data.stats.p50)}
              detail={`avg ${formatDuration(data.stats.avg)}`}
            />
            <Stat boxed label={t.e2eP95} value={formatDuration(data.stats.p95)} />
            <Stat boxed label={t.e2eP99} value={formatDuration(data.stats.p99)} />
          </dl>
        )}
      </div>

      {data && (
        <>
          <div>
            <SectionHeader label={t.cacheHeatmapLabel} detail={t.cacheHeatmapDetail} />
            <Expandable title={t.cacheHeatmapLabel} subtitle={t.cacheHeatmapDetail}>
              <CacheHeatmap data={data.cacheHeatmap} />
            </Expandable>
          </div>

          <div>
            <SectionHeader label={t.facetedLabel} detail={t.facetedDetail} />
            <Expandable title={t.facetedLabel} subtitle={t.facetedDetail}>
              <FacetedHeatmap data={data.cacheHeatmapByOutput} />
            </Expandable>
          </div>

          <div>
            <SectionHeader label={t.cacheTtftLabel} detail={t.cacheTtftDetail} />
            <Expandable title={t.cacheTtftLabel} subtitle={t.cacheTtftDetail}>
              <CacheHeatmap data={data.cacheHeatmapTTFT} />
            </Expandable>
          </div>

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

          <div>
            <SectionHeader
              label={t.interactivityHeatmapLabel}
              detail={t.interactivityHeatmapDetail}
            />
            <Expandable title={t.interactivityHeatmapLabel} subtitle={t.interactivityHeatmapDetail}>
              <InteractivityHeatmap data={data.cacheTotalVsOutputInteractivity} />
            </Expandable>
          </div>

          <div>
            <SectionHeader label={t.cacheReadLabel} detail={t.cacheReadDetail} />
            <Expandable title={t.cacheReadLabel} subtitle={t.cacheReadDetail} corner>
              <CacheReadLatencyChart data={data.cacheReadVsLatency} />
            </Expandable>
          </div>

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

          <div>
            <SectionHeader label={t.hourlyLabel} detail={t.hourlyDetail} />
            <Expandable title={t.hourlyLabel} subtitle={t.hourlyDetail} corner>
              <HourlyLatencyChart hourly={data.hourly} />
            </Expandable>
          </div>

          <div>
            <SectionHeader label={t.modelLabel} detail={t.modelDetail(data.byModel.length)} />
            <Card>
              <ModelLatencyChart byModel={data.byModel} />
            </Card>
          </div>

          <div>
            <SectionHeader label={t.streamVsNonLabel} />
            <StreamingComparison stats={data.stats} />
          </div>
        </>
      )}
    </div>
  );
}
