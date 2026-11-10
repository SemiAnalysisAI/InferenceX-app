'use client';

import { Suspense, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { PricingCoverageCard } from '@/components/agentic-workload-explorer/pricing-coverage';
import { formatDollars, formatNumber, truncateHash } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  CostData,
  ModelCost,
  ClientCost,
  CostBreakdown,
} from '@/lib/agentic-workload-explorer/api-types';
import { formatSnapshotTime, LAST_DAY_ISO } from '@/lib/agentic-workload-explorer/snapshot';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import {
  formatAxisDollars,
  formatDayLabel,
  TrendsStackedChart,
} from '@/components/agentic-workload-explorer/trends-charts';
import {
  TOKEN_SERIES_COLORS,
  CHART_COLORS,
} from '@/components/agentic-workload-explorer/series-colors';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';

const STRINGS = {
  en: {
    yCostUsd: 'Cost (USD)',
    summary: 'Summary',
    pricingCoverage: 'Pricing coverage',
    dailyCost: 'Daily cost',
    costByModel: 'Cost by model',
    costByClient: 'Cost by client',
    costComposition: 'Cost composition',
    totalCost: 'Total cost',
    avgPerSession: 'Avg / session',
    avgPerRequest: 'Avg / request',
    fastModeCost: 'Fast mode cost',
    regularCost: 'Regular cost',
    pctOfTotal: (pct: string) => `${pct}% of total`,
    unpricedModels: (n: number) => `${n} unpriced model${n === 1 ? '' : 's'}`,
    dailyCostDetail: (total: string, avg: string) => `${total} total · ${avg} / day avg`,
    modelCount: (n: number) => `${n} model${n === 1 ? '' : 's'}`,
    clientCount: (n: number) => `${n} client${n === 1 ? '' : 's'}`,
    errorLoading: 'Failed to load cost data',
    noDailyCostData: 'No daily cost data available',
    noModelCostData: 'No model cost data available',
    noClientCostData: 'No client cost data available',
    thRank: '#',
    thApiKeyHash: 'API key hash',
    thTotalCost: 'Total cost',
    thRequests: 'Requests',
    thSessions: 'Sessions',
    thLastActive: 'Last active',
    segInput: 'Input',
    segCacheRead: 'Cache read',
    segCacheWrite: 'Cache write',
    segOutput: 'Output',
  },
  zh: {
    yCostUsd: '成本（美元）',
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
    errorLoading: '无法加载成本数据',
    noDailyCostData: '暂无每日成本数据',
    noModelCostData: '暂无模型成本数据',
    noClientCostData: '暂无客户端成本数据',
    thRank: '#',
    thApiKeyHash: 'API key 哈希',
    thTotalCost: '总成本',
    thRequests: '请求数',
    thSessions: '会话数',
    thLastActive: '最后活跃',
    segInput: '输入',
    segCacheRead: '缓存读取',
    segCacheWrite: '缓存写入',
    segOutput: '输出',
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

const DAILY_COST_KEYS = ['cost'];

function ModelCostChart({ byModel, t }: { byModel: ModelCost[]; t: Strings }) {
  const sorted = [...byModel].toSorted((a, b) => b.totalCost - a.totalCost);
  const maxCost = sorted.length > 0 ? sorted[0].totalCost : 1;

  if (sorted.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noModelCostData}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((m) => {
        const pct = maxCost > 0 ? (m.totalCost / maxCost) * 100 : 0;
        return (
          <div
            key={m.model}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:flex"
          >
            <span
              className="min-w-0 sm:w-48 shrink-0 truncate text-xs text-foreground"
              title={m.model}
            >
              {m.model}
            </span>
            <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${pct}%`,
                  minWidth: m.totalCost > 0 ? 2 : 0,
                  backgroundColor: CHART_COLORS[0],
                }}
              />
            </div>
            <span className="sm:w-16 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-foreground">
              {formatDollars(m.totalCost)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MixBar({ breakdown, t }: { breakdown: CostBreakdown; t: Strings }) {
  const total = breakdown.input + breakdown.output + breakdown.cacheRead + breakdown.cacheWrite;
  if (total === 0) return null;

  const segments = [
    { label: t.segInput, value: breakdown.input, color: TOKEN_SERIES_COLORS.input },
    { label: t.segCacheRead, value: breakdown.cacheRead, color: TOKEN_SERIES_COLORS.cacheRead },
    { label: t.segCacheWrite, value: breakdown.cacheWrite, color: TOKEN_SERIES_COLORS.cacheWrite },
    { label: t.segOutput, value: breakdown.output, color: TOKEN_SERIES_COLORS.output },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex h-3 rounded-sm overflow-hidden">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${formatDollars(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {s.label} {formatDollars(s.value)} ({((s.value / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientCostTable({ byClient, t }: { byClient: ClientCost[]; t: Strings }) {
  const locale = useLocale();
  const sorted = [...byClient].toSorted((a, b) => b.totalCost - a.totalCost);

  if (sorted.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noClientCostData}
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-muted-foreground text-left border-b border-border/20">
            <th className="py-1.5 px-2 font-medium text-xs">{t.thRank}</th>
            <th className="py-1.5 px-2 font-medium text-xs">{t.thApiKeyHash}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thTotalCost}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thRequests}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thSessions}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thLastActive}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((u, i) => (
            <tr key={u.apiKeyHash} className="border-b border-border/20 hover:bg-surface-hover">
              <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
              <td className="py-1.5 px-2">
                <span className="font-mono text-muted-foreground" title={u.apiKeyHash}>
                  {truncateHash(u.apiKeyHash, 8)}
                </span>
              </td>
              <td className="py-1.5 px-2 text-right font-medium">{formatDollars(u.totalCost)}</td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatNumber(u.requestCount)}
              </td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatNumber(u.sessionCount)}
              </td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatSnapshotTime(u.lastActive, locale)}
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
    const complete = days.filter((d) => Date.parse(d.day) < Date.parse(LAST_DAY_ISO));
    const total = days.reduce((sum, d) => sum + d.cost, 0);
    const avg =
      complete.length > 0 ? complete.reduce((sum, d) => sum + d.cost, 0) / complete.length : 0;
    const chartDays = days.map((d) => ({ day: d.day, values: { cost: d.cost } }));
    return { chartDays, total, avg };
  }, [data, range]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader label={t.summary} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <EmptyState>{t.errorLoading}</EmptyState>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat boxed label={t.totalCost} value={formatDollars(data.summary.totalCost)} />
            <Stat
              boxed
              label={t.avgPerSession}
              value={formatDollars(data.summary.avgCostPerSession)}
            />
            <Stat
              boxed
              label={t.avgPerRequest}
              value={formatDollars(data.summary.avgCostPerRequest)}
            />
            <Stat
              boxed
              label={t.fastModeCost}
              value={formatDollars(data.summary.fastModeCost)}
              detail={t.pctOfTotal(
                data.summary.totalCost > 0
                  ? ((data.summary.fastModeCost / data.summary.totalCost) * 100).toFixed(1)
                  : '0',
              )}
            />
            <Stat
              boxed
              label={t.regularCost}
              value={formatDollars(data.summary.regularCost)}
              detail={t.pctOfTotal(
                data.summary.totalCost > 0
                  ? ((data.summary.regularCost / data.summary.totalCost) * 100).toFixed(1)
                  : '0',
              )}
            />
          </dl>
        )}
      </div>

      {data && (
        <>
          <div>
            <SectionHeader
              label={t.pricingCoverage}
              detail={t.unpricedModels(data.pricingCoverage.byModel.length)}
            />
            <PricingCoverageCard coverage={data.pricingCoverage} />
          </div>

          {spend && (
            <TrendsStackedChart
              title={t.dailyCost}
              subtext={t.dailyCostDetail(formatDollars(spend.total), formatDollars(spend.avg))}
              days={spend.chartDays}
              seriesKeys={DAILY_COST_KEYS}
              labelFor={() => t.dailyCost}
              colorFor={() => CHART_COLORS[0]}
              mode="count"
              yFormatter={formatAxisDollars}
              yLabel={t.yCostUsd}
              xFormatter={(day: string) => formatDayLabel(day, locale)}
              filename="daily-cost"
              emptyLabel={t.noDailyCostData}
              controls={
                <RangeToggle value={range} options={DAY_RANGES} onChange={handleRangeChange} />
              }
            />
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>{t.costByModel}</CardTitle>
              <div className="text-xs text-muted-foreground">
                {t.modelCount(data.byModel.length)}
              </div>
            </CardHeader>
            <div className="space-y-4">
              <ModelCostChart byModel={data.byModel} t={t} />
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                  {t.costComposition}
                </div>
                <MixBar breakdown={data.costBreakdown} t={t} />
              </div>
            </div>
          </Card>

          <div>
            <SectionHeader label={t.costByClient} detail={t.clientCount(data.byClient.length)} />
            <Card>
              <ClientCostTable byClient={data.byClient} t={t} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
