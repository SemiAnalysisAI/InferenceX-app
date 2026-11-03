'use client';

import { Suspense, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  formatExplorerDateTime,
  formatNumber,
  formatTimestamp,
} from '@/lib/agentic-workload-explorer/format';
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
import { formatSnapshotDate } from '@/lib/agentic-workload-explorer/snapshot';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import { ChartActions, Expandable } from '@/components/agentic-workload-explorer/expandable-chart';

const STRINGS = {
  en: {
    stats: 'Stats',
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
    concurrentDetail: 'final 7 days, hourly',
    noDataAvailable: 'No data available',
    noDailySessionData: 'No daily session data available',
    noConcurrentData: 'No concurrent session data available',
    sessions: (n: number) => `${formatNumber(n)} sessions`,
    tooltipSessions: (n: number) => `${n} sessions`,
    active: 'active',
    dailySessions: 'Daily sessions',
    exportSessionDuration: 'Session duration distribution',
    exportTurnsPerSession: 'Turns per session distribution',
    exportSessionCost: 'Session cost distribution',
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

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

/** Monospace advance for the 9-unit tick font; only used until the real widths are measured. */
const TICK_CHAR_WIDTH_ESTIMATE = 5.8;
const TICK_MIN_GAP = 6;

interface AxisTickCandidate {
  index: number;
  x: number;
  label: string;
}

/**
 * Picks which candidate ticks to show. The last tick is end-anchored at its x so it stays inside
 * the plot. The others are thinned to every `step`th candidate, using the smallest step at which
 * no two labels touch; a tick that would collide with the anchored last label is dropped.
 * Widths are in viewBox units, the same space the tick text renders in, so the spacing holds at
 * every rendered chart width.
 */
function layoutAxisTicks(candidates: AxisTickCandidate[], widths: number[]): Set<number> {
  const lastIdx = candidates.length - 1;
  if (lastIdx < 0) return new Set();
  const lastLeft = candidates[lastIdx].x - widths[lastIdx];
  const right = (k: number) => candidates[k].x + widths[k] / 2;
  for (let step = 1; step <= lastIdx; step++) {
    const picked: number[] = [];
    for (let k = 0; k < lastIdx; k += step) picked.push(k);
    while (picked.length > 0 && right(picked.at(-1)!) + TICK_MIN_GAP > lastLeft) picked.pop();
    const fits = picked.every(
      (k, j) => j === 0 || right(picked[j - 1]) + TICK_MIN_GAP <= candidates[k].x - widths[k] / 2,
    );
    if (fits) return new Set([...picked, lastIdx]);
  }
  return new Set([lastIdx]);
}

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
  for (let t = niceMin; t - spacing < max - spacing * 1e-9; t += spacing) {
    ticks.push(Math.round(t * 1e10) / 1e10);
  }
  return ticks;
}

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
  if (bins.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {emptyLabel}
      </EmptyState>
    );
  }

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount;

  const barGap = 1;
  const barWidth = Math.max(1, (PLOT_W - barGap * bins.length) / bins.length);

  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  const labelInterval = Math.max(1, Math.floor(bins.length / 5));

  return (
    <Expandable title={title}>
      <Card>
        {title && (
          <div className="flex items-center justify-end mb-2">
            <ChartActions
              fileName={(exportFilename || 'histogram.png').replace(/\.png$/u, '')}
              onExportPng={() =>
                track('agentic_workload_session_histogram_export', {
                  title,
                  file_name: exportFilename || 'histogram.png',
                })
              }
            />
          </div>
        )}
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: 240 }}>
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

          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-border"
            strokeWidth={0.5}
          />

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

        {percentiles && (
          <div className="grid grid-cols-6 gap-1.5 mt-3 pt-3 border-t border-border/20">
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
              <div key={p.label} className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                <div className="text-xs font-medium text-muted-foreground">{p.label}</div>
                <div className="text-sm font-mono font-medium mt-0.5">{formatX(p.value)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Expandable>
  );
}

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
  const labelEvery = Math.ceil(slice.length / 7);
  if (slice.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {emptyLabel}
      </EmptyState>
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
      <Card>
        <div className="flex items-center justify-between gap-2 mb-2">
          {controls}
          <ChartActions
            fileName="daily-sessions"
            onExportPng={() => track('agentic_workload_daily_sessions_export')}
          />
        </div>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: 240 }}>
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

          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-border"
            strokeWidth={0.5}
          />

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
                    {formatSnapshotDate(d.day, locale)}: {tooltipSessions(d.sessionCount)}
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
                    {formatSnapshotDate(d.day, locale)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </Card>
    </Expandable>
  );
}

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
  const tickCandidates = useMemo(() => {
    const interval = Math.max(1, Math.floor(data.length / 6));
    const indices = data.map((_, i) => i).filter((i) => i % interval === 0);
    if (data.length > 0 && indices.at(-1) !== data.length - 1) indices.push(data.length - 1);
    return indices.map((index) => {
      const date = new Date(data[index].hour);
      const day = formatExplorerDateTime(
        date,
        locale,
        { month: 'short', day: 'numeric' },
        { axisTick: true },
      );
      const time = formatExplorerDateTime(date, locale, {
        hour: 'numeric',
        hour12: true,
        timeZoneName: 'short',
      });
      return {
        index,
        x: MARGIN.left + (index / Math.max(data.length - 1, 1)) * PLOT_W,
        label: `${day} ${time}`,
      };
    });
  }, [data, locale]);
  const tickRefs = useRef<(SVGTextElement | null)[]>([]);
  const [measuredWidths, setMeasuredWidths] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    setMeasuredWidths(
      tickRefs.current.slice(0, tickCandidates.length).map((el) => el?.getBBox().width ?? 0),
    );
  }, [tickCandidates]);
  const tickWidths =
    measuredWidths?.length === tickCandidates.length
      ? measuredWidths
      : tickCandidates.map((c) => c.label.length * TICK_CHAR_WIDTH_ESTIMATE);
  const visibleTicks = layoutAxisTicks(tickCandidates, tickWidths);

  if (data.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {emptyLabel}
      </EmptyState>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.activeSessions), 1);
  const yTicks = generateTicks(0, maxVal, 5);
  const yMax = yTicks.at(-1) || maxVal;

  const sx = (i: number) => MARGIN.left + (i / Math.max(data.length - 1, 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  const points = data.map((d, i) => `${sx(i)},${sy(d.activeSessions)}`).join(' ');

  const areaPath = [
    `M ${sx(0)},${MARGIN.top + PLOT_H}`,
    ...data.map((d, i) => `L ${sx(i)},${sy(d.activeSessions)}`),
    `L ${sx(data.length - 1)},${MARGIN.top + PLOT_H}`,
    'Z',
  ].join(' ');

  return (
    <Expandable title={exportTitle}>
      <Card>
        <div className="flex items-center justify-end mb-2">
          <ChartActions
            fileName="concurrent-sessions"
            onExportPng={() => track('agentic_workload_concurrent_sessions_export')}
          />
        </div>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: 240 }}>
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

          <line
            x1={MARGIN.left}
            y1={MARGIN.top + PLOT_H}
            x2={MARGIN.left + PLOT_W}
            y2={MARGIN.top + PLOT_H}
            stroke="currentColor"
            className="text-border"
            strokeWidth={0.5}
          />

          <path d={areaPath} fill="#6366f1" opacity={0.15} />

          <polyline points={points} fill="none" stroke="#6366f1" strokeWidth={1.5} />

          {tickCandidates.map((tick, k) => (
            <text
              key={tick.index}
              ref={(el) => {
                tickRefs.current[k] = el;
              }}
              x={tick.x}
              y={MARGIN.top + PLOT_H + 14}
              textAnchor={k === tickCandidates.length - 1 ? 'end' : 'middle'}
              visibility={visibleTicks.has(k) ? undefined : 'hidden'}
              aria-hidden={visibleTicks.has(k) ? undefined : true}
              className="fill-muted-foreground"
              style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
            >
              {tick.label}
            </text>
          ))}

          {data.map((d, i) => (
            <circle key={d.hour} cx={sx(i)} cy={sy(d.activeSessions)} r={1.5} fill="#6366f1">
              <title>
                {formatTimestamp(d.hour, locale)}: {d.activeSessions} {activeLabel}
              </title>
            </circle>
          ))}
        </svg>
      </Card>
    </Expandable>
  );
}

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
            <Stat boxed label={t.avgDuration} value={formatDurationStat(data.stats.avgDuration)} />
            <Stat boxed label={t.avgTurnsPerSession} value={data.stats.avgTurns.toFixed(1)} />
            <Stat boxed label={t.avgCostPerSession} value={`$${data.stats.avgCost.toFixed(2)}`} />
            <Stat boxed label={t.activeFinal24h} value={formatNumber(data.stats.active24h)} />
          </dl>
        )}
      </div>

      {data && (
        <>
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
