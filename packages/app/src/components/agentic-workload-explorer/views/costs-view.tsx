'use client';

import { Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PricingCoverageCard } from '@/components/agentic-workload-explorer/pricing-coverage';
import { formatDollars, formatNumber, truncateHash } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  CostData,
  DailyCost,
  ModelCost,
  ClientCost,
  CostBreakdown,
} from '@/lib/agentic-workload-explorer/api-types';
import {
  formatSnapshotDate,
  formatSnapshotTime,
  LAST_DAY_ISO,
} from '@/lib/agentic-workload-explorer/snapshot';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

// ── i18n ────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    summary: 'Summary',
    pricingCoverage: 'Pricing Coverage',
    dailyCost: 'Daily Cost',
    costByModel: 'Cost by Model',
    costByClient: 'Cost by Client',
    costComposition: 'Cost Composition',
    totalCost: 'Total Cost',
    avgPerSession: 'Avg / Session',
    avgPerRequest: 'Avg / Request',
    fastModeCost: 'Fast Mode Cost',
    regularCost: 'Regular Cost',
    pctOfTotal: (pct: string) => `${pct}% of total`,
    unpricedModels: (n: number) => `${n} unpriced model${n === 1 ? '' : 's'}`,
    dailyCostDetail: (total: string, avg: string) => `${total} total · ${avg} / day avg`,
    modelCount: (n: number) => `${n} model${n === 1 ? '' : 's'}`,
    clientCount: (n: number) => `${n} client${n === 1 ? '' : 's'}`,
    errorLoading: 'Failed to load cost data.',
    noDailyCostData: 'No daily cost data available',
    noModelCostData: 'No model cost data available',
    noClientCostData: 'No client cost data available',
    exportTitle: 'Daily Cost',
    thRank: '#',
    thApiKeyHash: 'API Key Hash',
    thTotalCost: 'Total Cost',
    thRequests: 'Requests',
    thSessions: 'Sessions',
    thLastActive: 'Last Active',
    segInput: 'Input',
    segCacheRead: 'Cache Read',
    segCacheWrite: 'Cache Write',
    segOutput: 'Output',
    tooltipRequests: (count: number) => `${count} requests`,
  },
  zh: {
    summary: '概览',
    pricingCoverage: '定价覆盖',
    dailyCost: '每日成本',
    costByModel: '按模型统计成本',
    costByClient: '按客户端统计成本',
    costComposition: '成本构成',
    totalCost: '总成本',
    avgPerSession: '平均 / 会话',
    avgPerRequest: '平均 / 请求',
    fastModeCost: 'Fast Mode 成本',
    regularCost: '常规成本',
    pctOfTotal: (pct: string) => `占总成本 ${pct}%`,
    unpricedModels: (n: number) => `${n} 个未定价模型`,
    dailyCostDetail: (total: string, avg: string) => `合计 ${total} · 日均 ${avg}`,
    modelCount: (n: number) => `${n} 个模型`,
    clientCount: (n: number) => `${n} 个客户端`,
    errorLoading: '无法加载成本数据。',
    noDailyCostData: '暂无每日成本数据',
    noModelCostData: '暂无模型成本数据',
    noClientCostData: '暂无客户端成本数据',
    exportTitle: '每日成本',
    thRank: '#',
    thApiKeyHash: 'API Key Hash',
    thTotalCost: '总成本',
    thRequests: '请求数',
    thSessions: '会话数',
    thLastActive: '最后活跃',
    segInput: '输入',
    segCacheRead: '缓存读取',
    segCacheWrite: '缓存写入',
    segOutput: '输出',
    tooltipRequests: (count: number) => `${count} 个请求`,
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

// ── Chart constants ──────────────────────────────────────────────

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 56 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

// ── Helpers ──────────────────────────────────────────────────────

function formatDollarsAxis(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  if (v >= 1) return `$${v.toFixed(v % 1 === 0 ? 0 : 2)}`;
  return `$${v.toFixed(2)}`;
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

function truncateModel(model: string, maxLen = 32): string {
  if (model.length <= maxLen) return model;
  return `${model.slice(0, maxLen - 1)}...`;
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

// ── Daily cost bar chart ─────────────────────────────────────────

function DailyCostChart({
  data,
  controls,
  t,
}: {
  data: DailyCost[];
  controls: ReactNode;
  t: Strings;
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const labelEvery = Math.ceil(data.length / 7);
  if (data.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noDailyCostData}
      </div>
    );
  }

  const maxCost = Math.max(...data.map((d) => d.cost), 0.01);
  const yTicks = generateTicks(0, maxCost, 5);
  const yMax = yTicks.at(-1) || maxCost;

  const barGap = 2;
  const barWidth = Math.max(1, (PLOT_W - barGap * data.length) / data.length);

  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  return (
    <Expandable title={t.exportTitle}>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          {controls}
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: t.exportTitle,
                  filename: 'daily-cost.png',
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
          {yTicks.map((tv) => (
            <g key={`y-${tv}`}>
              {tv > 0 && (
                <line
                  x1={MARGIN.left}
                  y1={sy(tv)}
                  x2={MARGIN.left + PLOT_W}
                  y2={sy(tv)}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={0.5}
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={MARGIN.left - 6}
                y={sy(tv) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: SVG_FONT_SIZE, fontFamily: SVG_FONT }}
              >
                {formatDollarsAxis(tv)}
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
            const barH = (d.cost / yMax) * PLOT_H;
            return (
              <g key={d.day}>
                <rect
                  x={x}
                  y={sy(d.cost)}
                  width={barWidth}
                  height={Math.max(barH, 0.5)}
                  fill="#10b981"
                  rx={1}
                >
                  <title>
                    {formatSnapshotDate(d.day)}: {formatDollars(d.cost)} (
                    {t.tooltipRequests(d.requestCount)})
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

// ── Cost by model horizontal bar chart ───────────────────────────

function ModelCostChart({ byModel, t }: { byModel: ModelCost[]; t: Strings }) {
  const sorted = [...byModel].toSorted((a, b) => b.totalCost - a.totalCost);
  const maxCost = sorted.length > 0 ? sorted[0].totalCost : 1;

  if (sorted.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noModelCostData}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((m) => {
        const pct = maxCost > 0 ? (m.totalCost / maxCost) * 100 : 0;
        return (
          <div key={m.model} className="flex items-center gap-2">
            <span
              className="text-2xs font-mono text-foreground shrink-0 w-[200px] truncate"
              title={m.model}
            >
              {truncateModel(m.model)}
            </span>
            <div className="flex-1 h-4 bg-border/30 rounded-sm overflow-hidden relative">
              <div
                className="h-full bg-violet-500 rounded-sm"
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
            <span className="text-2xs font-mono text-foreground shrink-0 w-[64px] text-right">
              {formatDollars(m.totalCost)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Cost composition MixBar ──────────────────────────────────────

function MixBar({ breakdown, t }: { breakdown: CostBreakdown; t: Strings }) {
  const total = breakdown.input + breakdown.output + breakdown.cacheRead + breakdown.cacheWrite;
  if (total === 0) return null;

  const segments = [
    { label: t.segInput, value: breakdown.input, color: 'bg-sky-500', hex: '#0ea5e9' },
    { label: t.segCacheRead, value: breakdown.cacheRead, color: 'bg-emerald-500', hex: '#10b981' },
    { label: t.segCacheWrite, value: breakdown.cacheWrite, color: 'bg-amber-500', hex: '#f59e0b' },
    { label: t.segOutput, value: breakdown.output, color: 'bg-violet-500', hex: '#8b5cf6' },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex h-3 rounded-sm overflow-hidden">
        {segments.map((s) => (
          <div
            key={s.label}
            className={`${s.color} transition-all`}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${formatDollars(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-sm ${s.color}`} />
            <span className="text-3xs font-mono text-muted-foreground">
              {s.label} {formatDollars(s.value)} ({((s.value / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── User cost table ──────────────────────────────────────────────

function ClientCostTable({ byClient, t }: { byClient: ClientCost[]; t: Strings }) {
  const sorted = [...byClient].toSorted((a, b) => b.totalCost - a.totalCost);

  if (sorted.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noClientCostData}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-2xs">
        <thead>
          <tr className="text-muted-foreground text-left border-b border-border">
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow">
              {t.thRank}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow">
              {t.thApiKeyHash}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
              {t.thTotalCost}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
              {t.thRequests}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
              {t.thSessions}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
              {t.thLastActive}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((u, i) => (
            <tr key={u.apiKeyHash} className="border-b border-border/50 hover:bg-surface-hover">
              <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
              <td className="py-1.5 px-2">
                <span className="text-subtle" title={u.apiKeyHash}>
                  {truncateHash(u.apiKeyHash, 8)}
                </span>
              </td>
              <td className="py-1.5 px-2 text-right font-bold">{formatDollars(u.totalCost)}</td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatNumber(u.requestCount)}
              </td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatNumber(u.sessionCount)}
              </td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatSnapshotTime(u.lastActive)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CostsPage() {
  return (
    <Suspense>
      <CostsPageContent />
    </Suspense>
  );
}

function CostsPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading, error } = useDashboardData<CostData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/costs', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error('Failed to fetch cost data');
      return r.json();
    },
    key: String(traceVersionParam),
  });

  const [range, setRange] = useState<DayRange>('30d');
  const handleRangeChange = (r: DayRange) => {
    setRange(r);
    track('agentic_workload_costs_range_changed', { range: r });
  };

  const spend = useMemo(() => {
    if (!data) return null;
    const days = data.daily
      .toSorted((a, b) => Date.parse(a.day) - Date.parse(b.day))
      .slice(-DAY_RANGE_DAYS[range]);
    // The snapshot ends partway through its last UTC day, so that day is left
    // out of the per-day average (it would drag the average down).
    const complete = days.filter((d) => Date.parse(d.day) < Date.parse(LAST_DAY_ISO));
    const total = days.reduce((sum, d) => sum + d.cost, 0);
    const avg =
      complete.length > 0 ? complete.reduce((sum, d) => sum + d.cost, 0) / complete.length : 0;
    return { days, total, avg };
  }, [data, range]);

  return (
    <div className="space-y-6">
      {/* ── Stats ───────────────────────────────────────────────── */}
      <div>
        <SectionHeader label={t.summary} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border bg-surface p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <div className="text-sm font-mono text-muted-foreground text-center py-8">
            {t.errorLoading}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <StatCard label={t.totalCost} value={formatDollars(data.summary.totalCost)} />
            <StatCard
              label={t.avgPerSession}
              value={formatDollars(data.summary.avgCostPerSession)}
            />
            <StatCard
              label={t.avgPerRequest}
              value={`$${data.summary.avgCostPerRequest.toFixed(4)}`}
            />
            <StatCard
              label={t.fastModeCost}
              value={formatDollars(data.summary.fastModeCost)}
              detail={t.pctOfTotal(
                data.summary.totalCost > 0
                  ? ((data.summary.fastModeCost / data.summary.totalCost) * 100).toFixed(1)
                  : '0',
              )}
            />
            <StatCard
              label={t.regularCost}
              value={formatDollars(data.summary.regularCost)}
              detail={t.pctOfTotal(
                data.summary.totalCost > 0
                  ? ((data.summary.regularCost / data.summary.totalCost) * 100).toFixed(1)
                  : '0',
              )}
            />
          </div>
        )}
      </div>

      {data && (
        <>
          {/* ── Pricing Coverage ──────────────────────────────────── */}
          <div>
            <SectionHeader
              label={t.pricingCoverage}
              detail={t.unpricedModels(data.pricingCoverage.byModel.length)}
            />
            <PricingCoverageCard coverage={data.pricingCoverage} />
          </div>

          {/* ── Daily Cost Chart ────────────────────────────────────── */}
          {spend && (
            <div>
              <SectionHeader
                label={t.dailyCost}
                detail={t.dailyCostDetail(formatDollars(spend.total), formatDollars(spend.avg))}
              />
              <DailyCostChart
                data={spend.days}
                controls={
                  <RangeToggle value={range} options={DAY_RANGES} onChange={handleRangeChange} />
                }
                t={t}
              />
            </div>
          )}

          {/* ── Cost by Model ───────────────────────────────────────── */}
          <div>
            <SectionHeader label={t.costByModel} detail={t.modelCount(data.byModel.length)} />
            <div className="rounded-md border border-border bg-surface p-3 space-y-4">
              <ModelCostChart byModel={data.byModel} t={t} />
              <div>
                <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground mb-1.5">
                  {t.costComposition}
                </div>
                <MixBar breakdown={data.costBreakdown} t={t} />
              </div>
            </div>
          </div>

          {/* ── Cost by Client ────────────────────────────────────────── */}
          <div>
            <SectionHeader label={t.costByClient} detail={t.clientCount(data.byClient.length)} />
            <div className="rounded-md border border-border bg-surface p-3">
              <ClientCostTable byClient={data.byClient} t={t} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
