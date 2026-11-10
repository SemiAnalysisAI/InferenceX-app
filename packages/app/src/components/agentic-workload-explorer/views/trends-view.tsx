'use client';

import { Suspense, useMemo, useState } from 'react';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { bucketLabel, formatDuration, formatNumber } from '@/lib/agentic-workload-explorer/format';
import {
  ChartSkeleton,
  SkeletonSectionHeader,
  StatGridSkeleton,
} from '@/components/agentic-workload-explorer/dashboard-skeleton';
import {
  buildColorMap,
  formatAxisNumber,
  formatAxisPercent,
  TrendsLineChart,
  TrendsStackedChart,
  type LineSeries,
  type StackedDayPoint,
} from '@/components/agentic-workload-explorer/trends-charts';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { NEUTRAL_SERIES_COLOR } from '@/components/agentic-workload-explorer/series-colors';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { HARNESSES, type Harness } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';
import { harnessLabel } from '@/lib/agentic-workload-explorer/harness-label';
import {
  LAST_DAY_ISO,
  prevDayLabel,
  SNAPSHOT_NOW_MS,
} from '@/lib/agentic-workload-explorer/snapshot';
import { useLocale } from '@/lib/i18n/use-locale';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    description:
      'Behavior over time — model mix, cache/context trends, a compaction-rate heuristic, CLI version adoption, and E2E latency, all from one cached daily rollup.',
    stats: 'Stats',
    modelsTracked: 'Models tracked',
    cacheHitLabel: (date: string) => `Cache hit (${date})`,
    compactionRateLabel: 'Compaction rate (final 7d avg)',
    compactionPerSession: (v: string) => `${v}/session`,
    harnessVersionsSeen: 'Harness versions seen',
    e2eLatencyP50Label: (date: string) => `E2E latency p50 (${date})`,
    ttftP50Label: (date: string) => `TTFT p50 (${date})`,
    other: 'Other',
    modelMixTitle: 'Model mix over time',
    modelMixSubtext: (metric: string, range: string) => `Daily ${metric} share by model · ${range}`,
    cacheHitTitle: 'Cache hit-rate trend',
    cacheHitSubtext: (range: string) => `cache_read / (cache_read + input) · ${range}`,
    contextGrowthTitle: 'Context growth',
    contextGrowthSubtext: (range: string) =>
      `Avg (input + cache_read) tokens per request · ${range}`,
    compactionTitle: 'Compaction-like context resets',
    compactionSubtext: 'Candidate rate per day · heuristic, see explanation above',
    compactionExplanation: (dropPct: number, gapMin: number, minPrev: string, windowDays: number) =>
      `Heuristic, not a ground-truth signal: Anthropic doesn't mark compaction in any traced field. A "candidate" is a request whose cache_read_input_tokens drops to ≤${dropPct}% of the previous request in the same session (with total context shrinking too), excluding the first request of a session and gaps ≥${gapMin} min (those are session starts / idle restarts, not compaction). Requires ≥${minPrev} prior cache-read tokens so the drop is measured against a real context, not noise. Computed over a trailing ${windowDays}-day window.`,
    cliVersionMixTitle: 'CLI-version mix over time',
    cliVersionMixSubtextAll:
      'Daily new-session share by harness · pick a harness to see its versions',
    cliVersionMixSubtextByHarness: (label: string, range: string) =>
      `Daily new-session share by ${label} version · ${range}`,
    latencyTitle: 'E2E latency / TTFT trend',
    latencySubtext: (windowDays: number) =>
      `p50 / p95 duration_ms, p50 TTFT (streaming only) · Final ${windowDays} days`,
    failedToLoad: 'Failed to load trends data',
    loading: 'Loading',
    overall: 'Overall',
    candidatesPerReq: 'Candidates / 1,000 requests',
    candidatesPerSession: 'Candidates / active session',
    e2eLatencyP50: 'E2E latency p50',
    e2eLatencyP95: 'E2E latency p95',
    ttftP50Streaming: 'TTFT p50 (streaming)',
    noDataInWindow: 'No data in this window',
    toggleRequests: 'Requests',
    toggleTokens: 'Tokens',
    toggleShare: 'Share',
    toggleCount: 'Count',
    toggleOverall: 'Overall',
    togglePerModel: 'Per model',
    togglePer1kReq: 'Per 1K req',
    togglePerSession: 'Per session',
    toggleAll: 'All',
    toggle30d: '30D',
    toggle90d: '90D',
    windowLabels: { '30d': 'Final 30 days', '90d': 'Final 90 days', all: 'Full history' },
    toggleAllHarnesses: 'All harnesses',
    yRequests: 'Requests',
    yTokens: 'Tokens',
    yShareOfRequests: 'Share of requests',
    yShareOfTokens: 'Share of tokens',
    ySessions: 'Sessions',
    yShareOfSessions: 'Share of sessions',
    yHitRate: 'Hit rate',
    yTokensPerRequest: 'Tokens / request',
    yLatency: 'Latency',
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
    other: '其他',
    modelMixTitle: '模型组合随时间变化',
    modelMixSubtext: (metric: string, range: string) =>
      `每日${metric === 'requests' ? '请求数' : ' token '}按模型占比 · ${range}`,
    cacheHitTitle: 'Cache 命中率趋势',
    cacheHitSubtext: (range: string) => `cache_read / (cache_read + input) · ${range}`,
    contextGrowthTitle: '上下文增长',
    contextGrowthSubtext: (range: string) => `平均每请求 (input + cache_read) token 数 · ${range}`,
    compactionTitle: '类 Compaction 上下文重置',
    compactionSubtext: '每日候选率 · 启发式指标，参见上方说明',
    compactionExplanation: (dropPct: number, gapMin: number, minPrev: string, windowDays: number) =>
      `启发式指标，非真实信号：Anthropic 未在任何 trace 字段中标记 compaction。“候选”请求是指 cache_read_input_tokens 降至同会话前一请求的 ≤${dropPct}%（且总上下文也在缩小），排除会话首请求及间隔 ≥${gapMin} 分钟的请求（属于会话启动或闲置重启，而非 compaction）。前一请求需有 ≥${minPrev} 个 cache-read token，确保下降幅度基于真实上下文，而非噪声。统计窗口为最后 ${windowDays} 天。`,
    cliVersionMixTitle: 'CLI 版本组合随时间变化',
    cliVersionMixSubtextAll: '每日新会话按 harness 占比 · 选择一个 harness 查看其版本',
    cliVersionMixSubtextByHarness: (label: string, range: string) =>
      `每日新会话按 ${label} 版本占比 · ${range}`,
    latencyTitle: '端到端延迟 / TTFT 趋势',
    latencySubtext: (windowDays: number) =>
      `p50 / p95 duration_ms、p50 TTFT（仅 streaming） · 最后 ${windowDays} 天`,
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
    windowLabels: { '30d': '最后 30 天', '90d': '最后 90 天', all: '完整历史' },
    toggleAllHarnesses: '全部 harness',
    yRequests: '请求数',
    yTokens: 'Token 数',
    yShareOfRequests: '请求占比',
    yShareOfTokens: 'Token 占比',
    ySessions: '会话数',
    yShareOfSessions: '会话占比',
    yHitRate: '命中率',
    yTokensPerRequest: 'Token 数 / 请求',
    yLatency: '延迟',
  },
};

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

function shortenModel(model: string): string {
  return model.replace(/^claude-/u, '').replace(/-\d{8}$/u, '');
}

const MODEL_MIX_TOP_N = 8;
const MODEL_MIX_OTHER_KEY = '__other__';

type WindowChoice = '30d' | '90d' | 'all';

function windowCutoffMs(choice: WindowChoice): number | null {
  if (choice === 'all') return null;
  const days = choice === '30d' ? 30 : 90;
  return SNAPSHOT_NOW_MS - days * 24 * 60 * 60 * 1000;
}

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

export default function TrendsPage() {
  return (
    <Suspense>
      <TrendsPageContent />
    </Suspense>
  );
}

function TrendsPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const prevDay = prevDayLabel(locale);
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

  const dailyModel = useMemo(
    () => data?.dailyModel.map((r) => ({ ...r, model: shortenModel(r.model) })) ?? [],
    [data],
  );

  const allModelsFull = useMemo(() => {
    const set = new Set<string>();
    for (const row of dailyModel) set.add(row.model);
    return [...set].toSorted();
  }, [dailyModel]);
  const modelColorMap = useMemo(() => buildColorMap(allModelsFull), [allModelsFull]);

  const modelMix = useMemo(() => {
    const metricOf = (row: DailyModelPoint) =>
      modelMetric === 'requests'
        ? row.requestCount
        : row.inputTokens + row.outputTokens + row.cacheReadInputTokens + row.cacheWriteTokens;
    const rows = dailyModel.filter((row) => cutoff === null || dayTime(row.day) >= cutoff);
    const totals = new Map<string, number>();
    for (const row of rows) totals.set(row.model, (totals.get(row.model) ?? 0) + metricOf(row));
    const ranked = [...totals.entries()].toSorted((a, b) => b[1] - a[1]).map(([model]) => model);
    const top = ranked.slice(0, MODEL_MIX_TOP_N);
    const topSet = new Set(top);
    const byDay = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const key = topSet.has(row.model) ? row.model : MODEL_MIX_OTHER_KEY;
      const bucket = byDay.get(row.day) ?? {};
      bucket[key] = (bucket[key] ?? 0) + metricOf(row);
      byDay.set(row.day, bucket);
    }
    return {
      days: [...byDay.entries()]
        .map(([day, values]): StackedDayPoint => ({ day, values }))
        .toSorted((a, b) => dayTime(a.day) - dayTime(b.day)),
      keys: ranked.length > top.length ? [...top, MODEL_MIX_OTHER_KEY] : top,
      colors: buildColorMap(top),
    };
  }, [dailyModel, cutoff, modelMetric]);

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
  const cacheHitMin = useMemo(() => {
    const lowest = Math.min(100, ...cacheHitSeries.flatMap((s) => s.points.map((p) => p.value)));
    return Math.max(0, Math.floor((lowest - 5) / 10) * 10);
  }, [cacheHitSeries]);

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

  const cliDays: StackedDayPoint[] = useMemo(() => {
    if (!harnessVersions) return [];
    const byDay = new Map<string, Record<string, number>>();
    for (const row of harnessVersions) {
      if (cutoff !== null && dayTime(row.day) < cutoff) continue;
      if (cliHarness !== 'all' && row.harness !== cliHarness) continue;
      const key =
        cliHarness === 'all'
          ? harnessLabel(row.harness, locale)
          : bucketLabel(row.version ?? 'unknown', locale);
      const bucket = byDay.get(row.day) ?? {};
      bucket[key] = (bucket[key] ?? 0) + row.sessionCount;
      byDay.set(row.day, bucket);
    }
    return [...byDay.entries()]
      .map(([day, values]) => ({ day, values }))
      .toSorted((a, b) => dayTime(a.day) - dayTime(b.day));
  }, [harnessVersions, cutoff, cliHarness, locale]);

  const allCliVersions = useMemo(() => {
    const set = new Set<string>();
    for (const row of cliDays) for (const k of Object.keys(row.values)) set.add(k);
    const unknown = bucketLabel('unknown', locale);
    return [...set].toSorted((a, b) => {
      if (a === unknown) return 1;
      if (b === unknown) return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [cliDays, locale]);
  const cliColorMap = useMemo(() => buildColorMap(allCliVersions), [allCliVersions]);
  const harnessVersionCount = useMemo(
    () => new Set(harnessVersions?.map((r) => `${r.harness} ${r.version}`)).size,
    [harnessVersions],
  );

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
        <div className="text-sm text-muted-foreground">{t.description}</div>
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
          <div>
            <SectionHeader label={t.stats} />
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <Stat boxed label={t.modelsTracked} value={String(allModelsFull.length)} />
              <Stat
                boxed
                label={t.cacheHitLabel(prevDay)}
                value={latestCacheHit === null ? '—' : `${latestCacheHit.toFixed(1)}%`}
              />
              <Stat
                boxed
                label={t.compactionRateLabel}
                value={compactionRecent ? `${compactionRecent.perThousand.toFixed(1)}/1k req` : '—'}
                detail={
                  compactionRecent
                    ? t.compactionPerSession(compactionRecent.perSession.toFixed(2))
                    : undefined
                }
              />
              <Stat boxed label={t.harnessVersionsSeen} value={String(harnessVersionCount)} />
              <Stat
                boxed
                label={t.e2eLatencyP50Label(prevDay)}
                value={latestLatencyP50 ? formatDuration(latestLatencyP50.durationP50) : '—'}
              />
              <Stat
                boxed
                label={t.ttftP50Label(prevDay)}
                value={
                  latestLatencyP50 && latestLatencyP50.streamingSampleCount > 0
                    ? formatDuration(latestLatencyP50.ttftP50)
                    : '—'
                }
              />
            </dl>
          </div>

          <div>
            <TrendsStackedChart
              controls={
                <div className="flex flex-wrap items-center justify-end gap-2">
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
              }
              title={t.modelMixTitle}
              subtext={t.modelMixSubtext(modelMetric, t.windowLabels[windowChoice])}
              days={modelMix.days}
              seriesKeys={modelMix.keys}
              labelFor={(k) => (k === MODEL_MIX_OTHER_KEY ? t.other : k)}
              colorFor={(k) =>
                k === MODEL_MIX_OTHER_KEY ? NEUTRAL_SERIES_COLOR : modelMix.colors[k]
              }
              mode={modelMode}
              yLabel={
                modelMode === 'share'
                  ? modelMetric === 'requests'
                    ? t.yShareOfRequests
                    : t.yShareOfTokens
                  : modelMetric === 'requests'
                    ? t.yRequests
                    : t.yTokens
              }
              filename="trends-model-mix.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>

          <div>
            <TrendsLineChart
              controls={
                <ToggleGroup
                  value={cacheHitPerModel ? 'per-model' : 'overall'}
                  onChange={(v) => setCacheHitPerModel(v === 'per-model')}
                  options={[
                    { key: 'overall', label: t.toggleOverall },
                    { key: 'per-model', label: t.togglePerModel },
                  ]}
                  trackEvent="agentic_workload_trends_cache_hit_mode_changed"
                />
              }
              title={t.cacheHitTitle}
              subtext={t.cacheHitSubtext(t.windowLabels[windowChoice])}
              series={cacheHitSeries}
              yFormatter={formatAxisPercent}
              yLabel={t.yHitRate}
              yMin={cacheHitMin}
              yCeiling={100}
              filename="trends-cache-hit-rate.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>

          <div>
            <TrendsLineChart
              controls={
                <ToggleGroup
                  value={contextPerModel ? 'per-model' : 'overall'}
                  onChange={(v) => setContextPerModel(v === 'per-model')}
                  options={[
                    { key: 'overall', label: t.toggleOverall },
                    { key: 'per-model', label: t.togglePerModel },
                  ]}
                  trackEvent="agentic_workload_trends_context_mode_changed"
                />
              }
              title={t.contextGrowthTitle}
              subtext={t.contextGrowthSubtext(t.windowLabels[windowChoice])}
              series={contextGrowthSeries}
              yFormatter={formatAxisNumber}
              yLabel={t.yTokensPerRequest}
              filename="trends-context-growth.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>

          <div>
            <div className="mb-2 text-3xs text-muted-foreground leading-relaxed">
              {t.compactionExplanation(
                Math.round((1 - data.meta.compactionCliffDropRatio) * 100),
                Math.round(data.meta.compactionIdleGapMs / 60_000),
                formatNumber(data.meta.compactionMinPrevCacheRead),
                data.meta.compactionWindowDays,
              )}
            </div>
            <TrendsLineChart
              controls={
                <ToggleGroup
                  value={compactionDenom}
                  onChange={setCompactionDenom}
                  options={[
                    { key: 'requests', label: t.togglePer1kReq },
                    { key: 'sessions', label: t.togglePerSession },
                  ]}
                  trackEvent="agentic_workload_trends_compaction_denom_changed"
                />
              }
              title={t.compactionTitle}
              subtext={t.compactionSubtext}
              series={compactionSeries}
              yFormatter={formatAxisNumber}
              yLabel={compactionDenom === 'requests' ? t.candidatesPerReq : t.candidatesPerSession}
              filename="trends-compaction-rate.png"
              yMin={0}
              emptyLabel={t.noDataInWindow}
            />
          </div>

          <div>
            <TrendsStackedChart
              controls={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <ToggleGroup
                    value={cliHarness}
                    onChange={setCliHarness}
                    options={[
                      { key: 'all' as const, label: t.toggleAllHarnesses },
                      ...HARNESSES.map((h) => ({ key: h, label: harnessLabel(h, locale) })),
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
              }
              title={t.cliVersionMixTitle}
              subtext={
                cliHarness === 'all'
                  ? t.cliVersionMixSubtextAll
                  : t.cliVersionMixSubtextByHarness(
                      harnessLabel(cliHarness, locale),
                      t.windowLabels[windowChoice],
                    )
              }
              days={cliDays}
              seriesKeys={allCliVersions}
              labelFor={(k) => k}
              colorFor={(k) => cliColorMap[k] || '#94a3b8'}
              mode={cliMode}
              yLabel={cliMode === 'share' ? t.yShareOfSessions : t.ySessions}
              filename="trends-cli-version-mix.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>

          <div>
            <TrendsLineChart
              title={t.latencyTitle}
              subtext={t.latencySubtext(data.meta.latencyWindowDays)}
              series={latencySeries}
              yFormatter={formatDuration}
              yLabel={t.yLatency}
              filename="trends-latency.png"
              emptyLabel={t.noDataInWindow}
            />
          </div>
        </>
      ) : (
        <EmptyState>{t.failedToLoad}</EmptyState>
      )}
    </div>
  );
}
