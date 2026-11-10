'use client';

import { Suspense, useCallback, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { bucketLabel, formatDuration, formatNumber } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { formatSnapshotTime } from '@/lib/agentic-workload-explorer/snapshot';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/agentic-workload-explorer/ui/table';
import {
  formatAxisNumber,
  formatHourLabel,
  TrendsStackedChart,
  type StackedDayPoint,
} from '@/components/agentic-workload-explorer/trends-charts';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    stats: 'Stats',
    failedToLoad: 'Failed to load endpoint data',
    totalRequests: 'Total requests',
    errorRate: 'Error rate',
    routes: 'Routes',
    errorsFinal24h: 'Errors (final 24h)',
    final7days: 'Final 7 days',
    errors: (n: string) => `${n} errors`,
    uniqueEndpoints: 'unique endpoints',
    final24hours: 'Final 24 hours',
    statusCodeDistribution: 'Status code distribution',
    shareOfRequests: (share: string) => `${share} of requests`,
    hourlyTraffic: 'Hourly traffic',
    hourlyTrafficDetail: 'Requests per hour by route · Final 48 hours',
    yRequests: 'Requests',
    routeBreakdown: 'Route breakdown',
    latestErrors: 'Latest errors',
    thEndpoint: 'Endpoint',
    thTotal: 'Total',
    thSuccess: 'Success',
    thErrors: 'Errors',
    thSuccessPct: 'Success %',
    thAvgLatency: 'Avg latency',
    thP95Latency: 'p95 latency',
    thTime: 'Time',
    thModel: 'Model',
    thStatus: 'Status',
    thDuration: 'Duration',
    thError: 'Error',
    noRequestData: 'No request data in the final 7 days',
    noErrors: 'No errors in the final 24 hours',
  },
  zh: {
    yRequests: '请求数',
    stats: '统计',
    failedToLoad: '无法加载端点数据',
    totalRequests: '总请求数',
    errorRate: '错误率',
    routes: '路由',
    errorsFinal24h: '错误（最后 24 小时）',
    final7days: '最后 7 天',
    errors: (n: string) => `${n} 个错误`,
    uniqueEndpoints: '独立端点',
    final24hours: '最后 24 小时',
    statusCodeDistribution: '状态码分布',
    shareOfRequests: (share: string) => `占请求的 ${share}`,
    hourlyTraffic: '每小时流量',
    hourlyTrafficDetail: '按路由统计的每小时请求数 · 最后 48 小时',
    routeBreakdown: '路由明细',
    latestErrors: '最近错误',
    thEndpoint: 'Endpoint',
    thTotal: '总计',
    thSuccess: '成功',
    thErrors: '错误',
    thSuccessPct: '成功率',
    thAvgLatency: '平均延迟',
    thP95Latency: 'p95 延迟',
    thTime: '时间',
    thModel: '模型',
    thStatus: '状态',
    thDuration: '耗时',
    thError: '错误',
    noRequestData: '最后 7 天无请求数据',
    noErrors: '最后 24 小时无错误',
  },
} as const;

interface RouteStat {
  endpoint: string;
  total: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

interface HourlyEndpoint {
  hour: string;
  endpoint: string;
  count: number;
}

interface StatusGroup {
  statusGroup: string;
  count: number;
}

interface RecentError {
  id: string;
  timestamp: string;
  endpoint: string;
  model: string | null;
  responseStatusCode: number | null;
  durationMs: number | null;
  error: string | null;
}

interface ProxyHealthData {
  routeStats: RouteStat[];
  hourlyByEndpoint: HourlyEndpoint[];
  statusDistribution: StatusGroup[];
  recentErrors: RecentError[];
}

const ENDPOINT_COLORS: Record<string, string> = {
  '/v1/messages': CHART_COLORS[2],
};
const FALLBACK_COLORS = [CHART_COLORS[1], CHART_COLORS[6], CHART_COLORS[4], CHART_COLORS[5]];

const STATUS_COLORS: Record<string, string> = {
  '2xx': '#10b981',
  '3xx': '#06b6d4',
  '4xx': '#f59e0b',
  '5xx': '#ef4444',
  unknown: '#6b7280',
};

const TEXT_SUCCESS = 'text-emerald-700 dark:text-emerald-400';
const TEXT_WARNING = 'text-amber-700 dark:text-amber-400';
const TEXT_DESTRUCTIVE = 'text-red-700 dark:text-red-400';

function shareLabel(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '0.0%';
  const fixed = ((count / total) * 100).toFixed(1);
  return fixed === '0.0' ? '<0.1%' : `${fixed}%`;
}

export default function ProxyHealthPage() {
  return (
    <Suspense>
      <ProxyHealthPageContent />
    </Suspense>
  );
}

function ProxyHealthPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading } = useDashboardData<ProxyHealthData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/proxy-health', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: String(traceVersionParam),
  });

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState>{t.failedToLoad}</EmptyState>;
  }

  const totalRequests = data.routeStats.reduce((s, r) => s + r.total, 0);
  const totalErrors = data.routeStats.reduce((s, r) => s + r.errorCount, 0);
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  const statusTotal = data.statusDistribution.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader label={t.stats} />
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat
            boxed
            label={t.totalRequests}
            value={formatNumber(totalRequests)}
            detail={t.final7days}
          />
          <Stat
            boxed
            label={t.errorRate}
            value={`${errorRate.toFixed(1)}%`}
            detail={t.errors(formatNumber(totalErrors))}
            valueClassName={
              errorRate > 5 ? 'text-destructive' : errorRate > 1 ? 'text-warning' : 'text-success'
            }
          />
          <Stat
            boxed
            label={t.routes}
            value={String(data.routeStats.length)}
            detail={t.uniqueEndpoints}
          />
          <Stat
            boxed
            label={t.errorsFinal24h}
            value={String(data.recentErrors.length)}
            detail={t.final24hours}
            valueClassName={data.recentErrors.length > 10 ? 'text-destructive' : undefined}
          />
        </dl>
      </div>

      {data.statusDistribution.length > 0 && (
        <div>
          <SectionHeader label={t.statusCodeDistribution} detail={t.final7days} />
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {data.statusDistribution.map((s) => (
              <Stat
                key={s.statusGroup}
                boxed
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-sm"
                      style={{ backgroundColor: STATUS_COLORS[s.statusGroup] ?? '#6b7280' }}
                    />
                    {bucketLabel(s.statusGroup, locale)}
                  </span>
                }
                value={formatNumber(s.count)}
                detail={t.shareOfRequests(shareLabel(s.count, statusTotal))}
              />
            ))}
          </dl>
        </div>
      )}

      {data.hourlyByEndpoint.length > 0 && (
        <HourlyTrafficChart
          hourly={data.hourlyByEndpoint}
          title={t.hourlyTraffic}
          subtext={t.hourlyTrafficDetail}
          yLabel={t.yRequests}
        />
      )}

      <div>
        <SectionHeader label={t.routeBreakdown} detail={t.final7days} />
        <div className="rounded-xl border border-border/30 bg-card">
          <Table className="text-xs tabular-nums">
            <TableHeader>
              <TableRow>
                <TableHead>{t.thEndpoint}</TableHead>
                <TableHead className="text-right">{t.thTotal}</TableHead>
                <TableHead className="text-right">{t.thSuccess}</TableHead>
                <TableHead className="text-right">{t.thErrors}</TableHead>
                <TableHead className="text-right">{t.thSuccessPct}</TableHead>
                <TableHead className="text-right">{t.thAvgLatency}</TableHead>
                <TableHead className="text-right">{t.thP95Latency}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.routeStats.map((route) => {
                const successRate = route.total > 0 ? (route.successCount / route.total) * 100 : 0;
                return (
                  <TableRow key={route.endpoint}>
                    <TableCell className="text-foreground">
                      {bucketLabel(route.endpoint, locale)}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(route.total)}</TableCell>
                    <TableCell className={`text-right ${TEXT_SUCCESS}`}>
                      {formatNumber(route.successCount)}
                    </TableCell>
                    <TableCell className={`text-right ${TEXT_DESTRUCTIVE}`}>
                      {route.errorCount > 0 ? formatNumber(route.errorCount) : '—'}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        successRate >= 99
                          ? TEXT_SUCCESS
                          : successRate >= 95
                            ? TEXT_WARNING
                            : TEXT_DESTRUCTIVE
                      }`}
                    >
                      {successRate.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {route.avgDurationMs > 0 ? formatDuration(route.avgDurationMs) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {route.p95DurationMs > 0 ? formatDuration(route.p95DurationMs) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {data.routeStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    {t.noRequestData}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <SectionHeader label={t.latestErrors} detail={t.final24hours} />
        <div className="rounded-xl border border-border/30 bg-card">
          <Table className="text-xs tabular-nums">
            <TableHeader>
              <TableRow>
                <TableHead>{t.thTime}</TableHead>
                <TableHead>{t.thEndpoint}</TableHead>
                <TableHead>{t.thModel}</TableHead>
                <TableHead className="text-right">{t.thStatus}</TableHead>
                <TableHead className="text-right">{t.thDuration}</TableHead>
                <TableHead>{t.thError}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentErrors.map((err) => (
                <TableRow key={err.id}>
                  <TableCell className="text-muted-foreground">
                    {formatSnapshotTime(err.timestamp, locale)}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {bucketLabel(err.endpoint, locale)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{err.model ?? '—'}</TableCell>
                  <TableCell
                    className={`text-right font-mono ${
                      err.responseStatusCode && err.responseStatusCode >= 500
                        ? TEXT_DESTRUCTIVE
                        : TEXT_WARNING
                    }`}
                  >
                    {err.responseStatusCode ?? 'null'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {err.durationMs ? formatDuration(err.durationMs) : '—'}
                  </TableCell>
                  <TableCell
                    className={`max-w-xs truncate ${TEXT_DESTRUCTIVE}`}
                    title={err.error ?? ''}
                  >
                    {err.error ? err.error.slice(0, 80) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {data.recentErrors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className={`py-6 text-center ${TEXT_SUCCESS}`}>
                    {t.noErrors}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function HourlyTrafficChart({
  hourly,
  title,
  subtext,
  yLabel,
}: {
  hourly: HourlyEndpoint[];
  title: string;
  subtext: string;
  yLabel: string;
}) {
  const locale = useLocale();
  const { days, endpoints, colors } = useMemo(() => {
    const byHour = new Map<string, Record<string, number>>();
    const endpointSet = new Set<string>();
    for (const h of hourly) {
      endpointSet.add(h.endpoint);
      const values = byHour.get(h.hour) ?? {};
      values[h.endpoint] = (values[h.endpoint] ?? 0) + h.count;
      byHour.set(h.hour, values);
    }
    const sortedEndpoints = [...endpointSet].toSorted();
    let fallback = 0;
    const colorMap = new Map(
      sortedEndpoints.map((ep) => [
        ep,
        ENDPOINT_COLORS[ep] ?? FALLBACK_COLORS[fallback++ % FALLBACK_COLORS.length],
      ]),
    );
    return {
      days: [...byHour.keys()]
        .toSorted()
        .map((hour): StackedDayPoint => ({ day: hour, values: byHour.get(hour)! })),
      endpoints: sortedEndpoints,
      colors: colorMap,
    };
  }, [hourly]);
  const labelFor = useCallback((ep: string) => bucketLabel(ep, locale), [locale]);
  const colorFor = useCallback((ep: string) => colors.get(ep) ?? CHART_COLORS[0], [colors]);
  const formatHour = useCallback((hour: string) => formatHourLabel(hour, locale), [locale]);

  return (
    <TrendsStackedChart
      title={title}
      subtext={subtext}
      days={days}
      seriesKeys={endpoints}
      labelFor={labelFor}
      colorFor={colorFor}
      mode="count"
      yFormatter={formatAxisNumber}
      yLabel={yLabel}
      xFormatter={formatHour}
      filename="hourly-traffic"
    />
  );
}
