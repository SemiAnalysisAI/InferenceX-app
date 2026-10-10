'use client';

import { Suspense, useMemo, useState } from 'react';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { formatDuration, formatNumber } from '@/lib/agentic-workload-explorer/format';
import {
  ChartSkeleton,
  SkeletonSectionHeader,
  StatGridSkeleton,
} from '@/components/agentic-workload-explorer/dashboard-skeleton';
import {
  buildColorMap,
  formatAxisNumber,
  formatAxisPercent,
  SectionHeader,
  StatCard,
  TrendsLineChart,
  TrendsStackedChart,
  type LineSeries,
  type StackedDayPoint,
} from '@/components/agentic-workload-explorer/trends-charts';
import {
  HARNESS_LABELS,
  HARNESSES,
  type Harness,
} from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import {
  LAST_DAY_ISO,
  PREV_DAY_LABEL,
  SNAPSHOT_NOW_MS,
} from '@/lib/agentic-workload-explorer/snapshot';
import { useLocale } from '@/lib/i18n/use-locale';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';

// ── i18n ────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    description:
      'Behavior over time — model mix, cache/context trends, a compaction-rate heuristic, CLI version adoption, and E2E latency, all from one cached daily rollup.',
    stats: 'Stats',
    modelsTracked: 'Models Tracked',
    cacheHitLabel: (date: string) => `Cache Hit (${date})`,
    compactionRateLabel: 'Compaction Rate (final 7d avg)',
    compactionPerSession: (v: string) => `${v}/session`,
    harnessVersionsSeen: 'Harness Versions Seen',
    e2eLatencyP50Label: (date: string) => `E2E Latency p50 (${date})`,
    ttftP50Label: (date: string) => `TTFT p50 (${date})`,
    modelMix: '1 · Model Mix',
    cacheHitRateTrend: '2 · Cache Hit-Rate Trend',
    contextGrowth: '3 · Context Growth',
    compactionRateProxy: '4 · Compaction-Rate Proxy',
    cliVersionMix: '5 · CLI-Version Mix',
    latencyTrend: '6 · Latency Trend',
    modelMixTitle: 'Model Mix Over Time',
    modelMixSubtext: (metric: string) => `Daily ${metric} share by model — full history`,
    cacheHitTitle: 'Cache Hit-Rate Trend',
    cacheHitSubtext: 'cache_read / (cache_read + input) — full history',
    contextGrowthTitle: 'Context Growth',
    contextGrowthSubtext: 'Avg (input + cache_read) tokens per request — full history',
    compactionTitle: 'Compaction-Like Context Resets',
    compactionSubtext: 'Candidate rate per day (heuristic — see explanation above)',
    compactionExplanation: (dropPct: number, gapMin: number, minPrev: string, windowDays: number) =>
      `Heuristic, not a ground-truth signal: Anthropic doesn't mark compaction in any traced field. A "candidate" is a request whose cache_read_input_tokens drops to ≤${dropPct}% of the previous request in the same session (with total context shrinking too), excluding the first request of a session and gaps ≥${gapMin} min (those are session starts / idle restarts, not compaction). Requires ≥${minPrev} prior cache-read tokens so the drop is measured against a real context, not noise. Computed over a trailing ${windowDays}-day window.`,
    cliVersionMixTitle: 'CLI-Version Mix Over Time',
    cliVersionMixSubtextAll:
      'Daily new-session share by harness — pick a harness to see its versions',
    cliVersionMixSubtextByHarness: (label: string) =>
      `Daily new-session share by ${label} version — full history`,
    latencyTitle: 'E2E Latency / TTFT Trend',
    latencySubtext: (windowDays: number) =>
      `p50 / p95 duration_ms, p50 TTFT (streaming only) — trailing ${windowDays}d`,
    failedToLoad: 'Failed to load trends data',
    loading: 'Loading',
    overall: 'Overall',
    candidatesPerReq: 'Candidates / 1,000 requests',
    candidatesPerSession: 'Candidates / active session',
    e2eLatencyP50: 'E2E Latency p50',
    e2eLatencyP95: 'E2E Latency p95',
    ttftP50Streaming: 'TTFT p50 (streaming)',
    noDataInWindow: 'No data in this window',
    toggleRequests: 'REQUESTS',
    toggleTokens: 'TOKENS',
    toggleShare: 'SHARE',
    toggleCount: 'COUNT',
    toggleOverall: 'OVERALL',
    togglePerModel: 'PER-MODEL',
    togglePer1kReq: 'PER 1K REQ',
    togglePerSession: 'PER SESSION',
    toggleAll: 'ALL',
    toggle30d: '30D',
    toggle90d: '90D',
    toggleAllHarnesses: 'ALL HARNESSES',
  },
  zh: {
    description:
      '行为随时间变化 — 模型组合、cache / 上下文趋势、compaction 启发式指标、CLI 版本采用及端到端延迟，数据来自统一的每日汇总缓存。',
    stats: '统计',
    modelsTracked: '跟踪模型数',
    cacheHitLabel: (date: string) => `Cache 命中率（${date}）`,
    compactionRateLabel: 'Compaction 率（最后 7 天均值）',
    compactionPerSession: (v: string) => `${v}/会话`,
    harnessVersionsSeen: 'Harness 版本数',
    e2eLatencyP50Label: (date: string) => `端到端延迟 p50（${date}）`,
    ttftP50Label: (date: string) => `TTFT p50（${date}）`,
    modelMix: '1 · 模型组合',
    cacheHitRateTrend: '2 · Cache 命中率趋势',
    contextGrowth: '3 · 上下文增长',
    compactionRateProxy: '4 · Compaction 率代理指标',
    cliVersionMix: '5 · CLI 版本组合',
    latencyTrend: '6 · 延迟趋势',
    modelMixTitle: '模型组合随时间变化',
    modelMixSubtext: (metric: string) => `每日${metric}按模型占比 — 完整历史`,
    cacheHitTitle: 'Cache 命中率趋势',
    cacheHitSubtext: 'cache_read / (cache_read + input) — 完整历史',
    contextGrowthTitle: '上下文增长',
    contextGrowthSubtext: '平均每请求 (input + cache_read) token 数 — 完整历史',
    compactionTitle: '类 Compaction 上下文重置',
    compactionSubtext: '每日候选率（启发式指标 — 参见上方说明）',
    compactionExplanation: (dropPct: number, gapMin: number, minPrev: string, windowDays: number) =>
      `启发式指标，非真实信号：Anthropic 未在任何 trace 字段中标记 compaction。“候选”请求是指 cache_read_input_tokens 降至同会话前一请求的 ≤${dropPct}%（且总上下文也在缩小），排除会话首请求及间隔 ≥${gapMin} 分钟的请求（属于会话启动或闲置重启，而非 compaction）。前一请求需有 ≥${minPrev} 个 cache-read token，确保下降幅度基于真实上下文，而非噪声。统计窗口为最后 ${windowDays} 天。`,
    cliVersionMixTitle: 'CLI 版本组合随时间变化',
    cliVersionMixSubtextAll: '每日新会话按 harness 占比 — 选择一个 harness 查看其版本',
    cliVersionMixSubtextByHarness: (label: string) => `每日新会话按 ${label} 版本占比 — 完整历史`,
    latencyTitle: '端到端延迟 / TTFT 趋势',
    latencySubtext: (windowDays: number) =>
      `p50 / p95 duration_ms、p50 TTFT（仅 streaming） — 最后 ${windowDays} 天`,
    failedToLoad: '加载趋势数据失败',
    loading: '加载中',
    overall: '整体',
    candidatesPerReq: '候选数 / 1,000 请求',
    candidatesPerSession: '候选数 / 活跃会话',
    e2eLatencyP50: '端到端延迟 p50',
    e2eLatencyP95: '端到端延迟 p95',
    ttftP50Streaming: 'TTFT p50（streaming）',
    noDataInWindow: '所选时间段暂无数据',
    toggleRequests: '请求数',
    toggleTokens: 'Token',
    toggleShare: '占比',
    toggleCount: '计数',
    toggleOverall: '整体',
    togglePerModel: '按模型',
    togglePer1kReq: '每千请求',
    togglePerSession: '每会话',
    toggleAll: '全部',
    toggle30d: '30 天',
    toggle90d: '90 天',
    toggleAllHarnesses: '全部 harness',
  },
};

// ─────────────────────────────────────────────────────────────────────────
// /trends — "behavior over time". Reads ONE payload from
// /api/trends (cache-backed, see packages/db/src/trends.ts) and derives
// every chart below from
// its raw daily rows client-side, mirroring how /models derives
// cacheHitRatio/fastModePct from raw totals rather than having the server
// pre-compute ratios.
// ─────────────────────────────────────────────────────────────────────────

// ── Wire types (camelCased mirror of TrendsPayload in packages/db/src/trends.ts) ──

interface DailyModelPoint {
  day: string;
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteTokens: number;
}

interface DailyCompactionPoint {
  day: string;
  requestCount: number;
  sessionCount: number;
  candidateCount: number;
}

interface DailyCliVersionPoint {
  day: string;
  cliVersion: string | null;
  sessionCount: number;
}

interface DailyHarnessVersionPoint {
  day: string;
  harness: Harness;
  version: string | null;
  sessionCount: number;
}

interface DailyLatencyPoint {
  day: string;
  durationP50: number;
  durationP95: number;
  ttftP50: number;
  sampleCount: number;
  streamingSampleCount: number;
}

interface TrendsMeta {
  compactionWindowDays: number;
  latencyWindowDays: number;
  compactionIdleGapMs: number;
  compactionMinPrevCacheRead: number;
  compactionCliffDropRatio: number;
  generatedAt: string;
}

interface TrendsData {
  dailyModel: DailyModelPoint[];
  dailyCompaction: DailyCompactionPoint[];
  dailyCliVersion: DailyCliVersionPoint[];
  dailyLatency: DailyLatencyPoint[];
  meta: TrendsMeta;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function shortenModel(model: string): string {
  return model.replace(/^claude-/u, '').replace(/-\d{8}$/u, '');
}

type WindowChoice = '30d' | '90d' | 'all';

function windowCutoffMs(choice: WindowChoice): number | null {
  if (choice === 'all') return null;
  const days = choice === '30d' ? 30 : 90;
  return SNAPSHOT_NOW_MS - days * 24 * 60 * 60 * 1000;
}

/**
 * True for complete UTC days; the snapshot's last day is partial. Compares
 * instants because cached payloads carry Date strings ("Fri Sep 25 2026 …"),
 * not ISO days.
 */
function isCompleteDay(day: string): boolean {
  return dayTime(day) < Date.parse(LAST_DAY_ISO);
}

function dayTime(day: string): number {
  return new Date(day).getTime();
}

interface RatioAcc {
  a: number;
  b: number;
}

/** Group DailyModelPoint rows by day and (optionally) by model, accumulating an (a, b) pair per bucket. */
function groupByDayAndKey(
  rows: DailyModelPoint[],
  cutoff: number | null,
  perModel: boolean,
  accumulate: (acc: RatioAcc, r: DailyModelPoint) => void,
): Map<string, Map<string, RatioAcc>> {
  const groups = new Map<string, Map<string, RatioAcc>>();
  for (const r of rows) {
    if (cutoff !== null && dayTime(r.day) < cutoff) continue;
    const key = perModel ? r.model : 'all';
    let dayMap = groups.get(r.day);
    if (!dayMap) {
      dayMap = new Map();
      groups.set(r.day, dayMap);
    }
    const cur = dayMap.get(key) ?? { a: 0, b: 0 };
    accumulate(cur, r);
    dayMap.set(key, cur);
  }
  return groups;
}

function pivotToSeries(
  groups: Map<string, Map<string, RatioAcc>>,
  valueOf: (acc: RatioAcc) => number,
  colorMap: Record<string, string>,
  overallLabel: string,
): LineSeries[] {
  const seriesMap = new Map<string, { day: string; value: number }[]>();
  for (const [day, dayMap] of groups) {
    for (const [key, acc] of dayMap) {
      const arr = seriesMap.get(key) ?? [];
      arr.push({ day, value: valueOf(acc) });
      seriesMap.set(key, arr);
    }
  }
  return [...seriesMap.entries()]
    .map(([key, points]) => ({
      key,
      label: key === 'all' ? overallLabel : shortenModel(key),
      color: key === 'all' ? '#10b981' : colorMap[key] || '#94a3b8',
      points: points.toSorted((p1, p2) => dayTime(p1.day) - dayTime(p2.day)),
    }))
    .toSorted((s1, s2) =>
      s1.key === 'all' ? -1 : s2.key === 'all' ? 1 : s1.label.localeCompare(s2.label),
    );
}

// ── Small toggle control (window selector, share/count, overall/per-model) ──

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
  trackEvent,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  trackEvent?: string;
}) {
  return (
    <SegmentedToggle
      value={value}
      options={options.map((option) => ({ value: option.key, label: option.label }))}
      onValueChange={(next) => {
        if (trackEvent) track(trackEvent, { value: next });
        onChange(next);
      }}
      ariaLabel={options.map((option) => option.label).join(' / ')}
      role="group"
      className="flex-wrap"
    />
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────

function TrendsSkeleton({ strings }: { strings: (typeof STRINGS)['en'] }) {
  return (
    <div className="space-y-5">
      <section>
        <SkeletonSectionHeader label={strings.stats} />
        <StatGridSkeleton count={6} />
      </section>
      {Array.from({ length: 6 }).map((_, i) => (
        <section key={i}>
          <SkeletonSectionHeader label={strings.loading} />
          <ChartSkeleton />
        </section>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export default function TrendsPage() {
  return (
    <Suspense>
      <TrendsPageContent />
    </Suspense>
  );
}

function TrendsPageContent() {
  const t = STRINGS[useLocale()];
  const { apiParam: traceVersionParam } = useTraceVersion();
  const [windowChoice, setWindowChoice] = useState<WindowChoice>('90d');
  const [modelMetric, setModelMetric] = useState<'requests' | 'tokens'>('requests');
  const [modelMode, setModelMode] = useState<'share' | 'count'>('share');
  const [cacheHitPerModel, setCacheHitPerModel] = useState(false);
  const [contextPerModel, setContextPerModel] = useState(false);
  const [compactionDenom, setCompactionDenom] = useState<'requests' | 'sessions'>('requests');
  const [cliMode, setCliMode] = useState<'share' | 'count'>('share');
  const [cliHarness, setCliHarness] = useState<Harness | 'all'>('all');

  const { data, loading } = useDashboardData<TrendsData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/trends', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: String(traceVersionParam),
  });

  // Harness-aware version mix is read live; the trends cache only has
  // Claude Code's cliVersion.
  const { data: harnessVersions } = useDashboardData<DailyHarnessVersionPoint[]>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion(
          '/api/v1/agentic-workload-explorer/trends/harness-versions',
          traceVersionParam,
        ),
        {
          signal,
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: String(traceVersionParam),
  });

  const cutoff = windowCutoffMs(windowChoice);

  // Dated and undated ids (claude-haiku-4-5, claude-haiku-4-5-20251001) are
  // one model; key every chart by the short name so they merge.
  const dailyModel = useMemo(
    () => data?.dailyModel.map((r) => ({ ...r, model: shortenModel(r.model) })) ?? [],
    [data],
  );

  // Stable color map across the full history, independent of window choice.
  const allModelsFull = useMemo(() => {
    const set = new Set<string>();
    for (const row of dailyModel) set.add(row.model);
    return [...set].toSorted();
  }, [dailyModel]);
  const modelColorMap = useMemo(() => buildColorMap(allModelsFull), [allModelsFull]);

  // ── Chart 1: Model mix over time (stacked share/count, requests or tokens) ──
  const modelDays: StackedDayPoint[] = useMemo(() => {
    const byDay = new Map<string, Record<string, number>>();
    for (const row of dailyModel) {
      if (cutoff !== null && dayTime(row.day) < cutoff) continue;
      const bucket = byDay.get(row.day) ?? {};
      const metricValue =
        modelMetric === 'requests'
          ? row.requestCount
          : row.inputTokens + row.outputTokens + row.cacheReadInputTokens + row.cacheWriteTokens;
      bucket[row.model] = (bucket[row.model] ?? 0) + metricValue;
      byDay.set(row.day, bucket);
    }
    return [...byDay.entries()]
      .map(([day, values]) => ({ day, values }))
      .toSorted((a, b) => dayTime(a.day) - dayTime(b.day));
  }, [dailyModel, cutoff, modelMetric]);

  const modelDaysKeys = useMemo(() => {
    const set = new Set<string>();
    for (const d of modelDays) for (const k of Object.keys(d.values)) set.add(k);
    return [...set].toSorted();
  }, [modelDays]);

  // ── Chart 2: Cache hit-rate trend ──
  const cacheHitSeries = useMemo(() => {
    const groups = groupByDayAndKey(dailyModel, cutoff, cacheHitPerModel, (acc, r) => {
      acc.a += r.cacheReadInputTokens;
      acc.b += r.cacheReadInputTokens + r.inputTokens;
    });
    return pivotToSeries(
      groups,
      (acc) => (acc.b > 0 ? (acc.a / acc.b) * 100 : 0),
      modelColorMap,
      t.overall,
    );
  }, [dailyModel, cutoff, cacheHitPerModel, modelColorMap, t]);

  // ── Chart 3: Context growth (avg input+cache_read tokens per request) ──
  const contextGrowthSeries = useMemo(() => {
    const groups = groupByDayAndKey(dailyModel, cutoff, contextPerModel, (acc, r) => {
      acc.a += r.inputTokens + r.cacheReadInputTokens;
      acc.b += r.requestCount;
    });
    return pivotToSeries(
      groups,
      (acc) => (acc.b > 0 ? acc.a / acc.b : 0),
      modelColorMap,
      t.overall,
    );
  }, [dailyModel, cutoff, contextPerModel, modelColorMap, t]);

  // ── Chart 4: Compaction-rate proxy (heuristic) ──
  const compactionRows = useMemo(() => {
    if (!data) return [];
    return data.dailyCompaction
      .filter((r) => cutoff === null || dayTime(r.day) >= cutoff)
      .toSorted((a, b) => dayTime(a.day) - dayTime(b.day));
  }, [data, cutoff]);

  const compactionSeries: LineSeries[] = useMemo(
    () => [
      {
        key: 'rate',
        label: compactionDenom === 'requests' ? t.candidatesPerReq : t.candidatesPerSession,
        color: '#ef4444',
        points: compactionRows.map((r) => ({
          day: r.day,
          value:
            compactionDenom === 'requests'
              ? r.requestCount > 0
                ? (r.candidateCount / r.requestCount) * 1000
                : 0
              : r.sessionCount > 0
                ? r.candidateCount / r.sessionCount
                : 0,
        })),
      },
    ],
    [compactionRows, compactionDenom, t],
  );

  const compactionRecent = useMemo(() => {
    if (!data || data.dailyCompaction.length === 0) return null;
    // Final 7 complete UTC days; the snapshot's last day is partial.
    const rows = data.dailyCompaction
      .filter((r) => isCompleteDay(r.day))
      .toSorted((a, b) => dayTime(b.day) - dayTime(a.day))
      .slice(0, 7);
    const totalReq = rows.reduce((s, r) => s + r.requestCount, 0);
    const totalCand = rows.reduce((s, r) => s + r.candidateCount, 0);
    const totalSessions = rows.reduce((s, r) => s + r.sessionCount, 0);
    return {
      perThousand: totalReq > 0 ? (totalCand / totalReq) * 1000 : 0,
      perSession: totalSessions > 0 ? totalCand / totalSessions : 0,
      days: rows.length,
    };
  }, [data]);

  // ── Chart 5: Harness-version mix over time ──
  const cliDays: StackedDayPoint[] = useMemo(() => {
    if (!harnessVersions) return [];
    const byDay = new Map<string, Record<string, number>>();
    for (const row of harnessVersions) {
      if (cutoff !== null && dayTime(row.day) < cutoff) continue;
      if (cliHarness !== 'all' && row.harness !== cliHarness) continue;
      // Across harnesses the versions aren't comparable, so stack by harness.
      const key = cliHarness === 'all' ? HARNESS_LABELS[row.harness] : (row.version ?? 'unknown');
      const bucket = byDay.get(row.day) ?? {};
      bucket[key] = (bucket[key] ?? 0) + row.sessionCount;
      byDay.set(row.day, bucket);
    }
    return [...byDay.entries()]
      .map(([day, values]) => ({ day, values }))
      .toSorted((a, b) => dayTime(a.day) - dayTime(b.day));
  }, [harnessVersions, cutoff, cliHarness]);

  const allCliVersions = useMemo(() => {
    const set = new Set<string>();
    for (const row of cliDays) for (const k of Object.keys(row.values)) set.add(k);
    return [...set].toSorted((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [cliDays]);
  const cliColorMap = useMemo(() => buildColorMap(allCliVersions), [allCliVersions]);
  const harnessVersionCount = useMemo(
    () => new Set(harnessVersions?.map((r) => `${r.harness} ${r.version}`)).size,
    [harnessVersions],
  );

  // ── Chart 6: Latency trend ──
  const latencySeries: LineSeries[] = useMemo(() => {
    if (!data) return [];
    const rows = data.dailyLatency
      .filter((r) => cutoff === null || dayTime(r.day) >= cutoff)
      .toSorted((a, b) => dayTime(a.day) - dayTime(b.day));
    return [
      {
        key: 'p50',
        label: t.e2eLatencyP50,
        color: '#6366f1',
        points: rows
          .filter((r) => r.sampleCount > 0)
          .map((r) => ({ day: r.day, value: r.durationP50 })),
      },
      {
        key: 'p95',
        label: t.e2eLatencyP95,
        color: '#f59e0b',
        points: rows
          .filter((r) => r.sampleCount > 0)
          .map((r) => ({ day: r.day, value: r.durationP95 })),
      },
      {
        key: 'ttft',
        label: t.ttftP50Streaming,
        color: '#06b6d4',
        points: rows
          .filter((r) => r.streamingSampleCount > 0)
          .map((r) => ({ day: r.day, value: r.ttftP50 })),
      },
    ];
  }, [data, cutoff, t]);

  // ── Headline stats ──
  // "Latest" = the snapshot's last complete UTC day, not the partial final day.
  const latestCacheHit =
    cacheHitSeries
      .find((s) => s.key === 'all')
      ?.points.filter((p) => isCompleteDay(p.day))
      .at(-1)?.value ?? null;
  const latestLatencyP50 = data?.dailyLatency
    .filter((r) => isCompleteDay(r.day))
    .toSorted((a, b) => dayTime(b.day) - dayTime(a.day))[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="text-3xs font-mono text-muted-foreground">{t.description}</div>
        <ToggleGroup
          value={windowChoice}
          onChange={setWindowChoice}
          options={[
            { key: '30d', label: t.toggle30d },
            { key: '90d', label: t.toggle90d },
            { key: 'all', label: t.toggleAll },
          ]}
          trackEvent="agentic_workload_trends_window_changed"
        />
      </div>

      {loading ? (
        <TrendsSkeleton strings={t} />
      ) : data ? (
        <>
          {/* Stats */}
          <div>
            <SectionHeader label={t.stats} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <StatCard label={t.modelsTracked} value={String(allModelsFull.length)} />
              <StatCard
                label={t.cacheHitLabel(PREV_DAY_LABEL)}
                value={latestCacheHit === null ? '—' : `${latestCacheHit.toFixed(1)}%`}
              />
              <StatCard
                label={t.compactionRateLabel}
                value={compactionRecent ? `${compactionRecent.perThousand.toFixed(1)}/1k req` : '—'}
                detail={
                  compactionRecent
                    ? t.compactionPerSession(compactionRecent.perSession.toFixed(2))
                    : undefined
                }
              />
              <StatCard label={t.harnessVersionsSeen} value={String(harnessVersionCount)} />
              <StatCard
                label={t.e2eLatencyP50Label(PREV_DAY_LABEL)}
                value={latestLatencyP50 ? formatDuration(latestLatencyP50.durationP50) : '—'}
              />
              <StatCard
                label={t.ttftP50Label(PREV_DAY_LABEL)}
                value={
                  latestLatencyP50 && latestLatencyP50.streamingSampleCount > 0
                    ? formatDuration(latestLatencyP50.ttftP50)
                    : '—'
                }
              />
            </div>
          </div>

          {/* 1. Model mix over time */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                {t.modelMix}
              </div>
              <div className="flex items-center gap-2">
                <ToggleGroup
                  value={modelMetric}
                  onChange={setModelMetric}
                  options={[
                    { key: 'requests', label: t.toggleRequests },
                    { key: 'tokens', label: t.toggleTokens },
                  ]}
                  trackEvent="agentic_workload_trends_model_metric_changed"
                />
                <ToggleGroup
                  value={modelMode}
                  onChange={setModelMode}
                  options={[
                    { key: 'share', label: t.toggleShare },
                    { key: 'count', label: t.toggleCount },
                  ]}
                  trackEvent="agentic_workload_trends_model_mode_changed"
                />
              </div>
            </div>
            <TrendsStackedChart
              title={t.modelMixTitle}
              subtext={t.modelMixSubtext(modelMetric)}
              days={modelDays}
              seriesKeys={modelDaysKeys}
              labelFor={shortenModel}
              colorFor={(k) => modelColorMap[k] || '#94a3b8'}
              mode={modelMode}
              filename="trends-model-mix.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>

          {/* 2. Cache hit-rate trend */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                {t.cacheHitRateTrend}
              </div>
              <ToggleGroup
                value={cacheHitPerModel ? 'per-model' : 'overall'}
                onChange={(v) => setCacheHitPerModel(v === 'per-model')}
                options={[
                  { key: 'overall', label: t.toggleOverall },
                  { key: 'per-model', label: t.togglePerModel },
                ]}
                trackEvent="agentic_workload_trends_cache_hit_mode_changed"
              />
            </div>
            <TrendsLineChart
              title={t.cacheHitTitle}
              subtext={t.cacheHitSubtext}
              series={cacheHitSeries}
              yFormatter={formatAxisPercent}
              filename="trends-cache-hit-rate.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>

          {/* 3. Context growth */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                {t.contextGrowth}
              </div>
              <ToggleGroup
                value={contextPerModel ? 'per-model' : 'overall'}
                onChange={(v) => setContextPerModel(v === 'per-model')}
                options={[
                  { key: 'overall', label: t.toggleOverall },
                  { key: 'per-model', label: t.togglePerModel },
                ]}
                trackEvent="agentic_workload_trends_context_mode_changed"
              />
            </div>
            <TrendsLineChart
              title={t.contextGrowthTitle}
              subtext={t.contextGrowthSubtext}
              series={contextGrowthSeries}
              yFormatter={formatAxisNumber}
              filename="trends-context-growth.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>

          {/* 4. Compaction-rate proxy */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                {t.compactionRateProxy}
              </div>
              <ToggleGroup
                value={compactionDenom}
                onChange={setCompactionDenom}
                options={[
                  { key: 'requests', label: t.togglePer1kReq },
                  { key: 'sessions', label: t.togglePerSession },
                ]}
                trackEvent="agentic_workload_trends_compaction_denom_changed"
              />
            </div>
            <div className="mb-2 text-3xs font-mono text-subtle leading-relaxed">
              {t.compactionExplanation(
                Math.round((1 - data.meta.compactionCliffDropRatio) * 100),
                Math.round(data.meta.compactionIdleGapMs / 60_000),
                formatNumber(data.meta.compactionMinPrevCacheRead),
                data.meta.compactionWindowDays,
              )}
            </div>
            <TrendsLineChart
              title={t.compactionTitle}
              subtext={t.compactionSubtext}
              series={compactionSeries}
              yFormatter={formatAxisNumber}
              filename="trends-compaction-rate.png"
              yMin={0}
              emptyLabel={t.noDataInWindow}
            />
          </div>

          {/* 5. CLI-version mix over time */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                {t.cliVersionMix}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ToggleGroup
                  value={cliHarness}
                  onChange={setCliHarness}
                  options={[
                    { key: 'all' as const, label: t.toggleAllHarnesses },
                    ...HARNESSES.map((h) => ({ key: h, label: HARNESS_LABELS[h].toUpperCase() })),
                  ]}
                  trackEvent="agentic_workload_trends_cli_harness_changed"
                />
                <ToggleGroup
                  value={cliMode}
                  onChange={setCliMode}
                  options={[
                    { key: 'share', label: t.toggleShare },
                    { key: 'count', label: t.toggleCount },
                  ]}
                  trackEvent="agentic_workload_trends_cli_mode_changed"
                />
              </div>
            </div>
            <TrendsStackedChart
              title={t.cliVersionMixTitle}
              subtext={
                cliHarness === 'all'
                  ? t.cliVersionMixSubtextAll
                  : t.cliVersionMixSubtextByHarness(HARNESS_LABELS[cliHarness])
              }
              days={cliDays}
              seriesKeys={allCliVersions}
              labelFor={(k) => k}
              colorFor={(k) => cliColorMap[k] || '#94a3b8'}
              mode={cliMode}
              filename="trends-cli-version-mix.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>

          {/* 6. Latency trend */}
          <div>
            <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground mb-1">
              {t.latencyTrend}
            </div>
            <TrendsLineChart
              title={t.latencyTitle}
              subtext={t.latencySubtext(data.meta.latencyWindowDays)}
              series={latencySeries}
              yFormatter={formatDuration}
              filename="trends-latency.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>
        </>
      ) : (
        <div className="text-sm font-mono text-muted-foreground text-center py-8">
          {t.failedToLoad}
        </div>
      )}
    </div>
  );
}
