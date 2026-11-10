'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { formatDollars, formatNumber } from '@/lib/agentic-workload-explorer/format';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  WebSearchData,
  WebSearchModelEntry,
  WebSearchTopSession,
} from '@/lib/agentic-workload-explorer/api-types';
import {
  DAY_RANGES,
  DAY_RANGE_DAYS,
  RangeToggle,
  type DayRange,
} from '@/components/agentic-workload-explorer/range-toggle';
import {
  formatAxisDollars,
  formatDayLabel,
  TrendsLineChart,
  TrendsStackedChart,
  type LineSeries,
} from '@/components/agentic-workload-explorer/trends-charts';
import { useExplorerHref } from '@/hooks/agentic-workload-explorer/use-explorer-href';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';

const STRINGS = {
  en: {
    ySearches: 'Searches',
    yCostUsd: 'Cost (USD)',
    stats: 'Stats',
    loadError: 'Failed to load web search data',
    totalSearches: 'Total searches',
    pctWithSearches: '% with searches',
    estCost: 'Est. cost',
    requestsWithSearch: (n: string) => `${n} requests with search`,
    ofTotal: (a: string, b: string) => `${a} of ${b}`,
    perSearch: (cost: number) => `$${cost} per search`,
    searchesOverTime: 'Searches over time',
    searches: (n: string) => `${n} searches`,
    searchesByModel: 'Searches by model',
    models: (n: number) => `${n} model${n === 1 ? '' : 's'}`,
    searchCostOverTime: 'Search cost over time',
    topSessions: 'Top sessions',
    sessions: (n: number) => `${n} session${n === 1 ? '' : 's'}`,
    noDailySearch: 'No daily search data available',
    noModelSearch: 'No model search data available',
    noDailyCost: 'No daily cost data available',
    noSessionData: 'No session data available',
    thRank: '#',
    thSession: 'Session',
    thSearchCount: 'Search count',
    thRequestCount: 'Request count',
    thSearchesPerReq: 'Searches / req',
    searchesSeries: 'Searches',
    costSeries: 'Search cost',
    colModel: 'Model',
    colSearches: 'Searches',
    colSearchPct: '% of requests',
    showNoData: (n: number) => `Show ${n} with no data`,
    hideNoData: 'Hide models with no data',
    searchPctTooltip: "Share of this model's requests that searched",
  },
  zh: {
    ySearches: '搜索次数',
    yCostUsd: '成本（美元）',
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
    thSession: '会话',
    thSearchCount: '搜索次数',
    thRequestCount: '请求数',
    thSearchesPerReq: '搜索 / 请求',
    searchesSeries: '搜索次数',
    costSeries: '搜索成本',
    colModel: '模型',
    colSearches: '搜索次数',
    colSearchPct: '请求占比',
    showNoData: (n: number) => `显示 ${n} 个无数据的模型`,
    hideNoData: '隐藏无数据的模型',
    searchPctTooltip: '该模型请求中包含搜索的比例',
  },
} as const;

const COST_PER_SEARCH = 0.01;
const SEARCH_KEYS = ['searches'];
const ZERO_ROW_COLLAPSE_THRESHOLD = 5;
const searchColor = () => CHART_COLORS[0];

function shortenModel(model: string): string {
  return model.replace(/^claude-/u, '').replace(/-\d{8}$/u, '');
}

function SearchesByModelChart({
  byModel,
  locale,
}: {
  byModel: WebSearchModelEntry[];
  locale: Locale;
}) {
  const t = STRINGS[locale];
  const [showZero, setShowZero] = useState(false);
  const sorted = useMemo(() => {
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
    return [...merged.values()].toSorted(
      (a, b) => b.searchCount - a.searchCount || a.model.localeCompare(b.model),
    );
  }, [byModel]);

  if (sorted.length === 0) {
    return (
      <Card>
        <EmptyState bare className="py-8">
          {t.noModelSearch}
        </EmptyState>
      </Card>
    );
  }

  const maxCount = sorted[0].searchCount;
  const zeroCount = sorted.filter((m) => m.searchCount === 0).length;
  const collapsible = zeroCount > ZERO_ROW_COLLAPSE_THRESHOLD;
  const rows = collapsible && !showZero ? sorted.filter((m) => m.searchCount > 0) : sorted;

  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-border/30 pb-1.5 mb-2 text-xs font-medium text-muted-foreground">
        <span className="w-32 shrink-0 sm:w-44">{t.colModel}</span>
        <span className="flex-1" />
        <span className="w-14 shrink-0 text-right">{t.colSearches}</span>
        <span className="w-24 shrink-0 text-right" title={t.searchPctTooltip}>
          {t.colSearchPct}
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((m) => {
          const pct = maxCount > 0 ? (m.searchCount / maxCount) * 100 : 0;
          const searchPct =
            m.totalRequests > 0
              ? ((m.requestsWithSearch / m.totalRequests) * 100).toFixed(1)
              : '0.0';
          return (
            <div
              key={m.model}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 sm:flex"
            >
              <span
                className={`min-w-0 sm:w-32 shrink-0 truncate text-xs sm:w-44 ${m.searchCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}
                title={m.model}
              >
                {m.model}
              </span>
              <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${pct}%`,
                    minWidth: m.searchCount > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS[0],
                  }}
                />
              </div>
              <span className="sm:w-14 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-foreground">
                {formatNumber(m.searchCount)}
              </span>
              <span className="sm:w-24 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                {searchPct}%
              </span>
            </div>
          );
        })}
      </div>
      {collapsible && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-2"
          aria-expanded={showZero}
          onClick={() => {
            setShowZero((v) => !v);
            track('agentic_workload_web_search_zero_models_toggled', { shown: !showZero });
          }}
        >
          {showZero ? t.hideNoData : t.showNoData(zeroCount)}
        </Button>
      )}
    </Card>
  );
}

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
      <EmptyState bare className="py-8">
        {t.noSessionData}
      </EmptyState>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-muted-foreground text-left border-b border-border/20">
              <th className="py-1.5 px-2 font-medium text-xs">{t.thRank}</th>
              <th className="py-1.5 px-2 font-medium text-xs">{t.thSession}</th>
              <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thSearchCount}</th>
              <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thRequestCount}</th>
              <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thSearchesPerReq}</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => {
              const ratio =
                s.requestCount > 0 ? (s.searchCount / s.requestCount).toFixed(2) : '0.00';
              return (
                <tr key={s.sessionId} className="border-b border-border/20 hover:bg-surface-hover">
                  <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 px-2">
                    <Link
                      href={explorerHref(`/sessions/${s.sessionId}/conversation`)}
                      className="font-mono text-brand underline underline-offset-2"
                    >
                      {s.sessionId.split('-')[0]}…
                    </Link>
                  </td>
                  <td className="py-1.5 px-2 text-right font-medium">
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
    </Card>
  );
}

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
  const { searchDays, searchTotal, costSeries } = useMemo(() => {
    const days = data?.daily.slice(-DAY_RANGE_DAYS[range]) ?? [];
    const series: LineSeries[] = [
      {
        key: 'cost',
        label: t.costSeries,
        color: CHART_COLORS[0],
        points: (data?.daily ?? [])
          .slice(-30)
          .map((d) => ({ day: d.day, value: d.searchCount * COST_PER_SEARCH })),
      },
    ];
    return {
      searchDays: days.map((d) => ({ day: d.day, values: { searches: d.searchCount } })),
      searchTotal: days.reduce((sum, d) => sum + d.searchCount, 0),
      costSeries: series,
    };
  }, [data, range, t]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader label={t.stats} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data ? (
          <EmptyState>{t.loadError}</EmptyState>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat
              boxed
              label={t.totalSearches}
              value={formatNumber(data.stats.totalSearches)}
              detail={t.requestsWithSearch(formatNumber(data.stats.requestsWithSearch))}
            />
            <Stat
              boxed
              label={t.pctWithSearches}
              value={`${data.stats.searchPct.toFixed(1)}%`}
              detail={t.ofTotal(
                formatNumber(data.stats.requestsWithSearch),
                formatNumber(data.stats.totalRequests),
              )}
            />
            <Stat
              boxed
              label={t.estCost}
              value={formatDollars(data.stats.totalSearches * COST_PER_SEARCH)}
              detail={t.perSearch(COST_PER_SEARCH)}
            />
          </dl>
        )}
      </div>

      {data && (
        <>
          <TrendsStackedChart
            title={t.searchesOverTime}
            subtext={t.searches(formatNumber(searchTotal))}
            days={searchDays}
            seriesKeys={SEARCH_KEYS}
            labelFor={() => t.searchesSeries}
            colorFor={searchColor}
            mode="count"
            yLabel={t.ySearches}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            filename="web-searches-over-time"
            emptyLabel={t.noDailySearch}
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

          <div>
            <SectionHeader label={t.searchesByModel} detail={t.models(data.byModel.length)} />
            <SearchesByModelChart byModel={data.byModel} locale={locale} />
          </div>

          <TrendsLineChart
            title={t.searchCostOverTime}
            subtext={t.perSearch(COST_PER_SEARCH)}
            series={costSeries}
            yFormatter={formatAxisDollars}
            yLabel={t.yCostUsd}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            filename="web-search-cost"
            emptyLabel={t.noDailyCost}
          />

          <div>
            <SectionHeader label={t.topSessions} detail={t.sessions(data.topSessions.length)} />
            <WebSearchTopSessionsTable sessions={data.topSessions} locale={locale} />
          </div>
        </>
      )}
    </div>
  );
}
