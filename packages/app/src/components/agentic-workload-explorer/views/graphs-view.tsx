'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ExpandableChart } from '@/components/agentic-workload-explorer/expandable-chart';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { useModelFilter } from '@/hooks/agentic-workload-explorer/use-model-filter';
import { ModelFilter } from '@/components/agentic-workload-explorer/model-filter';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import {
  HARNESS_LABELS,
  HARNESSES,
  type Harness,
} from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { CURRENT_TRACE_VERSION } from '@semianalysisai/inferencex-db/proxytrace/shared/trace';
import { SUBAGENT_STATS_WINDOW_DAYS } from '@semianalysisai/inferencex-db/proxytrace/shared/subagent';
import { IDLE_GAP_CUTOFF_MS } from '@semianalysisai/inferencex-db/proxytrace/shared/wall-clock';
import { snapshotNow } from '@/lib/agentic-workload-explorer/snapshot';

// ── i18n ─────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    loading: 'Loading…',
    failedToLoad: 'Failed to load',
    noData: 'No data available',
    requests: 'Requests',
    tokens: 'Tokens',
    sessions: 'Sessions',
    usd: 'USD',
    total: 'Total',
    // Hourly token chart
    tokenVolumePerHour: 'Token Volume per Hour',
    final48h: '(final 48h)',
    hourlyTokenVolume: 'Hourly Token Volume',
    input: 'Input',
    cacheRead: 'Cache Read',
    cacheWrite: 'Cache Write',
    output: 'Output',
    // Weekly sessions
    weeklySessionsByHarness: 'Weekly Sessions by Harness',
    noSessionsInSnapshot: (v: number) =>
      `No sessions with > 20 requests at trace v${v} in this snapshot`,
    weekOf: (label: string) => `Week of ${label}`,
    // Hourly cost
    estimatedCostPerHour: 'Estimated Cost per Hour',
    hourlyCost: 'Hourly Cost',
    estCost: 'Est. Cost',
    // CPU vs GPU pie
    p50CpuGpuTime: 'P50 CPU vs GPU Time',
    cpuTimeBetweenTurns: 'CPU (time between turns)',
    gpuE2eLatency: 'GPU (E2E latency)',
    p50Cpu: 'P50 CPU',
    p50Gpu: 'P50 GPU',
    // Max concurrent subagents
    maxConcurrentSubagentsPerSession: 'Max Concurrent Subagents per Session',
    noEligibleSessions: 'No eligible sessions in this snapshot',
    // RPS
    requestsPerSecond: 'Requests per Second',
    finalOfSnapshot: (label: string) => `(final ${label} of snapshot)`,
    requestsPerSecondYAxis: 'Requests / second',
    rpsBucketLabel: (label: string) => `RPS (${label})`,
    rollingAvg: 'Rolling avg',
    rollingAvgLegend: (window: number) => `Rolling avg (window=${window})`,
    meanRps: 'Mean RPS',
    peakRps: 'Peak RPS',
    totalRequests: 'Total Requests',
    bucketMinutes: (min: number) => `${min}m buckets`,
    bucketHours: (h: number) => `${h}h buckets`,
    // Wall clock
    wallClockTitle: 'Wall Clock: Tool/CPU vs LLM/GPU vs Idle',
    wallClockFinal: (days: number) => `(final ${days}d, UTC)`,
    wallClockComposition: 'Wall Clock Composition',
    shareOfWallClock: 'Share of Wall Clock',
    wallClockHoursYAxis: 'Wall Clock Hours',
    llmGpuLegend: 'LLM / GPU (E2E latency)',
    toolCpuLegend: 'Tool / CPU (client-side)',
    userIdleLegend: 'User idle (between turns)',
    agentBoth: 'Both',
    modeHours: 'Hours',
    modeShare: 'Share',
    // Section headers
    traffic: 'Traffic',
    hourlyActivity: 'Hourly Activity',
    weeklySessions: 'Weekly Sessions',
    wallClock: 'Wall Clock',
    // Histogram titles and axis labels
    islTotalDist: 'ISL Total Distribution',
    islTotalAxis: 'ISL Total Tokens (Cache Read + Cache Write + Input)',
    cacheReadDist: 'Cache Read Distribution',
    cacheReadAxis: 'Cache Read Tokens',
    cacheWriteDist: 'Cache Write Distribution',
    cacheWriteAxis: 'Cache Write Tokens',
    outputDist: 'Output Distribution',
    outputAxis: 'Output Tokens',
    timeBetweenTurns: 'Time Between Turns',
    seconds: 'Seconds',
    userIdleTimeBetweenTurns: (min: number) => `User Idle Time Between Turns (< ${min} min)`,
    userIdleAxis: 'User Idle (seconds)',
    cpuGpuRatioTitle: 'CPU Tool-Use Time : GPU Time Ratio',
    cpuGpuRatioAxis: 'Ratio (time between turns / E2E latency)',
    cacheReadOutputRatioReq: 'Cache Read : Output Ratio (per request)',
    ratioAxis: 'Ratio',
    cacheReadWriteRatio: 'Cache Read : Write Ratio (per request)',
    cacheReadOutputRatioSess: 'Cache Read : Output Ratio (per session)',
    turnsPerSession: 'Turns per Session',
    turnsAxis: 'Turns',
    ttftDist: 'TTFT Distribution',
    ttftAxis: 'Time to First Token',
    tpotDist: 'TPOT Distribution',
    tpotAxis: 'Time per Output Token',
    prefillSpeedDist: 'Prefill Speed Distribution',
    prefillSpeedAxis: 'Prefill Speed (input tok/s/query)',
    tokensPerChunkDist: 'Tokens per SSE Chunk Distribution',
    tokensPerChunkAxis: 'Output Tokens / SSE Event (tok/chunk)',
    prefillShareTitle: 'Prefill Share of E2E Latency (TTFT / E2E)',
    prefillShareAxis: 'TTFT / E2E (% of latency spent in prefill)',
    interactivityDist: 'Interactivity Distribution',
    interactivityAxis: 'Interactivity (output tok/s/user)',
    sessionDurationTitle: (v: number) => `Session Duration (> 20 reqs, trace v${v})`,
    sessionDurationAxis: 'Session Duration (hours)',
    subagentCountTitle: (days: number, v: number) =>
      `Subagents per Session — Final ${days}d (> 20 reqs, trace v${v})`,
    subagentCountAxis: 'Subagents per Session',
    maxConcurrentHistTitle: (days: number, v: number) =>
      `Max Concurrent Subagents per Session — Final ${days}d (> 20 reqs, trace v${v})`,
    maxConcurrentAxis: 'Peak Concurrent Subagents',
    bins: (n: number) => `${n} bins`,
    // CpuGpuPie variant labels
    p50PrefillDecodeTime: 'P50 Prefill vs Decode Time',
    prefillTtft: 'Prefill (TTFT)',
    decodeE2eMinusTtft: 'Decode (E2E − TTFT)',
    p50Prefill: 'P50 Prefill',
    p50Decode: 'P50 Decode',
    // Model-specific titles
    cpuGpuOpus47Fast: 'P50 CPU vs GPU Time — Opus 4.7 (fast mode)',
    cpuGpuOpus47NonFast: 'P50 CPU vs GPU Time — Opus 4.7 (non-fast)',
    cpuGpuOpus48Fast: 'P50 CPU vs GPU Time — Opus 4.8 (fast mode)',
    cpuGpuOpus48NonFast: 'P50 CPU vs GPU Time — Opus 4.8 (non-fast)',
    prefillDecodeOpus47Fast: 'P50 Prefill vs Decode Time — Opus 4.7 (fast mode)',
    prefillDecodeOpus47NonFast: 'P50 Prefill vs Decode Time — Opus 4.7 (non-fast)',
    prefillDecodeOpus48Fast: 'P50 Prefill vs Decode Time — Opus 4.8 (fast mode)',
    prefillDecodeOpus48NonFast: 'P50 Prefill vs Decode Time — Opus 4.8 (non-fast)',
    maxConcSubLazy: (days: number) => `Max Concurrent Subagents per Session — Final ${days}d`,
    costPerHour: 'Cost per Hour',
    gt20ReqsTrace: (v: number) => `(> 20 reqs, trace v${v})`,
  },
  zh: {
    loading: '加载中…',
    failedToLoad: '加载失败',
    noData: '暂无数据',
    requests: '请求数',
    tokens: 'Token 数',
    sessions: '会话数',
    usd: 'USD',
    total: '合计',
    tokenVolumePerHour: '每小时 Token 用量',
    final48h: '（最后 48 小时）',
    hourlyTokenVolume: '每小时 Token 用量',
    input: '输入',
    cacheRead: '缓存读取',
    cacheWrite: '缓存写入',
    output: '输出',
    weeklySessionsByHarness: '每周会话数（按 Harness）',
    noSessionsInSnapshot: (v: number) => `当前快照中无超过 20 次请求且 trace v${v} 的会话`,
    weekOf: (label: string) => `${label} 当周`,
    estimatedCostPerHour: '每小时预估成本',
    hourlyCost: '每小时成本',
    estCost: '预估成本',
    p50CpuGpuTime: 'P50 CPU vs GPU 耗时',
    cpuTimeBetweenTurns: 'CPU（对话间隔）',
    gpuE2eLatency: 'GPU（E2E 延迟）',
    p50Cpu: 'P50 CPU',
    p50Gpu: 'P50 GPU',
    maxConcurrentSubagentsPerSession: '每会话最大并发 Subagent 数',
    noEligibleSessions: '当前快照中无符合条件的会话',
    requestsPerSecond: '每秒请求数',
    finalOfSnapshot: (label: string) => `（快照最后 ${label}）`,
    requestsPerSecondYAxis: '请求数 / 秒',
    rpsBucketLabel: (label: string) => `RPS（${label}）`,
    rollingAvg: '滑动平均',
    rollingAvgLegend: (window: number) => `滑动平均（窗口=${window}）`,
    meanRps: '平均 RPS',
    peakRps: '峰值 RPS',
    totalRequests: '总请求数',
    bucketMinutes: (min: number) => `${min} 分钟分桶`,
    bucketHours: (h: number) => `${h} 小时分桶`,
    wallClockTitle: '时钟时间：Tool/CPU vs LLM/GPU vs 空闲',
    wallClockFinal: (days: number) => `（最后 ${days} 天，UTC）`,
    wallClockComposition: '时钟时间构成',
    shareOfWallClock: '时钟时间占比',
    wallClockHoursYAxis: '时钟时间（小时）',
    llmGpuLegend: 'LLM / GPU（E2E 延迟）',
    toolCpuLegend: 'Tool / CPU（客户端）',
    userIdleLegend: '用户空闲（对话间隔）',
    agentBoth: '全部',
    modeHours: '小时',
    modeShare: '占比',
    traffic: '流量',
    hourlyActivity: '每小时活跃度',
    weeklySessions: '每周会话',
    wallClock: '时钟时间',
    islTotalDist: 'ISL Total 分布',
    islTotalAxis: 'ISL 总 Token（Cache Read + Cache Write + Input）',
    cacheReadDist: 'Cache Read 分布',
    cacheReadAxis: 'Cache Read Token 数',
    cacheWriteDist: 'Cache Write 分布',
    cacheWriteAxis: 'Cache Write Token 数',
    outputDist: '输出分布',
    outputAxis: '输出 Token 数',
    timeBetweenTurns: '对话间隔时间',
    seconds: '秒',
    userIdleTimeBetweenTurns: (min: number) => `用户空闲时间（< ${min} 分钟）`,
    userIdleAxis: '用户空闲（秒）',
    cpuGpuRatioTitle: 'CPU 工具调用时间 : GPU 时间比值',
    cpuGpuRatioAxis: '比值（对话间隔 / E2E 延迟）',
    cacheReadOutputRatioReq: 'Cache Read : Output 比（按请求）',
    ratioAxis: '比值',
    cacheReadWriteRatio: 'Cache Read : Write 比（按请求）',
    cacheReadOutputRatioSess: 'Cache Read : Output 比（按会话）',
    turnsPerSession: '每会话对话轮数',
    turnsAxis: '轮数',
    ttftDist: 'TTFT 分布',
    ttftAxis: 'Time to First Token',
    tpotDist: 'TPOT 分布',
    tpotAxis: 'Time per Output Token',
    prefillSpeedDist: 'Prefill 速度分布',
    prefillSpeedAxis: 'Prefill 速度（input tok/s/query）',
    tokensPerChunkDist: '每 SSE Chunk Token 数分布',
    tokensPerChunkAxis: '输出 Token / SSE Event（tok/chunk）',
    prefillShareTitle: 'Prefill 占 E2E 延迟比例（TTFT / E2E）',
    prefillShareAxis: 'TTFT / E2E（prefill 占延迟比例）',
    interactivityDist: 'Interactivity 分布',
    interactivityAxis: 'Interactivity（output tok/s/user）',
    sessionDurationTitle: (v: number) => `会话时长（> 20 次请求，trace v${v}）`,
    sessionDurationAxis: '会话时长（小时）',
    subagentCountTitle: (days: number, v: number) =>
      `每会话 Subagent 数 — 最后 ${days} 天（> 20 次请求，trace v${v}）`,
    subagentCountAxis: '每会话 Subagent 数',
    maxConcurrentHistTitle: (days: number, v: number) =>
      `每会话最大并发 Subagent 数 — 最后 ${days} 天（> 20 次请求，trace v${v}）`,
    maxConcurrentAxis: '峰值并发 Subagent 数',
    bins: (n: number) => `${n} 个分箱`,
    p50PrefillDecodeTime: 'P50 Prefill vs Decode 耗时',
    prefillTtft: 'Prefill (TTFT)',
    decodeE2eMinusTtft: 'Decode (E2E − TTFT)',
    p50Prefill: 'P50 Prefill',
    p50Decode: 'P50 Decode',
    cpuGpuOpus47Fast: 'P50 CPU vs GPU 耗时 — Opus 4.7（fast mode）',
    cpuGpuOpus47NonFast: 'P50 CPU vs GPU 耗时 — Opus 4.7（non-fast）',
    cpuGpuOpus48Fast: 'P50 CPU vs GPU 耗时 — Opus 4.8（fast mode）',
    cpuGpuOpus48NonFast: 'P50 CPU vs GPU 耗时 — Opus 4.8（non-fast）',
    prefillDecodeOpus47Fast: 'P50 Prefill vs Decode 耗时 — Opus 4.7（fast mode）',
    prefillDecodeOpus47NonFast: 'P50 Prefill vs Decode 耗时 — Opus 4.7（non-fast）',
    prefillDecodeOpus48Fast: 'P50 Prefill vs Decode 耗时 — Opus 4.8（fast mode）',
    prefillDecodeOpus48NonFast: 'P50 Prefill vs Decode 耗时 — Opus 4.8（non-fast）',
    maxConcSubLazy: (days: number) => `每会话最大并发 Subagent 数 — 最后 ${days} 天`,
    costPerHour: '每小时成本',
    gt20ReqsTrace: (v: number) => `（> 20 次请求，trace v${v}）`,
  },
};

// ── Lazy chart card scaffolding ───────────────────────────────────
//
// Each chart on the page is wrapped in a card that lazily fetches its own
// dataset via `useGraphDataset`. The hook's ref is attached to the card's
// outer div, so the dataset fetch only fires when the card scrolls within
// ~300px of the viewport. Multiple cards requesting the same dataset
// (e.g. all the `requestStats`-derived histograms) dedupe through the
// hook's module-level cache, so the first visible card triggers and the
// rest piggyback.

function ChartSkeletonCard({ title }: { title?: string }) {
  const t = STRINGS[useLocale()];
  return (
    <Card>
      <CardHeader className="pb-2">
        {title ? (
          <CardTitle className="text-sm">{title}</CardTitle>
        ) : (
          <Skeleton className="h-4 w-32" />
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center gap-2 h-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-3xs font-mono uppercase tracking-eyebrow-wide text-muted-foreground">
            {t.loading}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartErrorCard({ title }: { title?: string }) {
  const t = STRINGS[useLocale()];
  return (
    <Card>
      <CardHeader className="pb-2">
        {title && <CardTitle className="text-sm">{title}</CardTitle>}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          {t.failedToLoad}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyDataCard({ title }: { title: string }) {
  const t = STRINGS[useLocale()];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          {t.noData}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Generic wrapper that takes a dataset key + a render function. The render
 * function only runs once the dataset has resolved. While loading or before
 * the card has scrolled into view, a skeleton is rendered.
 */
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

type WeeklySessionPoint = { week: string; total: number } & Record<Harness, number>;

// One UTC day of wall-clock time split three ways (camelCased by jsonCamel
// from getWallClockBreakdown's snake_case row).
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

/** A percentile card value, precomputed server-side. */
interface Percentile {
  label: string;
  value: number;
}

/** Pre-binned histogram payload from /api/graphs (see packages/db/src/stats.ts).
 *  `n` is values.length on the server — the count the title displays. */
interface GraphHistogram {
  buckets: Bucket[];
  percentiles: Percentile[];
  n: number;
}

/** Pre-computed p50 pie payload (p50 of each series, in seconds) + n. */
interface GraphPie {
  p50a: number;
  p50b: number;
  n: number;
}

/** One labeled concurrency bucket count (color re-attached client-side). */
interface ConcurrencyBucket {
  label: string;
  value: number;
}

// ── Nice tick generation ──────────────────────────────────────────

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

function formatAxisValue(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  if (Number.isInteger(v)) return String(v);
  if (v < 1) return v.toFixed(2);
  return v.toFixed(1);
}

// ── SVG Histogram Component ───────────────────────────────────────

const CHART_WIDTH = 520;
const CHART_HEIGHT = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

function Histogram({
  buckets,
  color,
  percentiles,
  axisLabel,
  format,
  tickFormat,
  tailDirection = 'high',
  title,
  exportFilename,
}: {
  buckets: Bucket[];
  color: string;
  /** Percentile cards, precomputed server-side (label + value, already transformed). */
  percentiles: Percentile[];
  axisLabel: string;
  /** Display format for percentile cards (with unit, e.g. "5.13 tok/chunk"). */
  format?: (v: number) => string;
  /** Display format for x-axis tick labels (plain number; unit lives in axisLabel). */
  tickFormat?: (v: number) => string;
  /**
   * Which tail of the distribution is "the bad one". For latency-style
   * metrics (lower = better) the slow tail lives at the high percentiles, so
   * p99 is the bad tail — the default. For throughput-style metrics
   * (higher = better, e.g. prefill speed, interactivity) the slow tail lives
   * at the *low* percentiles (p1), so the coloring flips. Only affects the
   * percentile-line coloring here; the percentile SET is chosen server-side.
   */
  tailDirection?: 'high' | 'low';
  title?: string;
  exportFilename?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const locale = useLocale();
  const t = STRINGS[locale];

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const xMin = buckets[0].min;
  const xMax = buckets.at(-1)!.max;

  // Y-axis ticks
  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount;

  // X-axis ticks (sparse, nice round numbers)
  const xTicks = generateTicks(xMin, xMax, 10);
  const fmt = format || formatAxisValue;
  const tickFmt = tickFormat || formatAxisValue;

  // Scale functions
  const sx = (v: number) => MARGIN.left + ((v - xMin) / (xMax - xMin || 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  return (
    <div>
      {title && (
        <div className="flex justify-end mb-1">
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current) {
                exportSvgToPng(svgRef.current, {
                  title,
                  filename: exportFilename || 'histogram.png',
                  svgWidth: CHART_WIDTH,
                  svgHeight: CHART_HEIGHT,
                });
              }
            }}
          />
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        style={{ maxHeight: 220 }}
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((tv) => (
          <g key={`y-${tv}`}>
            {tv > 0 && (
              <line
                x1={MARGIN.left}
                y1={sy(tv)}
                x2={MARGIN.left + PLOT_W}
                y2={sy(tv)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={MARGIN.left - 6}
              y={sy(tv) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              {formatAxisValue(tv)}
            </text>
          </g>
        ))}

        {/* Y-axis label */}
        <text
          x={12}
          y={MARGIN.top + PLOT_H / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${MARGIN.top + PLOT_H / 2})`}
          className="fill-muted-foreground"
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}
        >
          {t.requests}
        </text>

        {/* Axes */}
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

        {/* Bars */}
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

        {/* Percentile lines */}
        {percentiles.map(({ label, value: val }) => {
          const px = sx(val);
          if (px < MARGIN.left || px > MARGIN.left + PLOT_W) return null;
          // Color the "bad tail" red regardless of which direction it lives
          // in — p99 for high-tail (latency), p1 for low-tail (throughput).
          const isBadTail = tailDirection === 'low' ? label === 'p1' : label === 'p99';
          const isWarnTail =
            tailDirection === 'low'
              ? label === 'p5' || label === 'p10'
              : label === 'p90' || label === 'p95';
          const lineColor = isBadTail
            ? '#f43f5e'
            : isWarnTail
              ? '#f59e0b'
              : label === 'p50'
                ? '#ef4444'
                : '#94a3b8';
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

        {/* X-axis ticks and labels */}
        {xTicks.map((tv) => {
          const x = sx(tv);
          if (x < MARGIN.left - 1 || x > MARGIN.left + PLOT_W + 1) return null;
          return (
            <g key={`x-${tv}`}>
              <line
                x1={x}
                y1={MARGIN.top + PLOT_H}
                x2={x}
                y2={MARGIN.top + PLOT_H + 4}
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth={1}
              />
              <text
                x={x}
                y={MARGIN.top + PLOT_H + 14}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {tickFmt(tv)}
              </text>
            </g>
          );
        })}

        {/* X-axis label */}
        <text
          x={MARGIN.left + PLOT_W / 2}
          y={CHART_HEIGHT - 2}
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

      {/* Percentile stats */}
      <div className="grid grid-cols-5 gap-1.5 mt-3 pt-3 border-t border-border">
        {percentiles.map((p) => (
          <div
            key={p.label}
            className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center"
          >
            <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
              {p.label}
            </div>
            <div className="text-sm font-mono font-bold tracking-tight mt-0.5">{fmt(p.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hourly token volume chart ──────────────────────────────────────

const HOURLY_COLORS = {
  input: '#6b7280',
  cacheRead: '#06b6d4',
  cacheWrite: '#f59e0b',
  output: '#10b981',
};

function HourlyTokenChart({ data }: { data: HourlyToken[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const locale = useLocale();
  const t = STRINGS[locale];
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    item: HourlyToken;
  } | null>(null);

  const CW = 900;
  const CH = 220;
  const M = { top: 8, right: 12, bottom: 40, left: 54 };
  const PW = CW - M.left - M.right;
  const PH = CH - M.top - M.bottom;

  const maxTotal = Math.max(
    ...data.map(
      (d) => Number(d.input) + Number(d.cacheRead) + Number(d.cacheWrite) + Number(d.output),
    ),
    1,
  );

  const yTicks = generateTicks(0, maxTotal, 5);
  const yMax = yTicks.at(-1) || maxTotal;

  const barWidth = Math.max(PW / data.length - 1, 2);
  const sy = (v: number) => M.top + PH - (v / yMax) * PH;

  const hourlyLegendItems = [
    { label: t.input, color: HOURLY_COLORS.input },
    { label: t.cacheRead, color: HOURLY_COLORS.cacheRead },
    { label: t.cacheWrite, color: HOURLY_COLORS.cacheWrite },
    { label: t.output, color: HOURLY_COLORS.output },
  ];
  const legendEl = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
      {hourlyLegendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-3xs font-mono text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <ExpandableChart
      title={
        <>
          {t.tokenVolumePerHour}{' '}
          <span className="text-muted-foreground font-normal">{t.final48h}</span>
        </>
      }
      subtitle={legendEl}
    >
      <div className="flex justify-end mb-1">
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current) {
              track('agentic_workload_export_png', { chart: 'hourly-token-volume' });
              exportSvgToPng(svgRef.current, {
                title: 'Hourly Token Volume',
                filename: 'hourly-token-volume.png',
                svgWidth: CW,
                svgHeight: CH,
              });
            }
          }}
        />
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ maxHeight: 240 }}>
        {/* Y-axis grid */}
        {yTicks.map((tv) => (
          <g key={`y-${tv}`}>
            {tv > 0 && (
              <line
                x1={M.left}
                y1={sy(tv)}
                x2={M.left + PW}
                y2={sy(tv)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={M.left - 6}
              y={sy(tv) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              {formatAxisValue(tv)}
            </text>
          </g>
        ))}

        {/* Y-axis label */}
        <text
          x={12}
          y={M.top + PH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${M.top + PH / 2})`}
          className="fill-muted-foreground"
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}
        >
          {t.tokens}
        </text>

        {/* Axes */}
        <line
          x1={M.left}
          y1={M.top}
          x2={M.left}
          y2={M.top + PH}
          stroke="currentColor"
          className="text-muted-foreground"
          strokeWidth={1}
        />
        <line
          x1={M.left}
          y1={M.top + PH}
          x2={M.left + PW}
          y2={M.top + PH}
          stroke="currentColor"
          className="text-muted-foreground"
          strokeWidth={1}
        />

        {/* Stacked bars */}
        {data.map((d, i) => {
          const x = M.left + (i / data.length) * PW;
          const input = Number(d.input);
          const cacheRead = Number(d.cacheRead);
          const cacheWrite = Number(d.cacheWrite);
          const output = Number(d.output);

          // Stack from bottom: output, cacheWrite, cacheRead, input
          const segments = [
            { value: output, color: HOURLY_COLORS.output },
            { value: cacheWrite, color: HOURLY_COLORS.cacheWrite },
            { value: cacheRead, color: HOURLY_COLORS.cacheRead },
            { value: input, color: HOURLY_COLORS.input },
          ];

          let cumulative = 0;
          return (
            <g
              key={i}
              onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, item: d })}
              onMouseLeave={() => setTooltip(null)}
            >
              {segments.map((seg, si) => {
                cumulative += seg.value;
                if (seg.value === 0) return null;
                const barY = sy(cumulative);
                const barH = (seg.value / yMax) * PH;
                return (
                  <rect
                    key={si}
                    x={x}
                    y={barY}
                    width={barWidth}
                    height={Math.max(barH, 0.5)}
                    fill={seg.color}
                    opacity={0.85}
                  />
                );
              })}
            </g>
          );
        })}

        {/* X-axis tick labels (every 6 hours) */}
        {data.map((d, i) => {
          const date = new Date(d.hour);
          const hour = date.getUTCHours();
          if (hour % 6 !== 0) return null;
          const x = M.left + (i / data.length) * PW + barWidth / 2;
          const dayStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          });
          return (
            <g key={`x-${i}`}>
              <line
                x1={x}
                y1={M.top + PH}
                x2={x}
                y2={M.top + PH + 4}
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth={1}
              />
              <text
                x={x}
                y={M.top + PH + 14}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{
                  fontSize: '8px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {`${String(hour).padStart(2, '0')}:00`}
              </text>
              <text
                x={x}
                y={M.top + PH + 24}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{
                  fontSize: '7px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {dayStr}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-border bg-surface p-2.5 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="space-y-1 text-2xs font-mono">
            <div className="font-bold text-foreground">
              {new Date(tooltip.item.hour).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short',
              })}
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t.requests}</span>
              <span>{Number(tooltip.item.requestCount)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: HOURLY_COLORS.input }}>{t.input}</span>
              <span>{formatNumber(Number(tooltip.item.input))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: HOURLY_COLORS.cacheRead }}>{t.cacheRead}</span>
              <span>{formatNumber(Number(tooltip.item.cacheRead))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: HOURLY_COLORS.cacheWrite }}>{t.cacheWrite}</span>
              <span>{formatNumber(Number(tooltip.item.cacheWrite))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: HOURLY_COLORS.output }}>{t.output}</span>
              <span>{formatNumber(Number(tooltip.item.output))}</span>
            </div>
            <div className="flex justify-between gap-4 font-bold">
              <span className="text-foreground">{t.total}</span>
              <span>
                {formatNumber(
                  Number(tooltip.item.input) +
                    Number(tooltip.item.cacheRead) +
                    Number(tooltip.item.cacheWrite) +
                    Number(tooltip.item.output),
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </ExpandableChart>
  );
}

// ── Weekly sessions by harness chart ─────────────────────────────

// Mirror the badge colors used on /sessions so the stacks read as
// "the chip's color, but bigger".
const HARNESS_COLORS: Record<Harness, string> = {
  'claude-code': '#f97316',
  codex: '#8b5cf6',
  pi: '#10b981',
  omp: '#0ea5e9',
  other: '#a1a1aa',
};

const HARNESS_LEGEND = HARNESSES.map((key) => ({ key, label: HARNESS_LABELS[key] }));

function pivotWeeklySessions(rows: WeeklySessionRow[]): WeeklySessionPoint[] {
  const byWeek = new Map<string, WeeklySessionPoint>();
  for (const r of rows) {
    let point = byWeek.get(r.week);
    if (!point) {
      point = { week: r.week, 'claude-code': 0, codex: 0, pi: 0, omp: 0, other: 0, total: 0 };
      byWeek.set(r.week, point);
    }
    point[r.harness] = r.sessionCount;
    point.total += r.sessionCount;
  }
  return [...byWeek.values()].toSorted((a, b) => a.week.localeCompare(b.week));
}

function formatWeekLabel(week: string): string {
  // Postgres ::date arrives as 'YYYY-MM-DD'. Parse as UTC midnight to avoid
  // local-timezone shift bumping us into the wrong week.
  const d = new Date(`${week}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function WeeklySessionsByHarnessChart({ data }: { data: WeeklySessionPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const locale = useLocale();
  const t = STRINGS[locale];
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    item: WeeklySessionPoint;
  } | null>(null);

  const CW = 900;
  const CH = 260;
  const M = { top: 8, right: 12, bottom: 44, left: 54 };
  const PW = CW - M.left - M.right;
  const PH = CH - M.top - M.bottom;

  const maxTotal = Math.max(...data.map((d) => d.total), 1);
  const yTicks = generateTicks(0, maxTotal, 5);
  const yMax = yTicks.at(-1) || maxTotal;
  const sy = (v: number) => M.top + PH - (v / yMax) * PH;

  // Center each bar inside its slot — 70% slot width, 15% gutter each side.
  const slotWidth = PW / Math.max(data.length, 1);
  const barWidth = Math.max(slotWidth * 0.7, 4);
  const slotX = (i: number) => M.left + i * slotWidth + (slotWidth - barWidth) / 2;

  const legendEl = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
      {HARNESS_LEGEND.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: HARNESS_COLORS[item.key] }}
          />
          <span className="text-3xs font-mono text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );

  // Label every week when there are <= 12 bars; otherwise stride to keep
  // labels readable. Always label the first and last bar.
  const labelStride = data.length > 12 ? Math.ceil(data.length / 12) : 1;

  return (
    <ExpandableChart
      title={
        <>
          {t.weeklySessionsByHarness}{' '}
          <span className="text-muted-foreground font-normal">
            {t.gt20ReqsTrace(CURRENT_TRACE_VERSION)}
          </span>
        </>
      }
      subtitle={legendEl}
    >
      <div className="flex justify-end mb-1">
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current) {
              track('agentic_workload_export_png', { chart: 'weekly-sessions-by-harness' });
              exportSvgToPng(svgRef.current, {
                title: 'Weekly Sessions by Harness',
                filename: 'weekly-sessions-by-harness.png',
                svgWidth: CW,
                svgHeight: CH,
              });
            }
          }}
        />
      </div>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          {t.noSessionsInSnapshot(CURRENT_TRACE_VERSION)}
        </div>
      ) : (
        <svg ref={svgRef} viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ maxHeight: 280 }}>
          {/* Y-axis grid */}
          {yTicks.map((tv) => (
            <g key={`y-${tv}`}>
              {tv > 0 && (
                <line
                  x1={M.left}
                  y1={sy(tv)}
                  x2={M.left + PW}
                  y2={sy(tv)}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={M.left - 6}
                y={sy(tv) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {formatAxisValue(tv)}
              </text>
            </g>
          ))}

          {/* Y-axis label */}
          <text
            x={12}
            y={M.top + PH / 2}
            textAnchor="middle"
            transform={`rotate(-90, 12, ${M.top + PH / 2})`}
            className="fill-muted-foreground"
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {t.sessions}
          </text>

          {/* Axes */}
          <line
            x1={M.left}
            y1={M.top}
            x2={M.left}
            y2={M.top + PH}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
          />
          <line
            x1={M.left}
            y1={M.top + PH}
            x2={M.left + PW}
            y2={M.top + PH}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
          />

          {/* Stacked bars in legend order, Claude Code on the bottom */}
          {data.map((d, i) => {
            const x = slotX(i);
            const segments = HARNESSES.map((key) => ({ key, value: d[key] }));
            let cumulative = 0;
            return (
              <g
                key={d.week}
                onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, item: d })}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Invisible full-height hit target so tooltip works even on
                  thin segments / empty stacks. */}
                <rect x={x} y={M.top} width={barWidth} height={PH} fill="transparent" />
                {segments.map((seg) => {
                  if (seg.value === 0) return null;
                  cumulative += seg.value;
                  const barY = sy(cumulative);
                  const barH = (seg.value / yMax) * PH;
                  return (
                    <rect
                      key={seg.key}
                      x={x}
                      y={barY}
                      width={barWidth}
                      height={Math.max(barH, 0.5)}
                      fill={HARNESS_COLORS[seg.key]}
                      opacity={0.9}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* X-axis tick labels — week-starting date */}
          {data.map((d, i) => {
            const isEdge = i === 0 || i === data.length - 1;
            if (!isEdge && i % labelStride !== 0) return null;
            const x = slotX(i) + barWidth / 2;
            return (
              <g key={`x-${d.week}`}>
                <line
                  x1={x}
                  y1={M.top + PH}
                  x2={x}
                  y2={M.top + PH + 4}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={M.top + PH + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}
                >
                  {formatWeekLabel(d.week)}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-border bg-surface p-2.5 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="space-y-1 text-2xs font-mono">
            <div className="font-bold text-foreground">
              {t.weekOf(formatWeekLabel(tooltip.item.week))}
            </div>
            <div className="h-px bg-border" />
            {HARNESS_LEGEND.map((item) => (
              <div key={item.key} className="flex justify-between gap-4">
                <span style={{ color: HARNESS_COLORS[item.key] }}>{item.label}</span>
                <span>{formatNumber(tooltip.item[item.key])}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 font-bold">
              <span className="text-foreground">{t.total}</span>
              <span>{formatNumber(tooltip.item.total)}</span>
            </div>
          </div>
        </div>
      )}
    </ExpandableChart>
  );
}

// ── Hourly cost chart ──────────────────────────────────────────────

function HourlyCostChart({ data }: { data: HourlyToken[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const locale = useLocale();
  const t = STRINGS[locale];
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    item: HourlyToken;
  } | null>(null);

  const CW = 900;
  const CH = 180;
  const M = { top: 8, right: 12, bottom: 40, left: 54 };
  const PW = CW - M.left - M.right;
  const PH = CH - M.top - M.bottom;

  const costs = data.map((d) => Number(d.cost));
  const maxCost = Math.max(...costs, 0.01);
  const yTicks = generateTicks(0, maxCost, 5);
  const yMax = yTicks.at(-1) || maxCost;

  const barWidth = Math.max(PW / data.length - 1, 2);
  const sy = (v: number) => M.top + PH - (v / yMax) * PH;

  return (
    <ExpandableChart
      title={
        <>
          {t.estimatedCostPerHour}{' '}
          <span className="text-muted-foreground font-normal">{t.final48h}</span>
        </>
      }
    >
      <div className="flex justify-end mb-1">
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current) {
              track('agentic_workload_export_png', { chart: 'hourly-cost' });
              exportSvgToPng(svgRef.current, {
                title: 'Hourly Cost',
                filename: 'hourly-cost.png',
                svgWidth: CW,
                svgHeight: CH,
              });
            }
          }}
        />
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* Y-axis grid */}
        {yTicks.map((tv) => (
          <g key={`y-${tv}`}>
            {tv > 0 && (
              <line
                x1={M.left}
                y1={sy(tv)}
                x2={M.left + PW}
                y2={sy(tv)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={M.left - 6}
              y={sy(tv) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              ${tv < 1 ? tv.toFixed(2) : tv.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Y-axis label */}
        <text
          x={12}
          y={M.top + PH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${M.top + PH / 2})`}
          className="fill-muted-foreground"
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}
        >
          {t.usd}
        </text>

        {/* Axes */}
        <line
          x1={M.left}
          y1={M.top}
          x2={M.left}
          y2={M.top + PH}
          stroke="currentColor"
          className="text-muted-foreground"
          strokeWidth={1}
        />
        <line
          x1={M.left}
          y1={M.top + PH}
          x2={M.left + PW}
          y2={M.top + PH}
          stroke="currentColor"
          className="text-muted-foreground"
          strokeWidth={1}
        />

        {/* Bars */}
        {data.map((d, i) => {
          const cost = Number(d.cost);
          if (cost === 0) return null;
          const x = M.left + (i / data.length) * PW;
          const barH = (cost / yMax) * PH;
          return (
            <rect
              key={i}
              x={x}
              y={sy(cost)}
              width={barWidth}
              height={Math.max(barH, 0.5)}
              fill="#10b981"
              opacity={0.75}
              stroke="#10b981"
              strokeWidth={0.5}
              onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, item: d })}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* X-axis tick labels (every 6 hours) */}
        {data.map((d, i) => {
          const date = new Date(d.hour);
          const hour = date.getUTCHours();
          if (hour % 6 !== 0) return null;
          const x = M.left + (i / data.length) * PW + barWidth / 2;
          const dayStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          });
          return (
            <g key={`x-${i}`}>
              <line
                x1={x}
                y1={M.top + PH}
                x2={x}
                y2={M.top + PH + 4}
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth={1}
              />
              <text
                x={x}
                y={M.top + PH + 14}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{
                  fontSize: '8px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {`${String(hour).padStart(2, '0')}:00`}
              </text>
              <text
                x={x}
                y={M.top + PH + 24}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{
                  fontSize: '7px',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {dayStr}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-border bg-surface p-2.5 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="space-y-1 text-2xs font-mono">
            <div className="font-bold text-foreground">
              {new Date(tooltip.item.hour).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short',
              })}
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t.requests}</span>
              <span>{Number(tooltip.item.requestCount)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-emerald-500">{t.estCost}</span>
              <span>${Number(tooltip.item.cost).toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}
    </ExpandableChart>
  );
}

// ── P50 CPU vs GPU time pie chart ─────────────────────────────────

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
  aColor = '#a855f7',
  bColor = '#10b981',
}: {
  /** P50 of series A (seconds), precomputed server-side. */
  p50a: number;
  /** P50 of series B (seconds), precomputed server-side. */
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
  const svgRef = useRef<SVGSVGElement>(null);
  const locale = useLocale();
  const t = STRINGS[locale];
  const resolvedTitle = title ?? t.p50CpuGpuTime;
  const resolvedALabel = aLabel ?? t.cpuTimeBetweenTurns;
  const resolvedBLabel = bLabel ?? t.gpuE2eLatency;
  const resolvedAStatLabel = aStatLabel ?? t.p50Cpu;
  const resolvedBStatLabel = bStatLabel ?? t.p50Gpu;
  const p50Cpu = p50a;
  const p50Gpu = p50b;
  const total = p50Cpu + p50Gpu;

  const CW = 520;
  const CH = 220;
  const cx = CW / 2;
  const cy = CH / 2;
  const r = 80;

  const cpuFrac = total > 0 ? p50Cpu / total : 0;
  const gpuFrac = 1 - cpuFrac;

  const cpuColor = aColor;
  const gpuColor = bColor;

  const cpuAngle = cpuFrac * Math.PI * 2;
  const cpuEndX = cx + r * Math.sin(cpuAngle);
  const cpuEndY = cy - r * Math.cos(cpuAngle);
  const cpuLarge = cpuFrac > 0.5 ? 1 : 0;
  const gpuLarge = gpuFrac > 0.5 ? 1 : 0;

  const cpuPath =
    total === 0
      ? ''
      : cpuFrac >= 1
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${cpuLarge} 1 ${cpuEndX} ${cpuEndY} Z`;
  const gpuPath =
    total === 0
      ? ''
      : gpuFrac >= 1
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${cx} ${cy} L ${cpuEndX} ${cpuEndY} A ${r} ${r} 0 ${gpuLarge} 1 ${cx} ${cy - r} Z`;

  const subtitle = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: cpuColor }}
        />
        <span className="text-3xs font-mono text-muted-foreground">{resolvedALabel}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: gpuColor }}
        />
        <span className="text-3xs font-mono text-muted-foreground">{resolvedBLabel}</span>
      </div>
    </div>
  );

  return (
    <ExpandableChart
      title={
        <>
          {resolvedTitle}{' '}
          <span className="text-muted-foreground font-normal">(N={n.toLocaleString()})</span>
        </>
      }
      subtitle={subtitle}
    >
      <div className="flex justify-end mb-1">
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current) {
              track('agentic_workload_export_png', { chart: exportFilename });
              exportSvgToPng(svgRef.current, {
                title: resolvedTitle,
                filename: exportFilename,
                svgWidth: CW,
                svgHeight: CH,
              });
            }
          }}
        />
      </div>
      {total === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          {t.noData}
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CW} ${CH}`}
            className="w-full"
            style={{ maxHeight: 240 }}
          >
            {cpuFrac > 0 && (
              <path
                d={cpuPath}
                fill={cpuColor}
                opacity={0.85}
                stroke={cpuColor}
                strokeWidth={0.5}
              />
            )}
            {gpuFrac > 0 && (
              <path
                d={gpuPath}
                fill={gpuColor}
                opacity={0.85}
                stroke={gpuColor}
                strokeWidth={0.5}
              />
            )}
            {cpuFrac > 0.05 && (
              <text
                x={cx + r * 0.6 * Math.sin(cpuAngle / 2)}
                y={cy - r * 0.6 * Math.cos(cpuAngle / 2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
              >
                {`${(cpuFrac * 100).toFixed(0)}%`}
              </text>
            )}
            {gpuFrac > 0.05 && (
              <text
                x={cx + r * 0.6 * Math.sin(cpuAngle + (Math.PI * 2 - cpuAngle) / 2)}
                y={cy - r * 0.6 * Math.cos(cpuAngle + (Math.PI * 2 - cpuAngle) / 2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
              >
                {`${(gpuFrac * 100).toFixed(0)}%`}
              </text>
            )}
          </svg>
          <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-border">
            <div className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                {resolvedAStatLabel}
              </div>
              <div
                className="text-sm font-mono font-bold tracking-tight mt-0.5"
                style={{ color: cpuColor }}
              >
                {`${p50Cpu.toFixed(2)}s`}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                {resolvedBStatLabel}
              </div>
              <div
                className="text-sm font-mono font-bold tracking-tight mt-0.5"
                style={{ color: gpuColor }}
              >
                {`${p50Gpu.toFixed(2)}s`}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                {t.total}
              </div>
              <div className="text-sm font-mono font-bold tracking-tight mt-0.5">
                {`${total.toFixed(2)}s`}
              </div>
            </div>
          </div>
        </>
      )}
    </ExpandableChart>
  );
}

// ── Max concurrent subagents pie chart ───────────────────────────

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

/** Sequential palette from "0 = quiet" → "many = busy". Ordered so the
 *  pie reads as "how often is the session quiet vs hot?". Index-aligned with
 *  the 7 buckets `graphConcurrencyBuckets` (server-side) emits. */
const CONCURRENCY_BUCKET_COLORS = [
  '#475569', // 0     — slate (idle)
  '#0ea5e9', // 1     — sky
  '#06b6d4', // 2     — cyan
  '#10b981', // 3     — emerald
  '#f59e0b', // 4–5   — amber
  '#f97316', // 6–10  — orange
  '#f43f5e', // 11+   — rose
];

/** Re-attach the client-side palette to the server's labeled counts. */
function concurrencySlices(buckets: ConcurrencyBucket[]): PieSlice[] {
  return buckets.map((b, i) => ({
    label: b.label,
    value: b.value,
    color: CONCURRENCY_BUCKET_COLORS[i] ?? '#475569',
  }));
}

function MaxConcurrentSubagentsPieChart({ slices }: { slices: PieSlice[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const locale = useLocale();
  const t = STRINGS[locale];
  const total = slices.reduce((acc, s) => acc + s.value, 0);

  const CW = 520;
  const CH = 240;
  const cx = CW / 2;
  const cy = CH / 2;
  const r = 90;

  // Build sequential arcs. Special-case "only one bucket non-zero" to draw a
  // full circle, since SVG's arc command can't span 360°.
  const nonZeroSlices = slices.filter((s) => s.value > 0);
  const arcs: { slice: PieSlice; path: string; midAngle: number; frac: number }[] = [];
  if (total > 0) {
    if (nonZeroSlices.length === 1) {
      const slice = nonZeroSlices[0];
      arcs.push({
        slice,
        path: `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`,
        midAngle: Math.PI,
        frac: 1,
      });
    } else {
      let startAngle = 0;
      for (const slice of slices) {
        if (slice.value === 0) continue;
        const frac = slice.value / total;
        const endAngle = startAngle + frac * Math.PI * 2;
        const startX = cx + r * Math.sin(startAngle);
        const startY = cy - r * Math.cos(startAngle);
        const endX = cx + r * Math.sin(endAngle);
        const endY = cy - r * Math.cos(endAngle);
        const large = frac > 0.5 ? 1 : 0;
        arcs.push({
          slice,
          path: `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${endX} ${endY} Z`,
          midAngle: (startAngle + endAngle) / 2,
          frac,
        });
        startAngle = endAngle;
      }
    }
  }

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
      {slices.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: s.color }}
          />
          <span className="text-3xs font-mono text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <ExpandableChart
      title={
        <>
          {t.maxConcurrentSubagentsPerSession}{' '}
          <span className="text-muted-foreground font-normal">
            (N={total.toLocaleString()}, {t.gt20ReqsTrace(CURRENT_TRACE_VERSION)})
          </span>
        </>
      }
      subtitle={legend}
    >
      <div className="flex justify-end mb-1">
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current) {
              track('agentic_workload_export_png', { chart: 'max-concurrent-subagents-pie' });
              exportSvgToPng(svgRef.current, {
                title: 'Max Concurrent Subagents per Session',
                filename: 'max-concurrent-subagents-pie.png',
                svgWidth: CW,
                svgHeight: CH,
              });
            }
          }}
        />
      </div>
      {total === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          {t.noEligibleSessions}
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CW} ${CH}`}
            className="w-full"
            style={{ maxHeight: 260 }}
          >
            {arcs.map((arc) => (
              <path
                key={arc.slice.label}
                d={arc.path}
                fill={arc.slice.color}
                opacity={0.9}
                stroke={arc.slice.color}
                strokeWidth={0.5}
              />
            ))}
            {arcs
              .filter((a) => a.frac >= 0.05)
              .map((arc) => (
                <text
                  key={`${arc.slice.label}-label`}
                  x={cx + r * 0.65 * Math.sin(arc.midAngle)}
                  y={cy - r * 0.65 * Math.cos(arc.midAngle)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                >
                  {`${(arc.frac * 100).toFixed(0)}%`}
                </text>
              ))}
          </svg>
          <div className="grid grid-cols-7 gap-1 mt-3 pt-3 border-t border-border">
            {slices.map((s) => (
              <div
                key={s.label}
                className="rounded-md border border-border bg-surface-hover px-1.5 py-1.5 text-center"
              >
                <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                  {s.label}
                </div>
                <div
                  className="text-xs font-mono font-bold tracking-tight mt-0.5"
                  style={{ color: s.color }}
                >
                  {s.value.toLocaleString()}
                </div>
                <div className="text-3xs font-mono text-muted-foreground mt-0.5">
                  {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : '0%'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </ExpandableChart>
  );
}

// ── RPS timeseries chart ──────────────────────────────────────────

/** Window size (in buckets) for the rolling average. Scales with bucket count
 *  so the line stays usefully smooth at every range. */
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
  const svgRef = useRef<SVGSVGElement>(null);
  const locale = useLocale();
  const t = STRINGS[locale];
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    item: RpsPoint;
    avg: number;
  } | null>(null);

  const CW = 900;
  const CH = 240;
  const M = { top: 12, right: 16, bottom: 44, left: 60 };
  const PW = CW - M.left - M.right;
  const PH = CH - M.top - M.bottom;

  const points = data?.points ?? [];
  const rpsValues = points.map((p) => p.rps);
  const window = rollingWindow(points.length);
  const smoothed = useMemo(() => rollingAverage(rpsValues, window), [rpsValues, window]);

  const maxRps = Math.max(...rpsValues, ...smoothed, 0.001);
  const yTicks = generateTicks(0, maxRps, 5);
  const yMax = yTicks.at(-1) || maxRps;

  const barColor = '#0ea5e9';
  const avgColor = '#f59e0b';

  const barWidth = points.length > 0 ? Math.max(PW / points.length - 1, 1) : 0;
  const sy = (v: number) => M.top + PH - (v / yMax) * PH;
  const bucketX = (i: number) => M.left + (i / Math.max(points.length, 1)) * PW;

  const linePath =
    points.length > 1
      ? points
          .map((_, i) => {
            const x = bucketX(i) + barWidth / 2;
            const y = sy(smoothed[i]);
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(' ')
      : '';

  const rangeLabel = RPS_RANGES.find((r) => r.key === range)?.label ?? range;
  const bucketMin = data?.bucketMinutes ?? 0;
  const bucketLabel = bucketMin >= 60 ? t.bucketHours(bucketMin / 60) : t.bucketMinutes(bucketMin);

  // Sparse x-axis ticks: aim for ~6 labels regardless of point count
  const tickInterval = Math.max(1, Math.floor(points.length / 6));

  const subtitle = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm"
          style={{ backgroundColor: barColor }}
        />
        <span className="text-3xs font-mono text-muted-foreground">
          {t.rpsBucketLabel(bucketLabel)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-0.5" style={{ backgroundColor: avgColor }} />
        <span className="text-3xs font-mono text-muted-foreground">
          {t.rollingAvgLegend(window)}
        </span>
      </div>
    </div>
  );

  const totalRequests = points.reduce((acc, p) => acc + p.requestCount, 0);
  const meanRps = points.length > 0 ? rpsValues.reduce((a, b) => a + b, 0) / points.length : 0;
  const peakRps = points.length > 0 ? Math.max(...rpsValues) : 0;

  return (
    <ExpandableChart
      title={
        <>
          {t.requestsPerSecond}{' '}
          <span className="text-muted-foreground font-normal">{t.finalOfSnapshot(rangeLabel)}</span>
        </>
      }
      subtitle={subtitle}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Time range">
          {RPS_RANGES.map((r) => {
            const active = r.key === range;
            return (
              <button
                key={r.key}
                onClick={() => {
                  track('agentic_workload_rps_range_changed', { range: r.key });
                  onRangeChange(r.key);
                }}
                className={`px-2 py-1 text-3xs font-mono font-bold uppercase tracking-eyebrow rounded-md border transition-colors ${
                  active
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-surface text-muted-foreground border-border hover:bg-surface-hover hover:text-foreground'
                }`}
                aria-pressed={active}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current) {
              track('agentic_workload_export_png', { chart: `rps-${range}` });
              exportSvgToPng(svgRef.current, {
                title: `Requests per Second (final ${rangeLabel} of snapshot)`,
                filename: `rps-${range}.png`,
                svgWidth: CW,
                svgHeight: CH,
              });
            }
          }}
        />
      </div>

      {loading && !data ? (
        <Skeleton className="h-[200px] w-full" />
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          {t.noData}
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CW} ${CH}`}
            className="w-full"
            style={{ maxHeight: 260 }}
          >
            {/* Y-axis grid lines */}
            {yTicks.map((tv) => (
              <g key={`y-${tv}`}>
                {tv > 0 && (
                  <line
                    x1={M.left}
                    y1={sy(tv)}
                    x2={M.left + PW}
                    y2={sy(tv)}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth={0.5}
                    strokeDasharray="3 3"
                  />
                )}
                <text
                  x={M.left - 6}
                  y={sy(tv) + 3}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  }}
                >
                  {formatRpsValue(tv)}
                </text>
              </g>
            ))}

            {/* Y-axis label */}
            <text
              x={12}
              y={M.top + PH / 2}
              textAnchor="middle"
              transform={`rotate(-90, 12, ${M.top + PH / 2})`}
              className="fill-muted-foreground"
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              {t.requestsPerSecondYAxis}
            </text>

            {/* Axes */}
            <line
              x1={M.left}
              y1={M.top}
              x2={M.left}
              y2={M.top + PH}
              stroke="currentColor"
              className="text-muted-foreground"
              strokeWidth={1}
            />
            <line
              x1={M.left}
              y1={M.top + PH}
              x2={M.left + PW}
              y2={M.top + PH}
              stroke="currentColor"
              className="text-muted-foreground"
              strokeWidth={1}
            />

            {/* Bars (raw RPS per bucket) */}
            {points.map((p, i) => {
              if (p.rps === 0) return null;
              const x = bucketX(i);
              const barH = (p.rps / yMax) * PH;
              return (
                <rect
                  key={i}
                  x={x}
                  y={sy(p.rps)}
                  width={barWidth}
                  height={Math.max(barH, 0.5)}
                  fill={barColor}
                  opacity={0.6}
                />
              );
            })}

            {/* Rolling average line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={avgColor}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Hover overlay (one slim invisible rect per bucket for tooltips) */}
            {points.map((p, i) => {
              const x = bucketX(i);
              return (
                <rect
                  key={`hover-${i}`}
                  x={x}
                  y={M.top}
                  width={Math.max(barWidth, 2)}
                  height={PH}
                  fill="transparent"
                  onMouseMove={(e) =>
                    setTooltip({ x: e.clientX, y: e.clientY, item: p, avg: smoothed[i] })
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}

            {/* X-axis tick labels */}
            {points.map((p, i) => {
              if (i % tickInterval !== 0) return null;
              const x = bucketX(i) + barWidth / 2;
              const date = new Date(p.bucket);
              const showDate = bucketMin >= 30;
              const hourStr = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });
              const dayStr = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              return (
                <g key={`x-${i}`}>
                  <line
                    x1={x}
                    y1={M.top + PH}
                    x2={x}
                    y2={M.top + PH + 4}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={M.top + PH + 14}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{
                      fontSize: '8px',
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    }}
                  >
                    {hourStr}
                  </text>
                  {showDate && (
                    <text
                      x={x}
                      y={M.top + PH + 24}
                      textAnchor="middle"
                      className="fill-muted-foreground"
                      style={{
                        fontSize: '7px',
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      }}
                    >
                      {dayStr}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-border">
            <div className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                {t.meanRps}
              </div>
              <div className="text-sm font-mono font-bold tracking-tight mt-0.5">
                {formatRpsValue(meanRps)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                {t.peakRps}
              </div>
              <div className="text-sm font-mono font-bold tracking-tight mt-0.5">
                {formatRpsValue(peakRps)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                {t.totalRequests}
              </div>
              <div className="text-sm font-mono font-bold tracking-tight mt-0.5">
                {formatNumber(totalRequests)}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-border bg-surface p-2.5 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="space-y-1 text-2xs font-mono">
            <div className="font-bold text-foreground">
              {new Date(tooltip.item.bucket).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short',
              })}
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between gap-4">
              <span style={{ color: barColor }}>RPS</span>
              <span>{formatRpsValue(tooltip.item.rps)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: avgColor }}>{t.rollingAvg}</span>
              <span>{formatRpsValue(tooltip.avg)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t.requests}</span>
              <span>{formatNumber(tooltip.item.requestCount)}</span>
            </div>
          </div>
        </div>
      )}
    </ExpandableChart>
  );
}

// ── Wall-clock composition chart (idle vs tool/CPU vs LLM/GPU) ────
//
// Every recorded lane-second falls in one of three buckets: the model
// generating (E2E latency), the client running tools, and the human
// reading/typing between turns. Stacked per UTC day so the mix — not just
// the totals — is visible. See getWallClockBreakdown in packages/db for how
// the tool and idle gaps are separated.

const WALL_CLOCK_COLORS = {
  llm: '#10b981',
  tool: '#a855f7',
  idle: '#f59e0b',
};

const WALL_CLOCK_RANGES = [
  { days: 14, label: '14d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;

const WALL_CLOCK_AGENTS = [
  { key: 'both', label: 'Both' },
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex' },
] as const;
type WallClockAgent = (typeof WALL_CLOCK_AGENTS)[number]['key'];

const totalOf = (d: WallClockDay) => d.llmMs + d.toolMs + d.idleMs;
const fmtHours = (ms: number) => `${(ms / 3_600_000).toFixed(1)}h`;
const pct = (ms: number, total: number) =>
  total > 0 ? `${((ms / total) * 100).toFixed(1)}%` : '—';

function WallClockStackedBarChart({ data }: { data: WallClockDay[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const locale = useLocale();
  const t = STRINGS[locale];
  const [share, setShare] = useState(false);
  const [rangeDays, setRangeDays] = useState<number>(14);
  const [agent, setAgent] = useState<WallClockAgent>('both');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; item: WallClockDay } | null>(null);

  const { visibleData, rangeStartMs, tickDays } = useMemo(() => {
    const now = snapshotNow();
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startMs = todayMs - (rangeDays - 1) * 86_400_000;
    const cutoffDay = new Date(startMs).toISOString().slice(0, 10);
    const ticks = Array.from({ length: rangeDays }, (_, i) => {
      const date = new Date(startMs + i * 86_400_000);
      return { day: date.toISOString().slice(0, 10), dayIndex: i, weekday: date.getUTCDay() };
    }).filter((tick) => rangeDays === 14 || tick.weekday === 1);
    return {
      visibleData: [...data]
        .filter(
          (d) =>
            d.day >= cutoffDay && (agent === 'both' ? d.agent !== 'openai' : d.agent === agent),
        )
        .reduce<WallClockDay[]>((days, row) => {
          const existing = days.at(-1);
          if (existing?.day === row.day) {
            existing.llmMs += row.llmMs;
            existing.toolMs += row.toolMs;
            existing.idleMs += row.idleMs;
            existing.requests += row.requests;
          } else {
            days.push({ ...row });
          }
          return days;
        }, []),
      rangeStartMs: startMs,
      tickDays: ticks,
    };
  }, [agent, data, rangeDays]);

  const CW = 900;
  const CH = 240;
  const M = { top: 8, right: 12, bottom: 40, left: 54 };
  const PW = CW - M.left - M.right;
  const PH = CH - M.top - M.bottom;

  // Hours in absolute mode, fraction of the day's total in share mode.
  const scaleOf = (d: WallClockDay) => {
    if (!share) return 1 / 3_600_000;
    const total = totalOf(d);
    return total > 0 ? 1 / total : 0;
  };

  const maxTotal = share ? 1 : Math.max(...visibleData.map((d) => totalOf(d) / 3_600_000), 0.001);
  const yTicks = share ? [0, 0.25, 0.5, 0.75, 1] : generateTicks(0, maxTotal, 5);
  const yMax = yTicks.at(-1) || maxTotal;

  const dayWidth = PW / rangeDays;
  const barWidth = Math.max(dayWidth - 2, 2);
  const dayIndex = (day: string) =>
    Math.round((new Date(`${day}T00:00:00Z`).getTime() - rangeStartMs) / 86_400_000);
  const sy = (v: number) => M.top + PH - (v / yMax) * PH;
  const fmtY = (v: number) => (share ? `${Math.round(v * 100)}%` : `${formatAxisValue(v)}h`);

  const wallClockLegendItems = [
    { key: 'llm' as const, label: t.llmGpuLegend, color: WALL_CLOCK_COLORS.llm },
    { key: 'tool' as const, label: t.toolCpuLegend, color: WALL_CLOCK_COLORS.tool },
    { key: 'idle' as const, label: t.userIdleLegend, color: WALL_CLOCK_COLORS.idle },
  ];
  const legendEl = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
      {wallClockLegendItems.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-3xs font-mono text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <ExpandableChart
      title={
        <>
          {t.wallClockTitle}{' '}
          <span className="text-muted-foreground font-normal">{t.wallClockFinal(rangeDays)}</span>
        </>
      }
      subtitle={legendEl}
    >
      <div className="flex items-center justify-end gap-2 mb-1">
        <div
          className="flex rounded-md border border-border overflow-hidden"
          role="group"
          aria-label="Agent"
        >
          {[
            { key: 'both' as const, label: t.agentBoth },
            { key: 'claude' as const, label: 'Claude' },
            { key: 'codex' as const, label: 'Codex' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                track('agentic_workload_wallclock_agent_changed', { agent: option.key });
                setAgent(option.key);
              }}
              className={`px-2 py-0.5 text-3xs font-mono uppercase tracking-eyebrow transition-colors ${
                agent === option.key
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div
          className="flex rounded-md border border-border overflow-hidden"
          role="group"
          aria-label="Time range"
        >
          {WALL_CLOCK_RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => {
                track('agentic_workload_wallclock_range_changed', { days: range.days });
                setRangeDays(range.days);
              }}
              className={`px-2 py-0.5 text-3xs font-mono uppercase tracking-eyebrow transition-colors ${
                rangeDays === range.days
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-border overflow-hidden">
          {[
            { key: false, label: t.modeHours },
            { key: true, label: t.modeShare },
          ].map((mode) => (
            <button
              key={String(mode.key)}
              type="button"
              onClick={() => {
                track('agentic_workload_wallclock_mode_changed', {
                  mode: mode.key ? 'share' : 'hours',
                });
                setShare(mode.key);
              }}
              className={`px-2 py-0.5 text-3xs font-mono uppercase tracking-eyebrow transition-colors ${
                share === mode.key
                  ? 'bg-surface-hover text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current) {
              track('agentic_workload_export_png', { chart: 'wall-clock-composition' });
              exportSvgToPng(svgRef.current, {
                title: 'Wall Clock Composition',
                filename: 'wall-clock-composition.png',
                svgWidth: CW,
                svgHeight: CH,
              });
            }
          }}
        />
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${CW} ${CH}`} className="w-full" style={{ maxHeight: 260 }}>
        {yTicks.map((tv) => (
          <g key={`y-${tv}`}>
            {tv > 0 && (
              <line
                x1={M.left}
                y1={sy(tv)}
                x2={M.left + PW}
                y2={sy(tv)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={M.left - 6}
              y={sy(tv) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            >
              {fmtY(tv)}
            </text>
          </g>
        ))}

        <text
          x={12}
          y={M.top + PH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${M.top + PH / 2})`}
          className="fill-muted-foreground"
          style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
        >
          {share ? t.shareOfWallClock : t.wallClockHoursYAxis}
        </text>

        <line
          x1={M.left}
          y1={M.top}
          x2={M.left}
          y2={M.top + PH}
          stroke="currentColor"
          className="text-muted-foreground"
          strokeWidth={1}
        />
        <line
          x1={M.left}
          y1={M.top + PH}
          x2={M.left + PW}
          y2={M.top + PH}
          stroke="currentColor"
          className="text-muted-foreground"
          strokeWidth={1}
        />

        {visibleData.map((d) => {
          const x = M.left + dayIndex(d.day) * dayWidth + 1;
          const k = scaleOf(d);
          // Stack from the bottom: LLM, then tool, then idle on top.
          const segments = [
            { value: d.llmMs * k, color: WALL_CLOCK_COLORS.llm },
            { value: d.toolMs * k, color: WALL_CLOCK_COLORS.tool },
            { value: d.idleMs * k, color: WALL_CLOCK_COLORS.idle },
          ];
          let cumulative = 0;
          return (
            <g
              key={d.day}
              onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, item: d })}
              onMouseLeave={() => setTooltip(null)}
            >
              <rect x={x} y={M.top} width={barWidth} height={PH} fill="transparent" />
              {segments.map((seg, si) => {
                cumulative += seg.value;
                if (seg.value <= 0) return null;
                return (
                  <rect
                    key={si}
                    x={x}
                    y={sy(cumulative)}
                    width={barWidth}
                    height={Math.max((seg.value / yMax) * PH, 0.5)}
                    fill={seg.color}
                    opacity={0.85}
                  />
                );
              })}
            </g>
          );
        })}

        {tickDays.map((tick) => {
          const x = M.left + tick.dayIndex * dayWidth + dayWidth / 2;
          return (
            <g key={`x-${tick.day}`}>
              <line
                x1={x}
                y1={M.top + PH}
                x2={x}
                y2={M.top + PH + 4}
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth={1}
              />
              <text
                x={x}
                y={M.top + PH + 14}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: '8px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
              >
                {tick.day.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-border bg-surface p-2.5 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="space-y-1 text-2xs font-mono">
            <div className="font-bold text-foreground">{tooltip.item.day}</div>
            <div className="h-px bg-border" />
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t.requests}</span>
              <span>{formatNumber(tooltip.item.requests)}</span>
            </div>
            {wallClockLegendItems.map((seg) => {
              const ms =
                seg.key === 'llm'
                  ? tooltip.item.llmMs
                  : seg.key === 'tool'
                    ? tooltip.item.toolMs
                    : tooltip.item.idleMs;
              return (
                <div key={seg.key} className="flex justify-between gap-4">
                  <span style={{ color: seg.color }}>{seg.label}</span>
                  <span>
                    {fmtHours(ms)} · {pct(ms, totalOf(tooltip.item))}
                  </span>
                </div>
              );
            })}
            <div className="flex justify-between gap-4 font-bold">
              <span className="text-foreground">{t.total}</span>
              <span>{fmtHours(totalOf(tooltip.item))}</span>
            </div>
          </div>
        </div>
      )}
    </ExpandableChart>
  );
}

// ── Main page ─────────────────────────────────────────────────────

// Pre-binned dataset payloads from /api/graphs (see packages/db/src/stats.ts).
// A dataset key that feeds multiple charts ships a dict of the per-chart
// payloads; single-chart keys ship the payload directly.
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
  /** Idle gaps >= the cutoff, excluded from userIdle and the daily sums. */
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
  color: string;
  axisLabel: string;
  format?: (v: number) => string;
  tickFormat?: (v: number) => string;
  tailDirection?: 'high' | 'low';
  exportFilename?: string;
  /** Which API include key feeds this chart. */
  datasetKey: string;
  /** Pick the pre-binned histogram this chart renders out of the payload. */
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
  return (
    <div ref={ref}>
      <ExpandableChart
        title={
          <>
            {spec.title}{' '}
            <span className="text-muted-foreground font-normal">(N={hist.n.toLocaleString()})</span>
          </>
        }
        subtitle={t.bins(hist.buckets.length)}
      >
        <Histogram
          buckets={hist.buckets}
          color={spec.color}
          percentiles={hist.percentiles}
          axisLabel={spec.axisLabel}
          format={spec.format}
          tickFormat={spec.tickFormat}
          tailDirection={spec.tailDirection}
          title={spec.title}
          exportFilename={spec.exportFilename || `${spec.key}-distribution.png`}
        />
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

  // Per-dataset lazy fetches replace the old monolithic /api/graphs call.
  // Each card on the page asks for only the dataset it needs; charts that
  // share a dataset (the ~8 requestStats-derived histograms) dedupe through
  // the hook's module-level cache.
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

  // ── Histogram specs: dataset key + a selector picking the pre-binned
  // per-chart payload. The binning + percentile math runs server-side (exact
  // port of the old client extract()/buildHistogram); `select` just reaches
  // into the dataset payload for this chart's slice. Cards lazy-load their
  // `datasetKey` via useGraphDataset and dedupe shared keys.
  const charts: HistogramSpec[] = [
    {
      key: 'islTotal',
      title: t.islTotalDist,
      color: '#ec4899',
      axisLabel: t.islTotalAxis,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).islTotal,
    },
    {
      key: 'cacheRead',
      title: t.cacheReadDist,
      color: '#06b6d4',
      axisLabel: t.cacheReadAxis,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).cacheRead,
    },
    {
      key: 'cacheWrite',
      title: t.cacheWriteDist,
      color: '#f59e0b',
      axisLabel: t.cacheWriteAxis,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).cacheWrite,
    },
    {
      key: 'output',
      title: t.outputDist,
      color: '#10b981',
      axisLabel: t.outputAxis,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).output,
    },
    {
      key: 'gap',
      title: t.timeBetweenTurns,
      color: '#3b82f6',
      axisLabel: t.seconds,
      format: (v) => `${v.toFixed(1)}s`,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).gap,
    },
    {
      key: 'userIdle',
      title: t.userIdleTimeBetweenTurns(Math.round(IDLE_GAP_CUTOFF_MS / 60_000)),
      color: '#f59e0b',
      axisLabel: t.userIdleAxis,
      format: (v) => `${v.toFixed(1)}s`,
      datasetKey: 'wallClock',
      select: (d) => (d as WallClockPayload).userIdle,
    },
    {
      key: 'cpuGpuRatio',
      title: t.cpuGpuRatioTitle,
      color: '#a855f7',
      axisLabel: t.cpuGpuRatioAxis,
      format: (v) => `${v.toFixed(2)}x`,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).cpuGpuRatio,
    },
    {
      key: 'reqRatio',
      title: t.cacheReadOutputRatioReq,
      color: '#8b5cf6',
      axisLabel: t.ratioAxis,
      format: (v) => `${v.toFixed(1)}x`,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).reqRatio,
    },
    {
      key: 'readWriteRatio',
      title: t.cacheReadWriteRatio,
      color: '#14b8a6',
      axisLabel: t.ratioAxis,
      format: (v) => `${v.toFixed(1)}x`,
      datasetKey: 'requestStats',
      select: (d) => (d as RequestStatsPayload).readWriteRatio,
    },
    {
      key: 'sessRatio',
      title: t.cacheReadOutputRatioSess,
      color: '#ec4899',
      axisLabel: t.ratioAxis,
      format: (v) => `${v.toFixed(1)}x`,
      datasetKey: 'sessionAggregates',
      select: (d) => (d as SessionAggregatesPayload).sessRatio,
    },
    {
      key: 'turns',
      title: t.turnsPerSession,
      color: '#f97316',
      axisLabel: t.turnsAxis,
      format: (v) => String(Math.round(v)),
      datasetKey: 'sessionAggregates',
      select: (d) => (d as SessionAggregatesPayload).turns,
    },
    {
      key: 'ttft',
      title: t.ttftDist,
      color: '#10b981',
      axisLabel: t.ttftAxis,
      format: formatDuration,
      datasetKey: 'ttftValues',
      select: (d) => d as GraphHistogram,
    },
    {
      key: 'tpot',
      title: t.tpotDist,
      color: '#8b5cf6',
      axisLabel: t.tpotAxis,
      format: (v) => `${v.toFixed(1)}ms/tok`,
      datasetKey: 'tpotValues',
      select: (d) => (d as TpotPayload).tpot,
    },
    {
      key: 'prefill-speed',
      title: t.prefillSpeedDist,
      color: '#0ea5e9',
      axisLabel: t.prefillSpeedAxis,
      format: formatPrefillSpeed,
      tailDirection: 'low',
      datasetKey: 'prefillSpeedValues',
      select: (d) => d as GraphHistogram,
    },
    {
      key: 'tokens-per-chunk',
      title: t.tokensPerChunkDist,
      color: '#22d3ee',
      axisLabel: t.tokensPerChunkAxis,
      format: (v) => `${v.toFixed(2)} tok/chunk`,
      tickFormat: (v) => v.toFixed(2),
      datasetKey: 'tokensPerChunkValues',
      select: (d) => d as GraphHistogram,
    },
    {
      key: 'prefill-share',
      title: t.prefillShareTitle,
      color: '#f97316',
      axisLabel: t.prefillShareAxis,
      format: (v) => `${(v * 100).toFixed(1)}%`,
      tickFormat: (v) => `${Math.round(v * 100)}%`,
      datasetKey: 'prefillDecodeValues',
      select: (d) => (d as PrefillDecodePayload).prefillShare,
    },
    {
      key: 'interactivity',
      title: t.interactivityDist,
      color: '#f59e0b',
      axisLabel: t.interactivityAxis,
      format: (v) => `${v.toFixed(1)} tok/s`,
      tailDirection: 'low',
      datasetKey: 'tpotValues',
      select: (d) => (d as TpotPayload).interactivity,
    },
    {
      key: 'session-duration',
      title: t.sessionDurationTitle(CURRENT_TRACE_VERSION),
      color: '#ec4899',
      axisLabel: t.sessionDurationAxis,
      format: (v) => `${v.toFixed(2)}h`,
      tickFormat: (v) => `${v.toFixed(1)}h`,
      datasetKey: 'sessionDurationValues',
      select: (d) => d as GraphHistogram,
    },
    {
      key: 'subagent-count',
      title: t.subagentCountTitle(SUBAGENT_STATS_WINDOW_DAYS, CURRENT_TRACE_VERSION),
      color: '#06b6d4',
      axisLabel: t.subagentCountAxis,
      format: (v) => String(Math.round(v)),
      tickFormat: (v) => String(Math.round(v)),
      datasetKey: 'subagentStatsPerSession',
      select: (d) => (d as SubagentPayload).subagentCount,
    },
    {
      key: 'max-concurrent-subagents',
      title: t.maxConcurrentHistTitle(SUBAGENT_STATS_WINDOW_DAYS, CURRENT_TRACE_VERSION),
      color: '#14b8a6',
      axisLabel: t.maxConcurrentAxis,
      format: (v) => String(Math.round(v)),
      tickFormat: (v) => String(Math.round(v)),
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
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.traffic}
        </span>
        <span className="flex-1 h-px bg-border" />
      </div>
      <RpsTimeseriesChart
        data={rpsData}
        range={rpsRange}
        onRangeChange={setRpsRange}
        loading={rpsLoading}
      />
      <div className="flex items-center gap-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.hourlyActivity}
        </span>
        <span className="flex-1 h-px bg-border" />
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

      {/* Weekly harness mix */}
      <div className="flex items-center gap-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.weeklySessions}
        </span>
        <span className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-4">
        <LazyDatasetCard<WeeklySessionRow[]>
          datasetKey="weeklySessionsByHarness"
          ctx={ctx}
          title={t.weeklySessionsByHarness}
          render={(rows) => <WeeklySessionsByHarnessChart data={pivotWeeklySessions(rows)} />}
        />
      </div>

      {/* Wall-clock composition: LLM vs tool/CPU vs user idle */}
      <div className="flex items-center gap-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.wallClock}
        </span>
        <span className="flex-1 h-px bg-border" />
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
          render={(d) => (
            <MaxConcurrentSubagentsPieChart slices={concurrencySlices(d.concurrencyPie)} />
          )}
        />
      </div>

      {/* Prefill vs Decode share of E2E latency (streaming rows only) */}
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
                aColor="#f97316"
                bColor="#0ea5e9"
              />
            );
          }}
        />
      </div>

      {/* Opus 4.7 CPU vs GPU split — fast-mode vs regular */}
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

      {/* Opus 4.7 Prefill vs Decode split — fast-mode vs regular */}
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
                aColor="#f97316"
                bColor="#0ea5e9"
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
                aColor="#f97316"
                bColor="#0ea5e9"
              />
            )
          }
        />
      </div>

      {/* Opus 4.8 CPU vs GPU split — fast-mode vs regular */}
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

      {/* Opus 4.8 Prefill vs Decode split — fast-mode vs regular */}
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
                aColor="#f97316"
                bColor="#0ea5e9"
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
                aColor="#f97316"
                bColor="#0ea5e9"
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
