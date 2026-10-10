import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import type { ErrorReach, ErrorReachCohort } from '@/lib/agentic-workload-explorer/api-types';
import type { Locale } from '@/lib/i18n';

// Cohorts are the proxy route (`metadata.client`), precomputed in the frozen
// errors cache, so they are API providers rather than harnesses.
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  codex: 'Codex',
  openai: 'OpenAI',
};

const STRINGS = {
  en: {
    noRequests: (days: number) => `No requests in the latest ${days} days.`,
    reachTitle: 'Reach separates broad incidents from repeated failures in a few sessions',
    reachDescription: (days: number) =>
      `Rolling ${days} days. Affected sessions have at least one failed HTTP request; repeat-error sessions have two or more. Errors include HTTP 4xx/5xx and recorded proxy failures.`,
    requestErrorRate: 'Request Error Rate',
    sessionsAffected: 'Sessions Affected',
    repeatSessionShare: 'Repeat-Session Share',
    topTenConcentration: 'Top 10 Concentration',
    requestsDetail: (errors: string, total: string) => `${errors} / ${total} requests`,
    sessionsDetail: (affected: string, total: string) => `${affected} / ${total} sessions`,
    repeatDetail: (count: string) => `${count} sessions with 2+ errors`,
    topDetail: (topShare: string, max: string) => `${topShare} from hottest · ${max} errors`,
    caption: 'Request error reach and retry concentration grouped by API provider.',
    colProvider: 'Provider',
    colRequests: 'Requests',
    colErrors: 'Errors',
    colReqRate: 'Req. Rate',
    colSessionsHit: 'Sessions Hit',
    colReach: 'Reach',
    colErrorsPerHit: 'Errors / Hit',
    colRepeatShare: 'Repeat Share',
    colTopTenShare: 'Top 10 Share',
    errorsPerHitTitle: 'Average / p90 request errors per affected session',
    repeatShareTitle: 'Share of errors from sessions with two or more errors',
  },
  zh: {
    noRequests: (days: number) => `最后 ${days} 天内没有请求。`,
    reachTitle: '区分大范围故障与少数 session 的重复失败',
    reachDescription: (days: number) =>
      `滚动 ${days} 天统计。受影响 session 至少有一次 HTTP 请求失败；重复出错 session 有两次及以上。错误包含 HTTP 4xx/5xx 及记录的代理失败。`,
    requestErrorRate: '请求错误率',
    sessionsAffected: '受影响 Session',
    repeatSessionShare: '重复出错占比',
    topTenConcentration: 'Top 10 集中度',
    requestsDetail: (errors: string, total: string) => `${errors} / ${total} 个请求`,
    sessionsDetail: (affected: string, total: string) => `${affected} / ${total} 个 session`,
    repeatDetail: (count: string) => `${count} 个 session 出错 2 次以上`,
    topDetail: (topShare: string, max: string) => `最高 ${topShare} · ${max} 个错误`,
    caption: '按 API 提供商分组的请求错误覆盖面与重试集中度。',
    colProvider: '提供商',
    colRequests: '请求数',
    colErrors: '错误数',
    colReqRate: '请求错误率',
    colSessionsHit: '受影响 Session',
    colReach: '覆盖率',
    colErrorsPerHit: '错误 / 受影响',
    colRepeatShare: '重复占比',
    colTopTenShare: 'Top 10 占比',
    errorsPerHitTitle: '受影响 session 的平均/p90 请求错误数',
    repeatShareTitle: '出错 2 次以上 session 的错误占比',
  },
};

function formatPct(value: number | null, digits = 1): string {
  return value === null ? '—' : `${(value * 100).toFixed(digits)}%`;
}

function ReachMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-mono font-bold">{value}</div>
      <div className="mt-0.5 text-3xs font-mono text-muted-foreground">{detail}</div>
    </div>
  );
}

function ProviderRow({ row }: { row: ErrorReachCohort }) {
  return (
    <tr className="transition-colors hover:bg-surface-hover/70">
      <th scope="row" className="py-1.5 text-left font-medium">
        {PROVIDER_LABELS[row.client] ?? row.client}
      </th>
      <td className="py-1.5 text-right tabular-nums">{formatNumber(row.requestCount)}</td>
      <td className="py-1.5 text-right tabular-nums text-rose-500">
        {formatNumber(row.errorCount)}
      </td>
      <td className="py-1.5 text-right tabular-nums">{formatPct(row.requestErrorRate, 2)}</td>
      <td className="py-1.5 text-right tabular-nums">
        {formatNumber(row.affectedSessionCount)} / {formatNumber(row.sessionCount)}
      </td>
      <td className="py-1.5 text-right tabular-nums">{formatPct(row.affectedSessionRate)}</td>
      <td className="py-1.5 text-right tabular-nums">
        {row.avgErrorsPerAffectedSession === null
          ? '—'
          : row.avgErrorsPerAffectedSession.toFixed(1)}
        <span className="text-subtle">
          {' '}
          /{' '}
          {row.p90ErrorsPerAffectedSession === null
            ? '—'
            : row.p90ErrorsPerAffectedSession.toFixed(1)}
        </span>
      </td>
      <td className="py-1.5 text-right tabular-nums">{formatPct(row.repeatErrorShare)}</td>
      <td className="py-1.5 text-right tabular-nums">{formatPct(row.topTenErrorShare)}</td>
    </tr>
  );
}

export function ErrorReachPanel({ data, locale = 'en' }: { data: ErrorReach; locale?: Locale }) {
  const t = STRINGS[locale];
  const overall = data.overall;
  if (!overall) {
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-center text-2xs font-mono text-muted-foreground">
        {t.noRequests(data.windowDays)}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3 space-y-3">
      <div>
        <div className="text-3xs font-mono font-bold text-foreground">{t.reachTitle}</div>
        <p className="mt-0.5 text-3xs font-mono text-subtle">
          {t.reachDescription(data.windowDays)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ReachMetric
          label={t.requestErrorRate}
          value={formatPct(overall.requestErrorRate, 2)}
          detail={t.requestsDetail(
            formatNumber(overall.errorCount),
            formatNumber(overall.requestCount),
          )}
        />
        <ReachMetric
          label={t.sessionsAffected}
          value={formatPct(overall.affectedSessionRate)}
          detail={t.sessionsDetail(
            formatNumber(overall.affectedSessionCount),
            formatNumber(overall.sessionCount),
          )}
        />
        <ReachMetric
          label={t.repeatSessionShare}
          value={formatPct(overall.repeatErrorShare)}
          detail={t.repeatDetail(formatNumber(overall.repeatErrorSessionCount))}
        />
        <ReachMetric
          label={t.topTenConcentration}
          value={formatPct(overall.topTenErrorShare)}
          detail={t.topDetail(
            formatPct(overall.topSessionErrorShare),
            formatNumber(overall.maxErrorsInSession),
          )}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-2xs font-mono">
          <caption className="sr-only">{t.caption}</caption>
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" className="py-1.5 text-left font-medium">
                {t.colProvider}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {t.colRequests}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {t.colErrors}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {t.colReqRate}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {t.colSessionsHit}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {t.colReach}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium" title={t.errorsPerHitTitle}>
                {t.colErrorsPerHit}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium" title={t.repeatShareTitle}>
                {t.colRepeatShare}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {t.colTopTenShare}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.byClient.map((row) => (
              <ProviderRow key={row.client} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
