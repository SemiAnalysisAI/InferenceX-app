'use client';

import { Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  useGraphDataset,
  type GraphDatasetContext,
} from '@/hooks/agentic-workload-explorer/use-graph-dataset';
import {
  formatDuration,
  formatNumber,
  formatPrefillSpeed,
} from '@/lib/agentic-workload-explorer/format';
import {
  ChartActions,
  ExpandableChart,
} from '@/components/agentic-workload-explorer/expandable-chart';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { useModelFilter } from '@/hooks/agentic-workload-explorer/use-model-filter';
import { ModelFilter } from '@/components/agentic-workload-explorer/model-filter';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { HARNESSES, type Harness } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { harnessLabel } from '@/lib/agentic-workload-explorer/harness-label';
import { CURRENT_TRACE_VERSION } from '@semianalysisai/inferencex-db/proxytrace/shared/trace';
import { SUBAGENT_STATS_WINDOW_DAYS } from '@semianalysisai/inferencex-db/proxytrace/shared/subagent';
import { IDLE_GAP_CUTOFF_MS } from '@semianalysisai/inferencex-db/proxytrace/shared/wall-clock';
import { snapshotNow } from '@/lib/agentic-workload-explorer/snapshot';
import {
  formatAxisDollars,
  formatAxisNumber,
  formatDayLabel,
  formatHourLabel,
  TrendsLineChart,
  TrendsStackedChart,
  type LineSeries,
  type StackedDayPoint,
} from '@/components/agentic-workload-explorer/trends-charts';
import { DistributionHistogram } from '@/components/agentic-workload-explorer/distribution-histogram';
import {
  CHART_COLORS,
  TOKEN_SERIES_COLORS,
} from '@/components/agentic-workload-explorer/series-colors';

const STRINGS = {
  en: {
    yTokens: 'Tokens',
    ySessions: 'Sessions',
    yCostUsd: 'Cost (USD)',
    yRequestsPerSecond: 'Requests / second',
    loading: 'Loading…',
    failedToLoad: 'Failed to load',
    noData: 'No data available',
    sessions: 'Sessions',
    total: 'Total',
    tokenVolumePerHour: 'Token volume per hour',
    final48h: 'Final 48 hours',
    input: 'Input',
    cacheRead: 'Cache read',
    cacheWrite: 'Cache write',
    output: 'Output',
    weeklySessionsByHarness: 'Weekly sessions by harness',
    noSessionsInSnapshot: (v: number) =>
      `No sessions with > 20 requests at trace v${v} in this snapshot`,
    estimatedCostPerHour: 'Estimated cost per hour',
    estCost: 'Est. cost',
    p50CpuGpuTime: 'P50 CPU vs GPU time',
    cpuTimeBetweenTurns: 'CPU (time between turns)',
    gpuE2eLatency: 'GPU (E2E latency)',
    p50Cpu: 'P50 CPU',
    p50Gpu: 'P50 GPU',
    maxConcurrentSubagentsPerSession: 'Max concurrent subagents per session',
    noEligibleSessions: 'No eligible sessions in this snapshot',
    requestsPerSecond: 'Requests per second',
    timeRangeLabel: 'Time range',
    agentLabel: 'Agent',
    rpsWindow: {
      '3h': 'Final 3 hours',
      '12h': 'Final 12 hours',
      '24h': 'Final 24 hours',
      '3d': 'Final 3 days',
      '7d': 'Final 7 days',
    },
    rpsBucketLabel: (label: string) => `RPS (${label})`,
    rollingAvgLegend: (window: number) => `Rolling avg (window=${window})`,
    meanRps: 'Mean RPS',
    peakRps: 'Peak RPS',
    totalRequests: 'Total requests',
    bucketMinutes: (min: number) => `${min}m buckets`,
    bucketHours: (h: number) => `${h}h buckets`,
    wallClockTitle: 'Wall clock: tool/CPU vs LLM/GPU vs idle',
    wallClockFinal: (days: number) => `Final ${days} days · UTC`,
    shareOfWallClock: 'Share of wall clock',
    wallClockHoursYAxis: 'Wall clock hours',
    llmGpuLegend: 'LLM / GPU (E2E latency)',
    toolCpuLegend: 'Tool / CPU (client-side)',
    userIdleLegend: 'User idle (between turns)',
    agentBoth: 'Both',
    modeHours: 'Hours',
    modeShare: 'Share',
    traffic: 'Traffic',
    hourlyActivity: 'Hourly activity',
    weeklySessions: 'Weekly sessions',
    wallClock: 'Wall clock',
    islTotalDist: 'ISL total distribution',
    islTotalAxis: 'ISL total tokens (cache read + cache write + input)',
    cacheReadDist: 'Cache read distribution',
    cacheReadAxis: 'Cache read tokens',
    cacheWriteDist: 'Cache write distribution',
    cacheWriteAxis: 'Cache write tokens',
    outputDist: 'Output distribution',
    outputAxis: 'Output tokens',
    timeBetweenTurns: 'Time between turns',
    seconds: 'Seconds',
    userIdleTimeBetweenTurns: (min: number) => `User idle time between turns (< ${min} min)`,
    userIdleAxis: 'User idle (seconds)',
    cpuGpuRatioTitle: 'CPU tool-use time : GPU time ratio',
    cpuGpuRatioAxis: 'Ratio (time between turns / E2E latency)',
    cacheReadOutputRatioReq: 'Cache read : output ratio (per request)',
    ratioAxis: 'Ratio',
    cacheReadWriteRatio: 'Cache read : write ratio (per request)',
    cacheReadOutputRatioSess: 'Cache read : output ratio (per session)',
    turnsPerSession: 'Turns per session',
    turnsAxis: 'Turns',
    ttftDist: 'TTFT distribution',
    ttftAxis: 'Time to first token',
    tpotDist: 'TPOT distribution',
    tpotAxis: 'Time per output token',
    prefillSpeedDist: 'Prefill speed distribution',
    prefillSpeedAxis: 'Prefill speed (input tok/s/query)',
    tokensPerChunkDist: 'Tokens per SSE chunk distribution',
    tokensPerChunkAxis: 'Output tokens / SSE event (tok/chunk)',
    prefillShareTitle: 'Prefill share of E2E latency (TTFT / E2E)',
    prefillShareAxis: 'TTFT / E2E (% of latency spent in prefill)',
    interactivityDist: 'Interactivity distribution',
    interactivityAxis: 'Interactivity (output tok/s/user)',
    sessionDurationTitle: (v: number) => `Session duration (> 20 reqs, trace v${v})`,
    sessionDurationAxis: 'Session duration (hours)',
    subagentCountTitle: (days: number, v: number) =>
      `Subagents per session · Final ${days} days (> 20 reqs, trace v${v})`,
    subagentCountAxis: 'Subagents per session',
    maxConcurrentHistTitle: (days: number, v: number) =>
      `Max concurrent subagents per session · Final ${days} days (> 20 reqs, trace v${v})`,
    maxConcurrentAxis: 'Peak concurrent subagents',
    bins: (n: number) => `${n} bins`,
    p50PrefillDecodeTime: 'P50 prefill vs decode time',
    prefillTtft: 'Prefill (TTFT)',
    decodeE2eMinusTtft: 'Decode (E2E − TTFT)',
    p50Prefill: 'P50 prefill',
    p50Decode: 'P50 decode',
    cpuGpuOpus47Fast: 'P50 CPU vs GPU time · Opus 4.7 (fast mode)',
    cpuGpuOpus47NonFast: 'P50 CPU vs GPU time · Opus 4.7 (non-fast)',
    cpuGpuOpus48Fast: 'P50 CPU vs GPU time · Opus 4.8 (fast mode)',
    cpuGpuOpus48NonFast: 'P50 CPU vs GPU time · Opus 4.8 (non-fast)',
    prefillDecodeOpus47Fast: 'P50 prefill vs decode time · Opus 4.7 (fast mode)',
    prefillDecodeOpus47NonFast: 'P50 prefill vs decode time · Opus 4.7 (non-fast)',
    prefillDecodeOpus48Fast: 'P50 prefill vs decode time · Opus 4.8 (fast mode)',
    prefillDecodeOpus48NonFast: 'P50 prefill vs decode time · Opus 4.8 (non-fast)',
    maxConcSubLazy: (days: number) => `Max concurrent subagents per session · Final ${days} days`,
    costPerHour: 'Cost per hour',
    gt20ReqsTrace: (v: number) => `> 20 requests, trace v${v}`,
    weeklySessionsSubtext: (v: number) => `Sessions with more than 20 requests · trace v${v}`,
    nSamples: (n: string) => `N = ${n}`,
    requestOne: 'request',
    requestOther: 'requests',
    sessionOne: 'session',
    sessionOther: 'sessions',
    peakSubagents: 'Peak subagents',
    share: 'Share',
  },
  zh: {
    yTokens: 'Token 数',
    ySessions: '会话数',
    yCostUsd: '成本（美元）',
    yRequestsPerSecond: '请求数 / 秒',
    loading: '加载中…',
    failedToLoad: '加载失败',
    noData: '暂无数据',
    sessions: '会话数',
    total: '合计',
    tokenVolumePerHour: '每小时 Token 用量',
    final48h: '最后 48 小时',
    input: '输入',
    cacheRead: '缓存读取',
    cacheWrite: '缓存写入',
    output: '输出',
    weeklySessionsByHarness: '每周会话数（按 Harness）',
    noSessionsInSnapshot: (v: number) => `当前快照中没有请求数超过 20 次且 trace 为 v${v} 的会话`,
    estimatedCostPerHour: '每小时预估成本',
    estCost: '预估成本',
    p50CpuGpuTime: 'P50 CPU vs GPU 耗时',
    cpuTimeBetweenTurns: 'CPU（对话间隔）',
    gpuE2eLatency: 'GPU（E2E 延迟）',
    p50Cpu: 'P50 CPU',
    p50Gpu: 'P50 GPU',
    maxConcurrentSubagentsPerSession: '每会话最大并发 Subagent 数',
    noEligibleSessions: '当前快照中无符合条件的会话',
    requestsPerSecond: '每秒请求数',
    timeRangeLabel: '时间范围',
    agentLabel: '智能体',
    rpsWindow: {
      '3h': '最后 3 小时',
      '12h': '最后 12 小时',
      '24h': '最后 24 小时',
      '3d': '最后 3 天',
      '7d': '最后 7 天',
    },
    rpsBucketLabel: (label: string) => `RPS（${label}）`,
    rollingAvgLegend: (window: number) => `滑动平均（窗口=${window}）`,
    meanRps: '平均 RPS',
    peakRps: '峰值 RPS',
    totalRequests: '总请求数',
    bucketMinutes: (min: number) => `${min} 分钟分桶`,
    bucketHours: (h: number) => `${h} 小时分桶`,
    wallClockTitle: '墙钟时间：Tool/CPU vs LLM/GPU vs 空闲',
    wallClockFinal: (days: number) => `最后 ${days} 天 · UTC`,
    shareOfWallClock: '墙钟时间占比',
    wallClockHoursYAxis: '墙钟时间（小时）',
    llmGpuLegend: 'LLM / GPU（E2E 延迟）',
    toolCpuLegend: 'Tool / CPU（客户端）',
    userIdleLegend: '用户空闲（对话间隔）',
    agentBoth: '全部',
    modeHours: '小时',
    modeShare: '占比',
    traffic: '流量',
    hourlyActivity: '每小时活跃度',
    weeklySessions: '每周会话',
    wallClock: '墙钟时间',
    islTotalDist: 'ISL 总量分布',
    islTotalAxis: 'ISL 总 token（缓存读取 + 缓存写入 + 输入）',
    cacheReadDist: '缓存读取分布',
    cacheReadAxis: '缓存读取 token 数',
    cacheWriteDist: '缓存写入分布',
    cacheWriteAxis: '缓存写入 token 数',
    outputDist: '输出分布',
    outputAxis: '输出 Token 数',
    timeBetweenTurns: '对话间隔时间',
    seconds: '秒',
    userIdleTimeBetweenTurns: (min: number) => `用户空闲时间（< ${min} 分钟）`,
    userIdleAxis: '用户空闲（秒）',
    cpuGpuRatioTitle: 'CPU 工具调用时间 : GPU 时间比值',
    cpuGpuRatioAxis: '比值（对话间隔 / E2E 延迟）',
    cacheReadOutputRatioReq: '缓存读取 : 输出比（按请求）',
    ratioAxis: '比值',
    cacheReadWriteRatio: '缓存读取 : 写入比（按请求）',
    cacheReadOutputRatioSess: '缓存读取 : 输出比（按会话）',
    turnsPerSession: '每会话对话轮数',
    turnsAxis: '轮数',
    ttftDist: 'TTFT 分布',
    ttftAxis: '首 token 延迟',
    tpotDist: 'TPOT 分布',
    tpotAxis: '每输出 token 耗时',
    prefillSpeedDist: 'Prefill 速度分布',
    prefillSpeedAxis: 'Prefill 速度（input tok/s/query）',
    tokensPerChunkDist: '每 SSE Chunk Token 数分布',
    tokensPerChunkAxis: '输出 Token / SSE Event（tok/chunk）',
    prefillShareTitle: 'Prefill 占 E2E 延迟比例（TTFT / E2E）',
    prefillShareAxis: 'TTFT / E2E（prefill 占延迟比例）',
    interactivityDist: '交互性分布',
    interactivityAxis: '交互性（output tok/s/user）',
    sessionDurationTitle: (v: number) => `会话时长（> 20 次请求，trace v${v}）`,
    sessionDurationAxis: '会话时长（小时）',
    subagentCountTitle: (days: number, v: number) =>
      `每会话 Subagent 数 · 最后 ${days} 天（> 20 次请求，trace v${v}）`,
    subagentCountAxis: '每会话 Subagent 数',
    maxConcurrentHistTitle: (days: number, v: number) =>
      `每会话最大并发 Subagent 数 · 最后 ${days} 天（> 20 次请求，trace v${v}）`,
    maxConcurrentAxis: '峰值并发 Subagent 数',
    bins: (n: number) => `${n} 个分箱`,
    p50PrefillDecodeTime: 'P50 Prefill vs Decode 耗时',
    prefillTtft: 'Prefill (TTFT)',
    decodeE2eMinusTtft: 'Decode (E2E − TTFT)',
    p50Prefill: 'P50 Prefill',
    p50Decode: 'P50 Decode',
    cpuGpuOpus47Fast: 'P50 CPU vs GPU 耗时 · Opus 4.7（Fast Mode）',
    cpuGpuOpus47NonFast: 'P50 CPU vs GPU 耗时 · Opus 4.7（非 Fast Mode）',
    cpuGpuOpus48Fast: 'P50 CPU vs GPU 耗时 · Opus 4.8（Fast Mode）',
    cpuGpuOpus48NonFast: 'P50 CPU vs GPU 耗时 · Opus 4.8（非 Fast Mode）',
    prefillDecodeOpus47Fast: 'P50 Prefill vs Decode 耗时 · Opus 4.7（Fast Mode）',
    prefillDecodeOpus47NonFast: 'P50 Prefill vs Decode 耗时 · Opus 4.7（非 Fast Mode）',
    prefillDecodeOpus48Fast: 'P50 Prefill vs Decode 耗时 · Opus 4.8（Fast Mode）',
    prefillDecodeOpus48NonFast: 'P50 Prefill vs Decode 耗时 · Opus 4.8（非 Fast Mode）',
    maxConcSubLazy: (days: number) => `每会话最大并发 Subagent 数 · 最后 ${days} 天`,
    costPerHour: '每小时成本',
    gt20ReqsTrace: (v: number) => `> 20 次请求，trace v${v}`,
    weeklySessionsSubtext: (v: number) => `超过 20 次请求的会话 · trace v${v}`,
    nSamples: (n: string) => `N = ${n}`,
    requestOne: '请求',
    requestOther: '请求',
    sessionOne: '会话',
    sessionOther: '会话',
    peakSubagents: '峰值 Subagent 数',
    share: '占比',
  },
};

function ChartStateCard({
  title,
  pending = false,
  children,
}: {
  title?: string;
  pending?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        {title ? <CardTitle>{title}</CardTitle> : pending && <Skeleton className="h-4 w-32" />}
      </CardHeader>
      <CardContent>
        <EmptyState bare className="h-40">
          {children}
        </EmptyState>
      </CardContent>
    </Card>
  );
}

function ChartSkeletonCard({ title }: { title?: string }) {
  const t = STRINGS[useLocale()];
  return (
    <ChartStateCard title={title} pending>
      <span className="flex flex-col items-center gap-2">
        <Loader2 className="size-6 animate-spin" />
        {t.loading}
      </span>
    </ChartStateCard>
  );
}

function ChartErrorCard({ title }: { title?: string }) {
  return <ChartStateCard title={title}>{STRINGS[useLocale()].failedToLoad}</ChartStateCard>;
}

function EmptyDataCard({ title }: { title: string }) {
  return <ChartStateCard title={title}>{STRINGS[useLocale()].noData}</ChartStateCard>;
}

function LazyDatasetCard<T>({
  datasetKey,
  ctx,
  title,
  render,
}: {
  datasetKey: string;
  ctx: GraphDatasetContext;
  title?: string;
  render: (data: T) => React.ReactNode;
}) {
  const { ref, data, loading, error } = useGraphDataset<T>(datasetKey, ctx);
  if (error)
    return (
      <div ref={ref}>
        <ChartErrorCard title={title} />
      </div>
    );
  if (loading || !data)
    return (
      <div ref={ref}>
        <ChartSkeletonCard title={title} />
      </div>
    );
  return <div ref={ref}>{render(data)}</div>;
}

interface HourlyToken {
  hour: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  requestCount: number;
  cost: number;
}

interface WeeklySessionRow {
  week: string;
  harness: Harness;
  sessionCount: number;
}

interface WallClockDay {
  day: string;
  agent: 'claude' | 'codex' | 'openai';
  llmMs: number;
  toolMs: number;
  idleMs: number;
  requests: number;
}

interface RpsPoint {
  bucket: string;
  requestCount: number;
  rps: number;
}

interface RpsData {
  range: RpsRangeKey;
  bucketMinutes: number;
  rangeHours: number;
  points: RpsPoint[];
}

const RPS_RANGES = [
  { key: '3h', label: '3h' },
  { key: '12h', label: '12h' },
  { key: '24h', label: '24h' },
  { key: '3d', label: '3d' },
  { key: '7d', label: '7d' },
] as const;

type RpsRangeKey = (typeof RPS_RANGES)[number]['key'];

interface Bucket {
  min: number;
  max: number;
  count: number;
}

interface Percentile {
  label: string;
  value: number;
}

interface GraphHistogram {
  buckets: Bucket[];
  percentiles: Percentile[];
  n: number;
}

interface GraphPie {
  p50a: number;
  p50b: number;
  n: number;
}

interface ConcurrencyBucket {
  label: string;
  value: number;
}

function LegendSwatches({ items }: { items: { key: string; label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

const TOKEN_KEYS = ['input', 'cacheRead', 'cacheWrite', 'output'] as const;
const tokenColor = (key: string) => TOKEN_SERIES_COLORS[key as (typeof TOKEN_KEYS)[number]];
const COST_KEYS = ['cost'];
const costColor = () => CHART_COLORS[0];

function HourlyTokenChart({ data }: { data: HourlyToken[] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const xFormatter = useCallback((iso: string) => formatHourLabel(iso, locale), [locale]);
  const days = useMemo(
    () =>
      data.map((d) => ({
        day: d.hour,
        values: {
          input: Number(d.input),
          cacheRead: Number(d.cacheRead),
          cacheWrite: Number(d.cacheWrite),
          output: Number(d.output),
        },
      })),
    [data],
  );
  const labels: Record<string, string> = {
    input: t.input,
    cacheRead: t.cacheRead,
    cacheWrite: t.cacheWrite,
    output: t.output,
  };
  return (
    <TrendsStackedChart
      title={t.tokenVolumePerHour}
      subtext={t.final48h}
      days={days}
      seriesKeys={[...TOKEN_KEYS]}
      labelFor={(key) => labels[key]}
      colorFor={tokenColor}
      mode="count"
      yFormatter={formatAxisNumber}
      yLabel={t.yTokens}
      xFormatter={xFormatter}
      filename="hourly-token-volume"
      emptyLabel={t.noData}
    />
  );
}

const HARNESS_COLORS: Record<Harness, string> = {
  'claude-code': '#f97316',
  codex: '#8b5cf6',
  pi: '#10b981',
  omp: '#0ea5e9',
  other: '#a1a1aa',
};
const harnessColor = (key: string) => HARNESS_COLORS[key as Harness];

function pivotWeeklySessions(rows: WeeklySessionRow[]): StackedDayPoint[] {
  const byWeek = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const values = byWeek.get(r.week) ?? {};
    values[r.harness] = r.sessionCount;
    byWeek.set(r.week, values);
  }
  return [...byWeek.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => ({ day, values }));
}

function WeeklySessionsByHarnessChart({ data }: { data: StackedDayPoint[] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const xFormatter = useCallback((week: string) => formatDayLabel(week, locale), [locale]);
  return (
    <TrendsStackedChart
      title={t.weeklySessionsByHarness}
      subtext={t.weeklySessionsSubtext(CURRENT_TRACE_VERSION)}
      days={data}
      seriesKeys={[...HARNESSES]}
      labelFor={(key) => harnessLabel(key as Harness, locale)}
      colorFor={harnessColor}
      mode="count"
      xFormatter={xFormatter}
      yLabel={t.ySessions}
      filename="weekly-sessions-by-harness"
      emptyLabel={t.noSessionsInSnapshot(CURRENT_TRACE_VERSION)}
    />
  );
}

function HourlyCostChart({ data }: { data: HourlyToken[] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const xFormatter = useCallback((iso: string) => formatHourLabel(iso, locale), [locale]);
  const days = useMemo(
    () => data.map((d) => ({ day: d.hour, values: { cost: Number(d.cost) } })),
    [data],
  );
  return (
    <TrendsStackedChart
      title={t.estimatedCostPerHour}
      subtext={t.final48h}
      days={days}
      seriesKeys={COST_KEYS}
      labelFor={() => t.estCost}
      colorFor={costColor}
      mode="count"
      yFormatter={formatAxisDollars}
      yLabel={t.yCostUsd}
      xFormatter={xFormatter}
      filename="hourly-cost"
      emptyLabel={t.noData}
    />
  );
}

function SplitBar({ segments }: { segments: { key: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  return (
    <div className="flex h-6 w-full overflow-hidden rounded-sm bg-muted/40">
      {segments.map((seg) =>
        seg.value > 0 ? (
          <div
            key={seg.key}
            className="flex h-full items-center justify-center text-xs font-medium tabular-nums text-white"
            style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }}
          >
            {seg.value / total >= 0.08 ? `${((seg.value / total) * 100).toFixed(0)}%` : ''}
          </div>
        ) : null,
      )}
    </div>
  );
}

function CpuGpuPieChart({
  p50a,
  p50b,
  n,
  title,
  exportFilename = 'p50-cpu-gpu-pie.png',
  aLabel,
  bLabel,
  aStatLabel,
  bStatLabel,
  aColor = CHART_COLORS[4],
  bColor = CHART_COLORS[2],
}: {
  p50a: number;
  p50b: number;
  n: number;
  title?: string;
  exportFilename?: string;
  aLabel?: string;
  bLabel?: string;
  aStatLabel?: string;
  bStatLabel?: string;
  aColor?: string;
  bColor?: string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const resolvedTitle = title ?? t.p50CpuGpuTime;
  const total = p50a + p50b;
  const fileName = exportFilename.replace(/\.png$/u, '');

  return (
    <ExpandableChart
      title={resolvedTitle}
      subtitle={t.nSamples(n.toLocaleString())}
      actions={
        <ChartActions
          fileName={fileName}
          onExportPng={() => track('agentic_workload_export_png', { chart: exportFilename })}
        />
      }
    >
      {total === 0 ? (
        <EmptyState bare className="h-40">
          {t.noData}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <LegendSwatches
            items={[
              { key: 'a', label: aLabel ?? t.cpuTimeBetweenTurns, color: aColor },
              { key: 'b', label: bLabel ?? t.gpuE2eLatency, color: bColor },
            ]}
          />
          <SplitBar
            segments={[
              { key: 'a', value: p50a, color: aColor },
              { key: 'b', value: p50b, color: bColor },
            ]}
          />
          <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border/20 pt-3">
            <Stat size="sm" label={aStatLabel ?? t.p50Cpu} value={`${p50a.toFixed(2)}s`} />
            <Stat size="sm" label={bStatLabel ?? t.p50Gpu} value={`${p50b.toFixed(2)}s`} />
            <Stat size="sm" label={t.total} value={`${total.toFixed(2)}s`} />
          </dl>
        </div>
      )}
    </ExpandableChart>
  );
}

function MaxConcurrentSubagentsChart({ buckets }: { buckets: ConcurrencyBucket[] }) {
  const t = STRINGS[useLocale()];
  const total = buckets.reduce((acc, b) => acc + b.value, 0);
  const max = buckets.reduce((acc, b) => Math.max(acc, b.value), 0);

  return (
    <ExpandableChart
      title={t.maxConcurrentSubagentsPerSession}
      subtitle={`${t.nSamples(total.toLocaleString())} · ${t.gt20ReqsTrace(CURRENT_TRACE_VERSION)}`}
      actions={
        <ChartActions
          fileName="max-concurrent-subagents-pie"
          onExportPng={() =>
            track('agentic_workload_export_png', { chart: 'max-concurrent-subagents-pie' })
          }
        />
      }
    >
      {total === 0 ? (
        <EmptyState bare className="h-40">
          {t.noEligibleSessions}
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          <div className="mb-2 flex items-center gap-3 border-b border-border/30 pb-1.5 text-xs font-medium text-muted-foreground">
            <span className="w-16 shrink-0">{t.peakSubagents}</span>
            <span className="flex-1" />
            <span className="w-16 shrink-0 text-right">{t.sessions}</span>
            <span className="w-14 shrink-0 text-right">{t.share}</span>
          </div>
          {buckets.map((b) => (
            <div
              key={b.label}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 sm:flex"
            >
              <span className="min-w-0 sm:w-16 shrink-0 text-xs tabular-nums text-foreground">
                {b.label}
              </span>
              <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${max > 0 ? (b.value / max) * 100 : 0}%`,
                    minWidth: b.value > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS[0],
                  }}
                />
              </div>
              <span className="sm:w-16 shrink-0 text-right text-xs tabular-nums text-foreground">
                {b.value.toLocaleString()}
              </span>
              <span className="sm:w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {((b.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </ExpandableChart>
  );
}

function rollingWindow(pointCount: number): number {
  if (pointCount >= 144) return 9;
  if (pointCount >= 72) return 7;
  if (pointCount >= 24) return 5;
  return 3;
}

function rollingAverage(values: number[], window: number): number[] {
  if (values.length === 0 || window <= 1) return [...values];
  const half = Math.floor(window / 2);
  const out: number[] = Array.from({ length: values.length });
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length, i + half + 1);
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += values[j];
    out[i] = sum / (hi - lo);
  }
  return out;
}

function formatRpsValue(v: number): string {
  if (v === 0) return '0';
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function RpsTimeseriesChart({
  data,
  range,
  onRangeChange,
  loading,
}: {
  data: RpsData | null;
  range: RpsRangeKey;
  onRangeChange: (range: RpsRangeKey) => void;
  loading: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const xFormatter = useCallback((iso: string) => formatHourLabel(iso, locale), [locale]);
  const bucketMin = data?.bucketMinutes ?? 0;
  const bucketLabel = bucketMin >= 60 ? t.bucketHours(bucketMin / 60) : t.bucketMinutes(bucketMin);

  const summary = useMemo(() => {
    const points = data?.points ?? [];
    const rps = points.map((p) => p.rps);
    const window = rollingWindow(points.length);
    const smoothed = rollingAverage(rps, window);
    const series: LineSeries[] = [
      {
        key: 'rps',
        label: t.rpsBucketLabel(bucketLabel),
        color: CHART_COLORS[0],
        points: points.map((p) => ({ day: p.bucket, value: p.rps })),
      },
      {
        key: 'avg',
        label: t.rollingAvgLegend(window),
        color: CHART_COLORS[1],
        points: points.map((p, i) => ({ day: p.bucket, value: smoothed[i] })),
      },
    ];
    return {
      series,
      totalRequests: points.reduce((acc, p) => acc + p.requestCount, 0),
      meanRps: rps.length > 0 ? rps.reduce((a, b) => a + b, 0) / rps.length : 0,
      peakRps: rps.reduce((a, b) => Math.max(a, b), 0),
    };
  }, [data, t, bucketLabel]);

  if (loading && !data) return <ChartSkeletonCard title={t.requestsPerSecond} />;

  return (
    <TrendsLineChart
      title={t.requestsPerSecond}
      subtext={`${t.rpsWindow[range]} · ${bucketLabel}`}
      series={summary.series}
      yFormatter={formatAxisNumber}
      yLabel={t.yRequestsPerSecond}
      xFormatter={xFormatter}
      showPoints={false}
      filename={`rps-${range}`}
      emptyLabel={t.noData}
      controls={
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <SegmentedToggle
            role="group"
            ariaLabel={t.timeRangeLabel}
            value={range}
            onValueChange={(next) => {
              track('agentic_workload_rps_range_changed', { range: next });
              onRangeChange(next);
            }}
            options={RPS_RANGES.map((r) => ({ value: r.key, label: r.label }))}
          />
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            <Stat size="sm" label={t.meanRps} value={formatRpsValue(summary.meanRps)} />
            <Stat size="sm" label={t.peakRps} value={formatRpsValue(summary.peakRps)} />
            <Stat size="sm" label={t.totalRequests} value={formatNumber(summary.totalRequests)} />
          </dl>
        </div>
      }
    />
  );
}

const WALL_CLOCK_COLORS: Record<string, string> = {
  llm: CHART_COLORS[2],
  tool: CHART_COLORS[4],
  idle: CHART_COLORS[1],
};
const WALL_CLOCK_KEYS = ['llm', 'tool', 'idle'];
const wallClockColor = (key: string) => WALL_CLOCK_COLORS[key];

const WALL_CLOCK_RANGES = [
  { days: 14, label: '14d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;

type WallClockAgent = 'both' | 'claude' | 'codex';

function WallClockStackedBarChart({ data }: { data: WallClockDay[] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [share, setShare] = useState(false);
  const [rangeDays, setRangeDays] = useState<number>(14);
  const [agent, setAgent] = useState<WallClockAgent>('both');

  const days = useMemo(() => {
    const now = snapshotNow();
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startMs = todayMs - (rangeDays - 1) * 86_400_000;
    const byDay = new Map<string, Record<string, number>>();
    for (const row of data) {
      if (agent === 'both' ? row.agent === 'openai' : row.agent !== agent) continue;
      const values = byDay.get(row.day) ?? { llm: 0, tool: 0, idle: 0 };
      values.llm += row.llmMs / 3_600_000;
      values.tool += row.toolMs / 3_600_000;
      values.idle += row.idleMs / 3_600_000;
      byDay.set(row.day, values);
    }
    return Array.from({ length: rangeDays }, (_, i): StackedDayPoint => {
      const day = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
      return { day, values: byDay.get(day) ?? { llm: 0, tool: 0, idle: 0 } };
    });
  }, [agent, data, rangeDays]);

  const labels: Record<string, string> = {
    llm: t.llmGpuLegend,
    tool: t.toolCpuLegend,
    idle: t.userIdleLegend,
  };

  return (
    <TrendsStackedChart
      title={t.wallClockTitle}
      subtext={t.wallClockFinal(rangeDays)}
      days={days}
      seriesKeys={WALL_CLOCK_KEYS}
      labelFor={(key) => labels[key]}
      colorFor={wallClockColor}
      mode={share ? 'share' : 'count'}
      yLabel={share ? t.shareOfWallClock : t.wallClockHoursYAxis}
      yFormatter={(v: number) => `${formatAxisNumber(v)}h`}
      xFormatter={(day: string) => formatDayLabel(day, locale)}
      filename="wall-clock-composition"
      emptyLabel={t.noData}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle
            role="group"
            ariaLabel={t.agentLabel}
            value={agent}
            onValueChange={(next) => {
              track('agentic_workload_wallclock_agent_changed', { agent: next });
              setAgent(next);
            }}
            options={[
              { value: 'both' as const, label: t.agentBoth },
              { value: 'claude' as const, label: 'Claude' },
              { value: 'codex' as const, label: 'Codex' },
            ]}
          />
          <SegmentedToggle
            role="group"
            ariaLabel={t.timeRangeLabel}
            value={String(rangeDays)}
            onValueChange={(next) => {
              const nextDays = Number(next);
              track('agentic_workload_wallclock_range_changed', { days: nextDays });
              setRangeDays(nextDays);
            }}
            options={WALL_CLOCK_RANGES.map((range) => ({
              value: String(range.days),
              label: range.label,
            }))}
          />
          <SegmentedToggle
            role="group"
            ariaLabel={`${t.modeHours} / ${t.modeShare}`}
            value={share ? 'share' : 'hours'}
            onValueChange={(next) => {
              track('agentic_workload_wallclock_mode_changed', { mode: next });
              setShare(next === 'share');
            }}
            options={[
              { value: 'hours', label: t.modeHours },
              { value: 'share', label: t.modeShare },
            ]}
          />
        </div>
      }
    />
  );
}

interface RequestStatsPayload {
  islTotal: GraphHistogram;
  cacheRead: GraphHistogram;
  cacheWrite: GraphHistogram;
  output: GraphHistogram;
  gap: GraphHistogram;
  cpuGpuRatio: GraphHistogram;
  reqRatio: GraphHistogram;
  readWriteRatio: GraphHistogram;
  cpuGpuPie: GraphPie;
}
interface WallClockPayload {
  userIdle: GraphHistogram;
  walkedAway: number;
  daily: WallClockDay[];
}
interface SessionAggregatesPayload {
  sessRatio: GraphHistogram;
  turns: GraphHistogram;
}
interface TpotPayload {
  tpot: GraphHistogram;
  interactivity: GraphHistogram;
}
interface PrefillDecodePayload {
  prefillShare: GraphHistogram;
  prefillDecodePie: GraphPie;
}
interface SubagentPayload {
  subagentCount: GraphHistogram;
  maxConcurrent: GraphHistogram;
  concurrencyPie: ConcurrencyBucket[];
}

interface HistogramSpec {
  key: string;
  title: string;
  axisLabel: string;
  format?: (v: number) => string;
  perSession?: boolean;
  exportFilename?: string;
  datasetKey: string;
  select: (payload: unknown) => GraphHistogram;
}

function HistogramChartCard({ spec, ctx }: { spec: HistogramSpec; ctx: GraphDatasetContext }) {
  const t = STRINGS[useLocale()];
  const { ref, data, loading, error } = useGraphDataset<unknown>(spec.datasetKey, ctx);
  if (loading || (!data && !error)) {
    return (
      <div ref={ref}>
        <ChartSkeletonCard title={spec.title} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div ref={ref}>
        <ChartErrorCard title={spec.title} />
      </div>
    );
  }
  const hist = spec.select(data);
  if (hist.n === 0) {
    return (
      <div ref={ref}>
        <EmptyDataCard title={spec.title} />
      </div>
    );
  }
  const fileName = (spec.exportFilename ?? `${spec.key}-distribution`).replace(/\.png$/u, '');
  return (
    <div ref={ref}>
      <ExpandableChart
        title={spec.title}
        subtitle={`${t.nSamples(hist.n.toLocaleString())} · ${t.bins(hist.buckets.length)}`}
        actions={
          <ChartActions
            fileName={fileName}
            onExportPng={() => track('agentic_workload_export_png', { chart: fileName })}
          />
        }
      >
        {(expanded) => (
          <DistributionHistogram
            buckets={hist.buckets}
            percentiles={hist.percentiles}
            format={spec.format ?? formatAxisNumber}
            axisLabel={spec.axisLabel}
            total={hist.n}
            expanded={expanded}
            color={CHART_COLORS[0]}
            countLabel={
              spec.perSession
                ? { one: t.sessionOne, other: t.sessionOther }
                : { one: t.requestOne, other: t.requestOther }
            }
          />
        )}
      </ExpandableChart>
    </div>
  );
}

export default function GraphsPage() {
  return (
    <Suspense>
      <GraphsPageContent />
    </Suspense>
  );
}

function GraphsPageContent() {
  const t = STRINGS[useLocale()];
  const { models, selectedModel, setSelectedModel, buildUrl } = useModelFilter();
  const { apiParam: traceVersionParam } = useTraceVersion();
  const [rpsRange, setRpsRange] = useState<RpsRangeKey>('24h');

  const ctx = useMemo<GraphDatasetContext>(
    () => ({
      baseUrl: buildUrl('/api/v1/agentic-workload-explorer/graphs'),
      traceVersionParam,
    }),
    [buildUrl, traceVersionParam],
  );

  const { data: rpsData, loading: rpsLoading } = useDashboardData<RpsData>({
    fetcher: async (signal) => {
      const url = appendTraceVersion(
        buildUrl(`/api/v1/agentic-workload-explorer/rps?range=${rpsRange}`),
        traceVersionParam,
      );
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: `${selectedModel ?? ''}-${traceVersionParam}-${rpsRange}`,
  });

  const charts: HistogramSpec[] = [
    {
      key: 'islTotal',
      title: t.islTotalDist,
      axisLabel: t.islTotalAxis,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).islTotal,
    },
    {
      key: 'cacheRead',
      title: t.cacheReadDist,
      axisLabel: t.cacheReadAxis,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).cacheRead,
    },
    {
      key: 'cacheWrite',
      title: t.cacheWriteDist,
      axisLabel: t.cacheWriteAxis,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).cacheWrite,
    },
    {
      key: 'output',
      title: t.outputDist,
      axisLabel: t.outputAxis,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).output,
    },
    {
      key: 'gap',
      title: t.timeBetweenTurns,
      axisLabel: t.seconds,
      format: (v) => `${v.toFixed(1)}s`,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).gap,
    },
    {
      key: 'userIdle',
      title: t.userIdleTimeBetweenTurns(Math.round(IDLE_GAP_CUTOFF_MS / 60_000)),
      axisLabel: t.userIdleAxis,
      format: (v) => `${v.toFixed(1)}s`,
      datasetKey: 'wallClock',
      select: (d) => (d as WallClockPayload).userIdle,
    },
    {
      key: 'cpuGpuRatio',
      title: t.cpuGpuRatioTitle,
      axisLabel: t.cpuGpuRatioAxis,
      format: (v) => `${v.toFixed(2)}x`,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).cpuGpuRatio,
    },
    {
      key: 'reqRatio',
      title: t.cacheReadOutputRatioReq,
      axisLabel: t.ratioAxis,
      format: (v) => `${v.toFixed(1)}x`,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).reqRatio,
    },
    {
      key: 'readWriteRatio',
      title: t.cacheReadWriteRatio,
      axisLabel: t.ratioAxis,
      format: (v) => `${v.toFixed(1)}x`,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).readWriteRatio,
    },
    {
      key: 'sessRatio',
      perSession: true,
      title: t.cacheReadOutputRatioSess,
      axisLabel: t.ratioAxis,
      format: (v) => `${v.toFixed(1)}x`,
      datasetKey: 'sessionAggregates',
      select: (d) => (d as SessionAggregatesPayload).sessRatio,
    },
    {
      key: 'turns',
      perSession: true,
      title: t.turnsPerSession,
      axisLabel: t.turnsAxis,
      format: (v) => String(Math.round(v)),
      datasetKey: 'sessionAggregates',
      select: (d) => (d as SessionAggregatesPayload).turns,
    },
    {
      key: 'ttft',
      title: t.ttftDist,
      axisLabel: t.ttftAxis,
      format: formatDuration,
      datasetKey: 'ttftValues',
      select: (d) => d as GraphHistogram,
    },
    {
      key: 'tpot',
      title: t.tpotDist,
      axisLabel: t.tpotAxis,
      format: (v) => `${v.toFixed(1)}ms/tok`,
      datasetKey: 'tpotValues',
      select: (d) => (d as TpotPayload).tpot,
    },
    {
      key: 'prefill-speed',
      title: t.prefillSpeedDist,
      axisLabel: t.prefillSpeedAxis,
      format: formatPrefillSpeed,
      datasetKey: 'prefillSpeedValues',
      select: (d) => d as GraphHistogram,
    },
    {
      key: 'tokens-per-chunk',
      title: t.tokensPerChunkDist,
      axisLabel: t.tokensPerChunkAxis,
      format: (v) => `${v.toFixed(2)} tok/chunk`,
      datasetKey: 'tokensPerChunkValues',
      select: (d) => d as GraphHistogram,
    },
    {
      key: 'prefill-share',
      title: t.prefillShareTitle,
      axisLabel: t.prefillShareAxis,
      format: (v) => `${(v * 100).toFixed(1)}%`,
      datasetKey: 'prefillDecodeValues',
      select: (d) => (d as PrefillDecodePayload).prefillShare,
    },
    {
      key: 'interactivity',
      title: t.interactivityDist,
      axisLabel: t.interactivityAxis,
      format: (v) => `${v.toFixed(1)} tok/s`,
      datasetKey: 'tpotValues',
      select: (d) => (d as TpotPayload).interactivity,
    },
    {
      key: 'session-duration',
      perSession: true,
      title: t.sessionDurationTitle(CURRENT_TRACE_VERSION),
      axisLabel: t.sessionDurationAxis,
      format: (v) => `${v.toFixed(2)}h`,
      datasetKey: 'sessionDurationValues',
      select: (d) => d as GraphHistogram,
    },
    {
      key: 'subagent-count',
      perSession: true,
      title: t.subagentCountTitle(SUBAGENT_STATS_WINDOW_DAYS, CURRENT_TRACE_VERSION),
      axisLabel: t.subagentCountAxis,
      format: (v) => String(Math.round(v)),
      datasetKey: 'subagentStatsPerSession',
      select: (d) => (d as SubagentPayload).subagentCount,
    },
    {
      key: 'max-concurrent-subagents',
      perSession: true,
      title: t.maxConcurrentHistTitle(SUBAGENT_STATS_WINDOW_DAYS, CURRENT_TRACE_VERSION),
      axisLabel: t.maxConcurrentAxis,
      format: (v) => String(Math.round(v)),
      datasetKey: 'subagentStatsPerSession',
      select: (d) => (d as SubagentPayload).maxConcurrent,
    },
  ];

  return (
    <div className="space-y-5">
      {models.length > 0 && (
        <div className="flex items-center gap-2">
          <ModelFilter
            models={models}
            selectedModel={selectedModel}
            onModelChange={(model) => {
              track('agentic_workload_model_changed', { model });
              setSelectedModel(model);
            }}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t.traffic}</span>
        <span className="flex-1 h-px bg-border/30" />
      </div>
      <RpsTimeseriesChart
        data={rpsData}
        range={rpsRange}
        onRangeChange={setRpsRange}
        loading={rpsLoading}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t.hourlyActivity}</span>
        <span className="flex-1 h-px bg-border/30" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LazyDatasetCard<
          {
            hour: string;
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            requestCount: number;
            cost: number;
          }[]
        >
          datasetKey="hourlyTokens"
          ctx={ctx}
          title={t.tokenVolumePerHour}
          render={(hourly) =>
            hourly.length > 0 ? (
              <HourlyTokenChart data={hourly as unknown as HourlyToken[]} />
            ) : (
              <EmptyDataCard title={t.tokenVolumePerHour} />
            )
          }
        />
        <LazyDatasetCard<
          {
            hour: string;
            input: number;
            output: number;
            cacheRead: number;
            cacheWrite: number;
            requestCount: number;
            cost: number;
          }[]
        >
          datasetKey="hourlyTokens"
          ctx={ctx}
          title={t.costPerHour}
          render={(hourly) =>
            hourly.length > 0 ? (
              <HourlyCostChart data={hourly as unknown as HourlyToken[]} />
            ) : (
              <EmptyDataCard title={t.costPerHour} />
            )
          }
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t.weeklySessions}</span>
        <span className="flex-1 h-px bg-border/30" />
      </div>
      <div className="grid grid-cols-1 gap-4">
        <LazyDatasetCard<WeeklySessionRow[]>
          datasetKey="weeklySessionsByHarness"
          ctx={ctx}
          title={t.weeklySessionsByHarness}
          render={(rows) => <WeeklySessionsByHarnessChart data={pivotWeeklySessions(rows)} />}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t.wallClock}</span>
        <span className="flex-1 h-px bg-border/30" />
      </div>
      <div className="grid grid-cols-1 gap-4">
        <LazyDatasetCard<WallClockPayload>
          datasetKey="wallClock"
          ctx={ctx}
          title={t.wallClockTitle}
          render={(d) =>
            d.daily.length > 0 ? (
              <WallClockStackedBarChart data={d.daily} />
            ) : (
              <EmptyDataCard title={t.wallClockTitle} />
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LazyDatasetCard<RequestStatsPayload>
          datasetKey="requestStats"
          ctx={ctx}
          title={t.p50CpuGpuTime}
          render={(d) => {
            const pie = d.cpuGpuPie;
            if (pie.n === 0) return <EmptyDataCard title={t.p50CpuGpuTime} />;
            return <CpuGpuPieChart p50a={pie.p50a} p50b={pie.p50b} n={pie.n} />;
          }}
        />
        <LazyDatasetCard<SubagentPayload>
          datasetKey="subagentStatsPerSession"
          ctx={ctx}
          title={t.maxConcSubLazy(SUBAGENT_STATS_WINDOW_DAYS)}
          render={(d) => <MaxConcurrentSubagentsChart buckets={d.concurrencyPie} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LazyDatasetCard<PrefillDecodePayload>
          datasetKey="prefillDecodeValues"
          ctx={ctx}
          title={t.p50PrefillDecodeTime}
          render={(d) => {
            const pie = d.prefillDecodePie;
            if (pie.n === 0) return <EmptyDataCard title={t.p50PrefillDecodeTime} />;
            return (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.p50PrefillDecodeTime}
                exportFilename="p50-prefill-decode-pie.png"
                aLabel={t.prefillTtft}
                bLabel={t.decodeE2eMinusTtft}
                aStatLabel={t.p50Prefill}
                bStatLabel={t.p50Decode}
                aColor={CHART_COLORS[1]}
                bColor={CHART_COLORS[0]}
              />
            );
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LazyDatasetCard<GraphPie>
          datasetKey="cpuGpuOpus47Fast"
          ctx={ctx}
          title={t.cpuGpuOpus47Fast}
          render={(pie) =>
            pie.n === 0 ? (
              <EmptyDataCard title={t.cpuGpuOpus47Fast} />
            ) : (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.cpuGpuOpus47Fast}
                exportFilename="p50-cpu-gpu-opus47-fast.png"
              />
            )
          }
        />
        <LazyDatasetCard<GraphPie>
          datasetKey="cpuGpuOpus47NonFast"
          ctx={ctx}
          title={t.cpuGpuOpus47NonFast}
          render={(pie) =>
            pie.n === 0 ? (
              <EmptyDataCard title={t.cpuGpuOpus47NonFast} />
            ) : (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.cpuGpuOpus47NonFast}
                exportFilename="p50-cpu-gpu-opus47-nonfast.png"
              />
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LazyDatasetCard<GraphPie>
          datasetKey="prefillDecodeOpus47Fast"
          ctx={ctx}
          title={t.prefillDecodeOpus47Fast}
          render={(pie) =>
            pie.n === 0 ? (
              <EmptyDataCard title={t.prefillDecodeOpus47Fast} />
            ) : (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.prefillDecodeOpus47Fast}
                exportFilename="p50-prefill-decode-opus47-fast.png"
                aLabel={t.prefillTtft}
                bLabel={t.decodeE2eMinusTtft}
                aStatLabel={t.p50Prefill}
                bStatLabel={t.p50Decode}
                aColor={CHART_COLORS[1]}
                bColor={CHART_COLORS[0]}
              />
            )
          }
        />
        <LazyDatasetCard<GraphPie>
          datasetKey="prefillDecodeOpus47NonFast"
          ctx={ctx}
          title={t.prefillDecodeOpus47NonFast}
          render={(pie) =>
            pie.n === 0 ? (
              <EmptyDataCard title={t.prefillDecodeOpus47NonFast} />
            ) : (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.prefillDecodeOpus47NonFast}
                exportFilename="p50-prefill-decode-opus47-nonfast.png"
                aLabel={t.prefillTtft}
                bLabel={t.decodeE2eMinusTtft}
                aStatLabel={t.p50Prefill}
                bStatLabel={t.p50Decode}
                aColor={CHART_COLORS[1]}
                bColor={CHART_COLORS[0]}
              />
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LazyDatasetCard<GraphPie>
          datasetKey="cpuGpuOpus48Fast"
          ctx={ctx}
          title={t.cpuGpuOpus48Fast}
          render={(pie) =>
            pie.n === 0 ? (
              <EmptyDataCard title={t.cpuGpuOpus48Fast} />
            ) : (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.cpuGpuOpus48Fast}
                exportFilename="p50-cpu-gpu-opus48-fast.png"
              />
            )
          }
        />
        <LazyDatasetCard<GraphPie>
          datasetKey="cpuGpuOpus48NonFast"
          ctx={ctx}
          title={t.cpuGpuOpus48NonFast}
          render={(pie) =>
            pie.n === 0 ? (
              <EmptyDataCard title={t.cpuGpuOpus48NonFast} />
            ) : (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.cpuGpuOpus48NonFast}
                exportFilename="p50-cpu-gpu-opus48-nonfast.png"
              />
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LazyDatasetCard<GraphPie>
          datasetKey="prefillDecodeOpus48Fast"
          ctx={ctx}
          title={t.prefillDecodeOpus48Fast}
          render={(pie) =>
            pie.n === 0 ? (
              <EmptyDataCard title={t.prefillDecodeOpus48Fast} />
            ) : (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.prefillDecodeOpus48Fast}
                exportFilename="p50-prefill-decode-opus48-fast.png"
                aLabel={t.prefillTtft}
                bLabel={t.decodeE2eMinusTtft}
                aStatLabel={t.p50Prefill}
                bStatLabel={t.p50Decode}
                aColor={CHART_COLORS[1]}
                bColor={CHART_COLORS[0]}
              />
            )
          }
        />
        <LazyDatasetCard<GraphPie>
          datasetKey="prefillDecodeOpus48NonFast"
          ctx={ctx}
          title={t.prefillDecodeOpus48NonFast}
          render={(pie) =>
            pie.n === 0 ? (
              <EmptyDataCard title={t.prefillDecodeOpus48NonFast} />
            ) : (
              <CpuGpuPieChart
                p50a={pie.p50a}
                p50b={pie.p50b}
                n={pie.n}
                title={t.prefillDecodeOpus48NonFast}
                exportFilename="p50-prefill-decode-opus48-nonfast.png"
                aLabel={t.prefillTtft}
                bLabel={t.decodeE2eMinusTtft}
                aStatLabel={t.p50Prefill}
                bStatLabel={t.p50Decode}
                aColor={CHART_COLORS[1]}
                bColor={CHART_COLORS[0]}
              />
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {charts.map((spec) => (
          <HistogramChartCard key={spec.key} spec={spec} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}
