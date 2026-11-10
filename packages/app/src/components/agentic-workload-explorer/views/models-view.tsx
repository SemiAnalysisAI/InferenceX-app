'use client';

import { Suspense, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  CHART_COLORS,
  TOKEN_SERIES_COLORS,
  NEUTRAL_SERIES_COLOR,
} from '@/components/agentic-workload-explorer/series-colors';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import type { ModelsData, TokensByModel } from '@/lib/agentic-workload-explorer/api-types';
import {
  formatAxisNumber,
  formatDayLabel,
  TrendsStackedChart,
  type StackedDayPoint,
} from '@/components/agentic-workload-explorer/trends-charts';
import { Button } from '@/components/ui/button';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';

const STRINGS = {
  en: {
    yRequests: 'Requests',
    stats: 'Stats',
    modelsUsed: 'Models used',
    totalTokens: 'Total tokens',
    fastModePct: 'Fast mode % (tokens)',
    cacheHitRatio: 'Cache hit ratio',
    failedToLoad: 'Failed to load model data',
    tokenDistByModel: 'Token distribution by model',
    input: 'Input',
    cacheRead: 'Cache read',
    cacheWrite: 'Cache write',
    output: 'Output',
    total: 'Total',
    modelCount: (n: number) => `${n} model${n === 1 ? '' : 's'}`,
    fastModeAnalysis: 'Fast mode analysis',
    sortedByFast: 'sorted by fast mode tokens',
    regular: 'Regular',
    fast: 'Fast mode',
    fastShare: (pct: string) => `${pct}% of tokens in fast mode`,
    regFastDetail: (reg: string, fast: string) => `${reg} regular / ${fast} fast`,
    showList: 'Show list',
    hideList: 'Hide list',
    modelUsageOverTime: 'Model usage over time',
    noTimeSeriesData: 'No time series data',
    requestsPerDay: 'Requests per day',
    inOut: (inp: string, out: string) => `${inp} in / ${out} out`,
    fastOfTotal: (fast: string, total: string) => `${fast} fast of ${total} tokens`,
    readEligible: (read: string, eligible: string) => `${read} read / ${eligible} eligible`,
  },
  zh: {
    yRequests: '请求数',
    stats: '统计',
    modelsUsed: '使用模型数',
    totalTokens: '总 Token 数',
    fastModePct: 'Fast Mode %（token）',
    cacheHitRatio: 'Cache 命中率',
    failedToLoad: '加载模型数据失败',
    tokenDistByModel: '按模型的 Token 分布',
    input: '输入',
    cacheRead: '缓存读取',
    cacheWrite: '缓存写入',
    output: '输出',
    total: '合计',
    modelCount: (n: number) => `${n} 个模型`,
    fastModeAnalysis: 'Fast Mode 分析',
    sortedByFast: '按 Fast Mode Token 排序',
    regular: '常规',
    fast: 'Fast Mode',
    fastShare: (pct: string) => `${pct}% 的 Token 为 Fast Mode`,
    regFastDetail: (reg: string, fast: string) => `常规 ${reg} / Fast ${fast}`,
    showList: '显示列表',
    hideList: '隐藏列表',
    modelUsageOverTime: '模型使用趋势',
    noTimeSeriesData: '暂无时序数据',
    requestsPerDay: '每日请求数',
    inOut: (inp: string, out: string) => `输入 ${inp} / 输出 ${out}`,
    fastOfTotal: (fast: string, total: string) => `${total} token 中 ${fast} 为 Fast Mode`,
    readEligible: (read: string, eligible: string) => `读取 ${read} / 可用 ${eligible}`,
  },
};

function shortenModel(model: string): string {
  return model.replace(/^claude-/u, '').replace(/-\d{8}$/u, '');
}

type Strings = (typeof STRINGS)['en'];

const TOKEN_KEYS = ['input', 'cacheRead', 'cacheWrite', 'output'] as const;
const FAST_COLORS = { regular: NEUTRAL_SERIES_COLOR, fast: CHART_COLORS[1] } as const;

interface RowHover {
  model: string;
  x: number;
  y: number;
}

function tokenParts(m: TokensByModel) {
  return {
    input: Number(m.inputTokens),
    cacheRead: Number(m.cacheReadInputTokens),
    cacheWrite: Number(m.cacheWriteTokens),
    output: Number(m.outputTokens),
  };
}

function fastParts(m: TokensByModel) {
  const fast =
    Number(m.fastInputTokens) +
    Number(m.fastOutputTokens) +
    Number(m.fastCacheReadInputTokens) +
    Number(m.fastCacheWriteTokens);
  const all =
    Number(m.inputTokens) +
    Number(m.outputTokens) +
    Number(m.cacheReadInputTokens) +
    Number(m.cacheWriteTokens);
  return { regular: all - fast, fast };
}

function LegendSwatches({ items }: { items: { key: string; label: string; color: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function TokenDistribution({ data, strings: s }: { data: TokensByModel[]; strings: Strings }) {
  const [hover, setHover] = useState<RowHover | null>(null);
  const rows = useMemo(
    () =>
      data
        .map((m) => {
          const parts = tokenParts(m);
          return {
            model: m.model,
            parts,
            total: parts.input + parts.cacheRead + parts.cacheWrite + parts.output,
          };
        })
        .filter((r) => r.total > 0)
        .toSorted((a, b) => b.total - a.total),
    [data],
  );
  const globalMax = rows[0]?.total ?? 0;
  const labels = {
    input: s.input,
    cacheRead: s.cacheRead,
    cacheWrite: s.cacheWrite,
    output: s.output,
  };
  const hovered = hover ? rows.find((r) => r.model === hover.model) : undefined;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{s.tokenDistByModel}</CardTitle>
        <div className="text-xs text-muted-foreground">{s.modelCount(rows.length)}</div>
      </CardHeader>
      <LegendSwatches
        items={TOKEN_KEYS.map((key) => ({
          key,
          label: labels[key],
          color: TOKEN_SERIES_COLORS[key],
        }))}
      />
      <div className="space-y-1.5" onMouseLeave={() => setHover(null)}>
        {rows.map((r) => (
          <div
            key={r.model}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:flex"
            onMouseMove={(e) => setHover({ model: r.model, x: e.clientX, y: e.clientY })}
          >
            <span
              className="min-w-0 sm:w-32 shrink-0 truncate text-xs text-foreground"
              title={r.model}
            >
              {shortenModel(r.model)}
            </span>
            <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
              <div
                className="flex h-full overflow-hidden rounded-sm"
                style={{ width: `${(r.total / globalMax) * 100}%`, minWidth: 2 }}
              >
                {TOKEN_KEYS.map((key) =>
                  r.parts[key] > 0 ? (
                    <div
                      key={key}
                      className="h-full"
                      style={{
                        width: `${(r.parts[key] / r.total) * 100}%`,
                        backgroundColor: TOKEN_SERIES_COLORS[key],
                      }}
                    />
                  ) : null,
                )}
              </div>
            </div>
            <span className="sm:w-16 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-foreground">
              {formatNumber(r.total)}
            </span>
          </div>
        ))}
      </div>
      {hover && hovered && (
        <FloatingTooltip x={hover.x} y={hover.y}>
          <ChartHoverCardBody
            title={shortenModel(hovered.model)}
            metrics={TOKEN_KEYS.map((key) => ({
              value: formatNumber(hovered.parts[key]),
              label: labels[key],
              color: TOKEN_SERIES_COLORS[key],
            }))}
            summary={`${s.total} ${formatNumber(hovered.total)}`}
          />
        </FloatingTooltip>
      )}
    </Card>
  );
}

function FastModeAnalysis({ data, strings: s }: { data: TokensByModel[]; strings: Strings }) {
  const [hover, setHover] = useState<RowHover | null>(null);
  const rows = useMemo(
    () =>
      data
        .filter((m) => Number(m.fastModeCount) > 0)
        .map((m) => {
          const parts = fastParts(m);
          return { model: m.model, ...parts, total: parts.regular + parts.fast };
        })
        .toSorted((a, b) => b.fast - a.fast),
    [data],
  );

  if (rows.length === 0) return null;
  const maxTokens = rows.reduce((max, r) => Math.max(max, r.total), 0);
  const hovered = hover ? rows.find((r) => r.model === hover.model) : undefined;

  return (
    <div>
      <SectionHeader label={s.fastModeAnalysis} detail={s.sortedByFast} />
      <Card>
        <LegendSwatches
          items={[
            { key: 'regular', label: s.regular, color: FAST_COLORS.regular },
            { key: 'fast', label: s.fast, color: FAST_COLORS.fast },
          ]}
        />
        <div className="space-y-1.5" onMouseLeave={() => setHover(null)}>
          {rows.map((r) => (
            <div
              key={r.model}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:flex"
              onMouseMove={(e) => setHover({ model: r.model, x: e.clientX, y: e.clientY })}
            >
              <span
                className="min-w-0 sm:w-32 shrink-0 truncate text-xs text-foreground"
                title={r.model}
              >
                {shortenModel(r.model)}
              </span>
              <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
                <div
                  className="flex h-full overflow-hidden rounded-sm"
                  style={{
                    width: `${maxTokens > 0 ? (r.total / maxTokens) * 100 : 0}%`,
                    minWidth: 2,
                  }}
                >
                  {r.regular > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(r.regular / r.total) * 100}%`,
                        backgroundColor: FAST_COLORS.regular,
                      }}
                    />
                  )}
                  {r.fast > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(r.fast / r.total) * 100}%`,
                        backgroundColor: FAST_COLORS.fast,
                      }}
                    />
                  )}
                </div>
              </div>
              <span className="sm:w-40 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                {s.regFastDetail(formatNumber(r.regular), formatNumber(r.fast))}
              </span>
            </div>
          ))}
        </div>
        {hover && hovered && (
          <FloatingTooltip x={hover.x} y={hover.y}>
            <ChartHoverCardBody
              title={shortenModel(hovered.model)}
              metrics={[
                {
                  value: formatNumber(hovered.regular),
                  label: s.regular,
                  color: FAST_COLORS.regular,
                },
                { value: formatNumber(hovered.fast), label: s.fast, color: FAST_COLORS.fast },
              ]}
              summary={
                hovered.total > 0
                  ? s.fastShare(((hovered.fast / hovered.total) * 100).toFixed(1))
                  : undefined
              }
            />
          </FloatingTooltip>
        )}
      </Card>
    </div>
  );
}

export default function ModelsPage() {
  return (
    <Suspense>
      <ModelsPageContent />
    </Suspense>
  );
}

function ModelsPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading } = useDashboardData<ModelsData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/models', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    key: String(traceVersionParam),
  });

  const allModels = useMemo(() => {
    if (!data) return [];
    const modelSet = new Set<string>();
    for (const m of data.tokensByModel) modelSet.add(m.model);
    for (const entry of data.timeSeries) modelSet.add(entry.model);
    return [...modelSet].toSorted();
  }, [data]);

  const [showModels, setShowModels] = useState(false);

  const usage = useMemo(() => {
    const dayMap = new Map<string, Record<string, number>>();
    const modelSet = new Set<string>();
    for (const entry of data?.timeSeries ?? []) {
      modelSet.add(entry.model);
      const values = dayMap.get(entry.day) ?? {};
      values[entry.model] = (values[entry.model] ?? 0) + Number(entry.requestCount);
      dayMap.set(entry.day, values);
    }
    const days: StackedDayPoint[] = [...dayMap.entries()]
      .toSorted(([a], [b]) => Date.parse(a) - Date.parse(b))
      .map(([day, values]) => ({ day, values }));
    return { days, keys: allModels.filter((m) => modelSet.has(m)) };
  }, [data, allModels]);

  const colorMap = useMemo(
    () => Object.fromEntries(allModels.map((m, i) => [m, CHART_COLORS[i % CHART_COLORS.length]])),
    [allModels],
  );

  let totalTokens = 0;
  let totalInput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalOutput = 0;
  let totalFastTokens = 0;

  if (data) {
    for (const m of data.tokensByModel) {
      const input = Number(m.inputTokens);
      const cacheRead = Number(m.cacheReadInputTokens);
      const cacheWrite = Number(m.cacheWriteTokens);
      const output = Number(m.outputTokens);
      totalInput += input;
      totalCacheRead += cacheRead;
      totalCacheWrite += cacheWrite;
      totalOutput += output;
      totalTokens += input + cacheRead + cacheWrite + output;
      totalFastTokens +=
        Number(m.fastInputTokens) +
        Number(m.fastCacheReadInputTokens) +
        Number(m.fastCacheWriteTokens) +
        Number(m.fastOutputTokens);
    }
  }

  const fastModePct = totalTokens > 0 ? ((totalFastTokens / totalTokens) * 100).toFixed(1) : '0';

  const cacheHitRatio =
    totalCacheRead + totalInput > 0
      ? ((totalCacheRead / (totalCacheRead + totalInput)) * 100).toFixed(1)
      : '0';

  return (
    <div className="space-y-5">
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
        ) : data ? (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              boxed
              label={t.modelsUsed}
              value={String(data.tokensByModel.length)}
              detail={
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0 text-xs"
                  aria-expanded={showModels}
                  aria-controls="models-used-list"
                  onClick={() => {
                    setShowModels((v) => !v);
                    track('agentic_workload_models_list_toggled', { shown: !showModels });
                  }}
                >
                  {showModels ? t.hideList : t.showList}
                </Button>
              }
            />
            <Stat
              boxed
              label={t.totalTokens}
              value={formatNumber(totalTokens)}
              detail={t.inOut(formatNumber(totalInput), formatNumber(totalOutput))}
            />
            <Stat
              boxed
              label={t.fastModePct}
              value={`${fastModePct}%`}
              detail={t.fastOfTotal(formatNumber(totalFastTokens), formatNumber(totalTokens))}
            />
            <Stat
              boxed
              label={t.cacheHitRatio}
              value={`${cacheHitRatio}%`}
              detail={t.readEligible(
                formatNumber(totalCacheRead),
                formatNumber(totalCacheRead + totalInput),
              )}
            />
          </dl>
        ) : (
          <EmptyState>{t.failedToLoad}</EmptyState>
        )}
        {data && showModels && (
          <ul
            id="models-used-list"
            className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-border/30 bg-card p-3 text-xs text-foreground"
          >
            {allModels.map((m) => (
              <li key={m} title={m}>
                {shortenModel(m)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && (
        <>
          {data.tokensByModel.length > 0 && (
            <TokenDistribution data={data.tokensByModel} strings={t} />
          )}

          <FastModeAnalysis data={data.tokensByModel} strings={t} />

          <TrendsStackedChart
            title={t.modelUsageOverTime}
            subtext={t.requestsPerDay}
            days={usage.days}
            seriesKeys={usage.keys}
            labelFor={shortenModel}
            colorFor={(key) => colorMap[key]}
            mode="count"
            yFormatter={formatAxisNumber}
            yLabel={t.yRequests}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            filename="model-usage-over-time"
            emptyLabel={t.noTimeSeriesData}
          />
        </>
      )}
    </div>
  );
}
