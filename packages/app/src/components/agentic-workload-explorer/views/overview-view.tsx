'use client';

import { Suspense, useState } from 'react';
import { DashboardOverviewSkeleton } from '@/components/agentic-workload-explorer/dashboard-skeleton';
import {
  formatDollars,
  formatNumber,
  formatDuration,
  formatInteractivity,
  formatPrefillSpeed,
} from '@/lib/agentic-workload-explorer/format';
import { InfoHelp } from '@/components/ui/option-info';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { useModelFilter } from '@/hooks/agentic-workload-explorer/use-model-filter';
import { ModelFilter } from '@/components/agentic-workload-explorer/model-filter';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  DailyUsageBucket,
  OverviewStats,
  UsageBucket,
} from '@/lib/agentic-workload-explorer/api-types';
import {
  LAST_DAY_LABEL,
  PREV_DAY_LABEL,
  SNAPSHOT_END_CLOCK,
  snapshotNow,
} from '@/lib/agentic-workload-explorer/snapshot';
import { RangeToggle, type RangeOption } from '@/components/agentic-workload-explorer/range-toggle';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    failedToLoad: 'Failed to load stats',
    stats: 'Stats',
    usage: 'Usage',
    totalTokens: 'Total Tokens',
    readWriteOut: 'Read : Write : Out',
    estCost: 'Est. Cost',
    input: 'Input',
    cacheRead: 'Cache Read',
    cacheWrite: 'Cache Write',
    output: 'Output',
    clientsLifetime: '# of Clients API Keys (Lifetime)',
    activeKeys24h: 'Active API Keys (Final 24h)',
    activeKeysTooltip: `API keys active in the snapshot's final 24 hours (ending ${LAST_DAY_LABEL} ${SNAPSHOT_END_CLOCK})`,
    sessions: 'Sessions',
    sessionsGt20: 'Sessions (> 20 reqs)',
    sessionsGt20Tooltip: 'Sessions with more than 20 requests',
    requests: 'Requests',
    cacheHitRate: 'Cache Hit Rate',
    cacheHitRateTooltip: 'cacheRead / (cacheRead + input) — % of input tokens served from cache',
    turnsPerSession: 'Turns / Session',
    gapSeconds: 'Gap (seconds)',
    ttftP90: 'TTFT (p90)',
    ttftTooltip: 'Time to First Token (streaming requests)',
    tpotP90: 'TPOT (p90)',
    tpotTooltip: 'Time per Output Token (streaming requests)',
    prefillSpeedP50: 'Prefill Speed (p50)',
    prefillSpeedTooltip:
      'Prefill Speed: (cacheRead + cacheWrite) / TTFT (streaming requests with cache)',
    interactivityP90: 'Interactivity (p90)',
    interactivityTooltip: 'Tokens per second per client (1000 / TPOT)',
    tokenDetail: (inp: string, cr: string, cw: string, out: string) =>
      `${inp} in · ${cr} cache_read · ${cw} cache_write · ${out} out`,
    cost: 'Cost',
    requestsMode: 'Requests',
    tokensMode: 'Tokens',
    sessionsMode: 'Sessions',
    fmtRequests: (n: string | number) => `${n} requests`,
    fmtTokens: (n: string | number) => `${n} tokens`,
    fmtSessions: (n: string | number) => `${n} sessions (> 20 reqs)`,
    usagePeriod24hTitle: "Snapshot's final 24 hours",
    usagePeriod14dTitle: "Snapshot's final 14 days",
    utcHours: 'UTC hours',
    utcDays: 'UTC days',
  },
  zh: {
    failedToLoad: '统计数据加载失败',
    stats: '统计',
    usage: '用量',
    totalTokens: 'Token 总量',
    readWriteOut: '读取 : 写入 : 输出',
    estCost: '预估成本',
    input: '输入',
    cacheRead: '缓存读取',
    cacheWrite: '缓存写入',
    output: '输出',
    clientsLifetime: 'API Key 数量（全时段）',
    activeKeys24h: '活跃 API Key（最后 24 小时）',
    activeKeysTooltip: `快照最后 24 小时内活跃的 API Key（截止 ${LAST_DAY_LABEL} ${SNAPSHOT_END_CLOCK}）`,
    sessions: '会话数',
    sessionsGt20: '会话数（> 20 请求）',
    sessionsGt20Tooltip: '超过 20 个请求的会话',
    requests: '请求数',
    cacheHitRate: '缓存命中率',
    cacheHitRateTooltip: 'cacheRead / (cacheRead + input) — 由缓存提供的输入 token 百分比',
    turnsPerSession: '每会话轮数',
    gapSeconds: '间隔（秒）',
    ttftP90: 'TTFT (p90)',
    ttftTooltip: '首 token 延迟（流式请求）',
    tpotP90: 'TPOT (p90)',
    tpotTooltip: '每输出 token 耗时（流式请求）',
    prefillSpeedP50: 'Prefill 速度 (p50)',
    prefillSpeedTooltip: 'Prefill 速度：(cacheRead + cacheWrite) / TTFT（带缓存的流式请求）',
    interactivityP90: '交互性 (p90)',
    interactivityTooltip: '每客户端每秒 token 数 (1000 / TPOT)',
    tokenDetail: (inp: string, cr: string, cw: string, out: string) =>
      `${inp} 输入 · ${cr} 缓存读 · ${cw} 缓存写 · ${out} 输出`,
    cost: '成本',
    requestsMode: '请求',
    tokensMode: 'Token',
    sessionsMode: '会话',
    fmtRequests: (n: string | number) => `${n} 个请求`,
    fmtTokens: (n: string | number) => `${n} token`,
    fmtSessions: (n: string | number) => `${n} 个会话（> 20 请求）`,
    usagePeriod24hTitle: '快照最后 24 小时',
    usagePeriod14dTitle: '快照最后 14 天',
    utcHours: 'UTC 小时',
    utcDays: 'UTC 天',
  },
} as const;
import { Expandable, ExpandTrigger } from '@/components/agentic-workload-explorer/expandable-chart';

const MIX_COLORS = {
  input: 'bg-sky-500',
  cacheRead: 'bg-emerald-500',
  cacheWrite: 'bg-amber-500',
  output: 'bg-violet-500',
};

export default function OverviewPage() {
  return (
    <Suspense>
      <OverviewPageContent />
    </Suspense>
  );
}

function OverviewPageContent() {
  const [expanded, setExpanded] = useState<string | null>('tokens');
  const t = STRINGS[useLocale()];

  const { models, selectedModel, setSelectedModel, buildUrl } = useModelFilter();
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data: stats, loading } = useDashboardData<OverviewStats>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion(
          buildUrl('/api/v1/agentic-workload-explorer/overview'),
          traceVersionParam,
        ),
        {
          signal,
        },
      );
      if (!r.ok) throw new Error('API error');
      return r.json();
    },
    key: `${selectedModel ?? ''}-${traceVersionParam}`,
  });

  const modelFilterBar = models.length > 0 && (
    <div className="flex items-center gap-2 mb-4">
      <ModelFilter models={models} selectedModel={selectedModel} onModelChange={setSelectedModel} />
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {modelFilterBar}
        <DashboardOverviewSkeleton />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        {t.failedToLoad}
      </div>
    );
  }

  const toggle = (key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
    track('agentic_workload_stat_card_toggled', { card: key });
  };

  const tokenSegments = [
    { label: t.input, value: stats.totalInputTokens, color: MIX_COLORS.input },
    { label: t.cacheRead, value: stats.totalCacheRead, color: MIX_COLORS.cacheRead },
    { label: t.cacheWrite, value: stats.totalCacheWrite, color: MIX_COLORS.cacheWrite },
    { label: t.output, value: stats.totalOutputTokens, color: MIX_COLORS.output },
  ];

  const costSegments = [
    { label: t.input, value: stats.costBreakdown.input, color: MIX_COLORS.input },
    { label: t.cacheRead, value: stats.costBreakdown.cacheRead, color: MIX_COLORS.cacheRead },
    { label: t.cacheWrite, value: stats.costBreakdown.cacheWrite, color: MIX_COLORS.cacheWrite },
    { label: t.output, value: stats.costBreakdown.output, color: MIX_COLORS.output },
  ];

  const plainCards = [
    { label: t.clientsLifetime, value: formatNumber(stats.clients) },
    {
      label: t.activeKeys24h,
      value: formatNumber(stats.activeClients24h),
      tooltip: t.activeKeysTooltip,
    },
    { label: t.sessions, value: formatNumber(stats.sessions) },
    {
      label: t.sessionsGt20,
      value: formatNumber(stats.sessionsGt20),
      tooltip: t.sessionsGt20Tooltip,
    },
    { label: t.requests, value: formatNumber(stats.requests) },
    {
      label: t.cacheHitRate,
      value:
        stats.totalCacheRead + stats.totalInputTokens > 0
          ? `${((stats.totalCacheRead / (stats.totalCacheRead + stats.totalInputTokens)) * 100).toFixed(1)}%`
          : '---',
      tooltip: t.cacheHitRateTooltip,
    },
    {
      label: t.turnsPerSession,
      value: String(Math.round(stats.turnsPercentiles.p50)),
      detail: `p25: ${Math.round(stats.turnsPercentiles.p25)} · p50: ${Math.round(stats.turnsPercentiles.p50)} · p75: ${Math.round(stats.turnsPercentiles.p75)} · p90: ${Math.round(stats.turnsPercentiles.p90)} · p99: ${Math.round(stats.turnsPercentiles.p99)}`,
    },
    {
      label: t.gapSeconds,
      value: `${stats.gapPercentiles.p50.toFixed(1)}s`,
      detail: `p25: ${stats.gapPercentiles.p25.toFixed(1)}s · p50: ${stats.gapPercentiles.p50.toFixed(1)}s · p75: ${stats.gapPercentiles.p75.toFixed(1)}s · p90: ${stats.gapPercentiles.p90.toFixed(1)}s · p99: ${stats.gapPercentiles.p99.toFixed(1)}s`,
    },
    {
      label: t.ttftP90,
      value: stats.ttftStats.count > 0 ? formatDuration(stats.ttftStats.p90) : '---',
      detail:
        stats.ttftStats.count > 0
          ? `p50: ${formatDuration(stats.ttftStats.p50)} · p95: ${formatDuration(stats.ttftStats.p95)}`
          : undefined,
      tooltip: t.ttftTooltip,
    },
    {
      label: t.tpotP90,
      value: stats.tpotStats.count > 0 ? `${stats.tpotStats.p90.toFixed(1)}ms/tok` : '---',
      detail:
        stats.tpotStats.count > 0
          ? `p50: ${stats.tpotStats.p50.toFixed(1)}ms/tok · p95: ${stats.tpotStats.p95.toFixed(1)}ms/tok`
          : undefined,
      tooltip: t.tpotTooltip,
    },
    {
      label: t.prefillSpeedP50,
      value:
        stats.prefillSpeedStats.count > 0 ? formatPrefillSpeed(stats.prefillSpeedStats.p50) : '---',
      detail:
        stats.prefillSpeedStats.count > 0
          ? `p90: ${formatPrefillSpeed(stats.prefillSpeedStats.p90)} · p95: ${formatPrefillSpeed(stats.prefillSpeedStats.p95)}`
          : undefined,
      tooltip: t.prefillSpeedTooltip,
    },
    {
      label: t.interactivityP90,
      value: stats.tpotStats.count > 0 ? formatInteractivity(stats.tpotStats.p90) : '---',
      detail:
        stats.tpotStats.count > 0
          ? `p50: ${formatInteractivity(stats.tpotStats.p50)} · p95: ${formatInteractivity(stats.tpotStats.p95)}`
          : undefined,
      tooltip: t.interactivityTooltip,
    },
  ];

  return (
    <div className="space-y-5">
      {modelFilterBar}
      {/* Stats grid */}
      <section>
        <SectionHeader label={t.stats} count={plainCards.length + 3} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {plainCards.slice(0, 3).map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              tooltip={card.tooltip}
            />
          ))}
          {/* Total Tokens — expandable */}
          <StatCard
            label={t.totalTokens}
            value={formatNumber(
              stats.totalInputTokens +
                stats.totalOutputTokens +
                stats.totalCacheRead +
                stats.totalCacheWrite,
            )}
            detail={t.tokenDetail(
              formatNumber(stats.totalInputTokens),
              formatNumber(stats.totalCacheRead),
              formatNumber(stats.totalCacheWrite),
              formatNumber(stats.totalOutputTokens),
            )}
            expandable
            isExpanded={expanded === 'tokens'}
            onClick={() => toggle('tokens')}
          />
          {/* Read:Write:Out — expandable */}
          <StatCard
            label={t.readWriteOut}
            value={(() => {
              const out = Number(stats.totalOutputTokens) || 1;
              return `${(Number(stats.totalCacheRead) / out).toFixed(1)} : ${(Number(stats.totalCacheWrite) / out).toFixed(1)} : 1`;
            })()}
            expandable
            isExpanded={expanded === 'ratio'}
            onClick={() => toggle('ratio')}
          />
          {/* Est. Cost — expandable */}
          <StatCard
            label={t.estCost}
            value={formatDollars(stats.totalCost ?? 0)}
            expandable
            isExpanded={expanded === 'cost'}
            onClick={() => toggle('cost')}
          />
          {plainCards.slice(3).map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              detail={card.detail}
              tooltip={card.tooltip}
            />
          ))}
        </div>

        {/* Expanded mix bar */}
        {(expanded === 'tokens' || expanded === 'ratio') && (
          <div className="mt-2">
            <MixBar segments={tokenSegments} formatValue={formatNumber} />
          </div>
        )}
        {expanded === 'cost' && (
          <div className="mt-2">
            <MixBar segments={costSegments} formatValue={(v) => `$${v.toFixed(2)}`} />
          </div>
        )}
      </section>

      {/* Usage over a selectable period */}
      <UsagePanel stats={stats} t={t} />
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number | string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" />
      <span className="text-3xs font-mono text-subtle">{count}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tooltip,
  expandable,
  isExpanded,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  tooltip?: string;
  expandable?: boolean;
  isExpanded?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-md border bg-surface p-3 ${
        expandable
          ? `cursor-pointer hover:bg-surface-hover transition-colors ${isExpanded ? 'border-foreground/30' : 'border-border'}`
          : 'border-border'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1 mb-1.5">
        <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {label}
        </div>
        {tooltip && (
          <InfoHelp label={label} value={label} analyticsEvent="selector_help_opened">
            {tooltip}
          </InfoHelp>
        )}
        {expandable && (
          <svg
            className={`w-2.5 h-2.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      <div className="text-lg font-mono font-bold tracking-tight">{value}</div>
      {detail && (
        <p className="text-3xs text-muted-foreground mt-1 leading-relaxed font-mono">{detail}</p>
      )}
    </div>
  );
}

// -- Usage Panel (single chart, selectable period) ---------------------------

type UsagePeriod = '24h' | 'lastDay' | 'prevDay' | '14d';
type T = (typeof STRINGS)[keyof typeof STRINGS];

interface HistModeProps {
  mode: HistMode;
  setMode: (m: HistMode) => void;
  histModes: RangeOption<HistMode>[];
}

function formatUsageTotal(v: number, mode: HistMode, t: T) {
  switch (mode) {
    case 'cost': {
      return formatDollars(v);
    }
    case 'requests': {
      return t.fmtRequests(formatNumber(v));
    }
    case 'tokens': {
      return t.fmtTokens(formatNumber(v));
    }
    case 'sessions': {
      return t.fmtSessions(formatNumber(v));
    }
  }
}

function UsagePanel({ stats, t }: { stats: OverviewStats; t: T }) {
  const [period, setPeriod] = useState<UsagePeriod>('14d');
  const [mode, setMode] = useState<HistMode>('cost');

  const usagePeriods: RangeOption<UsagePeriod>[] = [
    { id: '24h', label: '24h', title: t.usagePeriod24hTitle },
    { id: 'lastDay', label: LAST_DAY_LABEL, title: `${LAST_DAY_LABEL} UTC` },
    { id: 'prevDay', label: PREV_DAY_LABEL, title: `${PREV_DAY_LABEL} UTC` },
    { id: '14d', label: '14d', title: t.usagePeriod14dTitle },
  ];

  const histModes: RangeOption<HistMode>[] = [
    { id: 'cost', label: t.cost },
    { id: 'requests', label: t.requestsMode },
    { id: 'tokens', label: t.tokensMode },
    { id: 'sessions', label: t.sessionsMode },
  ];

  // Total over the selected period, from the same buckets the chart draws.
  const buckets =
    period === '24h'
      ? fillHourBuckets(stats.usageHistogram)
      : period === 'lastDay'
        ? fillUtcDayHourBuckets(stats.usageHistogramTodayUtc, 0)
        : period === 'prevDay'
          ? fillUtcDayHourBuckets(stats.usageHistogramYesterdayUtc, 1)
          : fillDayBuckets(stats.dailyUsageHistogram);
  const total = buckets.reduce((sum, b) => sum + getBarValue(b, mode), 0);

  return (
    <section>
      <SectionHeader label={t.usage} count={formatUsageTotal(total, mode, t)} />
      <div className="mb-2">
        <RangeToggle
          value={period}
          options={usagePeriods}
          onChange={(v) => {
            setPeriod(v);
            track('agentic_workload_usage_period_changed', { period: v });
          }}
        />
      </div>
      <Expandable
        title={t.usage}
        subtitle={`${usagePeriods.find((p) => p.id === period)?.title ?? period} \u00B7 ${formatUsageTotal(total, mode, t)}`}
      >
        {period === '24h' && (
          <UsageHistogram
            data={stats.usageHistogram}
            mode={mode}
            setMode={setMode}
            histModes={histModes}
            t={t}
          />
        )}
        {period === 'lastDay' && (
          <UtcDayUsageHistogram
            data={stats.usageHistogramTodayUtc}
            dayOffset={0}
            mode={mode}
            setMode={setMode}
            histModes={histModes}
            t={t}
          />
        )}
        {period === 'prevDay' && (
          <UtcDayUsageHistogram
            data={stats.usageHistogramYesterdayUtc}
            dayOffset={1}
            mode={mode}
            setMode={setMode}
            histModes={histModes}
            t={t}
          />
        )}
        {period === '14d' && (
          <DailyUsageHistogram
            data={stats.dailyUsageHistogram}
            mode={mode}
            setMode={setMode}
            histModes={histModes}
            t={t}
          />
        )}
      </Expandable>
    </section>
  );
}

// -- Usage Histogram ---------------------------------------------------------

const HIST_W = 600;
const HIST_H = 160;
const HIST_MARGIN = { top: 8, right: 12, bottom: 28, left: 48 };
const HIST_PLOT_W = HIST_W - HIST_MARGIN.left - HIST_MARGIN.right;
const HIST_PLOT_H = HIST_H - HIST_MARGIN.top - HIST_MARGIN.bottom;
const HIST_FONT = 'var(--font-mono, ui-monospace, monospace)';

type HistMode = 'cost' | 'requests' | 'tokens' | 'sessions';

function fillHourBuckets(data: UsageBucket[]): {
  hour: Date;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}[] {
  const now = snapshotNow();
  const bucketMap = new Map<number, UsageBucket>();
  for (const d of data) {
    const t = new Date(d.hour).getTime();
    bucketMap.set(t, d);
  }
  const result: {
    hour: Date;
    requestCount: number;
    totalTokens: number;
    totalCost: number;
    newSessions: number;
  }[] = [];
  for (let i = 23; i >= 0; i--) {
    const h = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - i, 0, 0);
    const key = h.getTime();
    const match = bucketMap.get(key);
    result.push({
      hour: h,
      requestCount: match?.requestCount ?? 0,
      totalTokens: match?.totalTokens ?? 0,
      totalCost: match?.totalCost ?? 0,
      newSessions: match?.newSessions ?? 0,
    });
  }
  return result;
}

function getBarValue(
  b: { requestCount: number; totalTokens: number; totalCost: number; newSessions: number },
  mode: HistMode,
) {
  switch (mode) {
    case 'requests': {
      return b.requestCount;
    }
    case 'tokens': {
      return b.totalTokens;
    }
    case 'sessions': {
      return b.newSessions;
    }
    default: {
      return b.totalCost;
    }
  }
}

function getBarColor(mode: HistMode) {
  switch (mode) {
    case 'cost': {
      return 'var(--color-emerald-500, #10b981)';
    }
    case 'requests': {
      return 'var(--color-sky-500, #0ea5e9)';
    }
    case 'tokens': {
      return 'var(--color-violet-500, #8b5cf6)';
    }
    case 'sessions': {
      return 'var(--color-orange-500, #f97316)';
    }
  }
}

function formatBarTooltip(v: number, mode: HistMode, t: T) {
  switch (mode) {
    case 'cost': {
      return `$${v.toFixed(4)}`;
    }
    case 'requests': {
      return t.fmtRequests(v);
    }
    case 'tokens': {
      return t.fmtTokens(formatNumber(v));
    }
    case 'sessions': {
      return t.fmtSessions(v);
    }
  }
}

function formatYTick(tick: number, mode: HistMode) {
  switch (mode) {
    case 'cost': {
      return formatDollars(tick);
    }
    case 'tokens': {
      return formatNumber(tick);
    }
    default: {
      return String(tick);
    }
  }
}

function HistModeButtons({ mode, setMode, histModes }: HistModeProps) {
  return (
    <RangeToggle
      value={mode}
      options={histModes}
      onChange={(v) => {
        setMode(v);
        track('agentic_workload_usage_mode_changed', { mode: v });
      }}
    />
  );
}

function UsageHistogram({
  data,
  mode,
  setMode,
  histModes,
  t,
}: { data: UsageBucket[]; t: T } & HistModeProps) {
  const buckets = fillHourBuckets(data);
  const values = buckets.map((b) => getBarValue(b, mode));
  const maxVal = Math.max(...values, 1);

  const barW = HIST_PLOT_W / 24 - 2;
  const scaleY = (v: number) => (v / maxVal) * HIST_PLOT_H;

  const yTicks: number[] = [];
  const yStep = maxVal / 4;
  for (let i = 0; i <= 4; i++) yTicks.push(Math.round(yStep * i));

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <HistModeButtons mode={mode} setMode={setMode} histModes={histModes} />
        <span className="ml-auto">
          <ExpandTrigger />
        </span>
      </div>
      <svg
        viewBox={`0 0 ${HIST_W} ${HIST_H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={`translate(${HIST_MARGIN.left},${HIST_MARGIN.top})`}>
          {yTicks.map((tick, i) => {
            const y = HIST_PLOT_H - scaleY(tick);
            return (
              <g key={i}>
                <line
                  x1={0}
                  x2={HIST_PLOT_W}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeWidth={0.5}
                />
                <text
                  x={-6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--color-muted-foreground)"
                  fontSize="8px"
                  fontFamily={HIST_FONT}
                >
                  {formatYTick(tick, mode)}
                </text>
              </g>
            );
          })}

          {buckets.map((b, i) => {
            const v = getBarValue(b, mode);
            const h = scaleY(v);
            const x = i * (HIST_PLOT_W / 24);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={HIST_PLOT_H - h}
                  width={Math.max(barW, 1)}
                  height={Math.max(h, 0)}
                  fill={getBarColor(mode)}
                  opacity={0.7}
                  rx={1}
                >
                  <title>
                    {b.hour.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                      timeZoneName: 'short',
                    })}
                    {'\n'}
                    {formatBarTooltip(v, mode, t)}
                  </title>
                </rect>
              </g>
            );
          })}

          {buckets.map((b, i) => {
            if (i % 4 !== 0) return null;
            const x = i * (HIST_PLOT_W / 24) + barW / 2;
            return (
              <text
                key={i}
                x={x}
                y={HIST_PLOT_H + 14}
                textAnchor="middle"
                fill="var(--color-muted-foreground)"
                fontSize="8px"
                fontFamily={HIST_FONT}
              >
                {b.hour.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                  timeZoneName: 'short',
                })}
              </text>
            );
          })}

          <line
            x1={0}
            x2={HIST_PLOT_W}
            y1={HIST_PLOT_H}
            y2={HIST_PLOT_H}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        </g>
      </svg>
    </div>
  );
}

// -- UTC Day Usage Histogram (today/yesterday, 24 fixed hourly slots) --------

function fillUtcDayHourBuckets(
  data: UsageBucket[],
  dayOffset: number,
): {
  hour: Date;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}[] {
  const now = snapshotNow();
  const startMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - dayOffset,
    0,
    0,
    0,
  );

  const bucketMap = new Map<number, UsageBucket>();
  for (const d of data) {
    const t = new Date(d.hour);
    // Normalize against UTC wall-clock so timestamps returned without a TZ
    // suffix don't drift on non-UTC clients.
    const utcKey = Date.UTC(
      t.getUTCFullYear(),
      t.getUTCMonth(),
      t.getUTCDate(),
      t.getUTCHours(),
      0,
      0,
    );
    bucketMap.set(utcKey, d);
  }

  const result: {
    hour: Date;
    requestCount: number;
    totalTokens: number;
    totalCost: number;
    newSessions: number;
  }[] = [];
  for (let i = 0; i < 24; i++) {
    const slotMs = startMs + i * 3600 * 1000;
    const match = bucketMap.get(slotMs);
    result.push({
      hour: new Date(slotMs),
      requestCount: match?.requestCount ?? 0,
      totalTokens: match?.totalTokens ?? 0,
      totalCost: match?.totalCost ?? 0,
      newSessions: match?.newSessions ?? 0,
    });
  }
  return result;
}

function UtcDayUsageHistogram({
  data,
  dayOffset,
  mode,
  setMode,
  histModes,
  t,
}: { data: UsageBucket[]; dayOffset: number; t: T } & HistModeProps) {
  const buckets = fillUtcDayHourBuckets(data, dayOffset);
  const values = buckets.map((b) => getBarValue(b, mode));
  const maxVal = Math.max(...values, 1);

  const barW = HIST_PLOT_W / 24 - 2;
  const scaleY = (v: number) => (v / maxVal) * HIST_PLOT_H;

  const yTicks: number[] = [];
  const yStep = maxVal / 4;
  for (let i = 0; i <= 4; i++) yTicks.push(Math.round(yStep * i));

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <HistModeButtons mode={mode} setMode={setMode} histModes={histModes} />
        <span className="text-3xs font-mono text-subtle ml-auto">{t.utcHours}</span>
        <ExpandTrigger />
      </div>
      <svg
        viewBox={`0 0 ${HIST_W} ${HIST_H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={`translate(${HIST_MARGIN.left},${HIST_MARGIN.top})`}>
          {yTicks.map((tick, i) => {
            const y = HIST_PLOT_H - scaleY(tick);
            return (
              <g key={i}>
                <line
                  x1={0}
                  x2={HIST_PLOT_W}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeWidth={0.5}
                />
                <text
                  x={-6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--color-muted-foreground)"
                  fontSize="8px"
                  fontFamily={HIST_FONT}
                >
                  {formatYTick(tick, mode)}
                </text>
              </g>
            );
          })}

          {buckets.map((b, i) => {
            const v = getBarValue(b, mode);
            const h = scaleY(v);
            const x = i * (HIST_PLOT_W / 24);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={HIST_PLOT_H - h}
                  width={Math.max(barW, 1)}
                  height={Math.max(h, 0)}
                  fill={getBarColor(mode)}
                  opacity={0.7}
                  rx={1}
                >
                  <title>
                    {`${String(b.hour.getUTCHours()).padStart(2, '0')}:00 UTC`}
                    {'\n'}
                    {formatBarTooltip(v, mode, t)}
                  </title>
                </rect>
              </g>
            );
          })}

          {buckets.map((b, i) => {
            if (i % 4 !== 0) return null;
            const x = i * (HIST_PLOT_W / 24) + barW / 2;
            return (
              <text
                key={i}
                x={x}
                y={HIST_PLOT_H + 14}
                textAnchor="middle"
                fill="var(--color-muted-foreground)"
                fontSize="8px"
                fontFamily={HIST_FONT}
              >
                {`${String(b.hour.getUTCHours()).padStart(2, '0')}:00`}
              </text>
            );
          })}

          <line
            x1={0}
            x2={HIST_PLOT_W}
            y1={HIST_PLOT_H}
            y2={HIST_PLOT_H}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        </g>
      </svg>
    </div>
  );
}

// -- Daily Usage Histogram (14d) ------------------------------------------------

const DAILY_NUM_DAYS = 14;

function fmtDateUTC(d: Date) {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

function fillDayBuckets(data: DailyUsageBucket[]): {
  day: Date;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}[] {
  const bucketMap = new Map<string, DailyUsageBucket>();
  for (const d of data) {
    const dt = new Date(d.day);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    bucketMap.set(key, d);
  }
  const result: {
    day: Date;
    requestCount: number;
    totalTokens: number;
    totalCost: number;
    newSessions: number;
  }[] = [];
  const now = snapshotNow();
  for (let i = DAILY_NUM_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const match = bucketMap.get(key);
    result.push({
      day: d,
      requestCount: match?.requestCount ?? 0,
      totalTokens: match?.totalTokens ?? 0,
      totalCost: match?.totalCost ?? 0,
      newSessions: match?.newSessions ?? 0,
    });
  }
  return result;
}

function DailyUsageHistogram({
  data,
  mode,
  setMode,
  histModes,
  t,
}: { data: DailyUsageBucket[]; t: T } & HistModeProps) {
  const buckets = fillDayBuckets(data);
  const values = buckets.map((b) => getBarValue(b, mode));
  const maxVal = Math.max(...values, 1);

  const barW = HIST_PLOT_W / DAILY_NUM_DAYS - 2;
  const scaleY = (v: number) => (v / maxVal) * HIST_PLOT_H;

  const yTicks: number[] = [];
  const yStep = maxVal / 4;
  for (let i = 0; i <= 4; i++) yTicks.push(Math.round(yStep * i));

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <HistModeButtons mode={mode} setMode={setMode} histModes={histModes} />
        <span className="text-3xs font-mono text-subtle ml-auto">{t.utcDays}</span>
        <ExpandTrigger />
      </div>
      <svg
        viewBox={`0 0 ${HIST_W} ${HIST_H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={`translate(${HIST_MARGIN.left},${HIST_MARGIN.top})`}>
          {yTicks.map((tick, i) => {
            const y = HIST_PLOT_H - scaleY(tick);
            return (
              <g key={i}>
                <line
                  x1={0}
                  x2={HIST_PLOT_W}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeWidth={0.5}
                />
                <text
                  x={-6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--color-muted-foreground)"
                  fontSize="8px"
                  fontFamily={HIST_FONT}
                >
                  {formatYTick(tick, mode)}
                </text>
              </g>
            );
          })}

          {buckets.map((b, i) => {
            const v = getBarValue(b, mode);
            const h = scaleY(v);
            const x = i * (HIST_PLOT_W / DAILY_NUM_DAYS);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={HIST_PLOT_H - h}
                  width={Math.max(barW, 1)}
                  height={Math.max(h, 0)}
                  fill={getBarColor(mode)}
                  opacity={0.7}
                  rx={1}
                >
                  <title>
                    {fmtDateUTC(b.day)} UTC
                    {'\n'}
                    {formatBarTooltip(v, mode, t)}
                  </title>
                </rect>
              </g>
            );
          })}

          {buckets.map((b, i) => {
            if (i % 2 !== 0) return null;
            const x = i * (HIST_PLOT_W / DAILY_NUM_DAYS) + barW / 2;
            return (
              <text
                key={i}
                x={x}
                y={HIST_PLOT_H + 14}
                textAnchor="middle"
                fill="var(--color-muted-foreground)"
                fontSize="8px"
                fontFamily={HIST_FONT}
              >
                {fmtDateUTC(b.day)}
              </text>
            );
          })}

          {/* Baseline */}
          <line
            x1={0}
            x2={HIST_PLOT_W}
            y1={HIST_PLOT_H}
            y2={HIST_PLOT_H}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        </g>
      </svg>
    </div>
  );
}

interface MixSegment {
  label: string;
  value: number;
  color: string;
}

function MixBar({
  segments,
  formatValue,
}: {
  segments: MixSegment[];
  formatValue: (v: number) => string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex h-5 rounded overflow-hidden gap-px">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={seg.label}
              className={`${seg.color} opacity-70 relative`}
              style={{ width: `${pct}%` }}
            >
              {pct > 8 && (
                <span className="absolute inset-0 flex items-center justify-center text-3xs font-mono font-bold text-white">
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {segments.map((seg) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          return (
            <div key={seg.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-sm ${seg.color} opacity-70`} />
              <span className="text-3xs font-mono text-muted-foreground">{seg.label}</span>
              <span className="text-3xs font-mono font-medium">{formatValue(seg.value)}</span>
              <span className="text-3xs font-mono text-subtle">({pct.toFixed(1)}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
