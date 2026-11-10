'use client';

import { Suspense, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { bucketLabel, formatNumber } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import type { PlatformData, PlatformStat } from '@/lib/agentic-workload-explorer/api-types';
import {
  formatAxisNumber,
  formatDayLabel,
  TrendsStackedChart,
  buildColorMap,
  type StackedDayPoint,
} from '@/components/agentic-workload-explorer/trends-charts';
import {
  CHART_COLORS,
  NEUTRAL_SERIES_COLOR,
} from '@/components/agentic-workload-explorer/series-colors';

const STRINGS = {
  en: {
    ySessions: 'Sessions',
    stats: 'Stats',
    uniqueOs: 'Unique OS',
    uniqueCliVersions: 'Unique CLI versions',
    mostCommonOs: 'Most common OS',
    totalSessions: 'Total sessions',
    failedToLoad: 'Failed to load platform data',
    osDist: 'OS distribution',
    cliVersionDist: 'CLI version distribution',
    nodeVersionDist: 'Node.js version distribution',
    archDist: 'Architecture distribution',
    platformTrends: 'Platform trends',
    noData: 'No data',
    noTimeSeries: 'No time series data',
    sessionsPerDay: 'Sessions per day by OS',
  },
  zh: {
    ySessions: '会话数',
    stats: '统计',
    uniqueOs: '操作系统种类',
    uniqueCliVersions: 'CLI 版本种类',
    mostCommonOs: '最常见操作系统',
    totalSessions: '会话总数',
    failedToLoad: '无法加载平台数据',
    osDist: '操作系统分布',
    cliVersionDist: 'CLI 版本分布',
    nodeVersionDist: 'Node.js 版本分布',
    archDist: '架构分布',
    platformTrends: '平台趋势',
    noData: '暂无数据',
    noTimeSeries: '暂无时间序列数据',
    sessionsPerDay: '按操作系统统计的每日会话数',
  },
} as const;

const UNKNOWN = 'unknown';

function aggregate(
  stats: PlatformStat[],
  key: keyof PlatformStat,
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const s of stats) {
    const val = s[key] as string | null;
    const label = val ?? UNKNOWN;
    map.set(label, (map.get(label) || 0) + Number(s.sessionCount));
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);
}

const BAR_COLOR = CHART_COLORS[0];

function HorizontalBars({
  data,
  limit,
  mono = false,
  emptyLabel,
}: {
  data: { label: string; count: number }[];
  limit?: number;
  mono?: boolean;
  emptyLabel: string;
}) {
  const locale = useLocale();
  const items = limit ? data.slice(0, limit) : data;
  const maxCount = items.reduce((max, d) => Math.max(max, d.count), 0);

  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((d) => {
        const widthPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
        const unknown = d.label === UNKNOWN;
        const label = bucketLabel(d.label, locale);
        return (
          <div
            key={d.label}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:flex"
          >
            <span
              className={`min-w-0 sm:w-36 shrink-0 truncate text-xs ${unknown ? 'text-muted-foreground' : 'text-foreground'} ${mono && !unknown ? 'font-mono' : ''}`}
              title={label}
            >
              {label}
            </span>
            <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${widthPct}%`,
                  minWidth: d.count > 0 ? 2 : 0,
                  backgroundColor: unknown ? NEUTRAL_SERIES_COLOR : BAR_COLOR,
                  opacity: unknown ? 0.5 : 1,
                }}
              />
            </div>
            <span
              className={`sm:w-14 shrink-0 text-right text-xs tabular-nums ${unknown ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {formatNumber(d.count)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PlatformPage() {
  return (
    <Suspense>
      <PlatformPageContent />
    </Suspense>
  );
}

function PlatformPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading } = useDashboardData<PlatformData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/platform', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: String(traceVersionParam),
  });

  const osDist = useMemo(() => (data ? aggregate(data.stats, 'os') : []), [data]);
  const cliDist = useMemo(() => (data ? aggregate(data.stats, 'cliVersion') : []), [data]);
  const nodeDist = useMemo(() => (data ? aggregate(data.stats, 'nodeVersion') : []), [data]);
  const archDist = useMemo(() => (data ? aggregate(data.stats, 'arch') : []), [data]);

  const uniqueOs = useMemo(() => osDist.filter((d) => d.label !== UNKNOWN).length, [osDist]);
  const uniqueCli = useMemo(() => cliDist.filter((d) => d.label !== UNKNOWN).length, [cliDist]);
  const mostCommonOs = useMemo(
    () => osDist.find((d) => d.label !== UNKNOWN)?.label ?? '—',
    [osDist],
  );
  const totalSessions = useMemo(() => osDist.reduce((sum, d) => sum + d.count, 0), [osDist]);

  const trend = useMemo(() => {
    const dayMap = new Map<string, Record<string, number>>();
    const osSet = new Set<string>();
    for (const entry of data?.timeSeries ?? []) {
      const os = entry.os ?? UNKNOWN;
      osSet.add(os);
      const values = dayMap.get(entry.day) ?? {};
      values[os] = (values[os] ?? 0) + Number(entry.sessionCount);
      dayMap.set(entry.day, values);
    }
    const keys = [...osSet].toSorted();
    const days: StackedDayPoint[] = [...dayMap.entries()]
      .toSorted(([a], [b]) => Date.parse(a) - Date.parse(b))
      .map(([day, values]) => ({ day, values }));
    return { keys, days, colors: buildColorMap(keys) };
  }, [data]);

  return (
    <div className="space-y-5">
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
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat boxed label={t.uniqueOs} value={String(uniqueOs)} />
            <Stat boxed label={t.uniqueCliVersions} value={String(uniqueCli)} />
            <Stat boxed label={t.mostCommonOs} value={bucketLabel(mostCommonOs, locale)} />
            <Stat boxed label={t.totalSessions} value={formatNumber(totalSessions)} />
          </dl>
        ) : (
          <EmptyState>{t.failedToLoad}</EmptyState>
        )}
      </div>

      {data && (
        <>
          <div>
            <SectionHeader label={t.osDist} />
            <Card>
              <HorizontalBars data={osDist} emptyLabel={t.noData} />
            </Card>
          </div>

          <div>
            <SectionHeader label={t.cliVersionDist} />
            <Card>
              <HorizontalBars data={cliDist} limit={15} mono emptyLabel={t.noData} />
            </Card>
          </div>

          <div>
            <SectionHeader label={t.nodeVersionDist} />
            <Card>
              <HorizontalBars data={nodeDist} mono emptyLabel={t.noData} />
            </Card>
          </div>

          <div>
            <SectionHeader label={t.archDist} />
            <Card>
              <HorizontalBars data={archDist} emptyLabel={t.noData} />
            </Card>
          </div>

          <TrendsStackedChart
            title={t.platformTrends}
            subtext={t.sessionsPerDay}
            days={trend.days}
            seriesKeys={trend.keys}
            labelFor={(key) => bucketLabel(key, locale)}
            colorFor={(key) => trend.colors[key]}
            mode="count"
            yFormatter={formatAxisNumber}
            yLabel={t.ySessions}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            filename="platform-trends"
            emptyLabel={t.noTimeSeries}
          />
        </>
      )}
    </div>
  );
}
