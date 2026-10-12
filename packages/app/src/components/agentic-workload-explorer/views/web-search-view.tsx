'use client';

import { Suspense, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  WebSearchData,
  WebSearchDailyEntry,
  WebSearchModelEntry,
  WebSearchTopSession,
} from '@/lib/agentic-workload-explorer/api-types';
import { formatSnapshotDate } from '@/lib/agentic-workload-explorer/snapshot';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';

// ── i18n ────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    stats: 'Stats',
    loadError: 'Failed to load web search data.',
    totalSearches: 'Total Searches',
    pctWithSearches: '% with Searches',
    estCost: 'Est. Cost',
    requestsWithSearch: (n: string) => `${n} requests with search`,
    ofTotal: (a: string, b: string) => `${a} of ${b}`,
    perSearch: (cost: number) => `$${cost} per search`,
    searchesOverTime: 'Searches Over Time',
    searches: (n: string) => `${n} searches`,
    searchesByModel: 'Searches by Model',
    models: (n: number) => `${n} model${n === 1 ? '' : 's'}`,
    searchCostOverTime: 'Search Cost Over Time',
    topSessions: 'Top Sessions',
    sessions: (n: number) => `${n} session${n === 1 ? '' : 's'}`,
    noDailySearch: 'No daily search data available',
    noModelSearch: 'No model search data available',
    noDailyCost: 'No daily cost data available',
    noSessionData: 'No session data available',
    thRank: '#',
    thSession: 'Session',
    thSearchCount: 'Search Count',
    thRequestCount: 'Request Count',
    thSearchesPerReq: 'Searches / Req',
    tooltipSearches: (count: number, requests: number) =>
      `${count} searches (${requests} requests)`,
    tooltipCost: (cost: string, count: number) => `${cost} (${count} searches)`,
    exportSearchesTitle: 'Web Searches Over Time',
    exportCostTitle: 'Web Search Cost',
    searchPctTooltip: "Share of this model's requests that searched",
  },
  zh: {
    stats: '统计',
    loadError: '加载搜索数据失败',
    totalSearches: '总搜索次数',
    pctWithSearches: '含搜索请求占比',
    estCost: '预估成本',
    requestsWithSearch: (n: string) => `${n} 个请求包含搜索`,
    ofTotal: (a: string, b: string) => `${a} / ${b}`,
    perSearch: (cost: number) => `$${cost} / 次搜索`,
    searchesOverTime: '搜索趋势',
    searches: (n: string) => `${n} 次搜索`,
    searchesByModel: '按模型搜索分布',
    models: (n: number) => `${n} 个模型`,
    searchCostOverTime: '搜索成本趋势',
    topSessions: '搜索最多的会话',
    sessions: (n: number) => `${n} 个会话`,
    noDailySearch: '暂无每日搜索数据',
    noModelSearch: '暂无模型搜索数据',
    noDailyCost: '暂无每日成本数据',
    noSessionData: '暂无会话数据',
    thRank: '#',
    thSession: 'Session',
    thSearchCount: '搜索次数',
    thRequestCount: '请求数',
    thSearchesPerReq: '搜索 / 请求',
    tooltipSearches: (count: number, requests: number) => `${count} 次搜索（${requests} 个请求）`,
    tooltipCost: (cost: string, count: number) => `${cost}（${count} 次搜索）`,
    exportSearchesTitle: 'Web 搜索趋势',
    exportCostTitle: 'Web 搜索成本',
    searchPctTooltip: '该模型请求中包含搜索的比例',
  },
} as const;

// ── Chart constants ──────────────────────────────────────────────

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 48 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

const COST_PER_SEARCH = 0.01;

// ── Helpers ──────────────────────────────────────────────────────

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

function formatDollarsAxis(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  if (v >= 1) return `$${v.toFixed(v % 1 === 0 ? 0 : 2)}`;
  return `$${v.toFixed(2)}`;
}

function formatDollars(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 10) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}

function shortenModel(model: string): string {
  return model.replace(/^claude-/u, '').replace(/-\d{8}$/u, '');
}

// ── Section header ───────────────────────────────────────────────

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

// ── Stat card ────────────────────────────────────────────────────

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-mono font-bold mt-0.5">{value}</div>
      {detail && <div className="text-3xs font-mono text-muted-foreground mt-0.5">{detail}</div>}
    </div>
  );
}

// ── Searches Over Time (SVG bar chart) ──────────────────────────

function SearchesOverTimeChart({
  data,
  controls,
  locale,
}: {
  data: WebSearchDailyEntry[];
  controls: ReactNode;
  locale: Locale;
}) {
  const t = STRINGS[locale];
  const svgRef = useRef<SVGSVGElement>(null);
  const labelEvery = Math.ceil(data.length / 7);
  if (data.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noDailySearch}
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.searchCount), 1);
  const yTicks = generateTicks(0, maxCount, 5);
  const yMax = yTicks.at(-1) || maxCount;

  const barGap = 2;
  const barWidth = Math.max(1, (PLOT_W - barGap * data.length) / data.length);

  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  return (
    <Expandable title={t.exportSearchesTitle}>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          {controls}
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: t.exportSearchesTitle,
                  filename: 'web-searches-over-time.png',
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
          {/* Y-axis grid lines and labels */}
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
                style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
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

          {/* Bars */}
          {data.map((d, i) => {
            const x = MARGIN.left + i * (barWidth + barGap);
            const barH = (d.searchCount / yMax) * PLOT_H;
            return (
              <g key={d.day}>
                <rect
                  x={x}
                  y={sy(d.searchCount)}
                  width={barWidth}
                  height={Math.max(barH, 0.5)}
                  fill="#6366f1"
                  rx={1}
                >
                  <title>
                    {formatSnapshotDate(d.day)}:{' '}
                    {t.tooltipSearches(d.searchCount, d.requestsWithSearch)}
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

// ── Searches by Model (horizontal bars) ─────────────────────────

function SearchesByModelChart({
  byModel,
  locale,
}: {
  byModel: WebSearchModelEntry[];
  locale: Locale;
}) {
  const t = STRINGS[locale];
  // Merge dated and undated ids of the same model under its short name.
  const merged = new Map<string, WebSearchModelEntry>();
  for (const m of byModel) {
    const model = shortenModel(m.model);
    const prev = merged.get(model);
    merged.set(
      model,
      prev
        ? {
            ...prev,
            searchCount: prev.searchCount + m.searchCount,
            requestsWithSearch: prev.requestsWithSearch + m.requestsWithSearch,
            totalRequests: prev.totalRequests + m.totalRequests,
          }
        : { ...m, model },
    );
  }
  const sorted = [...merged.values()].toSorted((a, b) => b.searchCount - a.searchCount);
  const maxCount = sorted.length > 0 ? sorted[0].searchCount : 1;

  if (sorted.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noModelSearch}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="space-y-1.5">
        {sorted.map((m) => {
          const pct = maxCount > 0 ? (m.searchCount / maxCount) * 100 : 0;
          const searchPct =
            m.totalRequests > 0
              ? ((m.requestsWithSearch / m.totalRequests) * 100).toFixed(1)
              : '0.0';
          return (
            <div key={m.model} className="flex items-center gap-2">
              <span
                className="text-2xs font-mono text-foreground shrink-0 w-[180px] truncate"
                title={m.model}
              >
                {m.model}
              </span>
              <div className="flex-1 h-4 bg-border/30 rounded-sm overflow-hidden relative">
                <div
                  className="h-full bg-indigo-500 rounded-sm"
                  style={{ width: m.searchCount > 0 ? `${Math.max(pct, 1)}%` : 0 }}
                />
              </div>
              <span className="text-2xs font-mono text-foreground shrink-0 w-[56px] text-right">
                {formatNumber(m.searchCount)}
              </span>
              <span
                className="text-3xs font-mono text-muted-foreground shrink-0 w-[56px] text-right"
                title={t.searchPctTooltip}
              >
                {searchPct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Search Cost Over Time (SVG area chart) ──────────────────────

function SearchCostChart({ daily, locale }: { daily: WebSearchDailyEntry[]; locale: Locale }) {
  const t = STRINGS[locale];
  const svgRef = useRef<SVGSVGElement>(null);
  const data = daily.slice(-30);
  if (data.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noDailyCost}
      </div>
    );
  }

  const costs = data.map((d) => d.searchCount * COST_PER_SEARCH);
  const maxCost = Math.max(...costs, 0.01);
  const yTicks = generateTicks(0, maxCost, 5);
  const yMax = yTicks.at(-1) || maxCost;

  const sx = (i: number) => MARGIN.left + (i / Math.max(data.length - 1, 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  // Build path for line and area
  const linePoints = data.map((_, i) => `${sx(i)},${sy(costs[i])}`).join(' ');
  const areaPath = [
    `M ${sx(0)},${MARGIN.top + PLOT_H}`,
    ...data.map((_, i) => `L ${sx(i)},${sy(costs[i])}`),
    `L ${sx(data.length - 1)},${MARGIN.top + PLOT_H}`,
    'Z',
  ].join(' ');

  const labelInterval = Math.max(1, Math.floor(data.length / 6));

  return (
    <Expandable title={t.exportCostTitle}>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-end mb-2">
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: t.exportCostTitle,
                  filename: 'web-search-cost.png',
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
          {/* Y-axis grid lines and labels */}
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
                style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
              >
                {formatDollarsAxis(tick)}
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
          <path d={areaPath} fill="#10b981" opacity={0.15} />

          {/* Line */}
          <polyline
            points={linePoints}
            fill="none"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Dots */}
          {data.map((_, i) => (
            <circle key={i} cx={sx(i)} cy={sy(costs[i])} r={2} fill="#10b981">
              <title>
                {data[i].day}: {t.tooltipCost(formatDollars(costs[i]), data[i].searchCount)}
              </title>
            </circle>
          ))}

          {/* X-axis labels */}
          {data.map((d, i) => {
            if (i % labelInterval !== 0 && i !== data.length - 1) return null;
            return (
              <text
                key={`x-${d.day}`}
                x={sx(i)}
                y={MARGIN.top + PLOT_H + 14}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
              >
                {new Date(d.day).toLocaleDateString('en-US', {
                  timeZone: 'UTC',
                  month: 'short',
                  day: 'numeric',
                })}
              </text>
            );
          })}
        </svg>
      </div>
    </Expandable>
  );
}

// ── Top Sessions Table ──────────────────────────────────────────

function WebSearchTopSessionsTable({
  sessions,
  locale,
}: {
  sessions: WebSearchTopSession[];
  locale: Locale;
}) {
  const t = STRINGS[locale];
  const explorerHref = useExplorerHref();
  if (sessions.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noSessionData}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-2xs">
          <thead>
            <tr className="text-muted-foreground text-left border-b border-border">
              <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow">
                {t.thRank}
              </th>
              <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow">
                {t.thSession}
              </th>
              <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
                {t.thSearchCount}
              </th>
              <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
                {t.thRequestCount}
              </th>
              <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
                {t.thSearchesPerReq}
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => {
              const ratio =
                s.requestCount > 0 ? (s.searchCount / s.requestCount).toFixed(2) : '0.00';
              return (
                <tr key={s.sessionId} className="border-b border-border/50 hover:bg-surface-hover">
                  <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 px-2">
                    <Link
                      href={explorerHref(`/sessions/${s.sessionId}/conversation`)}
                      className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                    >
                      {s.sessionId.split('-')[0]}...
                    </Link>
                  </td>
                  <td className="py-1.5 px-2 text-right font-bold">
                    {formatNumber(s.searchCount)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-muted-foreground">
                    {formatNumber(s.requestCount)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-muted-foreground">{ratio}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────

export default function WebSearchPage() {
  return (
    <Suspense>
      <WebSearchPageContent />
    </Suspense>
  );
}

function WebSearchPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading, error } = useDashboardData<WebSearchData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/web-search', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error('Failed to fetch web search data');
      return r.json();
    },
    key: String(traceVersionParam),
  });
  const [range, setRange] = useState<DayRange>('30d');
  const days = data?.daily.slice(-DAY_RANGE_DAYS[range]) ?? [];

  return (
    <div className="space-y-6">
      {/* ── Stats ───────────────────────────────────────────────── */}
      <div>
        <SectionHeader label={t.stats} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border bg-surface p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <div className="text-sm font-mono text-muted-foreground text-center py-8">
            {t.loadError}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard
              label={t.totalSearches}
              value={formatNumber(data.stats.totalSearches)}
              detail={t.requestsWithSearch(formatNumber(data.stats.requestsWithSearch))}
            />
            <StatCard
              label={t.pctWithSearches}
              value={`${data.stats.searchPct.toFixed(1)}%`}
              detail={t.ofTotal(
                formatNumber(data.stats.requestsWithSearch),
                formatNumber(data.stats.totalRequests),
              )}
            />
            <StatCard
              label={t.estCost}
              value={formatDollars(data.stats.totalSearches * COST_PER_SEARCH)}
              detail={t.perSearch(COST_PER_SEARCH)}
            />
          </div>
        )}
      </div>

      {data && (
        <>
          {/* ── Searches Over Time ─────────────────────────────────── */}
          <div>
            <SectionHeader
              label={t.searchesOverTime}
              detail={t.searches(formatNumber(days.reduce((sum, d) => sum + d.searchCount, 0)))}
            />
            <SearchesOverTimeChart
              data={days}
              locale={locale}
              controls={
                <RangeToggle
                  value={range}
                  options={DAY_RANGES}
                  onChange={(v) => {
                    setRange(v);
                    track('agentic_workload_web_search_range_changed', { range: v });
                  }}
                />
              }
            />
          </div>

          {/* ── Searches by Model ──────────────────────────────────── */}
          <div>
            <SectionHeader label={t.searchesByModel} detail={t.models(data.byModel.length)} />
            <SearchesByModelChart byModel={data.byModel} locale={locale} />
          </div>

          {/* ── Search Cost Over Time ──────────────────────────────── */}
          <div>
            <SectionHeader label={t.searchCostOverTime} detail={`$${COST_PER_SEARCH}/search`} />
            <SearchCostChart daily={data.daily} locale={locale} />
          </div>

          {/* ── Top Sessions ───────────────────────────────────────── */}
          <div>
            <SectionHeader label={t.topSessions} detail={t.sessions(data.topSessions.length)} />
            <WebSearchTopSessionsTable sessions={data.topSessions} locale={locale} />
          </div>
        </>
      )}
    </div>
  );
}
