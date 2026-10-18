'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ExpandableChart } from '@/components/agentic-workload-explorer/expandable-chart';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import {
  DEFAULT_REUSE_DAYS,
  parseReuseDays,
  selectReuseDays,
  sessionReuseCsv,
  type SessionReusePayload,
  type ReuseSeries,
  type ReuseCohort,
} from '@semianalysisai/inferencex-db/proxytrace/shared/session-reuse';

const COHORT_LABELS = {
  en: {
    all: 'All recorded sessions',
    multiDay: 'Multi-day conversations',
    smallStart: 'Initially small sessions',
    searchAssisted: 'Search-assisted sessions',
  },
  zh: {
    all: '所有已记录 session',
    multiDay: '跨天对话',
    smallStart: '初始规模较小的 session',
    searchAssisted: '搜索辅助 session',
  },
} as const;

const STRINGS = {
  en: {
    heading: 'Session reuse',
    description: 'Observed conversation activity and returns after long gaps.',
    exportCsv: 'Export CSV',
    exportJson: 'Export JSON',
    windowDesc: (start: string, end: string, asOf: string, days: number) =>
      `First observed ${start}–${end} (end exclusive), followed through ${asOf} (UTC, end exclusive). Minimum follow-up: ${days} days.`,
    eligibleDesc: (sessions: string, calls: string, traceVersion: number | null) =>
      `${sessions} eligible sessions · ${calls} calls. Includes short sessions and auxiliary/classifier calls. All models; trace version ${traceVersion ?? 'all'}.`,
    lookbackDesc: (days: number) =>
      `First observation is within a ${days}-day lookback. Credential rotations may split recorded sessions. This is not measured SSD retention or completed-task activity.`,
    versionNote:
      'All visible successful calls establish session ages and gaps; the selected version determines which sessions and calls are counted.',
    coverageDesc: (before: string, insufficient: string) =>
      `${before} sessions predate the cohort; ${insufficient} lack the minimum follow-up.`,
    cutoffsLabel: 'Cutoffs (days)',
    apply: 'Apply',
    coverageCohort: 'Coverage cohort',
    cutoffsError: 'Enter comma-separated whole days from 1 to 28.',
    noEligible:
      'No eligible sessions have enough follow-up in this trace-version scope. Try All versions or return after more history is recorded.',
    chartCoverageTitle: 'Conversation age versus call volume',
    chartCoverageSubtitle: 'Session counts and call counts have different denominators.',
    legendSessionSpan: 'Session span within window',
    legendCallsWithin: 'Calls within window',
    noCohortSessions: 'No eligible sessions in this cohort.',
    chartCohortTitle: 'Call-age coverage by cohort',
    chartCohortSubtitle:
      'Proxy cohorts overlap; they are not one-shot, multi-shot or deep-research task labels.',
    cohortNote:
      'Initially small: ≤5 calls on the first UTC date. Multi-day: activity on ≥2 UTC dates. Search-assisted: at least one Web Search Agent label.',
    chartReturnTitle: 'Returns after inactivity',
    chartReturnSubtitle:
      'Sessions with at least one observed inter-call gap longer than each cutoff.',
    returnNote:
      'Long gaps are included. Zero means no observed return during follow-up. Later history views, cross-session file reuse and storage reads are not measured.',
    activityHeader: (days: number) => `Activity · last ${days} complete UTC days`,
    calls: 'Calls',
    activeCredentials: 'Active credentials',
    callsPerActiveCredentialDay: 'Calls / active credential-day',
    callsPerCredentialCalendarDay: 'Calls / credential / calendar day',
    activityDesc: (start: string, asOf: string, credDays: string, median: string, p90: string) =>
      `${start}–${asOf} (end exclusive): ${credDays} active credential-days. Median ${median} calls per active credential-day; p90 ${p90}. Credentials can rotate or be shared; these are not verified user counts.`,
    dataTableSummary: 'Data table and definitions',
    thCohort: 'Cohort',
    thDays: 'Days',
    thSessions: 'Sessions',
    thCalls: 'Calls',
    thSessionsWithin: 'Sessions within',
    thCallsWithin: 'Calls within',
    thSessionsReturning: 'Sessions returning after gap',
    dataTableNote:
      "Session age is the time from first to last observed successful call. Call age is measured from that session's first observed call. A return gap is measured between consecutive observed calls, without a 30-minute idle cutoff. None of these quantities is a measure of bytes stored.",
    xAxisLabel: 'Days from first observed call',
    svgCoverageTitle: (label: string) => `Session and call-age coverage: ${label}`,
    svgCohortTitle: 'Call-age coverage by session cohort',
    svgReturnTitle: 'Sessions returning after a long gap',
    tooltipCoverage: (days: number, name: string, n: string, d: string, p: string) =>
      `${days} days · ${name}: ${n} / ${d} (${p})`,
    tooltipCohort: (label: string, days: number, n: string, d: string, p: string) =>
      `${label} · ${days} days: ${n} / ${d} calls (${p})`,
    tooltipReturn: (label: string, days: number, n: string, d: string) =>
      `${label} · gap over ${days} days: ${n} / ${d} sessions`,
    barSessions: 'Sessions',
    barCalls: 'Calls',
  },
  zh: {
    heading: 'Session 复用',
    description: '对话活动观测与长间隔后回访情况。',
    exportCsv: '导出 CSV',
    exportJson: '导出 JSON',
    windowDesc: (start: string, end: string, asOf: string, days: number) =>
      `首次观测 ${start}–${end}（不含末日），跟踪至 ${asOf}（UTC，不含末日）。最短跟踪期：${days} 天。`,
    eligibleDesc: (sessions: string, calls: string, traceVersion: number | null) =>
      `${sessions} 个符合条件的 session · ${calls} 次调用。含短 session 及辅助/分类调用。全部模型；trace version ${traceVersion ?? 'all'}。`,
    lookbackDesc: (days: number) =>
      `首次观测范围在 ${days} 天回溯窗口内。凭证轮换可能导致已记录的 session 被拆分。本数据并非 SSD 保留率或已完成任务活跃度的直接度量。`,
    versionNote:
      '所有可见的成功调用用于确定 session 时长和间隔；所选版本决定哪些 session 和调用被计入。',
    coverageDesc: (before: string, insufficient: string) =>
      `${before} 个 session 早于群组起始时间；${insufficient} 个跟踪期不足。`,
    cutoffsLabel: '截止天数',
    apply: '应用',
    coverageCohort: '覆盖群组',
    cutoffsError: '请输入 1 到 28 的逗号分隔整数天数。',
    noEligible:
      '当前 trace version 范围内没有足够跟踪期的 session。请尝试选择"全部版本"，或等待更多历史数据积累后再查看。',
    chartCoverageTitle: '对话时长与调用量',
    chartCoverageSubtitle: 'Session 计数与调用计数的分母不同。',
    legendSessionSpan: 'Session 跨度（窗口内）',
    legendCallsWithin: '调用次数（窗口内）',
    noCohortSessions: '该群组内无符合条件的 session。',
    chartCohortTitle: '按群组的调用时长覆盖',
    chartCohortSubtitle: '代理群组存在重叠，并非一次性、多次或深度研究任务标签。',
    cohortNote:
      '初始规模较小：首个 UTC 日期内 ≤5 次调用。跨天：活动覆盖 ≥2 个 UTC 日期。搜索辅助：至少含一个 Web Search Agent 标签。',
    chartReturnTitle: '长间隔后的回访',
    chartReturnSubtitle: '至少存在一次超出截止天数的调用间隔的 session。',
    returnNote:
      '包含较长间隔。零表示在跟踪期内未观测到回访。不涵盖后续的历史视图、跨 session 文件复用及存储读取。',
    activityHeader: (days: number) => `活跃度 · 最后 ${days} 个完整 UTC 日`,
    calls: '调用次数',
    activeCredentials: '活跃凭证数',
    callsPerActiveCredentialDay: '调用 / 活跃凭证日',
    callsPerCredentialCalendarDay: '调用 / 凭证 / 日历日',
    activityDesc: (start: string, asOf: string, credDays: string, median: string, p90: string) =>
      `${start}–${asOf}（不含末日）：${credDays} 活跃凭证日。每活跃凭证日中位调用 ${median} 次；p90 ${p90} 次。凭证可轮换或共享，此处并非已验证的用户数。`,
    dataTableSummary: '数据表与定义',
    thCohort: '群组',
    thDays: '天数',
    thSessions: 'Sessions',
    thCalls: '调用',
    thSessionsWithin: '窗口内 sessions',
    thCallsWithin: '窗口内调用',
    thSessionsReturning: '间隔后回访的 sessions',
    dataTableNote:
      'Session 时长为首次到末次成功调用的间隔。调用时长以该 session 首次调用为起点。回访间隔为相邻调用之间的时间差，不设 30 分钟空闲截断。这些指标均非字节存储量的度量。',
    xAxisLabel: '距首次调用的天数',
    svgCoverageTitle: (label: string) => `Session 及调用时长覆盖：${label}`,
    svgCohortTitle: '按 session 群组的调用时长覆盖',
    svgReturnTitle: '长间隔后回访的 session',
    tooltipCoverage: (days: number, name: string, n: string, d: string, p: string) =>
      `${days} 天 · ${name}: ${n} / ${d} (${p})`,
    tooltipCohort: (label: string, days: number, n: string, d: string, p: string) =>
      `${label} · ${days} 天: ${n} / ${d} 次调用 (${p})`,
    tooltipReturn: (label: string, days: number, n: string, d: string) =>
      `${label} · 间隔超过 ${days} 天: ${n} / ${d} sessions`,
    barSessions: 'Sessions',
    barCalls: '调用',
  },
} as const;
const COLORS = ['#0ea5e9', '#10b981', '#a855f7', '#f59e0b'];
const BUTTON =
  'rounded border border-border px-2 py-1 text-3xs font-mono text-muted-foreground hover:bg-surface-hover hover:text-foreground';
const W = 900,
  H = 285,
  L = 48,
  R = 16,
  T = 16,
  B = 45;
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');
const number = (n: number | null) =>
  n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const date = (s: string) => s.slice(0, 10);

function download(text: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ChartFrame({
  title,
  children,
  height = H,
  width = W,
}: {
  title: string;
  children: ReactNode;
  height?: number;
  width?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: width > W ? width : 680 }}
        className="w-full min-w-[680px] font-mono"
      >
        <title>{title}</title>
        {children}
      </svg>
    </div>
  );
}

function Axes({ days, xAxisLabel }: { days: number[]; xAxisLabel: string }) {
  const pw = W - L - R,
    ph = H - T - B;
  return (
    <>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line
            x1={L}
            x2={W - R}
            y1={T + ph * (1 - v / 100)}
            y2={T + ph * (1 - v / 100)}
            className="stroke-border"
          />
          <text
            x={L - 8}
            y={T + ph * (1 - v / 100) + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={9}
          >
            {v}%
          </text>
        </g>
      ))}
      {days.map((d, i) => (
        <text
          key={d}
          x={L + (pw * (i + 0.5)) / days.length}
          y={H - B + 18}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={10}
        >
          {d}
        </text>
      ))}
      <text x={W / 2} y={H - 5} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
        {xAxisLabel}
      </text>
    </>
  );
}

type Strings = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];

function CoverageChart({
  series,
  t,
  labels,
}: {
  series: ReuseSeries;
  t: Strings;
  labels: Record<ReuseCohort, string>;
}) {
  const pw = W - L - R,
    ph = H - T - B,
    step = pw / series.points.length;
  return (
    <ChartFrame title={t.svgCoverageTitle(labels[series.key])}>
      <Axes days={series.points.map((p) => p.days)} xAxisLabel={t.xAxisLabel} />
      {series.points.flatMap((p, i) =>
        [
          { name: t.barSessions, n: p.sessionsWithin, d: series.sessions, color: COLORS[1] },
          { name: t.barCalls, n: p.callsWithin, d: series.calls, color: COLORS[0] },
        ].map((s, j) => {
          const h = s.d ? (ph * s.n) / s.d : 0;
          return (
            <rect
              key={`${p.days}-${s.name}`}
              x={L + i * step + step * 0.12 + j * step * 0.38}
              y={T + ph - h}
              width={step * 0.34}
              height={h}
              fill={s.color}
            >
              <title>
                {t.tooltipCoverage(p.days, s.name, number(s.n), number(s.d), pct(s.n, s.d))}
              </title>
            </rect>
          );
        }),
      )}
    </ChartFrame>
  );
}

function CohortChart({
  cohorts,
  t,
  labels,
}: {
  cohorts: ReuseSeries[];
  t: Strings;
  labels: Record<ReuseCohort, string>;
}) {
  const pw = W - L - R,
    ph = H - T - B,
    days = cohorts[0].points.map((p) => p.days),
    step = pw / days.length;
  return (
    <ChartFrame title={t.svgCohortTitle}>
      <Axes days={days} xAxisLabel={t.xAxisLabel} />
      {cohorts.flatMap((c, j) =>
        c.points.map((p, i) => {
          const h = c.calls ? (ph * p.callsWithin) / c.calls : 0;
          return (
            <rect
              key={`${c.key}-${p.days}`}
              x={L + i * step + step * 0.08 + j * step * 0.21}
              y={T + ph - h}
              width={step * 0.18}
              height={h}
              fill={COLORS[j]}
            >
              <title>
                {t.tooltipCohort(
                  labels[c.key],
                  p.days,
                  number(p.callsWithin),
                  number(c.calls),
                  pct(p.callsWithin, c.calls),
                )}
              </title>
            </rect>
          );
        }),
      )}
    </ChartFrame>
  );
}

function ReturnChart({
  cohorts,
  t,
  labels,
}: {
  cohorts: ReuseSeries[];
  t: Strings;
  labels: Record<ReuseCohort, string>;
}) {
  const width = Math.max(W, 230 + cohorts[0].points.length * 58);
  const left = 220,
    top = 35,
    cellH = 48,
    pw = width - left - 10,
    days = cohorts[0].points.map((p) => p.days),
    step = pw / days.length;
  const max = Math.max(
    0.01,
    ...cohorts.flatMap((c) =>
      c.points.map((p) => (c.sessions ? p.sessionsReturningAfterGap / c.sessions : 0)),
    ),
  );
  return (
    <ChartFrame title={t.svgReturnTitle} height={top + cellH * cohorts.length + 12} width={width}>
      {days.map((d, i) => (
        <text
          key={d}
          x={left + step * (i + 0.5)}
          y={20}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={10}
        >
          {d}d
        </text>
      ))}
      {cohorts.map((c, j) => (
        <g key={c.key}>
          <text
            x={left - 12}
            y={top + cellH * j + 18}
            textAnchor="end"
            className="fill-foreground"
            fontSize={10}
          >
            {labels[c.key]}
          </text>
          <text
            x={left - 12}
            y={top + cellH * j + 33}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={9}
          >
            N={number(c.sessions)}
          </text>
          {c.points.map((p, i) => {
            const ratio = c.sessions ? p.sessionsReturningAfterGap / c.sessions : 0;
            return (
              <g key={p.days}>
                <rect
                  x={left + i * step + 1}
                  y={top + j * cellH + 1}
                  width={step - 2}
                  height={cellH - 2}
                  fill={COLORS[2]}
                  fillOpacity={0.08 + (0.5 * ratio) / max}
                />
                <text
                  x={left + (i + 0.5) * step}
                  y={top + j * cellH + 28}
                  textAnchor="middle"
                  className="fill-foreground"
                  fontSize={11}
                >
                  {pct(p.sessionsReturningAfterGap, c.sessions)}
                </text>
                <title>
                  {t.tooltipReturn(
                    labels[c.key],
                    p.days,
                    number(p.sessionsReturningAfterGap),
                    number(c.sessions),
                  )}
                </title>
              </g>
            );
          })}
        </g>
      ))}
    </ChartFrame>
  );
}

export function SessionReuseView({ data }: { data: SessionReusePayload & { cachedAt?: string } }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const labels = COHORT_LABELS[locale];
  const [draft, setDraft] = useState<string>(DEFAULT_REUSE_DAYS.join(','));
  const [days, setDays] = useState<number[]>([...DEFAULT_REUSE_DAYS]);
  const [error, setError] = useState('');
  const [cohort, setCohort] = useState<ReuseCohort>('all');
  const selected = useMemo(() => selectReuseDays(data, days), [data, days]);
  const series = selected.cohorts.find((c) => c.key === cohort)!;
  const all = data.cohorts.find((c) => c.key === 'all')!;
  function apply(event: FormEvent) {
    event.preventDefault();
    const parsed = parseReuseDays(draft);
    if (!parsed) {
      setError(t.cutoffsError);
      return;
    }
    track('agentic_workload_session_reuse_apply_cutoffs', { days: parsed.join(',') });
    setDays(parsed);
    setError('');
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-sm font-mono font-bold">{t.heading}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            className={BUTTON}
            onClick={() => {
              track('agentic_workload_session_reuse_export', { format: 'csv' });
              download(sessionReuseCsv(selected), 'text/csv;charset=utf-8', 'session-reuse.csv');
            }}
          >
            {t.exportCsv}
          </button>
          <button
            className={BUTTON}
            onClick={() => {
              track('agentic_workload_session_reuse_export', { format: 'json' });
              download(JSON.stringify(selected, null, 2), 'application/json', 'session-reuse.json');
            }}
          >
            {t.exportJson}
          </button>
        </div>
      </div>
      <div className="rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground space-y-1">
        <p>
          {t.windowDesc(
            date(data.window.cohortStart),
            date(data.window.cohortEnd),
            date(data.window.asOf),
            data.window.followupDays,
          )}
        </p>
        <p>{t.eligibleDesc(number(all.sessions), number(all.calls), data.traceVersion)}</p>
        <p>
          {t.lookbackDesc(
            Math.round(
              (Date.parse(data.window.asOf) - Date.parse(data.window.observationStart)) /
                86_400_000,
            ),
          )}
        </p>
        {data.traceVersion !== null && <p>{t.versionNote}</p>}
        <p>
          {t.coverageDesc(
            number(data.coverage.beforeCohortSessions),
            number(data.coverage.insufficientFollowupSessions),
          )}
        </p>
      </div>
      <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
        <label htmlFor="reuse-days" className="text-3xs font-mono text-muted-foreground">
          {t.cutoffsLabel}
        </label>
        <input
          id="reuse-days"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-describedby={error ? 'reuse-error' : undefined}
          className="w-64 rounded border border-border bg-background px-2 py-1 text-xs font-mono"
        />
        <button className={BUTTON} type="submit">
          {t.apply}
        </button>
        <label htmlFor="reuse-cohort" className="ml-2 text-3xs font-mono text-muted-foreground">
          {t.coverageCohort}
        </label>
        <select
          id="reuse-cohort"
          value={cohort}
          onChange={(e) => {
            const next = e.target.value as ReuseCohort;
            track('agentic_workload_session_reuse_cohort_changed', { cohort: next });
            setCohort(next);
          }}
          className="rounded border border-border bg-background px-2 py-1 text-xs font-mono"
        >
          {data.cohorts.map((c) => (
            <option key={c.key} value={c.key}>
              {labels[c.key]}
            </option>
          ))}
        </select>
        {error && (
          <p id="reuse-error" role="alert" className="text-xs text-rose-500">
            {error}
          </p>
        )}
      </form>
      {all.sessions === 0 ? (
        <div className="rounded-md border border-border p-6 text-xs text-muted-foreground">
          {t.noEligible}
        </div>
      ) : (
        <>
          <ExpandableChart title={t.chartCoverageTitle} subtitle={t.chartCoverageSubtitle}>
            <div className="flex gap-4 mb-2 text-3xs font-mono">
              <span style={{ color: COLORS[1] }}>{t.legendSessionSpan}</span>
              <span style={{ color: COLORS[0] }}>{t.legendCallsWithin}</span>
            </div>
            {series.sessions ? (
              <CoverageChart series={series} t={t} labels={labels} />
            ) : (
              <p className="py-8 text-xs text-muted-foreground">{t.noCohortSessions}</p>
            )}
          </ExpandableChart>
          <ExpandableChart title={t.chartCohortTitle} subtitle={t.chartCohortSubtitle}>
            <div className="flex flex-wrap gap-3 mb-2 text-3xs font-mono">
              {selected.cohorts.map((c, i) => (
                <span key={c.key} style={{ color: COLORS[i] }}>
                  {labels[c.key]} · N={number(c.sessions)}
                </span>
              ))}
            </div>
            <CohortChart cohorts={selected.cohorts} t={t} labels={labels} />
            <p className="text-3xs text-muted-foreground mt-2">{t.cohortNote}</p>
          </ExpandableChart>
          <ExpandableChart title={t.chartReturnTitle} subtitle={t.chartReturnSubtitle}>
            <ReturnChart cohorts={selected.cohorts} t={t} labels={labels} />
            <p className="text-3xs text-muted-foreground mt-2">{t.returnNote}</p>
          </ExpandableChart>
        </>
      )}
      <div className="flex items-center gap-2">
        <h2 className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {t.activityHeader(data.window.activityDays)}
        </h2>
        <div className="h-px bg-border flex-1" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(
          [
            [t.calls, data.activity.calls],
            [t.activeCredentials, data.activity.activeCredentials],
            [t.callsPerActiveCredentialDay, data.activity.callsPerActiveCredentialDay],
            [t.callsPerCredentialCalendarDay, data.activity.callsPerCredentialCalendarDay],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-surface p-3">
            <div className="text-3xs font-mono text-muted-foreground">{label}</div>
            <div className="text-lg font-mono font-bold mt-1">{number(value as number | null)}</div>
          </div>
        ))}
      </div>
      <p className="text-3xs text-muted-foreground">
        {t.activityDesc(
          date(data.window.activityStart),
          date(data.window.asOf),
          number(data.activity.activeCredentialDays),
          number(data.activity.medianActiveDayCalls),
          number(data.activity.p90ActiveDayCalls),
        )}
      </p>
      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-xs font-mono">{t.dataTableSummary}</summary>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-3xs font-mono text-left">
            <thead>
              <tr>
                {[
                  t.thCohort,
                  t.thDays,
                  t.thSessions,
                  t.thCalls,
                  t.thSessionsWithin,
                  t.thCallsWithin,
                  t.thSessionsReturning,
                ].map((h) => (
                  <th key={h} className="p-2 border-b border-border">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selected.cohorts.flatMap((c) =>
                c.points.map((p) => (
                  <tr key={`${c.key}-${p.days}`}>
                    {[
                      labels[c.key],
                      p.days,
                      c.sessions,
                      c.calls,
                      p.sessionsWithin,
                      p.callsWithin,
                      p.sessionsReturningAfterGap,
                    ].map((v, i) => (
                      <td key={i} className="p-2 border-b border-border">
                        {typeof v === 'number' ? number(v) : v}
                      </td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-3xs text-muted-foreground">{t.dataTableNote}</p>
      </details>
    </div>
  );
}
