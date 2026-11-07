'use client';

import { Suspense, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import {
  formatNumber,
  formatDuration,
  formatInteractivity,
  formatPrefillSpeed,
} from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { useModelFilter } from '@/hooks/agentic-workload-explorer/use-model-filter';
import { ModelFilter } from '@/components/agentic-workload-explorer/model-filter';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import type {
  DailyRatio,
  GraphHistogram,
  ModelBreakdown,
  StreamingData,
} from '@/lib/agentic-workload-explorer/api-types';
import {
  ChartActions,
  ChartLabelRow,
  Expandable,
} from '@/components/agentic-workload-explorer/expandable-chart';

const STRINGS = {
  en: {
    stats: 'Stats',
    streamingPct: 'Streaming %',
    nonStreamingPct: 'Non-streaming %',
    avgStreamingLatency: 'Avg streaming E2E latency',
    avgNonStreamingLatency: 'Avg non-streaming E2E latency',
    ttftP50: 'TTFT (p50)',
    tpotP50: 'TPOT (p50)',
    interactivityP50: 'Interactivity (p50)',
    prefillSpeedP50: 'Prefill speed (p50)',
    failedToLoad: 'Failed to load streaming data',
    streamingRatioOverTime: 'Streaming ratio over time',
    noDailyRatioData: 'No daily ratio data',
    streamingPct30d: 'Streaming % (30 days)',
    noData: 'No data',
    e2eLatencyComparison: 'E2E latency comparison',
    streamingE2eLatency: 'Streaming E2E latency',
    nonStreamingE2eLatency: 'Non-streaming E2E latency',
    durationMs: 'Duration (ms)',
    ttftTpotPrefill: 'TTFT & TPOT & prefill speed',
    timeToFirstToken: 'Time to first token',
    ttftMs: 'TTFT (ms)',
    timePerOutputToken: 'Time per output token',
    tpotMsTok: 'TPOT (ms/tok)',
    interactivityLabel: 'Interactivity (output tok/s/user)',
    outputTokSUser: 'output tok/s/user',
    prefillSpeedLabel: 'Prefill speed (input tok/s/query)',
    inputTokSQuery: 'input tok/s/query',
    tokenThroughput: 'Token throughput',
    streamingRequestsOnly: 'Streaming requests only (tokens/sec)',
    tokensSec: 'Tokens/sec',
    streamingByModel: 'Streaming by model',
    model: 'Model',
    streaming: 'Streaming',
    nonStreaming: 'Non-streaming',
    avgStreamingE2e: 'Avg streaming E2E latency',
    avgNonStreamingE2e: 'Avg non-streaming E2E latency',
    exportStreamingRatio: 'Streaming % (30 days)',
    exportStreamingLatency: 'Streaming E2E latency',
    exportNonStreamingLatency: 'Non-streaming E2E latency',
    exportTtft: 'Time to first token',
    exportTpot: 'Time per output token',
    exportInteractivity: 'Interactivity (output tok/s/user)',
    exportPrefillSpeed: 'Prefill speed',
    exportThroughput: 'Token throughput',
  },
  zh: {
    stats: '统计',
    streamingPct: '流式请求占比',
    nonStreamingPct: '非流式请求占比',
    avgStreamingLatency: '流式请求平均端到端延迟',
    avgNonStreamingLatency: '非流式请求平均端到端延迟',
    ttftP50: 'TTFT (p50)',
    tpotP50: 'TPOT (p50)',
    interactivityP50: '交互性 (p50)',
    prefillSpeedP50: 'Prefill 速度 (p50)',
    failedToLoad: '加载流式请求数据失败',
    streamingRatioOverTime: '流式请求占比趋势',
    noDailyRatioData: '暂无每日比例数据',
    streamingPct30d: '流式请求 %（30 天）',
    noData: '暂无数据',
    e2eLatencyComparison: '端到端延迟对比',
    streamingE2eLatency: '流式请求端到端延迟',
    nonStreamingE2eLatency: '非流式请求端到端延迟',
    durationMs: '时长 (ms)',
    ttftTpotPrefill: 'TTFT、TPOT 与 Prefill 速度',
    timeToFirstToken: '首 token 延迟',
    ttftMs: 'TTFT (ms)',
    timePerOutputToken: '每输出 token 耗时',
    tpotMsTok: 'TPOT (ms/tok)',
    interactivityLabel: '交互性（output tok/s/user）',
    outputTokSUser: 'output tok/s/user',
    prefillSpeedLabel: 'Prefill 速度（input tok/s/query）',
    inputTokSQuery: 'input tok/s/query',
    tokenThroughput: 'Token 吞吐量',
    streamingRequestsOnly: '仅流式请求（token/s）',
    tokensSec: 'token/s',
    streamingByModel: '按模型的流式请求统计',
    model: '模型',
    streaming: '流式',
    nonStreaming: '非流式',
    avgStreamingE2e: '流式请求平均端到端延迟',
    avgNonStreamingE2e: '非流式请求平均端到端延迟',
    exportStreamingRatio: '流式请求占比（30 天）',
    exportStreamingLatency: '流式请求端到端延迟',
    exportNonStreamingLatency: '非流式请求端到端延迟',
    exportTtft: '首 token 延迟',
    exportTpot: '每输出 token 耗时',
    exportInteractivity: '交互性（output tok/s/user）',
    exportPrefillSpeed: 'Prefill 速度',
    exportThroughput: 'Token 吞吐量',
  },
};

function shortenModel(model: string): string {
  return model.replace(/^claude-/u, '').replace(/-\d{8}$/u, '');
}

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

function formatAxisValue(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  if (Number.isInteger(v)) return String(v);
  if (v < 1) return v.toFixed(2);
  return v.toFixed(1);
}

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

function StreamingRatioChart({
  dailyRatio,
  headerLabel,
  emptyLabel,
  axisLabel,
  exportTitle,
}: {
  dailyRatio: DailyRatio[];
  headerLabel: string;
  emptyLabel: string;
  axisLabel: string;
  exportTitle: string;
}) {
  const sorted = useMemo(
    () => [...dailyRatio].toSorted((a, b) => a.day.localeCompare(b.day)),
    [dailyRatio],
  );

  if (sorted.length === 0) {
    return (
      <Card>
        <SectionHeader label={headerLabel} />
        <div className="flex items-center justify-center h-40 text-2xs font-mono text-muted-foreground">
          {emptyLabel}
        </div>
      </Card>
    );
  }

  const points = sorted.map((d) => ({
    day: d.day,
    pct: d.totalCount > 0 ? (d.streamingCount / d.totalCount) * 100 : 0,
  }));

  const yMin = 0;
  const yMax = 100;
  const yTicks = [0, 25, 50, 75, 100];

  const sx = (i: number) => MARGIN.left + (i / Math.max(points.length - 1, 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(2)},${sy(p.pct).toFixed(2)}`)
    .join(' ');

  const labelInterval = Math.max(1, Math.floor(points.length / 6));

  return (
    <Expandable title={exportTitle}>
      <Card>
        <div className="flex items-center justify-between mb-2">
          <SectionHeader label={headerLabel} />
          <ChartActions
            fileName="streaming-ratio"
            onExportPng={() => track('agentic_workload_streaming_ratio_export')}
          />
        </div>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full">
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              {t > 0 && (
                <line
                  x1={MARGIN.left}
                  y1={sy(t)}
                  x2={MARGIN.left + PLOT_W}
                  y2={sy(t)}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={MARGIN.left - 6}
                y={sy(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {t}%
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

          <path d={pathD} fill="none" stroke="#06b6d4" strokeWidth={2} strokeLinejoin="round" />

          {points.map((p, i) => (
            <circle key={p.day} cx={sx(i)} cy={sy(p.pct)} r={2.5} fill="#06b6d4">
              <title>
                {p.day}: {p.pct.toFixed(1)}%
              </title>
            </circle>
          ))}

          {points.map((p, i) => {
            if (i % labelInterval !== 0 && i !== points.length - 1) return null;
            const d = new Date(p.day);
            const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
            return (
              <text
                key={`x-${p.day}`}
                x={sx(i)}
                y={MARGIN.top + PLOT_H + 16}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {label}
              </text>
            );
          })}

          <text
            x={MARGIN.left + PLOT_W / 2}
            y={CHART_H - 2}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {axisLabel}
          </text>
        </svg>
      </Card>
    </Expandable>
  );
}

function Histogram({
  histogram,
  color,
  axisLabel,
  format,
  caption,
  title,
  exportFilename,
  emptyLabel,
}: {
  histogram: GraphHistogram;
  color: string;
  axisLabel: string;
  format?: (v: number) => string;
  caption: string;
  title?: string;
  exportFilename?: string;
  emptyLabel: string;
}) {
  const { buckets } = histogram;

  const percentiles = histogram.percentiles.filter(
    ({ label }) => label === 'p50' || label === 'p90' || label === 'p99',
  );

  if (buckets.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-2xs font-mono text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const xMin = buckets[0].min;
  const xMax = buckets.at(-1)!.max;

  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount;

  const xTicks = generateTicks(xMin, xMax, 6);
  const fmt = format || formatAxisValue;

  const sx = (v: number) => MARGIN.left + ((v - xMin) / (xMax - xMin || 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  return (
    <Expandable title={title}>
      <div>
        <ChartLabelRow label={caption}>
          {title && exportFilename && (
            <ChartActions
              fileName={exportFilename.replace(/\.png$/u, '')}
              onExportPng={() =>
                track('agentic_workload_streaming_histogram_export', {
                  title,
                  file_name: exportFilename,
                })
              }
            />
          )}
        </ChartLabelRow>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: 220 }}>
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              {t > 0 && (
                <line
                  x1={MARGIN.left}
                  y1={sy(t)}
                  x2={MARGIN.left + PLOT_W}
                  y2={sy(t)}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={MARGIN.left - 6}
                y={sy(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {formatAxisValue(t)}
              </text>
            </g>
          ))}

          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
          />
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
          />

          {buckets.map((bucket, i) => {
            const x = sx(bucket.min);
            const w = sx(bucket.max) - sx(bucket.min);
            const h = (bucket.count / yMax) * PLOT_H;
            if (bucket.count === 0) return null;
            return (
              <rect
                key={i}
                x={x}
                y={sy(bucket.count)}
                width={Math.max(w - 0.5, 1)}
                height={h}
                fill={color}
                opacity={0.75}
                stroke={color}
                strokeWidth={0.5}
              />
            );
          })}

          {percentiles.map(({ label, value: val }) => {
            const px = sx(val);
            if (px < MARGIN.left || px > MARGIN.left + PLOT_W) return null;
            const lineColor = label === 'p50' ? '#ef4444' : label === 'p90' ? '#f59e0b' : '#f43f5e';
            return (
              <g key={label}>
                <line
                  x1={px}
                  y1={MARGIN.top}
                  x2={px}
                  y2={MARGIN.top + PLOT_H}
                  stroke={lineColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  x={px}
                  y={MARGIN.top - 2}
                  textAnchor="middle"
                  fill={lineColor}
                  style={{ fontSize: '7px', fontFamily: 'var(--font-mono)' }}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {xTicks.map((t) => {
            if (t < xMin || t > xMax) return null;
            return (
              <text
                key={`x-${t}`}
                x={sx(t)}
                y={MARGIN.top + PLOT_H + 16}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {fmt(t)}
              </text>
            );
          })}

          <text
            x={MARGIN.left + PLOT_W / 2}
            y={CHART_H - 2}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {axisLabel}
          </text>
        </svg>

        <div className="flex items-center gap-3 mt-1 text-3xs font-mono text-muted-foreground">
          {percentiles.map((p) => (
            <span key={p.label}>
              {p.label}: {fmt(p.value)}
            </span>
          ))}
        </div>
      </div>
    </Expandable>
  );
}

function ModelTable({
  byModel,
  strings,
}: {
  byModel: ModelBreakdown[];
  strings: (typeof STRINGS)['en'];
}) {
  const sorted = useMemo(
    () =>
      [...byModel].toSorted(
        (a, b) => b.streamingCount + b.nonStreamingCount - (a.streamingCount + a.nonStreamingCount),
      ),
    [byModel],
  );

  return (
    <Card>
      <SectionHeader label={strings.streamingByModel} />
      <div className="overflow-x-auto">
        <table className="w-full text-2xs font-mono">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/20 font-medium">
              <th className="py-1.5 pr-4">{strings.model}</th>
              <th className="py-1.5 pr-4 text-right">{strings.streaming}</th>
              <th className="py-1.5 pr-4 text-right">{strings.nonStreaming}</th>
              <th className="py-1.5 pr-4 text-right">{strings.streamingPct}</th>
              <th className="py-1.5 pr-4 text-right">{strings.avgStreamingE2e}</th>
              <th className="py-1.5 text-right">{strings.avgNonStreamingE2e}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const total = m.streamingCount + m.nonStreamingCount;
              const pct = total > 0 ? ((m.streamingCount / total) * 100).toFixed(1) : '0.0';
              return (
                <tr key={m.model} className="border-b border-border/20 hover:bg-surface-hover">
                  <td
                    className="py-1.5 pr-4 text-foreground truncate max-w-[200px]"
                    title={m.model}
                  >
                    {shortenModel(m.model)}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-muted-foreground">
                    {formatNumber(m.streamingCount)}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-muted-foreground">
                    {formatNumber(m.nonStreamingCount)}
                  </td>
                  <td className="py-1.5 pr-4 text-right">{pct}%</td>
                  <td className="py-1.5 pr-4 text-right text-muted-foreground">
                    {m.streamingAvgLatency === null ? '-' : formatDuration(m.streamingAvgLatency)}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {m.nonStreamingAvgLatency === null
                      ? '-'
                      : formatDuration(m.nonStreamingAvgLatency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function StreamingPage() {
  return (
    <Suspense>
      <StreamingPageContent />
    </Suspense>
  );
}

function StreamingPageContent() {
  const t = STRINGS[useLocale()];
  const { models, selectedModel, setSelectedModel, buildUrl } = useModelFilter();
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading } = useDashboardData<StreamingData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion(
          buildUrl('/api/v1/agentic-workload-explorer/streaming'),
          traceVersionParam,
        ),
        {
          signal,
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: `${selectedModel ?? ''}-${traceVersionParam}`,
  });

  const streamingPct =
    data && data.stats.totalCount > 0
      ? ((data.stats.streamingCount / data.stats.totalCount) * 100).toFixed(1)
      : '0.0';
  const nonStreamingPct =
    data && data.stats.totalCount > 0
      ? ((data.stats.nonStreamingCount / data.stats.totalCount) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-5">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : data ? (
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Stat
              boxed
              label={t.streamingPct}
              value={`${streamingPct}%`}
              detail={`${formatNumber(data.stats.streamingCount)} of ${formatNumber(data.stats.totalCount)}`}
            />
            <Stat
              boxed
              label={t.nonStreamingPct}
              value={`${nonStreamingPct}%`}
              detail={`${formatNumber(data.stats.nonStreamingCount)} of ${formatNumber(data.stats.totalCount)}`}
            />
            <Stat
              boxed
              label={t.avgStreamingLatency}
              value={formatDuration(data.stats.streamingAvgLatency)}
            />
            <Stat
              boxed
              label={t.avgNonStreamingLatency}
              value={formatDuration(data.stats.nonStreamingAvgLatency)}
            />
            <Stat
              boxed
              label={t.ttftP50}
              value={data.ttftStats.count > 0 ? formatDuration(data.ttftStats.p50) : '---'}
              detail={
                data.ttftStats.count > 0 ? `p95 ${formatDuration(data.ttftStats.p95)}` : undefined
              }
            />
            <Stat
              boxed
              label={t.tpotP50}
              valueClassName="whitespace-normal"
              value={data.tpotStats.count > 0 ? `${data.tpotStats.p50.toFixed(1)}ms/tok` : '---'}
              detail={
                data.tpotStats.count > 0 ? `p95 ${data.tpotStats.p95.toFixed(1)}ms/tok` : undefined
              }
            />
            <Stat
              boxed
              label={t.interactivityP50}
              valueClassName="whitespace-normal"
              value={data.tpotStats.count > 0 ? formatInteractivity(data.tpotStats.p50) : '---'}
              detail={
                data.tpotStats.count > 0
                  ? `p95 ${formatInteractivity(data.tpotStats.p95)}`
                  : undefined
              }
            />
            <Stat
              boxed
              label={t.prefillSpeedP50}
              valueClassName="whitespace-normal"
              value={
                data.prefillSpeedStats.count > 0
                  ? formatPrefillSpeed(data.prefillSpeedStats.p50)
                  : '---'
              }
              detail={
                data.prefillSpeedStats.count > 0
                  ? `p95 ${formatPrefillSpeed(data.prefillSpeedStats.p95)}`
                  : undefined
              }
            />
          </dl>
        ) : (
          <EmptyState>{t.failedToLoad}</EmptyState>
        )}
      </div>

      {data && (
        <>
          <StreamingRatioChart
            dailyRatio={data.dailyRatio}
            headerLabel={t.streamingRatioOverTime}
            emptyLabel={t.noDailyRatioData}
            axisLabel={t.streamingPct30d}
            exportTitle={t.exportStreamingRatio}
          />

          <div>
            <SectionHeader label={t.e2eLatencyComparison} />
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <Histogram
                  caption={t.streamingE2eLatency}
                  histogram={data.streamingLatencyDistribution}
                  color="#06b6d4"
                  axisLabel={t.durationMs}
                  format={formatDuration}
                  title={t.exportStreamingLatency}
                  exportFilename="streaming-latency.png"
                  emptyLabel={t.noData}
                />
              </Card>
              <Card>
                <Histogram
                  caption={t.nonStreamingE2eLatency}
                  histogram={data.nonStreamingLatencyDistribution}
                  color="#f59e0b"
                  axisLabel={t.durationMs}
                  format={formatDuration}
                  title={t.exportNonStreamingLatency}
                  exportFilename="non-streaming-latency.png"
                  emptyLabel={t.noData}
                />
              </Card>
            </div>
          </div>

          <div>
            <SectionHeader label={t.ttftTpotPrefill} />
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <Histogram
                  caption={t.timeToFirstToken}
                  histogram={data.ttftDistribution}
                  color="#10b981"
                  axisLabel={t.ttftMs}
                  format={formatDuration}
                  title={t.exportTtft}
                  exportFilename="ttft.png"
                  emptyLabel={t.noData}
                />
              </Card>
              <Card>
                <Histogram
                  caption={t.timePerOutputToken}
                  histogram={data.tpotDistribution}
                  color="#8b5cf6"
                  axisLabel={t.tpotMsTok}
                  format={(v) => `${v.toFixed(1)}ms`}
                  title={t.exportTpot}
                  exportFilename="tpot.png"
                  emptyLabel={t.noData}
                />
              </Card>
              <Card>
                <Histogram
                  caption={t.interactivityLabel}
                  histogram={data.interactivityDistribution}
                  color="#f59e0b"
                  axisLabel={t.outputTokSUser}
                  format={(v) => `${v.toFixed(1)}`}
                  title={t.exportInteractivity}
                  exportFilename="interactivity.png"
                  emptyLabel={t.noData}
                />
              </Card>
              <Card>
                <Histogram
                  caption={t.prefillSpeedLabel}
                  histogram={data.prefillSpeedDistribution}
                  color="#0ea5e9"
                  axisLabel={t.inputTokSQuery}
                  format={formatPrefillSpeed}
                  title={t.exportPrefillSpeed}
                  exportFilename="prefill-speed.png"
                  emptyLabel={t.noData}
                />
              </Card>
            </div>
          </div>

          <Card>
            <SectionHeader label={t.tokenThroughput} />
            <Histogram
              caption={t.streamingRequestsOnly}
              histogram={data.throughputDistribution}
              color="#10b981"
              axisLabel={t.tokensSec}
              format={(v) => formatNumber(Math.round(v))}
              title={t.exportThroughput}
              exportFilename="throughput.png"
              emptyLabel={t.noData}
            />
          </Card>

          {data.byModel.length > 0 && <ModelTable byModel={data.byModel} strings={t} />}
        </>
      )}
    </div>
  );
}
