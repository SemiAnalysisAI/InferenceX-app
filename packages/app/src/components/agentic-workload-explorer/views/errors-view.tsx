'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { StatGridSkeleton } from '@/components/agentic-workload-explorer/dashboard-skeleton';
import { formatNumber, formatDuration } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { IncidentSignalRail } from '@/components/agentic-workload-explorer/incident-signal-rail';
import { ModelImpactMatrix } from '@/components/agentic-workload-explorer/model-impact-matrix';
import { ErrorReachPanel } from '@/components/agentic-workload-explorer/error-reach';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type { ErrorData } from '@/lib/agentic-workload-explorer/api-types';
import { formatSnapshotTime, lastDayLabel } from '@/lib/agentic-workload-explorer/snapshot';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    errorSummary: 'Error summary',
    errorReach: 'Error reach vs retry concentration',
    hourlyIncident: 'Hourly incident signals',
    statusBreakdown: 'Status code breakdown',
    modelImpact: 'All-time model impact matrix',
    recentErrors: 'Recent errors',
    totalErrors: 'Total errors',
    errorRate: 'Error rate',
    errorsDay: `Errors (${lastDayLabel('en')})`,
    mostCommonCode: 'Most common code',
    ofRequests: (n: string) => `of ${n} requests`,
    allTime: 'all time',
    utcDay: 'UTC day',
    occurrences: (n: string) => `${n} occurrences`,
    noErrors: 'no errors',
    errorUnavailable: 'Error data unavailable',
    errorCouldNotLoad: (msg: string) => `Error data could not be loaded: ${msg}`,
    retry: 'Retry',
    retrying: 'Retrying…',
    noErrorData: 'No error data was returned for this trace version',
    reload: 'Reload',
    reloadFailed: 'Reload failed · showing previously loaded data',
    errorCouldNotReload: (msg: string) => `Error data could not be reloaded: ${msg}`,
    loadingAria: 'Loading error summary and incident signals.',
    noStatusData: 'No status code data is available for this trace version',
    clientErrors: 'Client errors (4xx)',
    serverErrors: 'Server errors (5xx)',
    noRecentErrors: 'No recent errors',
    colStatus: 'Status',
    colModel: 'Model',
    colError: 'Error',
    colDuration: 'Duration',
    colSession: 'Session',
    colTime: 'Time',
  },
  zh: {
    errorSummary: '错误概览',
    errorReach: '错误覆盖面 vs 重试集中度',
    hourlyIncident: '逐小时事件信号',
    statusBreakdown: '状态码分布',
    modelImpact: '全时段模型影响矩阵',
    recentErrors: '最近的错误',
    totalErrors: '总错误数',
    errorRate: '错误率',
    errorsDay: `错误数 (${lastDayLabel('zh')})`,
    mostCommonCode: '最常见状态码',
    ofRequests: (n: string) => `共 ${n} 个请求`,
    allTime: '全时段',
    utcDay: 'UTC 日',
    occurrences: (n: string) => `${n} 次`,
    noErrors: '无错误',
    errorUnavailable: '错误数据不可用',
    errorCouldNotLoad: (msg: string) => `错误数据加载失败：${msg}`,
    retry: '重试',
    retrying: '正在重试…',
    noErrorData: '该 trace 版本未返回错误数据',
    reload: '重新加载',
    reloadFailed: '重新加载失败 · 显示之前加载的数据',
    errorCouldNotReload: (msg: string) => `错误数据重新加载失败：${msg}`,
    loadingAria: '正在加载错误概览和事件信号。',
    noStatusData: '该 trace 版本暂无状态码数据',
    clientErrors: '客户端错误 (4xx)',
    serverErrors: '服务端错误 (5xx)',
    noRecentErrors: '暂无最近的错误',
    colStatus: '状态',
    colModel: '模型',
    colError: '错误',
    colDuration: '耗时',
    colSession: '会话',
    colTime: '时间',
  },
};

function StatusBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-muted-foreground">--</span>;
  const is5xx = code >= 500;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-3xs font-mono font-medium ${
        is5xx
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-warning/30 bg-warning/10 text-warning'
      }`}
    >
      {code}
    </span>
  );
}

function StatusCodeBreakdown({ data }: { data: ErrorData['statusCodes'] }) {
  const t = STRINGS[useLocale()];
  if (data.length === 0) {
    return (
      <div role="status" className="text-2xs font-mono text-muted-foreground">
        {t.noStatusData}
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const count4xx = data
    .filter((d) => d.statusCode >= 400 && d.statusCode < 500)
    .reduce((sum, d) => sum + d.count, 0);
  const count5xx = data.filter((d) => d.statusCode >= 500).reduce((sum, d) => sum + d.count, 0);
  const pct4xx = total > 0 ? ((count4xx / total) * 100).toFixed(1) : '0.0';
  const pct5xx = total > 0 ? ((count5xx / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-2">
        {data.map((d) => {
          const is5xx = d.statusCode >= 500;
          const barColor = is5xx ? 'bg-destructive' : 'bg-warning';
          const widthPct = (d.count / maxCount) * 100;
          return (
            <div key={d.statusCode} className="flex items-center gap-3">
              <span className="text-2xs font-mono font-medium w-8 text-right shrink-0">
                {d.statusCode}
              </span>
              <div className="flex-1 h-5 bg-surface-hover rounded-sm overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-sm`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-3xs font-mono text-muted-foreground w-10 text-right shrink-0">
                {formatNumber(d.count)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 pl-4 border-l border-border/20">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">{t.clientErrors}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-medium text-warning tabular-nums">{pct4xx}%</span>
            <span className="text-3xs font-mono text-muted-foreground">
              {formatNumber(count4xx)} / {formatNumber(total)}
            </span>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">{t.serverErrors}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-medium text-destructive tabular-nums">{pct5xx}%</span>
            <span className="text-3xs font-mono text-muted-foreground">
              {formatNumber(count5xx)} / {formatNumber(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ErrorsPage() {
  return (
    <Suspense>
      <ErrorsPageContent />
    </Suspense>
  );
}

function ErrorsPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const explorerHref = useExplorerHref();
  const { apiParam: traceVersionParam } = useTraceVersion();

  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useDashboardData<ErrorData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/errors', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: String(traceVersionParam),
  });

  const initialLoading = loading && !data;

  if (loadError && !data) {
    return (
      <div
        role="alert"
        className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <div>
          <div className="text-sm font-medium text-destructive">{t.errorUnavailable}</div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {t.errorCouldNotLoad(loadError.message)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            track('agentic_workload_errors_retry_clicked');
            reload();
          }}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? t.retrying : t.retry}
        </Button>
      </div>
    );
  }

  if (!loading && !data) {
    return (
      <EmptyState
        role="status"
        className="min-h-48"
        action={
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              track('agentic_workload_errors_reload_clicked');
              reload();
            }}
          >
            {t.reload}
          </Button>
        }
      >
        {t.noErrorData}
      </EmptyState>
    );
  }

  const mostCommonCode =
    data && data.statusCodes.length > 0
      ? data.statusCodes.reduce((a, b) => (a.count > b.count ? a : b))
      : null;

  return (
    <div className="space-y-6" aria-busy={initialLoading}>
      {initialLoading && (
        <p role="status" className="sr-only">
          {t.loadingAria}
        </p>
      )}
      {loadError && data && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="text-xs font-medium text-warning">{t.reloadFailed}</div>
            <p className="mt-0.5 text-3xs text-muted-foreground">
              {t.errorCouldNotReload(loadError.message)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              track('agentic_workload_errors_retry_clicked');
              reload();
            }}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? t.retrying : t.retry}
          </Button>
        </div>
      )}

      <section>
        <SectionHeader label={t.errorSummary} />
        {initialLoading ? (
          <StatGridSkeleton count={4} />
        ) : (
          data && (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat
                boxed
                label={t.totalErrors}
                value={formatNumber(data.summary.totalErrors)}
                detail={t.ofRequests(formatNumber(data.summary.totalRequests))}
              />
              <Stat
                boxed
                label={t.errorRate}
                value={`${data.summary.errorRate.toFixed(1)}%`}
                detail={t.allTime}
              />
              <Stat
                boxed
                label={t.errorsDay}
                value={formatNumber(data.summary.errorsToday)}
                detail={t.utcDay}
              />
              <Stat
                boxed
                label={t.mostCommonCode}
                value={mostCommonCode ? mostCommonCode.statusCode : '--'}
                detail={
                  mostCommonCode ? t.occurrences(formatNumber(mostCommonCode.count)) : t.noErrors
                }
              />
            </dl>
          )
        )}
      </section>

      <section>
        <SectionHeader label={t.errorReach} />
        {initialLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          data && <ErrorReachPanel data={data.errorReach} locale={locale} />
        )}
      </section>

      <section>
        <SectionHeader label={t.hourlyIncident} />
        {initialLoading ? (
          <Skeleton className="h-[360px] rounded-xl" />
        ) : (
          data && (
            <Card>
              <IncidentSignalRail data={data.timeline} />
            </Card>
          )
        )}
      </section>

      <section>
        <SectionHeader label={t.statusBreakdown} />
        {initialLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          data && (
            <Card>
              <StatusCodeBreakdown data={data.statusCodes} />
            </Card>
          )
        )}
      </section>

      <section>
        <SectionHeader label={t.modelImpact} />
        {initialLoading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : (
          data && (
            <Card>
              <ModelImpactMatrix data={data.byModel} />
            </Card>
          )
        )}
      </section>

      <section>
        <SectionHeader label={t.recentErrors} />
        {initialLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded-sm" />
            ))}
          </div>
        ) : (
          data && (
            <Card className="overflow-x-auto p-0 md:p-0">
              <table className="w-full text-2xs font-mono">
                <thead>
                  <tr className="border-b border-border/20">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      {t.colStatus}
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      {t.colModel}
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      {t.colError}
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                      {t.colDuration}
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      {t.colSession}
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                      {t.colTime}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentErrors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        {t.noRecentErrors}
                      </td>
                    </tr>
                  ) : (
                    data.recentErrors.map((err) => (
                      <tr
                        key={err.id}
                        className="border-b border-border/20 last:border-b-0 hover:bg-surface-hover transition-colors"
                      >
                        <td className="px-3 py-2">
                          <StatusBadge code={err.statusCode} />
                        </td>
                        <td className="px-3 py-2 text-foreground max-w-[160px] truncate">
                          {err.model}
                        </td>
                        <td
                          className="px-3 py-2 text-muted-foreground max-w-[300px] truncate"
                          title={err.error || undefined}
                        >
                          {err.error
                            ? err.error.length > 60
                              ? `${err.error.slice(0, 60)}...`
                              : err.error
                            : '--'}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {err.durationMs === null ? '--' : formatDuration(err.durationMs)}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={explorerHref(`/sessions/${err.sessionId}/conversation`)}
                            className="text-brand hover:underline"
                          >
                            {err.sessionId.split('-')[0]}...
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                          {formatSnapshotTime(err.timestamp, locale)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          )
        )}
      </section>
    </div>
  );
}
