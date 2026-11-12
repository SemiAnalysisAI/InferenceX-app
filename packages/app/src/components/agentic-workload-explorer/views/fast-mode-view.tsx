'use client';

import { Suspense, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { formatDollars, formatNumber } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { getFastModeMultiplier } from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';
import {
  formatDayLabel,
  TrendsStackedChart,
} from '@/components/agentic-workload-explorer/trends-charts';
import {
  CHART_COLORS,
  NEUTRAL_SERIES_COLOR,
} from '@/components/agentic-workload-explorer/series-colors';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    yShareOfRequests: 'Share of requests',
    summary: 'Summary',
    dailyFastModePct: 'Daily fast mode %',
    modelBreakdown: 'Model breakdown',
    finalDays: (n: number) => `Final ${n} days`,
    models: (n: number) => `${n} models`,
    fastModePct: 'Fast mode %',
    fastModeCost: 'Fast mode cost',
    costPremium: 'Cost premium',
    avgE2eLatencyGain: 'Avg E2E latency gain',
    fastOfTotal: (fast: string, total: string) => `${fast} of ${total} requests`,
    regularDetail: (cost: string) => `Regular: ${cost}`,
    markupDetail: '6x markup over regular rates',
    fastVsRegular: (fast: string, regular: string) => `Fast: ${fast} vs regular: ${regular}`,
    errorLoading: 'Failed to load fast mode data',
    noDailyData: 'No daily data available',
    noModelData: 'No model data available',
    fast: 'Fast mode',
    regular: 'Regular',
    thModel: 'Model',
    thFastCount: 'Fast count',
    thRegularCount: 'Regular count',
    thFastCost: 'Fast cost',
    thRegularCost: 'Regular cost',
    thFastE2e: 'Fast E2E',
    thRegularE2e: 'Regular E2E',
    thDiff: 'Diff',
  },
  zh: {
    yShareOfRequests: '请求占比',
    summary: '概览',
    dailyFastModePct: '每日 Fast Mode 占比',
    modelBreakdown: '模型明细',
    finalDays: (n: number) => `最后 ${n} 天`,
    models: (n: number) => `${n} 个模型`,
    fastModePct: 'Fast Mode 占比',
    fastModeCost: 'Fast Mode 成本',
    costPremium: '额外成本',
    avgE2eLatencyGain: '平均 E2E 延迟优势',
    fastOfTotal: (fast: string, total: string) => `${total} 个请求中 ${fast} 个为 Fast Mode`,
    regularDetail: (cost: string) => `常规：${cost}`,
    markupDetail: '按常规成本 6 倍加价',
    fastVsRegular: (fast: string, regular: string) => `Fast：${fast} vs 常规：${regular}`,
    errorLoading: '无法加载 Fast Mode 数据',
    noDailyData: '暂无每日数据',
    noModelData: '暂无模型数据',
    fast: 'Fast Mode',
    regular: '常规',
    thModel: '模型',
    thFastCount: 'Fast 次数',
    thRegularCount: '常规次数',
    thFastCost: 'Fast 成本',
    thRegularCost: '常规成本',
    thFastE2e: 'Fast E2E',
    thRegularE2e: '常规 E2E',
    thDiff: '差异',
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

interface FastModeSummaryRow {
  isFastMode: boolean;
  count: number;
  totalCost: number;
  avgDurationMs: number;
  avgTtftMs: number;
  totalOutputTokens: number;
}

interface FastModeDaily {
  day: string;
  totalCount: number;
  fastCount: number;
  totalCost: number;
  fastCost: number;
}

interface FastModeModelRow {
  model: string;
  isFastMode: boolean;
  count: number;
  totalCost: number;
  avgDurationMs: number;
}

interface FastModeData {
  summary: FastModeSummaryRow[];
  daily: FastModeDaily[];
  byModel: FastModeModelRow[];
}

const DAILY_KEYS = ['fast', 'regular'];
const DAILY_COLORS: Record<string, string> = {
  fast: CHART_COLORS[1],
  regular: NEUTRAL_SERIES_COLOR,
};
const dailyColor = (key: string) => DAILY_COLORS[key];

function formatPct(v: number): string {
  if (isNaN(v) || !isFinite(v)) return '0%';
  return `${v.toFixed(1)}%`;
}

function formatMs(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

interface ModelBreakdown {
  model: string;
  fastCount: number;
  regularCount: number;
  fastCost: number;
  regularCost: number;
  fastAvgDuration: number;
  regularAvgDuration: number;
}

function ModelBreakdownTable({ byModel, t }: { byModel: FastModeModelRow[]; t: Strings }) {
  const models = useMemo(() => {
    const map = new Map<string, ModelBreakdown>();
    for (const row of byModel) {
      let entry = map.get(row.model);
      if (!entry) {
        entry = {
          model: row.model,
          fastCount: 0,
          regularCount: 0,
          fastCost: 0,
          regularCost: 0,
          fastAvgDuration: 0,
          regularAvgDuration: 0,
        };
        map.set(row.model, entry);
      }
      if (row.isFastMode) {
        entry.fastCount = row.count;
        entry.fastCost = row.totalCost;
        entry.fastAvgDuration = row.avgDurationMs;
      } else {
        entry.regularCount = row.count;
        entry.regularCost = row.totalCost;
        entry.regularAvgDuration = row.avgDurationMs;
      }
    }
    return [...map.values()]
      .filter((m) => m.fastCount > 0 || m.regularCount > 0)
      .toSorted((a, b) => b.fastCost + b.regularCost - (a.fastCost + a.regularCost));
  }, [byModel]);

  if (models.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noModelData}
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-muted-foreground text-left border-b border-border/20">
            <th className="py-1.5 px-2 font-medium text-xs">{t.thModel}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thFastCount}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thRegularCount}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thFastCost}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thRegularCost}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thFastE2e}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thRegularE2e}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.thDiff}</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const latencyDiff =
              m.fastAvgDuration > 0 && m.regularAvgDuration > 0
                ? m.fastAvgDuration - m.regularAvgDuration
                : null;
            return (
              <tr key={m.model} className="border-b border-border/20 hover:bg-surface-hover">
                <td className="max-w-64 truncate py-1.5 px-2 font-mono" title={m.model}>
                  {m.model}
                </td>
                <td className="py-1.5 px-2 text-right text-foreground">
                  {formatNumber(m.fastCount)}
                </td>
                <td className="py-1.5 px-2 text-right text-muted-foreground">
                  {formatNumber(m.regularCount)}
                </td>
                <td className="py-1.5 px-2 text-right font-medium text-foreground">
                  {formatDollars(m.fastCost)}
                </td>
                <td className="py-1.5 px-2 text-right text-muted-foreground">
                  {formatDollars(m.regularCost)}
                </td>
                <td className="py-1.5 px-2 text-right text-foreground">
                  {m.fastAvgDuration > 0 ? formatMs(m.fastAvgDuration) : '—'}
                </td>
                <td className="py-1.5 px-2 text-right text-muted-foreground">
                  {m.regularAvgDuration > 0 ? formatMs(m.regularAvgDuration) : '—'}
                </td>
                <td
                  className={`py-1.5 px-2 text-right ${latencyDiff !== null && latencyDiff < 0 ? 'text-success' : latencyDiff !== null && latencyDiff > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {latencyDiff === null
                    ? '—'
                    : `${latencyDiff < 0 ? '' : '+'}${formatMs(latencyDiff)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function FastModePage() {
  return (
    <Suspense>
      <FastModePageContent />
    </Suspense>
  );
}

function FastModePageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading, error } = useDashboardData<FastModeData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/fast-mode', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error('Failed to fetch fast mode data');
      return r.json();
    },
    key: String(traceVersionParam),
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const fastRow = data.summary.find((r) => r.isFastMode === true);
    const regularRow = data.summary.find((r) => r.isFastMode === false);

    const fastCount = fastRow?.count ?? 0;
    const regularCount = regularRow?.count ?? 0;
    const totalCount = fastCount + regularCount;
    const fastPct = totalCount > 0 ? (fastCount / totalCount) * 100 : 0;

    const fastCost = fastRow?.totalCost ?? 0;
    const regularCost = regularRow?.totalCost ?? 0;

    const costPremium = data.byModel.reduce((acc, row) => {
      if (!row.isFastMode || row.totalCost <= 0) return acc;
      const m = getFastModeMultiplier(row.model);
      if (m <= 1) return acc;
      return acc + row.totalCost * ((m - 1) / m);
    }, 0);

    const fastAvgDuration = fastRow?.avgDurationMs ?? 0;
    const regularAvgDuration = regularRow?.avgDurationMs ?? 0;
    const latencyGain =
      fastAvgDuration > 0 && regularAvgDuration > 0 ? regularAvgDuration - fastAvgDuration : 0;

    const fastAvgTtft = fastRow?.avgTtftMs ?? 0;
    const regularAvgTtft = regularRow?.avgTtftMs ?? 0;

    return {
      fastPct,
      fastCount,
      regularCount,
      totalCount,
      fastCost,
      regularCost,
      costPremium,
      latencyGain,
      fastAvgDuration,
      regularAvgDuration,
      fastAvgTtft,
      regularAvgTtft,
    };
  }, [data]);

  const dailyDays = useMemo(
    () =>
      (data?.daily ?? []).slice(-30).map((d) => ({
        day: d.day,
        values: { fast: d.fastCount, regular: Math.max(0, d.totalCount - d.fastCount) },
      })),
    [data],
  );

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader label={t.summary} />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card p-3">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : error || !data || !stats ? (
          <EmptyState>{t.errorLoading}</EmptyState>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              boxed
              label={t.fastModePct}
              value={formatPct(stats.fastPct)}
              detail={t.fastOfTotal(formatNumber(stats.fastCount), formatNumber(stats.totalCount))}
            />
            <Stat
              boxed
              label={t.fastModeCost}
              value={formatDollars(stats.fastCost)}
              detail={t.regularDetail(formatDollars(stats.regularCost))}
            />
            <Stat
              boxed
              label={t.costPremium}
              value={formatDollars(stats.costPremium)}
              detail={t.markupDetail}
            />
            <Stat
              boxed
              label={t.avgE2eLatencyGain}
              value={
                stats.latencyGain > 0
                  ? formatMs(stats.latencyGain)
                  : stats.latencyGain < 0
                    ? `+${formatMs(Math.abs(stats.latencyGain))}`
                    : '—'
              }
              detail={
                stats.fastAvgDuration > 0 && stats.regularAvgDuration > 0
                  ? t.fastVsRegular(
                      formatMs(stats.fastAvgDuration),
                      formatMs(stats.regularAvgDuration),
                    )
                  : undefined
              }
            />
          </dl>
        )}
      </div>

      {data && stats && (
        <>
          <TrendsStackedChart
            title={t.dailyFastModePct}
            subtext={t.finalDays(Math.min(data.daily.length, 30))}
            days={dailyDays}
            seriesKeys={DAILY_KEYS}
            labelFor={(key) => (key === 'fast' ? t.fast : t.regular)}
            colorFor={dailyColor}
            mode="share"
            yLabel={t.yShareOfRequests}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            filename="daily-fast-mode"
            emptyLabel={t.noDailyData}
          />

          <div>
            <SectionHeader
              label={t.modelBreakdown}
              detail={t.models(new Set(data.byModel.map((r) => r.model)).size)}
            />
            <Card>
              <ModelBreakdownTable byModel={data.byModel} t={t} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
