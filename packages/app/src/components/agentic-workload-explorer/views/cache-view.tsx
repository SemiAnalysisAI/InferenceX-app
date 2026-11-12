'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatExplorerDateTime,
  formatNumber,
  truncateHash,
} from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type { CacheData, ModelCache, ClientCache } from '@/lib/agentic-workload-explorer/api-types';
import { snapshotNow } from '@/lib/agentic-workload-explorer/snapshot';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { TOKEN_SERIES_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import {
  ChartActions,
  ExpandableChart,
} from '@/components/agentic-workload-explorer/expandable-chart';
import {
  formatAxisNumber,
  formatAxisPercent,
  formatDayLabel,
  TrendsLineChart,
  type LineSeries,
} from '@/components/agentic-workload-explorer/trends-charts';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_FONT_SANS, CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';

const STRINGS = {
  en: {
    yHitRate: 'Hit rate',
    yTokens: 'Tokens',
    stats: 'Stats',
    cacheHitRateOverTime: 'Cache hit rate over time',
    cacheReadVsWriteTrends: 'Cache read vs write trends',
    cacheEfficiencyByModel: 'Cache efficiency by model',
    cacheByClient: 'Cache by client',
    cacheEfficiencyPerDev: 'Cache efficiency per developer',
    cacheEfficiencyPerDevDetail: 'Final 90 days · cache_read / (cache_read + input)',
    loading: 'Loading…',
    lastNDays: (n: number) => `Final ${n} days`,
    nModels: (n: number) => `${n} model${n === 1 ? '' : 's'}`,
    nClients: (n: number) => `${n} client${n === 1 ? '' : 's'}`,
    cacheHitRate: 'Cache hit rate',
    cacheReadTokens: 'Cache read tokens',
    cacheWriteTokens: 'Cache write tokens',
    totalRequests: 'Total requests',
    ofRequests: (hit: string, total: string) => `${hit} of ${total} requests`,
    noDailyCacheData: 'No daily cache data available',
    noModelCacheData: 'No model cache data available',
    noClientCacheData: 'No client cache data available',
    failedToLoad: 'Failed to load cache data',
    allClients: 'All clients',
    cacheReadLegend: 'Cache read',
    cacheWriteLegend: 'Cache write',
    modelHeader: 'Model',
    readWriteHeader: 'Read / write tokens',
    efficiency: 'Efficiency',
    cacheReadHeatmap: 'Cache read',
    inputHeatmap: 'Input',
    less: 'Low',
    more: 'High',
    rankHeader: '#',
    apiKeyHash: 'API key hash',
    hitRate: 'Hit rate',
    cacheReadHeader: 'Cache read',
    cacheWriteHeader: 'Cache write',
    requestsHeader: 'Requests',
    weekdayLabels: ['', 'Mon', '', 'Wed', '', 'Fri', ''],
  },
  zh: {
    yHitRate: '命中率',
    yTokens: 'Token 数',
    stats: '统计',
    cacheHitRateOverTime: '缓存命中率趋势',
    cacheReadVsWriteTrends: '缓存读写趋势',
    cacheEfficiencyByModel: '各模型缓存效率',
    cacheByClient: '各客户端缓存',
    cacheEfficiencyPerDev: '各开发者缓存效率',
    cacheEfficiencyPerDevDetail: '最后 90 天 · cache_read / (cache_read + input)',
    loading: '加载中…',
    lastNDays: (n: number) => `最后 ${n} 天`,
    nModels: (n: number) => `${n} 个模型`,
    nClients: (n: number) => `${n} 个客户端`,
    cacheHitRate: '缓存命中率',
    cacheReadTokens: '缓存读取 Token',
    cacheWriteTokens: '缓存写入 Token',
    totalRequests: '总请求数',
    ofRequests: (hit: string, total: string) => `${total} 个请求中 ${hit} 个命中`,
    noDailyCacheData: '暂无每日缓存数据',
    noModelCacheData: '暂无模型缓存数据',
    noClientCacheData: '暂无客户端缓存数据',
    failedToLoad: '缓存数据加载失败',
    allClients: '所有客户端',
    cacheReadLegend: '缓存读取',
    cacheWriteLegend: '缓存写入',
    modelHeader: '模型',
    readWriteHeader: '读取 / 写入 Token',
    efficiency: '效率',
    cacheReadHeatmap: '缓存读取',
    inputHeatmap: '输入',
    less: '低',
    more: '高',
    rankHeader: '#',
    apiKeyHash: 'API key 哈希',
    hitRate: '命中率',
    cacheReadHeader: '缓存读取',
    cacheWriteHeader: '缓存写入',
    requestsHeader: '请求数',
    weekdayLabels: ['', '周一', '', '周三', '', '周五', ''],
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

const HEATMAP_LABEL_W = 32;
const HEATMAP_TOP = 20;
const HEATMAP_GAP = 3;
const HEATMAP_LEVEL_OPACITY = [1, 0.3, 0.5, 0.75, 1];
const HEATMAP_COLOR = TOKEN_SERIES_COLORS.cacheRead;

function heatmapFill(level: number): string {
  return level === 0 ? 'var(--muted)' : HEATMAP_COLOR;
}

interface HeatmapEntry {
  clientId: string;
  apiKeyHash: string;
  day: string;
  cacheRead: number;
  inputTokens: number;
}

interface HeatmapDay {
  date: Date;
  key: string;
}

function heatmapWeeks(): HeatmapDay[][] {
  const today = snapshotNow();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (12 * 7 + today.getDay()));
  const totalDays = Math.round((today.getTime() - startDate.getTime()) / 86400000) + 1;
  const weeks: HeatmapDay[][] = [];
  let currentWeek: HeatmapDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    currentWeek.push({ date: d, key });
    if (d.getDay() === 6 || i === totalDays - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  return weeks;
}

function heatmapCellSize(width: number, weekCount: number): number {
  const fit = (width - HEATMAP_LABEL_W) / weekCount - HEATMAP_GAP;
  return Math.max(10, Math.min(28, Math.floor(fit)));
}

function CacheEfficiencyHeatmap({ t }: { t: Strings }) {
  const locale = useLocale();
  const { apiParam: traceVersionParam } = useTraceVersion();
  const [data, setData] = useState<HeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    day: string;
    efficiency: number;
    cacheRead: number;
    inputTokens: number;
    x: number;
    y: number;
  } | null>(null);
  const weeks = useMemo(() => heatmapWeeks(), []);
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({
    height: (width) => HEATMAP_TOP + 7 * (heatmapCellSize(width, weeks.length) + HEATMAP_GAP),
  });

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/cache/heatmap', traceVersionParam),
      );
      if (!r.ok) return;
      const d = await r.json();
      setData(d.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [traceVersionParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const clientList = (() => {
    const map = new Map<string, { apiKeyHash: string; totalCacheRead: number }>();
    for (const d of data) {
      const existing = map.get(d.clientId);
      if (existing) {
        existing.totalCacheRead += d.cacheRead;
      } else {
        map.set(d.clientId, {
          apiKeyHash: d.apiKeyHash,
          totalCacheRead: d.cacheRead,
        });
      }
    }
    return Array.from(map, ([id, { apiKeyHash, totalCacheRead }]) => ({
      id,
      apiKeyHash,
      totalCacheRead,
    })).toSorted((a, b) => b.totalCacheRead - a.totalCacheRead);
  })();

  const filteredData = selectedClient ? data.filter((d) => d.clientId === selectedClient) : data;

  const dayMap = new Map<string, { cacheRead: number; inputTokens: number }>();
  for (const d of filteredData) {
    const existing = dayMap.get(d.day);
    if (existing) {
      existing.cacheRead += d.cacheRead;
      existing.inputTokens += d.inputTokens;
    } else {
      dayMap.set(d.day, { cacheRead: d.cacheRead, inputTokens: d.inputTokens });
    }
  }

  if (loading) {
    return (
      <div>
        <SectionHeader label={t.cacheEfficiencyPerDev} detail={t.loading} />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (data.length === 0) return null;

  const cell = heatmapCellSize(dimensions.width, weeks.length);
  const step = cell + HEATMAP_GAP;

  return (
    <ExpandableChart
      title={t.cacheEfficiencyPerDev}
      subtitle={t.cacheEfficiencyPerDevDetail}
      actions={
        <ChartActions
          fileName="cache-efficiency-heatmap"
          onExportPng={() =>
            track('agentic_workload_cache_export_png', { chart: 'efficiency-heatmap' })
          }
        />
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <Select
          value={selectedClient === null ? 'all' : `client:${selectedClient}`}
          onValueChange={(v) => {
            const client = v === 'all' ? null : v.slice('client:'.length);
            setSelectedClient(client);
            track('agentic_workload_cache_client_changed', { client: client ?? 'all' });
          }}
        >
          <SelectTrigger aria-label={t.allClients}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.allClients}</SelectItem>
            {clientList.map((client) => (
              <SelectItem key={client.id} value={`client:${client.id}`}>
                {truncateHash(client.apiKeyHash)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div ref={setContainerRef} className="w-full min-w-0 overflow-x-auto">
        {dimensions.width > 0 && (
          <svg
            width={HEATMAP_LABEL_W + weeks.length * step}
            height={dimensions.height}
            role="img"
            aria-label={`${t.cacheEfficiencyPerDev}, ${t.cacheEfficiencyPerDevDetail}`}
            fontFamily={CHART_FONT_SANS}
            className="block"
            onMouseLeave={() => setHoveredCell(null)}
          >
            {t.weekdayLabels.map((label, i) =>
              label ? (
                <text
                  key={`wl-${i}`}
                  x={HEATMAP_LABEL_W - 6}
                  y={HEATMAP_TOP + i * step + cell / 2}
                  dominantBaseline="central"
                  textAnchor="end"
                  fontSize={px(CHART_TYPE.annotationSub)}
                  className="fill-muted-foreground"
                >
                  {label}
                </text>
              ) : null,
            )}

            {weeks.map((week, wi) => {
              const firstDay = week[0];
              if (firstDay.date.getDate() > 7 || wi === 0) return null;
              return (
                <text
                  key={`ml-${wi}`}
                  x={HEATMAP_LABEL_W + wi * step}
                  y={12}
                  fontSize={px(CHART_TYPE.annotationSub)}
                  className="fill-muted-foreground"
                >
                  {formatExplorerDateTime(firstDay.date, locale, { month: 'short' })}
                </text>
              );
            })}

            {weeks.map((week, wi) =>
              week.map((day) => {
                const entry = dayMap.get(day.key);
                const total = entry ? entry.cacheRead + entry.inputTokens : 0;
                const efficiency = entry && total > 0 ? entry.cacheRead / total : 0;
                const level = total === 0 ? 0 : Math.min(4, Math.ceil(efficiency * 4));
                const isHovered = hoveredCell?.day === day.key;
                return (
                  <rect
                    key={day.key}
                    x={HEATMAP_LABEL_W + wi * step}
                    y={HEATMAP_TOP + day.date.getDay() * step}
                    width={cell}
                    height={cell}
                    rx={2}
                    fill={heatmapFill(level)}
                    fillOpacity={HEATMAP_LEVEL_OPACITY[level]}
                    stroke={isHovered ? 'var(--foreground)' : 'none'}
                    strokeWidth={1.5}
                    style={{ cursor: entry ? 'pointer' : 'default' }}
                    onMouseMove={(e) => {
                      if (!entry) {
                        setHoveredCell(null);
                        return;
                      }
                      setHoveredCell({
                        day: day.key,
                        efficiency: efficiency * 100,
                        cacheRead: entry.cacheRead,
                        inputTokens: entry.inputTokens,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                  />
                );
              }),
            )}
          </svg>
        )}
      </div>

      {hoveredCell && (
        <FloatingTooltip x={hoveredCell.x} y={hoveredCell.y} placement="above">
          <ChartHoverCardBody
            title={hoveredCell.day}
            metrics={[{ value: `${hoveredCell.efficiency.toFixed(1)}%`, label: t.efficiency }]}
            summary={`${t.cacheReadHeatmap}: ${formatNumber(hoveredCell.cacheRead)} · ${t.inputHeatmap}: ${formatNumber(hoveredCell.inputTokens)}`}
          />
        </FloatingTooltip>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="mr-1 font-medium">{t.cacheHitRate}</span>
        <span>{t.less}</span>
        {HEATMAP_LEVEL_OPACITY.map((opacity, level) => (
          <span
            key={level}
            aria-hidden="true"
            className="size-3 rounded-sm"
            style={{ backgroundColor: heatmapFill(level), opacity }}
          />
        ))}
        <span>{t.more}</span>
      </div>
    </ExpandableChart>
  );
}

function ModelEfficiencyChart({ byModel, t }: { byModel: ModelCache[]; t: Strings }) {
  const sorted = [...byModel]
    .map((m) => {
      const eligible = m.cacheRead + m.inputTokens;
      const hitRate = eligible > 0 ? (m.cacheRead / eligible) * 100 : 0;
      return { ...m, hitRate };
    })
    .toSorted((a, b) => b.hitRate - a.hitRate);

  if (sorted.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noModelCacheData}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="mb-2 flex items-center gap-3 border-b border-border/30 pb-1.5 text-xs font-medium text-muted-foreground">
        <span className="w-32 shrink-0 sm:w-48">{t.modelHeader}</span>
        <span className="flex-1" />
        <span className="w-14 shrink-0 text-right">{t.hitRate}</span>
        <span className="hidden w-32 shrink-0 text-right sm:inline">{t.readWriteHeader}</span>
      </div>
      {sorted.map((m) => (
        <div
          key={m.model}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:flex"
        >
          <span
            className="min-w-0 sm:w-32 shrink-0 truncate text-xs text-foreground sm:w-48"
            title={m.model}
          >
            {m.model}
          </span>
          <div className="h-3 flex-1 max-sm:col-span-full max-sm:row-start-2 overflow-hidden rounded-sm bg-muted/40">
            <div
              className="h-full rounded-sm"
              style={{
                width: `${m.hitRate}%`,
                minWidth: m.hitRate > 0 ? 2 : 0,
                backgroundColor: TOKEN_SERIES_COLORS.cacheRead,
              }}
            />
          </div>
          <span className="sm:w-14 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-foreground">
            {m.hitRate.toFixed(1)}%
          </span>
          <span className="hidden w-32 shrink-0 text-right text-xs tabular-nums whitespace-nowrap text-muted-foreground sm:inline">
            {formatNumber(m.cacheRead)} / {formatNumber(m.cacheWrite)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ClientCacheTable({ byClient, t }: { byClient: ClientCache[]; t: Strings }) {
  const sorted = [...byClient]
    .map((u) => {
      const eligible = u.cacheRead + u.inputTokens;
      const hitRate = eligible > 0 ? (u.cacheRead / eligible) * 100 : 0;
      return { ...u, hitRate };
    })
    .toSorted((a, b) => b.hitRate - a.hitRate);

  if (sorted.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noClientCacheData}
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-muted-foreground text-left border-b border-border/20">
            <th className="py-1.5 px-2 font-medium text-xs">{t.rankHeader}</th>
            <th className="py-1.5 px-2 font-medium text-xs">{t.apiKeyHash}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.hitRate}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.cacheReadHeader}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.cacheWriteHeader}</th>
            <th className="py-1.5 px-2 font-medium text-xs text-right">{t.requestsHeader}</th>
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
              <td className="py-1.5 px-2 text-right font-medium">{u.hitRate.toFixed(1)}%</td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatNumber(u.cacheRead)}
              </td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatNumber(u.cacheWrite)}
              </td>
              <td className="py-1.5 px-2 text-right text-muted-foreground">
                {formatNumber(u.requestCount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CachePage() {
  return (
    <Suspense>
      <CachePageContent />
    </Suspense>
  );
}

function CachePageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading, error } = useDashboardData<CacheData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion('/api/v1/agentic-workload-explorer/cache', traceVersionParam),
        { signal },
      );
      if (!r.ok) throw new Error('Failed to fetch cache data');
      return r.json();
    },
    key: String(traceVersionParam),
  });

  const trends = useMemo(() => {
    const days = data?.daily.slice(-30) ?? [];
    const rates = days.map((d) => {
      const eligible = d.cacheRead + d.inputTokens;
      return { day: d.day, value: eligible > 0 ? (d.cacheRead / eligible) * 100 : 0 };
    });
    const lowest = Math.min(...rates.map((r) => r.value), 100);
    const hitRate: LineSeries[] = [
      {
        key: 'hitRate',
        label: t.cacheHitRate,
        color: TOKEN_SERIES_COLORS.cacheRead,
        points: rates,
      },
    ];
    const readWrite: LineSeries[] = [
      {
        key: 'cacheRead',
        label: t.cacheReadLegend,
        color: TOKEN_SERIES_COLORS.cacheRead,
        points: days.map((d) => ({ day: d.day, value: d.cacheRead })),
      },
      {
        key: 'cacheWrite',
        label: t.cacheWriteLegend,
        color: TOKEN_SERIES_COLORS.cacheWrite,
        points: days.map((d) => ({ day: d.day, value: d.cacheWrite })),
      },
    ];
    return { hitRate, hitRateMin: Math.max(0, Math.floor((lowest - 5) / 10) * 10), readWrite };
  }, [data, t]);

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
            <Stat
              boxed
              label={t.cacheHitRate}
              value={`${data.stats.hitRate.toFixed(1)}%`}
              detail={t.ofRequests(
                formatNumber(data.stats.cacheHitRequests),
                formatNumber(data.stats.totalRequests),
              )}
            />
            <Stat boxed label={t.cacheReadTokens} value={formatNumber(data.stats.totalCacheRead)} />
            <Stat
              boxed
              label={t.cacheWriteTokens}
              value={formatNumber(data.stats.totalCacheWrite)}
            />
            <Stat boxed label={t.totalRequests} value={formatNumber(data.stats.totalRequests)} />
          </dl>
        )}
      </div>

      {data && (
        <>
          <TrendsLineChart
            title={t.cacheHitRateOverTime}
            subtext={t.lastNDays(Math.min(data.daily.length, 30))}
            series={trends.hitRate}
            yFormatter={formatAxisPercent}
            yLabel={t.yHitRate}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            yMin={trends.hitRateMin}
            yCeiling={100}
            filename="cache-hit-rate"
            emptyLabel={t.noDailyCacheData}
          />

          <TrendsLineChart
            title={t.cacheReadVsWriteTrends}
            subtext={t.lastNDays(Math.min(data.daily.length, 30))}
            series={trends.readWrite}
            yFormatter={formatAxisNumber}
            yLabel={t.yTokens}
            xFormatter={(day: string) => formatDayLabel(day, locale)}
            filename="cache-read-vs-write"
            emptyLabel={t.noDailyCacheData}
          />

          <div>
            <SectionHeader
              label={t.cacheEfficiencyByModel}
              detail={t.nModels(data.byModel.length)}
            />
            <Card>
              <ModelEfficiencyChart byModel={data.byModel} t={t} />
            </Card>
          </div>

          <div>
            <SectionHeader label={t.cacheByClient} detail={t.nClients(data.byClient.length)} />
            <Card>
              <ClientCacheTable byClient={data.byClient} t={t} />
            </Card>
          </div>

          <CacheEfficiencyHeatmap t={t} />
        </>
      )}
    </div>
  );
}
