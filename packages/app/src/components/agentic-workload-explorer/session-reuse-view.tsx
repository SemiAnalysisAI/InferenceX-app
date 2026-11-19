'use client';

import { useMemo, useState, type FormEvent, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
import { Heading } from '@/components/ui/heading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import {
  ChartActions,
  ExpandableChart,
} from '@/components/agentic-workload-explorer/expandable-chart';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/agentic-workload-explorer/ui/table';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CURSOR_LINE_PROPS } from '@/lib/d3-chart/cursor';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
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
    description: 'Observed conversation activity and returns after long gaps',
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
    cutoffsError: 'Enter comma-separated whole days from 1 to 28',
    noEligible:
      'No eligible sessions have enough follow-up in this trace-version scope. Try All versions or return after more history is recorded.',
    chartCoverageTitle: 'Conversation age versus call volume',
    chartCoverageSubtitle: 'Session counts and call counts have different denominators',
    legendSessionSpan: 'Session span within window',
    legendCallsWithin: 'Calls within window',
    noCohortSessions: 'No eligible sessions in this cohort',
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
    svgCoverageTitle: (label: string) => `Session and call-age coverage, ${label}`,
    svgCohortTitle: 'Call-age coverage by session cohort',
    svgReturnTitle: 'Sessions returning after a long gap',
    dayGroup: (days: number) => `${days} days from first call`,
    returnGapTitle: (label: string, days: number) => `${label}, gap over ${days} days`,
    ofSessions: (n: string, d: string) => `${n} / ${d} sessions`,
    ofCalls: (n: string, d: string) => `${n} / ${d} calls`,
    barSessions: 'Sessions',
    barCalls: 'Calls',
  },
  zh: {
    heading: 'Session 复用',
    description: '对话活动观测与长间隔后回访情况',
    exportCsv: '导出 CSV',
    exportJson: '导出 JSON',
    windowDesc: (start: string, end: string, asOf: string, days: number) =>
      `首次观测 ${start}–${end}（不含结束日），跟踪至 ${asOf}（UTC，不含结束日）。最短跟踪期：${days} 天。`,
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
    cutoffsError: '请输入 1 到 28 的逗号分隔整数天数',
    noEligible:
      '当前 trace version 范围内没有足够跟踪期的 session。请尝试选择“全部版本”，或等待更多历史数据积累后再查看。',
    chartCoverageTitle: '对话时长与调用量',
    chartCoverageSubtitle: 'Session 计数与调用计数的分母不同',
    legendSessionSpan: 'Session 跨度（窗口内）',
    legendCallsWithin: '调用次数（窗口内）',
    noCohortSessions: '该群组内无符合条件的 session',
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
      `${start}–${asOf}（不含结束日）：${credDays} 活跃凭证日。每活跃凭证日中位调用 ${median} 次；p90 ${p90} 次。凭证可轮换或共享，此处并非已验证的用户数。`,
    dataTableSummary: '数据表与定义',
    thCohort: '群组',
    thDays: '天数',
    thSessions: 'Session 数',
    thCalls: '调用',
    thSessionsWithin: '窗口内 session 数',
    thCallsWithin: '窗口内调用',
    thSessionsReturning: '间隔后回访的 session 数',
    dataTableNote:
      'Session 时长为首次到末次成功调用的间隔。调用时长以该 session 首次调用为起点。回访间隔为相邻调用之间的时间差，不设 30 分钟空闲截断。这些指标均非字节存储量的度量。',
    xAxisLabel: '距首次调用的天数',
    svgCoverageTitle: (label: string) => `Session 及调用时长覆盖，${label}`,
    svgCohortTitle: '按 session 群组的调用时长覆盖',
    svgReturnTitle: '长间隔后回访的 session',
    dayGroup: (days: number) => `距首次调用 ${days} 天`,
    returnGapTitle: (label: string, days: number) => `${label}，间隔超过 ${days} 天`,
    ofSessions: (n: string, d: string) => `${n} / ${d} 个 session`,
    ofCalls: (n: string, d: string) => `${n} / ${d} 次调用`,
    barSessions: 'Session',
    barCalls: '调用',
  },
} as const;

const COLORS = [CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[4], CHART_COLORS[1]];
const MIN_CHART_WIDTH = 320;
const BAR_H = 280;
const BAR_MARGIN = { left: 44, right: 12, top: 12, bottom: 44 };
const RETURN_LEFT = 220;
const RETURN_TOP = 30;
const RETURN_CELL_H = 48;
const RETURN_MIN_CELL_W = 48;
const PERCENT_TICKS = [0, 25, 50, 75, 100];

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

type Strings = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];

interface HoverPoint {
  index: number;
  x: number;
  y: number;
}

interface BarSeries {
  key: string;
  label: string;
  color: string;
  denominator: number;
  values: number[];
  of: (n: string, d: string) => string;
}

function Legend({ items }: { items: { key: string; label: string; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function GroupedBarChart({
  ariaLabel,
  days,
  series,
  t,
}: {
  ariaLabel: string;
  days: number[];
  series: BarSeries[];
  t: Strings;
}) {
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: BAR_H });
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const width = Math.max(dimensions.width, MIN_CHART_WIDTH);
  const plotW = width - BAR_MARGIN.left - BAR_MARGIN.right;
  const plotH = BAR_H - BAR_MARGIN.top - BAR_MARGIN.bottom;
  const step = plotW / days.length;
  const barW = (step * 0.76) / series.length;
  const yFor = (share: number) => BAR_MARGIN.top + plotH * (1 - share);
  const groupX = (i: number) => BAR_MARGIN.left + i * step;
  const updateHover = (index: number) => (e: PointerEvent<SVGRectElement>) =>
    setHover({ index, x: e.clientX, y: e.clientY });

  return (
    <div ref={setContainerRef} className="w-full min-w-0">
      <svg
        role="img"
        aria-label={ariaLabel}
        width={width}
        height={BAR_H}
        className="block"
        onPointerLeave={() => setHover(null)}
      >
        {PERCENT_TICKS.map((v) => (
          <g key={v}>
            <line
              x1={BAR_MARGIN.left}
              x2={width - BAR_MARGIN.right}
              y1={yFor(v / 100)}
              y2={yFor(v / 100)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={BAR_MARGIN.left - 8}
              y={yFor(v / 100)}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={CHART_TYPE.annotation}
              className="fill-muted-foreground tabular-nums"
            >
              {v}%
            </text>
          </g>
        ))}
        {hover && (
          <line
            x1={groupX(hover.index) + step / 2}
            x2={groupX(hover.index) + step / 2}
            y1={BAR_MARGIN.top}
            y2={BAR_MARGIN.top + plotH}
            {...CURSOR_LINE_PROPS}
            className="pointer-events-none"
          />
        )}
        {days.map((d, i) => (
          <g key={d}>
            {series.map((s, j) => {
              const share = s.denominator ? s.values[i] / s.denominator : 0;
              return (
                <rect
                  key={s.key}
                  x={groupX(i) + step * 0.12 + j * barW}
                  y={yFor(share)}
                  width={Math.max(1, barW - 2)}
                  height={plotH * share}
                  fill={s.color}
                  opacity={hover === null || hover.index === i ? 0.9 : 0.45}
                  className="pointer-events-none"
                />
              );
            })}
            <text
              x={groupX(i) + step / 2}
              y={BAR_MARGIN.top + plotH + 18}
              textAnchor="middle"
              fontSize={CHART_TYPE.annotation}
              className="fill-muted-foreground tabular-nums"
            >
              {d}
            </text>
            <rect
              x={groupX(i)}
              y={BAR_MARGIN.top}
              width={step}
              height={plotH}
              fill="transparent"
              onPointerMove={updateHover(i)}
              onPointerDown={updateHover(i)}
            />
          </g>
        ))}
        <text
          x={BAR_MARGIN.left + plotW / 2}
          y={BAR_H - 6}
          textAnchor="middle"
          fontSize={CHART_TYPE.axisLabel}
          className="fill-muted-foreground"
        >
          {t.xAxisLabel}
        </text>
      </svg>
      {hover && (
        <FloatingTooltip x={hover.x} y={hover.y}>
          <ChartHoverCardBody
            title={t.dayGroup(days[hover.index])}
            metrics={series.map((s) => ({
              value: pct(s.values[hover.index], s.denominator),
              label: `${s.label} · ${s.of(number(s.values[hover.index]), number(s.denominator))}`,
              color: s.color,
            }))}
          />
        </FloatingTooltip>
      )}
    </div>
  );
}

function CoverageChart({
  series,
  t,
  labels,
}: {
  series: ReuseSeries;
  t: Strings;
  labels: Record<ReuseCohort, string>;
}) {
  return (
    <GroupedBarChart
      ariaLabel={t.svgCoverageTitle(labels[series.key])}
      days={series.points.map((p) => p.days)}
      t={t}
      series={[
        {
          key: 'sessions',
          label: t.barSessions,
          color: COLORS[1],
          denominator: series.sessions,
          values: series.points.map((p) => p.sessionsWithin),
          of: t.ofSessions,
        },
        {
          key: 'calls',
          label: t.barCalls,
          color: COLORS[0],
          denominator: series.calls,
          values: series.points.map((p) => p.callsWithin),
          of: t.ofCalls,
        },
      ]}
    />
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
  return (
    <GroupedBarChart
      ariaLabel={t.svgCohortTitle}
      days={cohorts[0].points.map((p) => p.days)}
      t={t}
      series={cohorts.map((c, j) => ({
        key: c.key,
        label: labels[c.key],
        color: COLORS[j],
        denominator: c.calls,
        values: c.points.map((p) => p.callsWithin),
        of: t.ofCalls,
      }))}
    />
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
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: 0 });
  const [hover, setHover] = useState<(HoverPoint & { row: number }) | null>(null);
  const days = cohorts[0].points.map((p) => p.days);
  const width = Math.max(
    dimensions.width,
    MIN_CHART_WIDTH,
    RETURN_LEFT + days.length * RETURN_MIN_CELL_W + 10,
  );
  const step = (width - RETURN_LEFT - 10) / days.length;
  const height = RETURN_TOP + RETURN_CELL_H * cohorts.length + 12;
  const max = Math.max(
    0.01,
    ...cohorts.flatMap((c) =>
      c.points.map((p) => (c.sessions ? p.sessionsReturningAfterGap / c.sessions : 0)),
    ),
  );
  const hovered = hover ? cohorts[hover.row] : undefined;
  const hoveredPoint = hover && hovered ? hovered.points[hover.index] : undefined;

  return (
    <div ref={setContainerRef} className="w-full min-w-0 overflow-x-auto">
      <svg
        role="img"
        aria-label={t.svgReturnTitle}
        width={width}
        height={height}
        className="block"
        onPointerLeave={() => setHover(null)}
      >
        {days.map((d, i) => (
          <text
            key={d}
            x={RETURN_LEFT + step * (i + 0.5)}
            y={18}
            textAnchor="middle"
            fontSize={CHART_TYPE.annotation}
            className="fill-muted-foreground tabular-nums"
          >
            {d}d
          </text>
        ))}
        {cohorts.map((c, j) => (
          <g key={c.key}>
            <text
              x={RETURN_LEFT - 12}
              y={RETURN_TOP + RETURN_CELL_H * j + 20}
              textAnchor="end"
              fontSize={CHART_TYPE.annotation}
              className="fill-foreground"
            >
              {labels[c.key]}
            </text>
            <text
              x={RETURN_LEFT - 12}
              y={RETURN_TOP + RETURN_CELL_H * j + 35}
              textAnchor="end"
              fontSize={CHART_TYPE.axisLabelSub}
              className="fill-muted-foreground tabular-nums"
            >
              N={number(c.sessions)}
            </text>
            {c.points.map((p, i) => {
              const ratio = c.sessions ? p.sessionsReturningAfterGap / c.sessions : 0;
              const update = (e: PointerEvent<SVGRectElement>) =>
                setHover({ row: j, index: i, x: e.clientX, y: e.clientY });
              return (
                <g key={p.days}>
                  <rect
                    x={RETURN_LEFT + i * step + 1}
                    y={RETURN_TOP + j * RETURN_CELL_H + 1}
                    width={step - 2}
                    height={RETURN_CELL_H - 2}
                    rx={2}
                    fill={COLORS[2]}
                    fillOpacity={0.08 + (0.5 * ratio) / max}
                    onPointerMove={update}
                    onPointerDown={update}
                  />
                  <text
                    x={RETURN_LEFT + (i + 0.5) * step}
                    y={RETURN_TOP + j * RETURN_CELL_H + RETURN_CELL_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={CHART_TYPE.annotation}
                    className="pointer-events-none fill-foreground tabular-nums"
                  >
                    {pct(p.sessionsReturningAfterGap, c.sessions)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
        {hover && (
          <rect
            x={RETURN_LEFT + hover.index * step + 0.75}
            y={RETURN_TOP + hover.row * RETURN_CELL_H + 0.75}
            width={step - 1.5}
            height={RETURN_CELL_H - 1.5}
            rx={2}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={1.5}
            className="pointer-events-none"
          />
        )}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium">{t.svgReturnTitle}</span>
        <span className="tabular-nums">0%</span>
        <span
          aria-hidden="true"
          className="h-2.5 w-32 rounded-sm"
          style={{
            background: `linear-gradient(to right, color-mix(in srgb, ${COLORS[2]} 8%, transparent), color-mix(in srgb, ${COLORS[2]} 58%, transparent))`,
          }}
        />
        <span className="tabular-nums">{(100 * max).toFixed(1)}%</span>
      </div>
      {hover && hovered && hoveredPoint && (
        <FloatingTooltip x={hover.x} y={hover.y}>
          <ChartHoverCardBody
            title={t.returnGapTitle(labels[hovered.key], hoveredPoint.days)}
            metrics={[
              {
                value: pct(hoveredPoint.sessionsReturningAfterGap, hovered.sessions),
                label: t.ofSessions(
                  number(hoveredPoint.sessionsReturningAfterGap),
                  number(hovered.sessions),
                ),
                color: COLORS[2],
              },
            ]}
          />
        </FloatingTooltip>
      )}
    </div>
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
  const methodology = [
    t.windowDesc(
      date(data.window.cohortStart),
      date(data.window.cohortEnd),
      date(data.window.asOf),
      data.window.followupDays,
    ),
    t.eligibleDesc(number(all.sessions), number(all.calls), data.traceVersion),
    t.lookbackDesc(
      Math.round(
        (Date.parse(data.window.asOf) - Date.parse(data.window.observationStart)) / 86_400_000,
      ),
    ),
    ...(data.traceVersion === null ? [] : [t.versionNote]),
    t.coverageDesc(
      number(data.coverage.beforeCohortSessions),
      number(data.coverage.insufficientFollowupSessions),
    ),
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading as="h2" level="card">
            {t.heading}
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              track('agentic_workload_session_reuse_export', { format: 'csv' });
              download(sessionReuseCsv(selected), 'text/csv;charset=utf-8', 'session-reuse.csv');
            }}
          >
            {t.exportCsv}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              track('agentic_workload_session_reuse_export', { format: 'json' });
              download(JSON.stringify(selected, null, 2), 'application/json', 'session-reuse.json');
            }}
          >
            {t.exportJson}
          </Button>
        </div>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {methodology.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
        <label htmlFor="reuse-days" className="text-sm text-muted-foreground">
          {t.cutoffsLabel}
        </label>
        <Input
          id="reuse-days"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-describedby={error ? 'reuse-error' : undefined}
          aria-invalid={error ? true : undefined}
          className="w-64 tabular-nums"
        />
        <Button variant="outline" type="submit">
          {t.apply}
        </Button>
        <label htmlFor="reuse-cohort" className="ml-2 text-sm text-muted-foreground">
          {t.coverageCohort}
        </label>
        <Select
          value={cohort}
          onValueChange={(value) => {
            const next = value as ReuseCohort;
            track('agentic_workload_session_reuse_cohort_changed', { cohort: next });
            setCohort(next);
          }}
        >
          <SelectTrigger id="reuse-cohort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.cohorts.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {labels[c.key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p id="reuse-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
      {all.sessions === 0 ? (
        <div className="rounded-md border border-border/30 p-6 text-sm text-muted-foreground">
          {t.noEligible}
        </div>
      ) : (
        <>
          <ExpandableChart
            sharedZoom
            title={t.chartCoverageTitle}
            subtitle={t.chartCoverageSubtitle}
            actions={
              <ChartActions
                fileName="session-reuse-coverage"
                onExportPng={() =>
                  track('agentic_workload_export_png', { chart: 'session-reuse-coverage' })
                }
              />
            }
          >
            {series.sessions ? (
              <>
                <CoverageChart series={series} t={t} labels={labels} />
                <Legend
                  items={[
                    { key: 'sessions', label: t.legendSessionSpan, color: COLORS[1] },
                    { key: 'calls', label: t.legendCallsWithin, color: COLORS[0] },
                  ]}
                />
              </>
            ) : (
              <p className="py-8 text-sm text-muted-foreground">{t.noCohortSessions}</p>
            )}
          </ExpandableChart>
          <ExpandableChart
            sharedZoom
            title={t.chartCohortTitle}
            subtitle={t.chartCohortSubtitle}
            actions={
              <ChartActions
                fileName="session-reuse-cohorts"
                onExportPng={() =>
                  track('agentic_workload_export_png', { chart: 'session-reuse-cohorts' })
                }
              />
            }
          >
            <CohortChart cohorts={selected.cohorts} t={t} labels={labels} />
            <Legend
              items={selected.cohorts.map((c, i) => ({
                key: c.key,
                label: `${labels[c.key]} · N=${number(c.sessions)}`,
                color: COLORS[i],
              }))}
            />
            <p className="mt-2 text-xs text-muted-foreground">{t.cohortNote}</p>
          </ExpandableChart>
          <ExpandableChart
            sharedZoom
            title={t.chartReturnTitle}
            subtitle={t.chartReturnSubtitle}
            actions={
              <ChartActions
                fileName="session-reuse-return"
                onExportPng={() =>
                  track('agentic_workload_export_png', { chart: 'session-reuse-return' })
                }
              />
            }
          >
            <ReturnChart cohorts={selected.cohorts} t={t} labels={labels} />
            <p className="mt-2 text-xs text-muted-foreground">{t.returnNote}</p>
          </ExpandableChart>
        </>
      )}
      <div>
        <SectionHeader label={t.activityHeader(data.window.activityDays)} />
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {(
            [
              [t.calls, data.activity.calls],
              [t.activeCredentials, data.activity.activeCredentials],
              [t.callsPerActiveCredentialDay, data.activity.callsPerActiveCredentialDay],
              [t.callsPerCredentialCalendarDay, data.activity.callsPerCredentialCalendarDay],
            ] as const
          ).map(([label, value]) => (
            <Stat key={label} boxed label={label} value={number(value as number | null)} />
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          {t.activityDesc(
            date(data.window.activityStart),
            date(data.window.asOf),
            number(data.activity.activeCredentialDays),
            number(data.activity.medianActiveDayCalls),
            number(data.activity.p90ActiveDayCalls),
          )}
        </p>
      </div>
      <details className="rounded-xl border border-border/30 bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">{t.dataTableSummary}</summary>
        <div className="mt-3">
          <Table className="text-xs tabular-nums">
            <TableHeader>
              <TableRow>
                {[
                  t.thCohort,
                  t.thDays,
                  t.thSessions,
                  t.thCalls,
                  t.thSessionsWithin,
                  t.thCallsWithin,
                  t.thSessionsReturning,
                ].map((h, i) => (
                  <TableHead key={h} className={i === 0 ? undefined : 'text-right'}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {selected.cohorts.flatMap((c) =>
                c.points.map((p) => (
                  <TableRow key={`${c.key}-${p.days}`}>
                    <TableCell>{labels[c.key]}</TableCell>
                    {[
                      p.days,
                      c.sessions,
                      c.calls,
                      p.sessionsWithin,
                      p.callsWithin,
                      p.sessionsReturningAfterGap,
                    ].map((v, i) => (
                      <TableCell key={i} className="text-right">
                        {number(v)}
                      </TableCell>
                    ))}
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t.dataTableNote}</p>
      </details>
    </div>
  );
}
