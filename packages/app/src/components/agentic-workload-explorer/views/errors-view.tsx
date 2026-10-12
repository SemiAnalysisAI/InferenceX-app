'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
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
import { formatSnapshotTime, LAST_DAY_LABEL } from '@/lib/agentic-workload-explorer/snapshot';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    errorSummary: 'Error Summary',
    errorReach: 'Error Reach vs Retry Concentration',
    hourlyIncident: 'Hourly Incident Signals',
    statusBreakdown: 'Status Code Breakdown',
    modelImpact: 'All-Time Model Impact Matrix',
    recentErrors: 'Recent Errors',
    totalErrors: 'Total Errors',
    errorRate: 'Error Rate',
    errorsDay: `Errors (${LAST_DAY_LABEL})`,
    mostCommonCode: 'Most Common Code',
    ofRequests: (n: string) => `of ${n} requests`,
    allTime: 'all time',
    utcDay: 'UTC day',
    occurrences: (n: string) => `${n} occurrences`,
    noErrors: 'no errors',
    errorUnavailable: 'Error data unavailable',
    errorCouldNotLoad: (msg: string) => `Error data could not be loaded: ${msg}`,
    retry: 'Retry',
    retrying: 'Retrying…',
    noErrorData: 'No error data was returned for this trace version.',
    reload: 'Reload',
    reloadFailed: 'Reload failed · showing previously loaded data',
    errorCouldNotReload: (msg: string) => `Error data could not be reloaded: ${msg}`,
    loadingAria: 'Loading error summary and incident signals.',
    noStatusData: 'No status code data is available for this trace version.',
    clientErrors: 'Client Errors (4xx)',
    serverErrors: 'Server Errors (5xx)',
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
    errorsDay: `错误数 (${LAST_DAY_LABEL})`,
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
    noErrorData: '该 trace 版本未返回错误数据。',
    reload: '重新加载',
    reloadFailed: '重新加载失败 · 显示之前加载的数据',
    errorCouldNotReload: (msg: string) => `错误数据重新加载失败：${msg}`,
    loadingAria: '正在加载错误概览和事件信号。',
    noStatusData: '该 trace 版本暂无状态码数据。',
    clientErrors: '客户端错误 (4xx)',
    serverErrors: '服务端错误 (5xx)',
    noRecentErrors: '暂无最近的错误',
    colStatus: '状态',
    colModel: '模型',
    colError: '错误',
    colDuration: '耗时',
    colSession: 'Session',
    colTime: '时间',
  },
};

// ── Section header component ─────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────

function StatusBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-muted-foreground">--</span>;
  const is5xx = code >= 500;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono font-bold ${
        is5xx
          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
          : 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
      }`}
    >
      {code}
    </span>
  );
}

// ── Status Code Breakdown ────────────────────────────────────────

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
      {/* Left: horizontal bars */}
      <div className="space-y-2">
        {data.map((d) => {
          const is5xx = d.statusCode >= 500;
          const barColor = is5xx ? 'bg-rose-500' : 'bg-amber-500';
          const widthPct = (d.count / maxCount) * 100;
          return (
            <div key={d.statusCode} className="flex items-center gap-3">
              <span className="text-2xs font-mono font-bold w-8 text-right shrink-0">
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

      {/* Right: summary stats */}
      <div className="space-y-3 pl-4 border-l border-border">
        <div>
          <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground mb-1">
            {t.clientErrors}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-mono font-bold text-amber-500">{pct4xx}%</span>
            <span className="text-3xs font-mono text-muted-foreground">
              {formatNumber(count4xx)} / {formatNumber(total)}
            </span>
          </div>
        </div>
        <div>
          <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground mb-1">
            {t.serverErrors}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-mono font-bold text-rose-500">{pct5xx}%</span>
            <span className="text-3xs font-mono text-muted-foreground">
              {formatNumber(count5xx)} / {formatNumber(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

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
        className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-6 text-center font-mono"
      >
        <div>
          <div className="text-sm font-bold text-rose-500">{t.errorUnavailable}</div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {t.errorCouldNotLoad(loadError.message)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            track('agentic_workload_errors_retry_clicked');
            reload();
          }}
          disabled={loading}
          aria-busy={loading}
          className="border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-3xs font-bold uppercase tracking-eyebrow text-rose-500 transition-colors hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? t.retrying : t.retry}
        </button>
      </div>
    );
  }

  if (!loading && !data) {
    return (
      <div
        role="status"
        className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-border bg-surface p-6 text-center font-mono"
      >
        <p className="text-2xs text-muted-foreground">{t.noErrorData}</p>
        <button
          type="button"
          onClick={() => {
            track('agentic_workload_errors_reload_clicked');
            reload();
          }}
          className="border border-border bg-surface-hover px-3 py-1.5 text-3xs font-bold uppercase tracking-eyebrow transition-colors hover:text-foreground"
        >
          {t.reload}
        </button>
      </div>
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
          className="flex flex-col gap-3 border border-amber-500/30 bg-amber-500/5 p-3 font-mono sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="text-3xs font-bold uppercase tracking-eyebrow text-amber-500">
              {t.reloadFailed}
            </div>
            <p className="mt-0.5 text-3xs text-muted-foreground">
              {t.errorCouldNotReload(loadError.message)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              track('agentic_workload_errors_retry_clicked');
              reload();
            }}
            disabled={loading}
            aria-busy={loading}
            className="shrink-0 border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-3xs font-bold uppercase tracking-eyebrow text-amber-500 transition-colors hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? t.retrying : t.retry}
          </button>
        </div>
      )}

      {/* ── Stats ── */}
      <section>
        <SectionHeader label={t.errorSummary} />
        {initialLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-md" />
            ))}
          </div>
        ) : (
          data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-border bg-surface p-3">
                <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                  {t.totalErrors}
                </div>
                <div className="text-lg font-mono font-bold">
                  {formatNumber(data.summary.totalErrors)}
                </div>
                <div className="text-3xs font-mono text-muted-foreground">
                  {t.ofRequests(formatNumber(data.summary.totalRequests))}
                </div>
              </div>

              <div className="rounded-md border border-border bg-surface p-3">
                <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                  {t.errorRate}
                </div>
                <div className="text-lg font-mono font-bold">
                  {data.summary.errorRate.toFixed(1)}%
                </div>
                <div className="text-3xs font-mono text-muted-foreground">{t.allTime}</div>
              </div>

              <div className="rounded-md border border-border bg-surface p-3">
                <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                  {t.errorsDay}
                </div>
                <div className="text-lg font-mono font-bold">
                  {formatNumber(data.summary.errorsToday)}
                </div>
                <div className="text-3xs font-mono text-muted-foreground">{t.utcDay}</div>
              </div>

              <div className="rounded-md border border-border bg-surface p-3">
                <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
                  {t.mostCommonCode}
                </div>
                <div className="text-lg font-mono font-bold">
                  {mostCommonCode ? mostCommonCode.statusCode : '--'}
                </div>
                <div className="text-3xs font-mono text-muted-foreground">
                  {mostCommonCode ? t.occurrences(formatNumber(mostCommonCode.count)) : t.noErrors}
                </div>
              </div>
            </div>
          )
        )}
      </section>

      {/* ── Error Reach vs Retry Concentration ── */}
      <section>
        <SectionHeader label={t.errorReach} />
        {initialLoading ? (
          <Skeleton className="h-64 rounded-md" />
        ) : (
          data && <ErrorReachPanel data={data.errorReach} locale={locale} />
        )}
      </section>

      {/* ── Hourly Incident Signals ── */}
      <section>
        <SectionHeader label={t.hourlyIncident} />
        {initialLoading ? (
          <Skeleton className="h-[360px] rounded-md" />
        ) : (
          data && (
            <div className="rounded-md border border-border bg-surface p-3">
              <IncidentSignalRail data={data.timeline} />
            </div>
          )
        )}
      </section>

      {/* ── Status Code Breakdown ── */}
      <section>
        <SectionHeader label={t.statusBreakdown} />
        {initialLoading ? (
          <Skeleton className="h-40 rounded-md" />
        ) : (
          data && (
            <div className="rounded-md border border-border bg-surface p-3">
              <StatusCodeBreakdown data={data.statusCodes} />
            </div>
          )
        )}
      </section>

      {/* ── Model Impact Matrix ── */}
      <section>
        <SectionHeader label={t.modelImpact} />
        {initialLoading ? (
          <Skeleton className="h-48 rounded-md" />
        ) : (
          data && (
            <div className="rounded-md border border-border bg-surface p-3">
              <ModelImpactMatrix data={data.byModel} />
            </div>
          )
        )}
      </section>

      {/* ── Recent Errors ── */}
      <section>
        <SectionHeader label={t.recentErrors} />
        {initialLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded-md" />
            ))}
          </div>
        ) : (
          data && (
            <div className="rounded-md border border-border bg-surface overflow-x-auto">
              <table className="w-full text-2xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground">
                      {t.colStatus}
                    </th>
                    <th className="text-left px-3 py-2 text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground">
                      {t.colModel}
                    </th>
                    <th className="text-left px-3 py-2 text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground">
                      {t.colError}
                    </th>
                    <th className="text-right px-3 py-2 text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground">
                      {t.colDuration}
                    </th>
                    <th className="text-left px-3 py-2 text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground">
                      {t.colSession}
                    </th>
                    <th className="text-right px-3 py-2 text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground">
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
                        className="border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors"
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
                            className="text-sky-500 hover:underline"
                          >
                            {err.sessionId.split('-')[0]}...
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                          {formatSnapshotTime(err.timestamp)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}
