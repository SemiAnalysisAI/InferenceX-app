'use client';

import { Suspense, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DashboardOverviewSkeleton } from '@/components/agentic-workload-explorer/dashboard-skeleton';
import {
  formatDollars,
  formatNumber,
  formatDuration,
  formatInteractivity,
  formatPrefillSpeed,
} from '@/lib/agentic-workload-explorer/format';
import { InfoHelp } from '@/components/ui/option-info';
import { Card } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { cn } from '@/lib/shared/utils';
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
  lastDayLabel,
  prevDayLabel,
  SNAPSHOT_END_CLOCK,
  snapshotNow,
} from '@/lib/agentic-workload-explorer/snapshot';
import { RangeToggle, type RangeOption } from '@/components/agentic-workload-explorer/range-toggle';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { chartFont, measureTextWidth, useFontsVersion } from '@/lib/d3-chart/dynamic-margins';
import { readableTextColor } from '@/lib/d3-chart/contrast-colors';

const STRINGS = {
  en: {
    yLabels: {
      cost: 'Cost (USD)',
      requests: 'Requests',
      tokens: 'Tokens',
      sessions: 'Sessions',
    },
    failedToLoad: 'Failed to load stats',
    stats: 'Stats',
    usage: 'Usage',
    totalTokens: 'Total tokens',
    readWriteOut: 'Read : write : out',
    estCost: 'Est. cost',
    input: 'Input',
    cacheRead: 'Cache read',
    cacheWrite: 'Cache write',
    output: 'Output',
    clientsLifetime: '# of clients API keys (lifetime)',
    activeKeys24h: 'Active API keys (final 24h)',
    activeKeysTooltip: `API keys active in the snapshot's final 24 hours (ending ${lastDayLabel('en')} ${SNAPSHOT_END_CLOCK})`,
    sessions: 'Sessions',
    sessionsGt20: 'Sessions (> 20 reqs)',
    sessionsGt20Tooltip: 'Sessions with more than 20 requests',
    requests: 'Requests',
    cacheHitRate: 'Cache hit rate',
    cacheHitRateTooltip: 'cacheRead / (cacheRead + input) — % of input tokens served from cache',
    turnsPerSession: 'Turns / session',
    gapSeconds: 'Gap (seconds)',
    ttftP90: 'TTFT (p90)',
    ttftTooltip: 'Time to first token (streaming requests)',
    tpotP90: 'TPOT (p90)',
    tpotTooltip: 'Time per output token (streaming requests)',
    prefillSpeedP50: 'Prefill speed (p50)',
    prefillSpeedTooltip:
      'Prefill speed: (cacheRead + cacheWrite) / TTFT (streaming requests with cache)',
    interactivityP90: 'Interactivity (p90)',
    interactivityTooltip: 'Tokens per second per client (1000 / TPOT)',
    tokenDetail: (inp: string, cr: string, cw: string, out: string) =>
      `${inp} in · ${cr} cache read · ${cw} cache write · ${out} out`,
    cost: 'Cost',
    requestsMode: 'Requests',
    tokensMode: 'Tokens',
    sessionsMode: 'Sessions',
    fmtRequests: (n: string | number) => `${n} requests`,
    fmtTokens: (n: string | number) => `${n} tokens`,
    fmtSessions: (n: string | number) => `${n} sessions (> 20 reqs)`,
    usagePeriod24hTitle: 'Final 24 hours',
    usagePeriod14dTitle: 'Final 14 days',
    utcHours: 'UTC hours',
    utcDays: 'UTC days',
  },
  zh: {
    yLabels: {
      cost: '成本（美元）',
      requests: '请求数',
      tokens: 'Token 数',
      sessions: '会话数',
    },
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
    activeKeysTooltip: `快照最后 24 小时内活跃的 API Key（截止 ${lastDayLabel('zh')} ${SNAPSHOT_END_CLOCK}）`,
    sessions: '会话数',
    sessionsGt20: '会话数（> 20 请求）',
    sessionsGt20Tooltip: '超过 20 个请求的会话',
    requests: '请求数',
    cacheHitRate: '缓存命中率',
    cacheHitRateTooltip: 'cacheRead / (cacheRead + input) — 由缓存提供的输入 token 百分比',
    turnsPerSession: '每会话轮数',
    gapSeconds: '间隔（秒）',
    ttftP90: 'TTFT（p90）',
    ttftTooltip: '首 token 延迟（流式请求）',
    tpotP90: 'TPOT（p90）',
    tpotTooltip: '每输出 token 耗时（流式请求）',
    prefillSpeedP50: 'Prefill 速度（p50）',
    prefillSpeedTooltip: 'Prefill 速度：(cacheRead + cacheWrite) / TTFT（带缓存的流式请求）',
    interactivityP90: '交互性（p90）',
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
    usagePeriod24hTitle: '最后 24 小时',
    usagePeriod14dTitle: '最后 14 天',
    utcHours: 'UTC 小时',
    utcDays: 'UTC 天',
  },
} as const;
import {
  TOKEN_SERIES_COLORS,
  CHART_COLORS,
} from '@/components/agentic-workload-explorer/series-colors';
import {
  formatAxisDollars,
  formatAxisNumber,
  formatDayLabel,
  formatHourLabel,
  TrendsStackedChart,
} from '@/components/agentic-workload-explorer/trends-charts';

const MIX_COLORS = TOKEN_SERIES_COLORS;

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
          : '—',
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
      value: stats.ttftStats.count > 0 ? formatDuration(stats.ttftStats.p90) : '—',
      detail:
        stats.ttftStats.count > 0
          ? `p50: ${formatDuration(stats.ttftStats.p50)} · p95: ${formatDuration(stats.ttftStats.p95)}`
          : undefined,
      tooltip: t.ttftTooltip,
    },
    {
      label: t.tpotP90,
      value: stats.tpotStats.count > 0 ? `${stats.tpotStats.p90.toFixed(1)}ms/tok` : '—',
      detail:
        stats.tpotStats.count > 0
          ? `p50: ${stats.tpotStats.p50.toFixed(1)}ms/tok · p95: ${stats.tpotStats.p95.toFixed(1)}ms/tok`
          : undefined,
      tooltip: t.tpotTooltip,
    },
    {
      label: t.prefillSpeedP50,
      value:
        stats.prefillSpeedStats.count > 0 ? formatPrefillSpeed(stats.prefillSpeedStats.p50) : '—',
      detail:
        stats.prefillSpeedStats.count > 0
          ? `p90: ${formatPrefillSpeed(stats.prefillSpeedStats.p90)} · p95: ${formatPrefillSpeed(stats.prefillSpeedStats.p95)}`
          : undefined,
      tooltip: t.prefillSpeedTooltip,
    },
    {
      label: t.interactivityP90,
      value: stats.tpotStats.count > 0 ? formatInteractivity(stats.tpotStats.p90) : '—',
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
      <section>
        <SectionHeader label={t.stats} />
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {plainCards.slice(0, 3).map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              tooltip={card.tooltip}
            />
          ))}
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
        </dl>

        {(expanded === 'tokens' || expanded === 'ratio') && (
          <div className="mt-2">
            <MixBar segments={tokenSegments} formatValue={formatNumber} />
          </div>
        )}
        {expanded === 'cost' && (
          <div className="mt-2">
            <MixBar segments={costSegments} formatValue={formatDollars} />
          </div>
        )}
      </section>

      <UsagePanel stats={stats} t={t} />
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
    <Stat
      boxed
      label={
        <span className="flex h-4 items-center gap-1">
          {label}
          {tooltip && (
            <InfoHelp label={label} value={label} analyticsEvent="selector_help_opened">
              {tooltip}
            </InfoHelp>
          )}
          {expandable && (
            <ChevronDown
              className={cn(
                'size-3 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          )}
        </span>
      }
      value={value}
      detail={detail}
      valueClassName="whitespace-normal"
      className={cn(
        expandable && 'cursor-pointer transition-colors hover:bg-surface-hover',
        isExpanded && 'border-foreground/30',
      )}
      onClick={onClick}
    />
  );
}

type UsagePeriod = '24h' | 'lastDay' | 'prevDay' | '14d';
type HistMode = 'cost' | 'requests' | 'tokens' | 'sessions';
type T = (typeof STRINGS)[keyof typeof STRINGS];

const DAILY_NUM_DAYS = 14;
const USAGE_KEYS = ['value'];
const usageColor = () => CHART_COLORS[0];

interface UsageSlot {
  at: Date;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}

interface UsageCounts {
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}

function usageSlot(at: Date, match: UsageCounts | undefined): UsageSlot {
  return {
    at,
    requestCount: match?.requestCount ?? 0,
    totalTokens: match?.totalTokens ?? 0,
    totalCost: match?.totalCost ?? 0,
    newSessions: match?.newSessions ?? 0,
  };
}

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function fillHourBuckets(data: UsageBucket[]): UsageSlot[] {
  const now = snapshotNow();
  const bucketMap = new Map(data.map((d) => [new Date(d.hour).getTime(), d]));
  return Array.from({ length: 24 }, (_, i) => {
    const h = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours() - (23 - i),
      0,
      0,
    );
    return usageSlot(h, bucketMap.get(h.getTime()));
  });
}

function fillUtcDayHourBuckets(data: UsageBucket[], dayOffset: number): UsageSlot[] {
  const now = snapshotNow();
  const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOffset);
  const bucketMap = new Map(
    data.map((d) => {
      const t = new Date(d.hour);
      return [
        Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours()),
        d,
      ] as const;
    }),
  );
  return Array.from({ length: 24 }, (_, i) => {
    const slotMs = startMs + i * 3600 * 1000;
    return usageSlot(new Date(slotMs), bucketMap.get(slotMs));
  });
}

function fillDayBuckets(data: DailyUsageBucket[]): UsageSlot[] {
  const bucketMap = new Map(data.map((d) => [utcDayKey(new Date(d.day)), d]));
  const now = snapshotNow();
  return Array.from({ length: DAILY_NUM_DAYS }, (_, i) => {
    const d = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - (DAILY_NUM_DAYS - 1 - i),
      ),
    );
    return usageSlot(d, bucketMap.get(utcDayKey(d)));
  });
}

function getBarValue(b: UsageCounts, mode: HistMode) {
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

const PERIOD_X_FORMAT: Record<UsagePeriod, (iso: string, locale: Locale) => string> = {
  '24h': (iso, locale) => formatHourLabel(iso, locale),
  lastDay: (iso, locale) => formatHourLabel(iso, locale),
  prevDay: (iso, locale) => formatHourLabel(iso, locale),
  '14d': formatDayLabel,
};

const MODE_Y_FORMAT: Record<HistMode, (v: number) => string> = {
  cost: formatAxisDollars,
  requests: formatAxisNumber,
  tokens: formatAxisNumber,
  sessions: formatAxisNumber,
};

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
  const locale = useLocale();
  const [period, setPeriod] = useState<UsagePeriod>('14d');
  const [mode, setMode] = useState<HistMode>('cost');

  const usagePeriods: RangeOption<UsagePeriod>[] = [
    { id: '24h', label: '24h', title: t.usagePeriod24hTitle },
    { id: 'lastDay', label: lastDayLabel(locale), title: `${lastDayLabel(locale)} UTC` },
    { id: 'prevDay', label: prevDayLabel(locale), title: `${prevDayLabel(locale)} UTC` },
    { id: '14d', label: '14d', title: t.usagePeriod14dTitle },
  ];

  const histModes: RangeOption<HistMode>[] = [
    { id: 'cost', label: t.cost },
    { id: 'requests', label: t.requestsMode },
    { id: 'tokens', label: t.tokensMode },
    { id: 'sessions', label: t.sessionsMode },
  ];

  const slots = useMemo(
    () =>
      period === '24h'
        ? fillHourBuckets(stats.usageHistogram)
        : period === 'lastDay'
          ? fillUtcDayHourBuckets(stats.usageHistogramTodayUtc, 0)
          : period === 'prevDay'
            ? fillUtcDayHourBuckets(stats.usageHistogramYesterdayUtc, 1)
            : fillDayBuckets(stats.dailyUsageHistogram),
    [period, stats],
  );
  const { days, total } = useMemo(
    () => ({
      days: slots.map((b) => ({
        day: b.at.toISOString(),
        values: { value: getBarValue(b, mode) },
      })),
      total: slots.reduce((sum, b) => sum + getBarValue(b, mode), 0),
    }),
    [slots, mode],
  );
  const periodTitle = usagePeriods.find((p) => p.id === period)?.title ?? period;
  const unit = period === '14d' ? t.utcDays : period === '24h' ? undefined : t.utcHours;
  const modeLabel = histModes.find((m) => m.id === mode)?.label ?? mode;

  return (
    <TrendsStackedChart
      title={t.usage}
      subtext={[periodTitle, unit, formatUsageTotal(total, mode, t)].filter(Boolean).join(' · ')}
      days={days}
      seriesKeys={USAGE_KEYS}
      labelFor={() => modeLabel}
      colorFor={usageColor}
      mode="count"
      yFormatter={MODE_Y_FORMAT[mode]}
      yLabel={t.yLabels[mode]}
      xFormatter={(iso: string) => PERIOD_X_FORMAT[period](iso, locale)}
      filename="usage"
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <RangeToggle
            value={period}
            options={usagePeriods}
            onChange={(v) => {
              setPeriod(v);
              track('agentic_workload_usage_period_changed', { period: v });
            }}
          />
          <RangeToggle
            value={mode}
            options={histModes}
            onChange={(v) => {
              setMode(v);
              track('agentic_workload_usage_mode_changed', { mode: v });
            }}
          />
        </div>
      }
    />
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
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: 0 });
  useFontsVersion();
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;
  const labelFont = chartFont(CHART_TYPE.dataLabel, 500);

  return (
    <Card>
      <div ref={setContainerRef} className="flex h-5 rounded-sm overflow-hidden gap-px">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          if (pct < 0.5) return null;
          const label = `${pct.toFixed(0)}%`;
          const fits =
            dimensions.width > 0 &&
            (pct / 100) * dimensions.width >= measureTextWidth(label, labelFont) + 8;
          return (
            <div key={seg.label} className="relative" style={{ width: `${pct}%` }}>
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-70"
                style={{ backgroundColor: seg.color }}
              />
              {fits && (
                <span
                  className="absolute inset-0 flex items-center justify-center font-medium tabular-nums"
                  style={{
                    fontSize: px(CHART_TYPE.dataLabel),
                    color: readableTextColor(seg.color, 0.7),
                  }}
                >
                  {label}
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
              <span
                className="w-2 h-2 rounded-sm opacity-70"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-xs text-muted-foreground">{seg.label}</span>
              <span className="text-xs font-medium tabular-nums">{formatValue(seg.value)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                ({pct.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
