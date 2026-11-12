'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { formatDollars, formatNumber } from '@/lib/agentic-workload-explorer/format';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import type {
  SessionInsightsData,
  HistogramBin,
  PercentileStats,
} from '@/lib/agentic-workload-explorer/api-types';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import {
  ChartActions,
  ExpandableChart,
} from '@/components/agentic-workload-explorer/expandable-chart';
import { DistributionHistogram } from '@/components/agentic-workload-explorer/distribution-histogram';
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
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';

const STRINGS = {
  en: {
    stats: 'Stats',
    distributions: 'Distributions',
    failedToLoad: 'Failed to load session insights data',
    avgDuration: 'Avg duration',
    avgTurnsPerSession: 'Avg turns / session',
    avgCostPerSession: 'Avg cost / session',
    activeFinal24h: 'Active (final 24h)',
    sessionDurationDistribution: 'Session duration distribution',
    turnsPerSessionDistribution: 'Turns per session distribution',
    sessionCostDistribution: 'Session cost distribution',
    sessionsOverTime: 'Sessions over time',
    concurrentSessions: 'Concurrent sessions',
    concurrentDetail: 'Final 7 days, hourly',
    noDataAvailable: 'No data available',
    noDailySessionData: 'No daily session data available',
    noConcurrentData: 'No concurrent session data available',
    sessions: (n: number) => `${formatNumber(n)} sessions`,
    active: 'Active sessions',
    dailySessions: 'Daily sessions',
    axisDuration: 'Session duration',
    axisTurns: 'Turns per session',
    axisCost: 'Session cost (USD)',
    axisSessions: 'Sessions',
    sessionCount: { one: 'session', other: 'sessions' },
  },
  zh: {
    stats: '统计',
    distributions: '分布',
    failedToLoad: '加载会话分析数据失败',
    avgDuration: '平均时长',
    avgTurnsPerSession: '平均轮次 / 会话',
    avgCostPerSession: '平均成本 / 会话',
    activeFinal24h: '活跃数（最后 24 小时）',
    sessionDurationDistribution: '会话时长分布',
    turnsPerSessionDistribution: '每会话轮次分布',
    sessionCostDistribution: '会话成本分布',
    sessionsOverTime: '会话随时间变化',
    concurrentSessions: '并发会话',
    concurrentDetail: '最后 7 天，按小时',
    noDataAvailable: '暂无数据',
    noDailySessionData: '暂无每日会话数据',
    noConcurrentData: '暂无并发会话数据',
    sessions: (n: number) => `${formatNumber(n)} 个会话`,
    active: '活跃会话',
    dailySessions: '每日会话',
    axisDuration: '会话时长',
    axisTurns: '每会话轮次',
    axisCost: '会话成本（美元）',
    axisSessions: '会话数',
    sessionCount: { one: '个会话', other: '个会话' },
  },
};

const SESSION_COLOR = CHART_COLORS[0];
const DAILY_SESSIONS_KEY = 'sessions';
const DAILY_SESSIONS_KEYS = [DAILY_SESSIONS_KEY];
const PERCENTILE_LABELS = ['p25', 'p50', 'p75', 'p90', 'p99'] as const;

function formatDurationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function SessionHistogram({
  title,
  bins,
  percentiles,
  total,
  format,
  axisLabel,
  fileName,
}: {
  title: string;
  bins: HistogramBin[];
  percentiles: PercentileStats;
  total: number;
  format: (v: number) => string;
  axisLabel: string;
  fileName: string;
}) {
  const t = STRINGS[useLocale()];
  const marks = useMemo(
    () => PERCENTILE_LABELS.map((label) => ({ label, value: percentiles[label] })),
    [percentiles],
  );

  return (
    <ExpandableChart
      sharedZoom
      title={title}
      subtitle={t.sessions(total)}
      actions={
        <ChartActions
          fileName={fileName}
          onExportPng={() =>
            track('agentic_workload_session_histogram_export', {
              title,
              file_name: `${fileName}.png`,
            })
          }
        />
      }
    >
      {(expanded) =>
        bins.length === 0 ? (
          <EmptyState bare className="py-8">
            {t.noDataAvailable}
          </EmptyState>
        ) : (
          <DistributionHistogram
            buckets={bins}
            percentiles={marks}
            total={total}
            format={format}
            axisLabel={axisLabel}
            color={SESSION_COLOR}
            countLabel={t.sessionCount}
            expanded={expanded}
          />
        )
      }
    </ExpandableChart>
  );
}

export default function SessionInsightsPage() {
  return (
    <Suspense>
      <SessionInsightsPageContent />
    </Suspense>
  );
}

function SessionInsightsPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading, error } = useDashboardData<SessionInsightsData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/session-insights', traceVersionParam),
        {
          signal,
        },
      );
      if (!r.ok) throw new Error('Failed to fetch session insights');
      return r.json();
    },
    key: String(traceVersionParam),
  });
  const [range, setRange] = useState<DayRange>('30d');
  const handleRangeChange = (v: DayRange) => {
    track('agentic_workload_sessions_range_changed', { range: v });
    setRange(v);
  };

  const dailyDays = useMemo<StackedDayPoint[]>(
    () =>
      (data?.dailySessions ?? [])
        .slice(-DAY_RANGE_DAYS[range])
        .map((d) => ({ day: d.day, values: { [DAILY_SESSIONS_KEY]: d.sessionCount } })),
    [data, range],
  );
  const concurrentSeries = useMemo<LineSeries[]>(
    () => [
      {
        key: 'active',
        label: t.active,
        color: SESSION_COLOR,
        points: (data?.hourlyConcurrent ?? []).map((h) => ({
          day: h.hour,
          value: h.activeSessions,
        })),
      },
    ],
    [data, t],
  );
  const formatHour = useCallback((hour: string) => formatHourLabel(hour, locale), [locale]);
  const dailyLabel = useCallback(() => t.dailySessions, [t]);
  const dailyColor = useCallback(() => SESSION_COLOR, []);

  return (
    <div className="space-y-6">
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
        ) : error || !data ? (
          <EmptyState>{t.failedToLoad}</EmptyState>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat boxed label={t.avgDuration} value={formatDurationLabel(data.stats.avgDuration)} />
            <Stat boxed label={t.avgTurnsPerSession} value={data.stats.avgTurns.toFixed(1)} />
            <Stat boxed label={t.avgCostPerSession} value={formatDollars(data.stats.avgCost)} />
            <Stat boxed label={t.activeFinal24h} value={formatNumber(data.stats.active24h)} />
          </dl>
        )}
      </div>

      {data && (
        <>
          <div>
            <SectionHeader label={t.distributions} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SessionHistogram
                title={t.sessionDurationDistribution}
                bins={data.durationBins}
                percentiles={data.durationPercentiles}
                total={data.durationTotal}
                format={formatDurationLabel}
                axisLabel={t.axisDuration}
                fileName="session-duration-distribution"
              />
              <SessionHistogram
                title={t.turnsPerSessionDistribution}
                bins={data.turnBins}
                percentiles={data.turnPercentiles}
                total={data.turnTotal}
                format={formatAxisNumber}
                axisLabel={t.axisTurns}
                fileName="turns-per-session-distribution"
              />
              <SessionHistogram
                title={t.sessionCostDistribution}
                bins={data.costBins}
                percentiles={data.costPercentiles}
                total={data.costTotal}
                format={formatAxisDollars}
                axisLabel={t.axisCost}
                fileName="session-cost-distribution"
              />
            </div>
          </div>

          <TrendsStackedChart
            title={t.sessionsOverTime}
            days={dailyDays}
            seriesKeys={DAILY_SESSIONS_KEYS}
            labelFor={dailyLabel}
            colorFor={dailyColor}
            mode="count"
            yFormatter={formatAxisNumber}
            yLabel={t.axisSessions}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            filename="daily-sessions"
            emptyLabel={t.noDailySessionData}
            controls={
              <RangeToggle value={range} options={DAY_RANGES} onChange={handleRangeChange} />
            }
          />

          <TrendsLineChart
            title={t.concurrentSessions}
            subtext={t.concurrentDetail}
            series={concurrentSeries}
            yFormatter={formatAxisNumber}
            yLabel={t.active}
            xFormatter={formatHour}
            filename="concurrent-sessions"
            emptyLabel={t.noConcurrentData}
          />
        </>
      )}
    </div>
  );
}
