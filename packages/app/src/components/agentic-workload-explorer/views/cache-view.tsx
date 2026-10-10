'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber, truncateHash } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  CacheData,
  DailyCache,
  ModelCache,
  ClientCache,
} from '@/lib/agentic-workload-explorer/api-types';
import { snapshotNow } from '@/lib/agentic-workload-explorer/snapshot';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';

const STRINGS = {
  en: {
    stats: 'Stats',
    cacheHitRateOverTime: 'Cache Hit Rate Over Time',
    cacheReadVsWriteTrends: 'Cache Read vs Write Trends',
    cacheReadVsWrite: 'Cache Read vs Write',
    cacheEfficiencyByModel: 'Cache Efficiency by Model',
    cacheByClient: 'Cache by Client',
    cacheEfficiencyPerDev: 'Cache Efficiency per Developer',
    cacheEfficiencyPerDevDetail: 'final 90 days · cache_read / (cache_read + input)',
    loading: 'loading...',
    lastNDays: (n: number) => `last ${n} days`,
    nModels: (n: number) => `${n} model${n === 1 ? '' : 's'}`,
    nClients: (n: number) => `${n} client${n === 1 ? '' : 's'}`,
    cacheHitRate: 'Cache Hit Rate',
    cacheReadTokens: 'Cache Read Tokens',
    cacheWriteTokens: 'Cache Write Tokens',
    totalRequests: 'Total Requests',
    ofRequests: (hit: string, total: string) => `${hit} of ${total} requests`,
    noDailyCacheData: 'No daily cache data available',
    noModelCacheData: 'No model cache data available',
    noClientCacheData: 'No client cache data available',
    failedToLoad: 'Failed to load cache data.',
    allClients: 'All clients',
    cacheReadLegend: 'cache read',
    cacheWriteLegend: 'cache write',
    efficiency: 'Efficiency',
    cacheReadHeatmap: 'Cache Read',
    inputHeatmap: 'Input',
    less: 'Less',
    more: 'More',
    rankHeader: '#',
    apiKeyHash: 'API Key Hash',
    hitRate: 'Hit Rate',
    cacheReadHeader: 'Cache Read',
    cacheWriteHeader: 'Cache Write',
    requestsHeader: 'Requests',
  },
  zh: {
    stats: '统计',
    cacheHitRateOverTime: '缓存命中率趋势',
    cacheReadVsWriteTrends: '缓存读写趋势',
    cacheReadVsWrite: '缓存读取 vs 写入',
    cacheEfficiencyByModel: '各模型缓存效率',
    cacheByClient: '各客户端缓存',
    cacheEfficiencyPerDev: '各开发者缓存效率',
    cacheEfficiencyPerDevDetail: '最后 90 天 · cache_read / (cache_read + input)',
    loading: '加载中...',
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
    failedToLoad: '缓存数据加载失败。',
    allClients: '所有客户端',
    cacheReadLegend: '缓存读取',
    cacheWriteLegend: '缓存写入',
    efficiency: '效率',
    cacheReadHeatmap: '缓存读取',
    inputHeatmap: '输入',
    less: '低',
    more: '高',
    rankHeader: '#',
    apiKeyHash: 'API Key Hash',
    hitRate: '命中率',
    cacheReadHeader: '缓存读取',
    cacheWriteHeader: '缓存写入',
    requestsHeader: '请求数',
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

// -- Chart constants ──────────────────────────────────────────────

const CHART_W = 600;
const CHART_H = 200;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 56 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

const SVG_FONT = 'var(--font-mono, ui-monospace, monospace)';
const SVG_FONT_SIZE = '9px';

// -- Helpers ──────────────────────────────────────────────────────

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

function formatAxisValue(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function truncateModel(model: string, maxLen = 32): string {
  if (model.length <= maxLen) return model;
  return `${model.slice(0, maxLen - 1)}...`;
}

// -- Cache Efficiency Contribution Heatmap ────────────────────────

interface HeatmapEntry {
  clientId: string;
  apiKeyHash: string;
  day: string;
  cacheRead: number;
  inputTokens: number;
}

const HEATMAP_COLORS = [
  'var(--color-border)', // level 0: no data
  '#065f46', // level 1: 0-25%
  '#047857', // level 2: 25-50%
  '#059669', // level 3: 50-75%
  '#10b981', // level 4: 75-100%
];

function CacheEfficiencyHeatmap({ t }: { t: Strings }) {
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
    width: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Get unique clients sorted by total cache read desc
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

  // Filter data for selected client (or show all merged)
  const filteredData = selectedClient ? data.filter((d) => d.clientId === selectedClient) : data;

  // Build day -> efficiency map (merge across clients if no filter)
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

  // Build 13-week grid (91 days)
  const today = snapshotNow();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0=Sun
  const endDate = new Date(today);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (12 * 7 + dayOfWeek));

  const CELL_SIZE = 13;
  const CELL_GAP = 2;
  const LABEL_W = 28;
  const weeks: { date: Date; key: string }[][] = [];
  let currentWeek: { date: Date; key: string }[] = [];

  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
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
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const svgW = LABEL_W + weeks.length * (CELL_SIZE + CELL_GAP);
  const svgH = 7 * (CELL_SIZE + CELL_GAP) + 20; // +20 for month labels

  const weekdayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  if (loading) {
    return (
      <div>
        <SectionHeader label={t.cacheEfficiencyPerDev} detail={t.loading} />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <div>
      <SectionHeader label={t.cacheEfficiencyPerDev} detail={t.cacheEfficiencyPerDevDetail} />
      <Expandable title={t.cacheEfficiencyPerDev} subtitle={t.cacheEfficiencyPerDevDetail} corner>
        <div className="rounded-md border border-border bg-surface p-3">
          {/* Client selector */}
          <div className="flex items-center gap-2 mb-3">
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

          {/* Heatmap */}
          <div ref={containerRef} className="overflow-x-auto relative">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="block w-full max-w-[640px]">
              {/* Weekday labels */}
              {weekdayLabels.map((label, i) =>
                label ? (
                  <text
                    key={`wl-${i}`}
                    x={LABEL_W - 4}
                    y={20 + i * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2 + 3}
                    textAnchor="end"
                    fill="var(--muted)"
                    fontSize="8px"
                    fontFamily="var(--font-mono, ui-monospace, monospace)"
                  >
                    {label}
                  </text>
                ) : null,
              )}

              {/* Month labels */}
              {weeks.map((week, wi) => {
                const firstDay = week[0];
                if (firstDay.date.getDate() <= 7 && wi > 0) {
                  return (
                    <text
                      key={`ml-${wi}`}
                      x={LABEL_W + wi * (CELL_SIZE + CELL_GAP)}
                      y={12}
                      fill="var(--muted)"
                      fontSize="8px"
                      fontFamily="var(--font-mono, ui-monospace, monospace)"
                    >
                      {firstDay.date.toLocaleDateString('en-US', {
                        month: 'short',
                      })}
                    </text>
                  );
                }
                return null;
              })}

              {/* Cells */}
              {weeks.map((week, wi) =>
                week.map((day) => {
                  const dow = day.date.getDay();
                  const x = LABEL_W + wi * (CELL_SIZE + CELL_GAP);
                  const y = 20 + dow * (CELL_SIZE + CELL_GAP);
                  const entry = dayMap.get(day.key);
                  const total = entry ? entry.cacheRead + entry.inputTokens : 0;
                  const efficiency = total > 0 ? entry!.cacheRead / total : 0;
                  const level = !entry || total === 0 ? 0 : Math.min(4, Math.ceil(efficiency * 4));

                  return (
                    <rect
                      key={day.key}
                      x={x}
                      y={y}
                      width={CELL_SIZE}
                      height={CELL_SIZE}
                      rx={2}
                      fill={HEATMAP_COLORS[level]}
                      opacity={level === 0 ? 0.4 : 0.85}
                      style={{ cursor: entry ? 'pointer' : 'default' }}
                      onMouseEnter={(e) => {
                        if (!entry) return;
                        const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        if (!svgRect) return;
                        setHoveredCell({
                          day: day.key,
                          efficiency: efficiency * 100,
                          cacheRead: entry.cacheRead,
                          inputTokens: entry.inputTokens,
                          x: e.clientX - svgRect.left,
                          y: e.clientY - svgRect.top,
                          width: svgRect.width,
                        });
                      }}
                      onMouseLeave={() => setHoveredCell(null)}
                    />
                  );
                }),
              )}
            </svg>

            {/* Tooltip */}
            {hoveredCell && (
              <div
                className="absolute pointer-events-none z-50 bg-background border border-border rounded-md shadow-lg px-2.5 py-1.5"
                style={{
                  left: Math.min(hoveredCell.x + 12, hoveredCell.width - 180),
                  top: hoveredCell.y - 8,
                  transform: 'translateY(-100%)',
                }}
              >
                <div className="text-3xs font-mono font-medium text-foreground">
                  {hoveredCell.day}
                </div>
                <div className="text-3xs font-mono text-muted-foreground">
                  {t.efficiency}: {hoveredCell.efficiency.toFixed(1)}%
                </div>
                <div className="text-3xs font-mono text-muted-foreground">
                  {t.cacheReadHeatmap}: {formatNumber(hoveredCell.cacheRead)} · {t.inputHeatmap}:{' '}
                  {formatNumber(hoveredCell.inputTokens)}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-3xs font-mono text-muted-foreground">{t.less}</span>
            {HEATMAP_COLORS.map((color, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: color, opacity: i === 0 ? 0.4 : 0.85 }}
              />
            ))}
            <span className="text-3xs font-mono text-muted-foreground">{t.more}</span>
          </div>
        </div>
      </Expandable>
    </div>
  );
}

// -- Section header ───────────────────────────────────────────────

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

// -- Stat card ────────────────────────────────────────────────────

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

// -- Cache Hit Rate Over Time (SVG line chart) ────────────────────

function HitRateChart({ daily, t }: { daily: DailyCache[]; t: Strings }) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const data = daily.slice(-30);
  if (data.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noDailyCacheData}
      </div>
    );
  }

  const rates = data.map((d) => {
    const eligible = d.cacheRead + d.inputTokens;
    return eligible > 0 ? (d.cacheRead / eligible) * 100 : 0;
  });

  const yMax = 100;
  const yTicks = [0, 25, 50, 75, 100];

  const sx = (i: number) => MARGIN.left + (i / Math.max(data.length - 1, 1)) * PLOT_W;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  const pathD = rates
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(2)},${sy(r).toFixed(2)}`)
    .join(' ');

  const areaD = `${pathD} L${sx(rates.length - 1).toFixed(2)},${sy(0).toFixed(2)} L${sx(0).toFixed(2)},${sy(0).toFixed(2)} Z`;

  const labelInterval = Math.max(1, Math.ceil(data.length / 6));

  return (
    <Expandable title={t.cacheHitRate}>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-end mb-2">
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: 'Cache Hit Rate',
                  filename: 'cache-hit-rate.png',
                  svgWidth: CHART_W,
                  svgHeight: CHART_H,
                });
              track('agentic_workload_cache_export_png', { chart: 'hit-rate' });
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
                {tick}%
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
          <path d={areaD} fill="#10b981" fillOpacity={0.1} />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#10b981" strokeWidth={1.5} strokeLinejoin="round" />

          {/* Data points */}
          {rates.map((r, i) => (
            <circle key={data[i].day} cx={sx(i)} cy={sy(r)} r={2} fill="#10b981">
              <title>
                {data[i].day}: {r.toFixed(1)}%
              </title>
            </circle>
          ))}

          {/* X-axis labels */}
          {data.map((d, i) => {
            if (i % labelInterval !== 0 && i !== data.length - 1) return null;
            return (
              <text
                key={d.day}
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

// -- Cache Read vs Write Trends (SVG grouped bar chart) ───────────

function ReadWriteChart({ daily, t }: { daily: DailyCache[]; t: Strings }) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const data = daily.slice(-30);
  if (data.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noDailyCacheData}
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => Math.max(d.cacheRead, d.cacheWrite)), 1);
  const yTicks = generateTicks(0, maxVal, 5);
  const yMax = yTicks.at(-1) || maxVal;

  const groupWidth = PLOT_W / data.length;
  const barWidth = Math.max(1, (groupWidth - 4) / 2);
  const groupGap = groupWidth - barWidth * 2;

  const sx = (i: number, bar: 0 | 1) =>
    MARGIN.left + i * groupWidth + groupGap / 2 + bar * barWidth;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;

  const labelInterval = Math.max(1, Math.ceil(data.length / 6));

  return (
    <Expandable title={t.cacheReadVsWrite}>
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between mb-2">
          {/* Legend */}
          <div className="flex items-center gap-4 text-3xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />{' '}
              {t.cacheReadLegend}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500" />{' '}
              {t.cacheWriteLegend}
            </span>
          </div>
          <ExportPngButton
            locale={locale}
            onClick={() => {
              if (svgRef.current)
                exportSvgToPng(svgRef.current, {
                  title: 'Cache Read vs Write',
                  filename: 'cache-read-vs-write.png',
                  svgWidth: CHART_W,
                  svgHeight: CHART_H,
                });
              track('agentic_workload_cache_export_png', { chart: 'read-vs-write' });
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

          {/* Grouped bars */}
          {data.map((d, i) => (
            <g key={d.day}>
              {/* Cache Read bar */}
              <rect
                x={sx(i, 0)}
                y={sy(d.cacheRead)}
                width={barWidth}
                height={Math.max((d.cacheRead / yMax) * PLOT_H, 0.5)}
                fill="#10b981"
                rx={1}
              >
                <title>
                  {d.day} read: {formatNumber(d.cacheRead)}
                </title>
              </rect>
              {/* Cache Write bar */}
              <rect
                x={sx(i, 1)}
                y={sy(d.cacheWrite)}
                width={barWidth}
                height={Math.max((d.cacheWrite / yMax) * PLOT_H, 0.5)}
                fill="#f59e0b"
                rx={1}
              >
                <title>
                  {d.day} write: {formatNumber(d.cacheWrite)}
                </title>
              </rect>
              {/* X-axis label */}
              {(i % labelInterval === 0 || i === data.length - 1) && (
                <text
                  x={sx(i, 0) + barWidth}
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
              )}
            </g>
          ))}
        </svg>
      </div>
    </Expandable>
  );
}

// -- Cache Efficiency by Model (horizontal bars) ──────────────────

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
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noModelCacheData}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((m) => (
        <div key={m.model} className="flex items-center gap-2">
          <span
            className="text-2xs font-mono text-foreground shrink-0 w-[120px] sm:w-[200px] truncate"
            title={m.model}
          >
            {truncateModel(m.model)}
          </span>
          <div className="flex-1 h-4 bg-border/30 rounded-sm overflow-hidden relative">
            <div
              className="h-full bg-emerald-500 rounded-sm"
              style={{ width: `${Math.max(m.hitRate, 1)}%` }}
            />
          </div>
          <span className="text-2xs font-mono text-foreground shrink-0 w-[64px] text-right">
            {m.hitRate.toFixed(1)}%
          </span>
          <span className="hidden sm:inline text-3xs font-mono text-muted-foreground shrink-0 w-[120px] text-right">
            {formatNumber(m.cacheRead)} / {formatNumber(m.cacheWrite)}
          </span>
        </div>
      ))}
    </div>
  );
}

// -- Cache by Client Table ──────────────────────────────────────────

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
      <div className="text-xs font-mono text-muted-foreground text-center py-8">
        {t.noClientCacheData}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-2xs">
        <thead>
          <tr className="text-muted-foreground text-left border-b border-border">
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow">
              {t.rankHeader}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow">
              {t.apiKeyHash}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
              {t.hitRate}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
              {t.cacheReadHeader}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
              {t.cacheWriteHeader}
            </th>
            <th className="py-1.5 px-2 font-bold text-3xs uppercase tracking-eyebrow text-right">
              {t.requestsHeader}
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
              <td className="py-1.5 px-2 text-right font-bold">{u.hitRate.toFixed(1)}%</td>
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

// -- Main page ────────────────────────────────────────────────────

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

  return (
    <div className="space-y-6">
      {/* -- Stats ───────────────────────────────────────────────── */}
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
            <StatCard
              label={t.cacheHitRate}
              value={`${data.stats.hitRate.toFixed(1)}%`}
              detail={t.ofRequests(
                formatNumber(data.stats.cacheHitRequests),
                formatNumber(data.stats.totalRequests),
              )}
            />
            <StatCard label={t.cacheReadTokens} value={formatNumber(data.stats.totalCacheRead)} />
            <StatCard label={t.cacheWriteTokens} value={formatNumber(data.stats.totalCacheWrite)} />
            <StatCard label={t.totalRequests} value={formatNumber(data.stats.totalRequests)} />
          </div>
        )}
      </div>

      {data && (
        <>
          {/* -- Cache Hit Rate Over Time ──────────────────────────── */}
          <div>
            <SectionHeader
              label={t.cacheHitRateOverTime}
              detail={t.lastNDays(Math.min(data.daily.length, 30))}
            />
            <HitRateChart daily={data.daily} t={t} />
          </div>

          {/* -- Cache Read vs Write Trends ────────────────────────── */}
          <div>
            <SectionHeader
              label={t.cacheReadVsWriteTrends}
              detail={t.lastNDays(Math.min(data.daily.length, 30))}
            />
            <ReadWriteChart daily={data.daily} t={t} />
          </div>

          {/* -- Cache Efficiency by Model ─────────────────────────── */}
          <div>
            <SectionHeader
              label={t.cacheEfficiencyByModel}
              detail={t.nModels(data.byModel.length)}
            />
            <div className="rounded-md border border-border bg-surface p-3">
              <ModelEfficiencyChart byModel={data.byModel} t={t} />
            </div>
          </div>

          {/* -- Cache by Client ─────────────────────────────────────── */}
          <div>
            <SectionHeader label={t.cacheByClient} detail={t.nClients(data.byClient.length)} />
            <div className="rounded-md border border-border bg-surface p-3">
              <ClientCacheTable byClient={data.byClient} t={t} />
            </div>
          </div>

          {/* -- Cache Efficiency Contribution Heatmap ────────────── */}
          <CacheEfficiencyHeatmap t={t} />
        </>
      )}
    </div>
  );
}
