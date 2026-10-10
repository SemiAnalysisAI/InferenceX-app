'use client';

import { Suspense, useRef, useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { formatNumber, formatTimestamp } from '@/lib/agentic-workload-explorer/format';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import type {
  SessionInsightsData,
  HistogramBin,
  PercentileStats,
} from '@/lib/agentic-workload-explorer/api-types';
import { formatSnapshotDate } from '@/lib/agentic-workload-explorer/snapshot';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';

// -- i18n -------------------------------------------------------------------

const STRINGS = {
  en: {
    stats: 'Stats',
    failedToLoad: 'Failed to load session insights data.',
    avgDuration: 'Avg Duration',
    avgTurnsPerSession: 'Avg Turns / Session',
    avgCostPerSession: 'Avg Cost / Session',
    activeFinal24h: 'Active (Final 24h)',
    sessionDurationDistribution: 'Session Duration Distribution',
    turnsPerSessionDistribution: 'Turns Per Session Distribution',
    sessionCostDistribution: 'Session Cost Distribution',
    sessionsOverTime: 'Sessions Over Time',
    concurrentSessions: 'Concurrent Sessions',
    concurrentDetail: 'final 7 days, hourly',
    noDataAvailable: 'No data available',
    noDailySessionData: 'No daily session data available',
    noConcurrentData: 'No concurrent session data available',
    sessions: (n: number) => `${formatNumber(n)} sessions`,
    tooltipSessions: (n: number) => `${n} sessions`,
    active: 'active',
    dailySessions: 'Daily Sessions',
    exportSessionDuration: 'Session Duration Distribution',
    exportTurnsPerSession: 'Turns Per Session Distribution',
    exportSessionCost: 'Session Cost Distribution',
  },
  zh: {
    stats: '统计',
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
    tooltipSessions: (n: number) => `${n} 个会话`,
    active: '活跃',
    dailySessions: '每日会话',
    exportSessionDuration: '会话时长分布',
    exportTurnsPerSession: '每会话轮次分布',
    exportSessionCost: '会话成本分布',
  },
};

// -- Chart constants --------------------------------------------------------

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

// -- Helpers ----------------------------------------------------------------

function formatDurationLabel(seconds: number): string {
  seconds = Number(seconds);
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatDurationStat(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} hrs`;
}

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
  // Keep going until a tick reaches max, so the tallest bar is never clipped.
  for (let t = niceMin; t - spacing < max - spacing * 1e-9; t += spacing) {
    ticks.push(Math.round(t * 1e10) / 1e10);
  }
  return ticks;
}

// -- Section header ---------------------------------------------------------

function SectionHeader({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 h-px bg-border" />
      {detail && <span className="text-3xs font-mono text-subtle">{detail}</span>}
    </div>
  );
}

// -- Stat card --------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-mono font-bold mt-0.5">{value}</div>
    </div>
  );
}

// -- Histogram chart --------------------------------------------------------

const PERCENTILE_COLORS: Record<string, string> = {
  p25: '#94a3b8',
  p50: '#ef4444',
  p75: '#94a3b8',
  p90: '#f59e0b',
  p95: '#f59e0b',
  p99: '#f43f5e',
};

function HistogramChart({
  bins,
  color,
  formatX,
  percentiles,
  title,
  exportFilename,
  emptyLabel,
}: {
  bins: HistogramBin[];
  color: string;
  formatX: (v: number) => string;
  percentiles?: PercentileStats;
  title?: string;
  exportFilename?: string;
  emptyLabel: string;
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  if (bins.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">{emptyLabel}</div>
    );
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount;

  const barGap = 1;
  const barWidth = Math.max(1, (PLOT_W - barGap * bins.length) / bins.length);

  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  // Show ~5 evenly spaced x-axis labels
  const labelInterval = Math.max(1, Math.floor(bins.length / 5));

  return (
    <Expandable title={title}>
      <div className="rounded-md border border-border bg-surface p-3">
        {title && (
          <div className="flex items-center justify-end mb-2">
            <ExportPngButton
              locale={locale}
              onClick={() => {
                track('agentic_workload_session_histogram_export', {
                  title,
                  filename: exportFilename || 'histogram.png',
                });
                if (svgRef.current)
                  exportSvgToPng(svgRef.current, {
                    title,
                    filename: exportFilename || 'histogram.png',
                    svgWidth: CHART_W,
                    svgHeight: CHART_H,
                  });
              }}
            />
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full"
          style={{ maxHeight: 240 }}
        >
          {/* Y-axis grid lines and labels */}
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              {t > 0 && (
                <line
                  x1={MARGIN.left}
                  y1={sy(t)}
                  x2={MARGIN.left + PLOT_W}
                  y2={sy(t)}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={MARGIN.left - 6}
                y={sy(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
              >
                {formatNumber(t)}
              </text>
            </g>
          ))}

          {/* Baseline */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-border"
            strokeWidth={0.5}
          />

          {/* Bars */}
          {bins.map((b, i) => {
            const x = MARGIN.left + i * (barWidth + barGap);
            const barH = (b.count / yMax) * PLOT_H;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={sy(b.count)}
                  width={barWidth}
                  height={Math.max(barH, 0.5)}
                  fill={color}
                  rx={1}
                >
                  <title>
                    {formatX(b.min)} - {formatX(b.max)}: {b.count}
                  </title>
                </rect>
                {i % labelInterval === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={MARGIN.top + PLOT_H + 14}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
                  >
                    {formatX(b.min)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Percentile vertical lines */}
          {percentiles &&
            (() => {
              const xMin = bins[0].min;
              const xMax = bins.at(-1)!.max;
              const xRange = xMax - xMin;
              if (xRange <= 0) return null;
              const sx = (v: number) => MARGIN.left + ((v - xMin) / xRange) * PLOT_W;
              const entries: { label: string; value: number }[] = [
                { label: 'p25', value: percentiles.p25 },
                { label: 'p50', value: percentiles.p50 },
                { label: 'p75', value: percentiles.p75 },
                { label: 'p90', value: percentiles.p90 },
                { label: 'p95', value: percentiles.p95 },
                { label: 'p99', value: percentiles.p99 },
              ];
              return entries.map(({ label, value }) => {
                const px = sx(value);
                if (px < MARGIN.left || px > MARGIN.left + PLOT_W) return null;
                return (
                  <g key={label}>
                    <line
                      x1={px}
                      y1={MARGIN.top}
                      x2={px}
                      y2={MARGIN.top + PLOT_H}
                      stroke={PERCENTILE_COLORS[label] || '#94a3b8'}
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      opacity={0.7}
                    />
                    <text
                      x={px}
                      y={MARGIN.top - 2}
                      textAnchor="middle"
                      fill={PERCENTILE_COLORS[label] || '#94a3b8'}
                      style={{ fontSize: '7px', fontFamily: SVG_FONT }}
                    >
                      {label}
                    </text>
                  </g>
                );
              });
            })()}
        </svg>

        {/* Percentile stats row */}
        {percentiles && (
          <div className="grid grid-cols-6 gap-1.5 mt-3 pt-3 border-t border-border">
            {(
              [
                { label: 'p25', value: percentiles.p25 },
                { label: 'p50', value: percentiles.p50 },
                { label: 'p75', value: percentiles.p75 },
                { label: 'p90', value: percentiles.p90 },
                { label: 'p95', value: percentiles.p95 },
                { label: 'p99', value: percentiles.p99 },
              ] as const
            ).map((p) => (
              <div
                key={p.label}
                className="rounded-md border border-border bg-surface-hover px-2 py-1.5 text-center"
              >
                <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
                  {p.label}
                </div>
                <div className="text-sm font-mono font-bold tracking-tight mt-0.5">
                  {formatX(p.value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Expandable>
  );
}

// -- Bar chart (daily sessions) ---------------------------------------------

function DailySessionsChart({
  data: slice,
  controls,
  emptyLabel,
  tooltipSessions,
  exportTitle,
}: {
  data: { day: string; sessionCount: number }[];
  controls: ReactNode;
  emptyLabel: string;
  tooltipSessions: (n: number) => string;
  exportTitle: string;
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const labelEvery = Math.ceil(slice.length / 7);
  if (slice.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">{emptyLabel}</div>
    );
  }

  const maxCount = Math.max(...slice.map((d) => d.sessionCount), 1);
  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount;

  const barGap = 2;
  const barWidth = Math.max(1, (PLOT_W - barGap * slice.length) / slice.length);

  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  return (
    <Expandable title={exportTitle}>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          {controls}
          <ExportPngButton
            locale={locale}
            onClick={() => {
              track('agentic_workload_daily_sessions_export');
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: exportTitle,
                  filename: 'daily-sessions.png',
                  svgWidth: CHART_W,
                  svgHeight: CHART_H,
                });
            }}
          />
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full"
          style={{ maxHeight: 240 }}
        >
          {/* Y-axis */}
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              {t > 0 && (
                <line
                  x1={MARGIN.left}
                  y1={sy(t)}
                  x2={MARGIN.left + PLOT_W}
                  y2={sy(t)}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={MARGIN.left - 6}
                y={sy(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
              >
                {formatNumber(t)}
              </text>
            </g>
          ))}

          {/* Baseline */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-border"
            strokeWidth={0.5}
          />

          {/* Bars */}
          {slice.map((d, i) => {
            const x = MARGIN.left + i * (barWidth + barGap);
            const barH = (d.sessionCount / yMax) * PLOT_H;
            return (
              <g key={d.day}>
                <rect
                  x={x}
                  y={sy(d.sessionCount)}
                  width={barWidth}
                  height={Math.max(barH, 0.5)}
                  fill="#8b5cf6"
                  rx={1}
                >
                  <title>
                    {formatSnapshotDate(d.day)}: {tooltipSessions(d.sessionCount)}
                  </title>
                </rect>
                {i % labelEvery === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={MARGIN.top + PLOT_H + 14}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
                  >
                    {formatSnapshotDate(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Expandable>
  );
}

// -- Line chart (concurrent sessions) ---------------------------------------

function ConcurrentSessionsChart({
  data,
  emptyLabel,
  activeLabel,
  exportTitle,
}: {
  data: { hour: string; activeSessions: number }[];
  emptyLabel: string;
  activeLabel: string;
  exportTitle: string;
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  if (data.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">{emptyLabel}</div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.activeSessions), 1);
  const yTicks = generateTicks(0, maxVal, 5);
  const yMax = yTicks.at(-1) || maxVal;

  const sx = (i: number) => MARGIN.left + (i / Math.max(data.length - 1, 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  const points = data.map((d, i) => `${sx(i)},${sy(d.activeSessions)}`).join(' ');

  // Area fill path
  const areaPath = [
    `M ${sx(0)},${MARGIN.top + PLOT_H}`,
    ...data.map((d, i) => `L ${sx(i)},${sy(d.activeSessions)}`),
    `L ${sx(data.length - 1)},${MARGIN.top + PLOT_H}`,
    'Z',
  ].join(' ');

  // Show ~6 evenly spaced x-axis labels
  const labelInterval = Math.max(1, Math.floor(data.length / 6));

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-end mb-2">
        <ExportPngButton
          locale={locale}
          onClick={() => {
            track('agentic_workload_concurrent_sessions_export');
            if (svgRef.current)
              exportSvgToPng(svgRef.current, {
                title: exportTitle,
                filename: 'concurrent-sessions.png',
                svgWidth: CHART_W,
                svgHeight: CHART_H,
              });
          }}
        />
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ maxHeight: 240 }}
      >
        {/* Y-axis */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            {t > 0 && (
              <line
                x1={MARGIN.left}
                y1={sy(t)}
                x2={MARGIN.left + PLOT_W}
                y2={sy(t)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={MARGIN.left - 6}
              y={sy(t) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
            >
              {formatNumber(t)}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_H}
          x2={MARGIN.left + PLOT_W}
          y2={MARGIN.top + PLOT_H}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />

        {/* Area fill */}
        <path d={areaPath} fill="#6366f1" opacity={0.15} />

        {/* Line */}
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth={1.5} />

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % labelInterval !== 0) return null;
          const date = new Date(d.hour);
          const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const timeLabel = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            hour12: true,
            timeZoneName: 'short',
          });
          return (
            <text
              key={d.hour}
              x={sx(i)}
              y={MARGIN.top + PLOT_H + 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
            >
              {label} {timeLabel}
            </text>
          );
        })}

        {/* Data point dots */}
        {data.map((d, i) => (
          <circle key={d.hour} cx={sx(i)} cy={sy(d.activeSessions)} r={1.5} fill="#6366f1">
            <title>
              {formatTimestamp(d.hour)}: {d.activeSessions} {activeLabel}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

// -- Main page --------------------------------------------------------------

export default function SessionInsightsPage() {
  const t = STRINGS[useLocale()];
  return (
    <Expandable title={t.concurrentSessions}>
      <Suspense>
        <SessionInsightsPageContent />
      </Suspense>
    </Expandable>
  );
}

function SessionInsightsPageContent() {
  const t = STRINGS[useLocale()];
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

  const durationCount = data ? data.durationBins.reduce((s, b) => s + b.count, 0) : 0;
  const turnCount = data ? data.turnBins.reduce((s, b) => s + b.count, 0) : 0;
  const costCount = data ? data.costBins.reduce((s, b) => s + b.count, 0) : 0;

  return (
    <div className="space-y-6">
      {/* -- Stats --------------------------------------------------------- */}
      <div>
        <SectionHeader label={t.stats} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border bg-surface p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <div className="text-sm font-mono text-muted-foreground text-center py-8">
            {t.failedToLoad}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label={t.avgDuration} value={formatDurationStat(data.stats.avgDuration)} />
            <StatCard label={t.avgTurnsPerSession} value={data.stats.avgTurns.toFixed(1)} />
            <StatCard label={t.avgCostPerSession} value={`$${data.stats.avgCost.toFixed(2)}`} />
            <StatCard label={t.activeFinal24h} value={formatNumber(data.stats.active24h)} />
          </div>
        )}
      </div>

      {data && (
        <>
          {/* -- Session Duration Distribution --------------------------------- */}
          <div>
            <SectionHeader
              label={t.sessionDurationDistribution}
              detail={t.sessions(durationCount)}
            />
            <HistogramChart
              bins={data.durationBins}
              color="#6366f1"
              formatX={(v) => formatDurationLabel(v)}
              percentiles={data.durationPercentiles}
              title={t.exportSessionDuration}
              exportFilename="session-duration-distribution.png"
              emptyLabel={t.noDataAvailable}
            />
          </div>

          {/* -- Turns Per Session Distribution -------------------------------- */}
          <div>
            <SectionHeader label={t.turnsPerSessionDistribution} detail={t.sessions(turnCount)} />
            <HistogramChart
              bins={data.turnBins}
              color="#06b6d4"
              formatX={(v) => v.toFixed(0)}
              percentiles={data.turnPercentiles}
              title={t.exportTurnsPerSession}
              exportFilename="turns-per-session-distribution.png"
              emptyLabel={t.noDataAvailable}
            />
          </div>

          {/* -- Session Cost Distribution ------------------------------------- */}
          <div>
            <SectionHeader label={t.sessionCostDistribution} detail={t.sessions(costCount)} />
            <HistogramChart
              bins={data.costBins}
              color="#10b981"
              formatX={(v) => (v >= 1 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`)}
              percentiles={data.costPercentiles}
              title={t.exportSessionCost}
              exportFilename="session-cost-distribution.png"
              emptyLabel={t.noDataAvailable}
            />
          </div>

          {/* -- Sessions Over Time -------------------------------------------- */}
          <div>
            <SectionHeader label={t.sessionsOverTime} />
            <DailySessionsChart
              data={data.dailySessions.slice(-DAY_RANGE_DAYS[range])}
              controls={
                <RangeToggle value={range} options={DAY_RANGES} onChange={handleRangeChange} />
              }
              emptyLabel={t.noDailySessionData}
              tooltipSessions={t.tooltipSessions}
              exportTitle={t.dailySessions}
            />
          </div>

          {/* -- Concurrent Sessions ------------------------------------------- */}
          <div>
            <SectionHeader label={t.concurrentSessions} detail={t.concurrentDetail} />
            <ConcurrentSessionsChart
              data={data.hourlyConcurrent}
              emptyLabel={t.noConcurrentData}
              activeLabel={t.active}
              exportTitle={t.concurrentSessions}
            />
          </div>
        </>
      )}
    </div>
  );
}
