'use client';

import { Suspense, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import {
  bucketLabel,
  formatDuration,
  formatExplorerDateTime,
  formatNumber,
} from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { formatSnapshotTime } from '@/lib/agentic-workload-explorer/snapshot';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    failedToLoad: 'Failed to load endpoint data',
    totalRequests: 'Total requests',
    errorRate: 'Error rate',
    routes: 'Routes',
    errorsFinal24h: 'Errors (final 24h)',
    final7days: 'final 7 days',
    errors: (n: string) => `${n} errors`,
    uniqueEndpoints: 'unique endpoints',
    final24hours: 'final 24 hours',
    statusCodeDistribution: 'Status code distribution',
    hourlyTraffic: 'Hourly traffic',
    final48hours: 'final 48 hours',
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
    tooltipTotal: 'total',
  },
  zh: {
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
    hourlyTraffic: '每小时流量',
    final48hours: '最后 48 小时',
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
    tooltipTotal: '合计',
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

const CHART_W = 600;
const CHART_H = 180;
const MARGIN = { top: 8, right: 12, bottom: 32, left: 48 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;
const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

const ENDPOINT_COLORS: Record<string, string> = {
  '/v1/messages': '#10b981',
};
const FALLBACK_COLORS = ['#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];

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

const STATUS_COLORS: Record<string, string> = {
  '2xx': '#10b981',
  '3xx': '#06b6d4',
  '4xx': '#f59e0b',
  '5xx': '#ef4444',
  unknown: '#6b7280',
};

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

  return (
    <div className="space-y-6">
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

      {data.statusDistribution.length > 0 && (
        <div>
          <SectionHeader label={t.statusCodeDistribution} detail={t.final7days} />
          <div className="mt-3 flex items-end gap-1.5 h-16">
            {data.statusDistribution.map((s) => {
              const maxCount = Math.max(...data.statusDistribution.map((d) => d.count), 1);
              const height = (s.count / maxCount) * 100;
              return (
                <div key={s.statusGroup} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-3xs font-mono text-muted-foreground">
                    {formatNumber(s.count)}
                  </span>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max(height, 4)}%`,
                      backgroundColor: STATUS_COLORS[s.statusGroup] || '#6b7280',
                      opacity: 0.8,
                    }}
                  />
                  <span
                    className="text-3xs font-mono font-medium"
                    style={{ color: STATUS_COLORS[s.statusGroup] || '#6b7280' }}
                  >
                    {bucketLabel(s.statusGroup, locale)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.hourlyByEndpoint.length > 0 && (
        <div>
          <SectionHeader label={t.hourlyTraffic} detail={t.final48hours} />
          <Expandable title={t.hourlyTraffic} subtitle={t.final48hours} corner>
            <div className="mt-3 rounded-xl border border-border/30 bg-card p-3">
              <HourlyTrafficChart hourly={data.hourlyByEndpoint} tooltipTotal={t.tooltipTotal} />
            </div>
          </Expandable>
        </div>
      )}

      <div>
        <SectionHeader label={t.routeBreakdown} detail={t.final7days} />
        <div className="mt-3 rounded-xl border border-border/30 bg-card overflow-hidden">
          <table className="w-full text-2xs font-mono">
            <thead>
              <tr className="border-b border-border/20 bg-surface-hover">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thEndpoint}
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thTotal}
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thSuccess}
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thErrors}
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thSuccessPct}
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thAvgLatency}
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thP95Latency}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.routeStats.map((route) => {
                const successRate = route.total > 0 ? (route.successCount / route.total) * 100 : 0;
                return (
                  <tr
                    key={route.endpoint}
                    className="border-b border-border/20 last:border-0 hover:bg-surface-hover"
                  >
                    <td className="px-3 py-2 text-foreground">
                      {bucketLabel(route.endpoint, locale)}
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(route.total)}</td>
                    <td className="px-3 py-2 text-right text-success">
                      {formatNumber(route.successCount)}
                    </td>
                    <td className="px-3 py-2 text-right text-destructive">
                      {route.errorCount > 0 ? formatNumber(route.errorCount) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={
                          successRate >= 99
                            ? 'text-success'
                            : successRate >= 95
                              ? 'text-warning'
                              : 'text-destructive'
                        }
                      >
                        {successRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {route.avgDurationMs > 0 ? formatDuration(route.avgDurationMs) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {route.p95DurationMs > 0 ? formatDuration(route.p95DurationMs) : '—'}
                    </td>
                  </tr>
                );
              })}
              {data.routeStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    {t.noRequestData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionHeader label={t.latestErrors} detail={t.final24hours} />
        <div className="mt-3 rounded-xl border border-border/30 bg-card overflow-hidden">
          <table className="w-full text-2xs font-mono">
            <thead>
              <tr className="border-b border-border/20 bg-surface-hover">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thTime}
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thEndpoint}
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thModel}
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thStatus}
                </th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thDuration}
                </th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium text-xs">
                  {t.thError}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.recentErrors.map((err) => (
                <tr
                  key={err.id}
                  className="border-b border-border/20 last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {formatSnapshotTime(err.timestamp, locale)}
                  </td>
                  <td className="px-3 py-2 text-foreground">{bucketLabel(err.endpoint, locale)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{err.model ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={
                        err.responseStatusCode && err.responseStatusCode >= 500
                          ? 'text-destructive'
                          : 'text-warning'
                      }
                    >
                      {err.responseStatusCode ?? 'null'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {err.durationMs ? formatDuration(err.durationMs) : '—'}
                  </td>
                  <td
                    className="px-3 py-2 text-destructive truncate max-w-xs"
                    title={err.error ?? ''}
                  >
                    {err.error ? err.error.slice(0, 80) : '—'}
                  </td>
                </tr>
              ))}
              {data.recentErrors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-success">
                    {t.noErrors}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HourlyTrafficChart({
  hourly,
  tooltipTotal,
}: {
  hourly: HourlyEndpoint[];
  tooltipTotal: string;
}) {
  const locale = useLocale();
  const { hours, endpointNames, seriesByEndpoint, maxCount } = useMemo(() => {
    const hourSet = new Set<string>();
    const epSet = new Set<string>();
    for (const h of hourly) {
      hourSet.add(h.hour);
      epSet.add(h.endpoint);
    }
    const sortedHours = [...hourSet].toSorted();
    const epNames = [...epSet].toSorted();

    const lookup = new Map<string, number>();
    for (const h of hourly) {
      lookup.set(`${h.hour}|${h.endpoint}`, h.count);
    }

    const series: Record<string, number[]> = {};
    for (const ep of epNames) {
      series[ep] = sortedHours.map((hr) => lookup.get(`${hr}|${ep}`) || 0);
    }

    let max = 0;
    for (let i = 0; i < sortedHours.length; i++) {
      let sum = 0;
      for (const ep of epNames) sum += series[ep][i];
      if (sum > max) max = sum;
    }

    return { hours: sortedHours, endpointNames: epNames, seriesByEndpoint: series, maxCount: max };
  }, [hourly]);

  if (hours.length === 0) return null;

  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount || 1;

  const barGap = 1;
  const barWidth = Math.max(1, (PLOT_W - barGap * hours.length) / hours.length);

  const sx = (i: number) => MARGIN.left + i * (barWidth + barGap);
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  const colorMap = new Map<string, string>();
  let fallbackIdx = 0;
  for (const ep of endpointNames) {
    colorMap.set(
      ep,
      ENDPOINT_COLORS[ep] || FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length],
    );
  }

  // Four intervals: at eight, the date + hour labels overlapped in both locales.
  const labelInterval = Math.max(1, Math.floor(hours.length / 4));

  return (
    <div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" role="img">
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              y1={sy(t)}
              x2={MARGIN.left + PLOT_W}
              y2={sy(t)}
              stroke="var(--color-border)"
              strokeWidth={0.5}
            />
            <text
              x={MARGIN.left - 6}
              y={sy(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--color-muted-foreground)"
              fontFamily={SVG_FONT}
              fontSize={SVG_FONT_SIZE}
            >
              {formatNumber(t)}
            </text>
          </g>
        ))}

        {hours.map((hr, i) => {
          let cumY = 0;
          const total = endpointNames.reduce((s, ep) => s + seriesByEndpoint[ep][i], 0);
          return (
            <g key={hr}>
              {endpointNames.map((ep) => {
                const count = seriesByEndpoint[ep][i];
                if (count === 0) return null;
                const barH = (count / yMax) * PLOT_H;
                const y = sy(cumY + count);
                cumY += count;
                return (
                  <rect
                    key={ep}
                    x={sx(i)}
                    y={y}
                    width={barWidth}
                    height={Math.max(barH, 0.5)}
                    fill={colorMap.get(ep)}
                    opacity={0.8}
                  >
                    <title>
                      {formatExplorerDateTime(hr, locale, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {'\n'}
                      {bucketLabel(ep, locale)}: {count} ({total} {tooltipTotal})
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}

        {hours.map((hr, i) =>
          i % labelInterval === 0 ? (
            <text
              key={hr}
              x={i + labelInterval >= hours.length ? sx(i) + barWidth : sx(i) + barWidth / 2}
              y={CHART_H - 4}
              textAnchor={i + labelInterval >= hours.length ? 'end' : 'middle'}
              fill="var(--color-muted-foreground)"
              fontFamily={SVG_FONT}
              fontSize={SVG_FONT_SIZE}
            >
              {formatExplorerDateTime(
                hr,
                locale,
                { month: 'short', day: 'numeric', hour: '2-digit' },
                { axisTick: true },
              )}
            </text>
          ) : null,
        )}
      </svg>

      <div className="flex flex-wrap gap-3 mt-2 px-1">
        {endpointNames.map((ep) => (
          <div key={ep} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: colorMap.get(ep), opacity: 0.8 }}
            />
            <span className="text-3xs font-mono text-muted-foreground">
              {bucketLabel(ep, locale)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
