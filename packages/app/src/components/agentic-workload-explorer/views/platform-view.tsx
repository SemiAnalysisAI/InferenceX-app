'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { useLocale } from '@/lib/use-locale';
import type {
  PlatformData,
  PlatformStat,
  PlatformTimeSeries,
} from '@/lib/agentic-workload-explorer/api-types';
import { formatSnapshotDate } from '@/lib/agentic-workload-explorer/snapshot';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';

const STRINGS = {
  en: {
    stats: 'Stats',
    uniqueOs: 'Unique OS',
    uniqueCliVersions: 'Unique CLI Versions',
    mostCommonOs: 'Most Common OS',
    totalSessions: 'Total Sessions',
    failedToLoad: 'Failed to load platform data',
    osDist: 'OS Distribution',
    cliVersionDist: 'CLI Version Distribution',
    nodeVersionDist: 'Node.js Version Distribution',
    archDist: 'Architecture Distribution',
    platformTrends: 'Platform Trends',
    noData: 'No data',
    noTimeSeries: 'No time series data',
    sessionsPerDay: 'Sessions per day',
    tooltipSessions: (os: string, count: number, day: string) =>
      `${os}: ${count} sessions (${day})`,
  },
  zh: {
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
    sessionsPerDay: '每日会话数',
    tooltipSessions: (os: string, count: number, day: string) => `${os}: ${count} 个会话 (${day})`,
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────

function aggregate(
  stats: PlatformStat[],
  key: keyof PlatformStat,
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const s of stats) {
    const val = s[key] as string | null;
    const label = val ?? 'unknown';
    map.set(label, (map.get(label) || 0) + Number(s.sessionCount));
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);
}

const TREND_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// ── Section header ───────────────────────────────────────────────

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

// ── Stat card ────────────────────────────────────────────────────

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-mono font-bold mt-1">{value}</div>
      {detail && <div className="text-3xs font-mono text-muted-foreground mt-0.5">{detail}</div>}
    </div>
  );
}

// ── Horizontal bar chart ─────────────────────────────────────────

function HorizontalBars({
  data,
  color,
  limit,
  emptyLabel,
}: {
  data: { label: string; count: number }[];
  color: string;
  limit?: number;
  emptyLabel?: string;
}) {
  const items = limit ? data.slice(0, limit) : data;
  const maxCount = items.length > 0 ? items[0].count : 0;

  if (items.length === 0) {
    return (
      <div className="text-2xs font-mono text-muted-foreground">{emptyLabel ?? 'No data'}</div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((d) => {
        const widthPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
        return (
          <div key={d.label} className="flex items-center gap-3">
            <span className="text-2xs font-mono w-36 truncate shrink-0" title={d.label}>
              {d.label}
            </span>
            <div className="flex-1 h-5 bg-surface-hover rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm"
                style={{ width: `${Math.max(widthPct, 1)}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-3xs font-mono text-muted-foreground w-12 text-right shrink-0">
              {formatNumber(d.count)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Platform Trends (SVG stacked bar chart) ──────────────────────

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

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

function formatAxisValue(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function PlatformTrendsChart({
  timeSeries,
  allOsList,
  colorMap,
  noDataLabel,
  sessionsPerDayLabel,
  tooltipSessions,
}: {
  timeSeries: PlatformTimeSeries[];
  allOsList: string[];
  colorMap: Record<string, string>;
  noDataLabel: string;
  sessionsPerDayLabel: string;
  tooltipSessions: (os: string, count: number, day: string) => string;
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const { days, maxY, yTicks } = useMemo(() => {
    const dayMap = new Map<string, Record<string, number>>();
    for (const entry of timeSeries) {
      if (!dayMap.has(entry.day)) dayMap.set(entry.day, {});
      const dayData = dayMap.get(entry.day)!;
      const os = entry.os ?? 'unknown';
      dayData[os] = (dayData[os] || 0) + Number(entry.sessionCount);
    }

    // Days arrive as Date strings ("Wed Aug 26 2026 …"), so sort by time.
    const sortedDays = [...dayMap.keys()].toSorted((a, b) => Date.parse(a) - Date.parse(b));

    let max = 0;
    for (const dayData of dayMap.values()) {
      let total = 0;
      for (const count of Object.values(dayData)) total += count;
      if (total > max) max = total;
    }

    const ticks = max > 0 ? generateTicks(0, max, 5) : [0];
    const yMax = ticks.at(-1) || max || 1;

    return {
      days: sortedDays.map((day) => ({ day, data: dayMap.get(day)! })),
      maxY: yMax,
      yTicks: ticks,
    };
  }, [timeSeries]);

  if (days.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-2xs font-mono text-muted-foreground">
        {noDataLabel}
      </div>
    );
  }

  const barWidth = Math.max(1, PLOT_W / days.length - 2);
  const barGap = PLOT_W / days.length - barWidth;

  const sx = (i: number) => MARGIN.left + i * (barWidth + barGap) + barGap / 2;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / maxY) * PLOT_H;

  const labelInterval = Math.max(1, Math.floor(days.length / 6));

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-3xs font-mono text-muted-foreground">
          {allOsList.map((os) => (
            <span key={os} className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: colorMap[os] }}
              />
              {os}
            </span>
          ))}
        </div>
        <ExportPngButton
          locale={locale}
          onClick={() => {
            if (svgRef.current)
              exportSvgToPng(svgRef.current, {
                title: 'Platform Trends',
                filename: 'platform-trends.png',
                svgWidth: CHART_W,
                svgHeight: CHART_H,
              });
          }}
        />
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full">
        {/* Y-axis grid lines + labels */}
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            {tick > 0 && (
              <line
                x1={MARGIN.left}
                y1={sy(tick)}
                x2={MARGIN.left + PLOT_W}
                y2={sy(tick)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={MARGIN.left - 6}
              y={sy(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              {formatAxisValue(tick)}
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

        {/* Stacked bars */}
        {days.map(({ day, data }, i) => {
          let yOffset = 0;
          const rects: React.ReactNode[] = [];

          for (const os of allOsList) {
            const count = data[os] || 0;
            if (count === 0) continue;
            const barH = (count / maxY) * PLOT_H;
            rects.push(
              <rect
                key={`${day}-${os}`}
                x={sx(i)}
                y={sy(yOffset + count)}
                width={barWidth}
                height={barH}
                fill={colorMap[os]}
                rx={1}
              >
                <title>{tooltipSessions(os, count, formatSnapshotDate(day))}</title>
              </rect>,
            );
            yOffset += count;
          }

          return <g key={day}>{rects}</g>;
        })}

        {/* X-axis labels */}
        {days.map(({ day }, i) => {
          if (i % labelInterval !== 0 && i !== days.length - 1) return null;
          const d = new Date(day);
          const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
          return (
            <text
              key={`x-${day}`}
              x={sx(i) + barWidth / 2}
              y={MARGIN.top + PLOT_H + 16}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              {label}
            </text>
          );
        })}

        {/* Axis label */}
        <text
          x={MARGIN.left + PLOT_W / 2}
          y={CHART_H - 2}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}
        >
          {sessionsPerDayLabel}
        </text>
      </svg>
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────

export default function PlatformPage() {
  const t = STRINGS[useLocale()];
  return (
    <Expandable title={t.platformTrends}>
      <Suspense>
        <PlatformPageContent />
      </Suspense>
    </Expandable>
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

  // ── Aggregated distributions ──────────────────────────────────
  const osDist = useMemo(() => (data ? aggregate(data.stats, 'os') : []), [data]);
  const cliDist = useMemo(() => (data ? aggregate(data.stats, 'cliVersion') : []), [data]);
  const nodeDist = useMemo(() => (data ? aggregate(data.stats, 'nodeVersion') : []), [data]);
  const archDist = useMemo(() => (data ? aggregate(data.stats, 'arch') : []), [data]);

  // ── Stats ─────────────────────────────────────────────────────
  const uniqueOs = useMemo(() => osDist.filter((d) => d.label !== 'unknown').length, [osDist]);
  const uniqueCli = useMemo(() => cliDist.filter((d) => d.label !== 'unknown').length, [cliDist]);
  const mostCommonOs = useMemo(() => (osDist.length > 0 ? osDist[0].label : '--'), [osDist]);
  const totalSessions = useMemo(() => osDist.reduce((sum, d) => sum + d.count, 0), [osDist]);

  // ── Trend chart data ──────────────────────────────────────────
  const { allOsList, osColorMap } = useMemo(() => {
    if (!data) return { allOsList: [], osColorMap: {} };
    const osSet = new Set<string>();
    for (const entry of data.timeSeries) {
      osSet.add(entry.os ?? 'unknown');
    }
    const list = [...osSet].toSorted();
    const cMap: Record<string, string> = {};
    for (let i = 0; i < list.length; i++) {
      cMap[list[i]] = TREND_COLORS[i % TREND_COLORS.length];
    }
    return { allOsList: list, osColorMap: cMap };
  }, [data]);

  return (
    <div className="space-y-5">
      {/* ── Stats ── */}
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
        ) : data ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label={t.uniqueOs} value={String(uniqueOs)} />
            <StatCard label={t.uniqueCliVersions} value={String(uniqueCli)} />
            <StatCard label={t.mostCommonOs} value={mostCommonOs} />
            <StatCard label={t.totalSessions} value={formatNumber(totalSessions)} />
          </div>
        ) : (
          <div className="text-sm font-mono text-muted-foreground text-center py-8">
            {t.failedToLoad}
          </div>
        )}
      </div>

      {data && (
        <>
          {/* ── OS Distribution ── */}
          <div>
            <SectionHeader label={t.osDist} />
            <div className="rounded-md border border-border bg-surface p-3">
              <HorizontalBars data={osDist} color="#6366f1" emptyLabel={t.noData} />
            </div>
          </div>

          {/* ── CLI Version Distribution ── */}
          <div>
            <SectionHeader label={t.cliVersionDist} />
            <div className="rounded-md border border-border bg-surface p-3">
              <HorizontalBars data={cliDist} color="#06b6d4" limit={15} emptyLabel={t.noData} />
            </div>
          </div>

          {/* ── Node.js Version Distribution ── */}
          <div>
            <SectionHeader label={t.nodeVersionDist} />
            <div className="rounded-md border border-border bg-surface p-3">
              <HorizontalBars data={nodeDist} color="#10b981" emptyLabel={t.noData} />
            </div>
          </div>

          {/* ── Architecture Distribution ── */}
          <div>
            <SectionHeader label={t.archDist} />
            <div className="rounded-md border border-border bg-surface p-3">
              <HorizontalBars data={archDist} color="#f59e0b" emptyLabel={t.noData} />
            </div>
          </div>

          {/* ── Platform Trends ── */}
          <div>
            <SectionHeader label={t.platformTrends} />
            <div className="rounded-md border border-border bg-surface p-3">
              <PlatformTrendsChart
                timeSeries={data.timeSeries}
                allOsList={allOsList}
                colorMap={osColorMap}
                noDataLabel={t.noTimeSeries}
                sessionsPerDayLabel={t.sessionsPerDay}
                tooltipSessions={t.tooltipSessions}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
