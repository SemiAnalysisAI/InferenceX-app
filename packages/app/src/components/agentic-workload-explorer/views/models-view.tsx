'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/trends-charts';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import type {
  ModelsData,
  TokensByModel,
  ModelTimeSeries,
} from '@/lib/agentic-workload-explorer/api-types';
import { formatSnapshotDate } from '@/lib/agentic-workload-explorer/snapshot';
import { Expandable } from '@/components/agentic-workload-explorer/expandable-chart';

// ── i18n ────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    stats: 'Stats',
    modelsUsed: 'Models Used',
    totalTokens: 'Total Tokens',
    fastModePct: 'Fast Mode % (tokens)',
    cacheHitRatio: 'Cache Hit Ratio',
    failedToLoad: 'Failed to load model data',
    tokenDistByModel: 'Token Distribution by Model',
    input: 'input',
    cacheRead: 'cache_read',
    cacheWrite: 'cache_write',
    output: 'output',
    inputTooltip: (n: string) => `Input: ${n}`,
    cacheReadTooltip: (n: string) => `Cache Read: ${n}`,
    cacheWriteTooltip: (n: string) => `Cache Write: ${n}`,
    outputTooltip: (n: string) => `Output: ${n}`,
    fastModeAnalysis: 'Fast Mode Analysis',
    regular: 'regular',
    fast: 'fast',
    regularTooltip: (n: string) => `Regular: ${n}`,
    fastTooltip: (n: string) => `Fast: ${n}`,
    regFastDetail: (reg: string, fast: string) => `${reg} reg / ${fast} fast`,
    modelUsageOverTime: 'Model Usage Over Time',
    noTimeSeriesData: 'No time series data',
    requestsPerDay: 'Requests per day',
    requestsTooltip: (model: string, count: number, day: string) =>
      `${model}: ${count} requests (${day})`,
    inOut: (inp: string, out: string) => `${inp} in / ${out} out`,
    fastOfTotal: (fast: string, total: string) => `${fast} fast of ${total} tokens`,
    readEligible: (read: string, eligible: string) => `${read} read / ${eligible} eligible`,
    exportModelUsage: 'Model Usage Over Time',
  },
  zh: {
    stats: '统计',
    modelsUsed: '使用模型数',
    totalTokens: '总 Token 数',
    fastModePct: 'Fast Mode %（token）',
    cacheHitRatio: 'Cache 命中率',
    failedToLoad: '加载模型数据失败',
    tokenDistByModel: '按模型的 Token 分布',
    input: 'input',
    cacheRead: 'cache_read',
    cacheWrite: 'cache_write',
    output: 'output',
    inputTooltip: (n: string) => `Input: ${n}`,
    cacheReadTooltip: (n: string) => `Cache Read: ${n}`,
    cacheWriteTooltip: (n: string) => `Cache Write: ${n}`,
    outputTooltip: (n: string) => `Output: ${n}`,
    fastModeAnalysis: 'Fast Mode 分析',
    regular: '常规',
    fast: 'fast',
    regularTooltip: (n: string) => `Regular: ${n}`,
    fastTooltip: (n: string) => `Fast: ${n}`,
    regFastDetail: (reg: string, fast: string) => `${reg} reg / ${fast} fast`,
    modelUsageOverTime: '模型使用趋势',
    noTimeSeriesData: '暂无时序数据',
    requestsPerDay: '每日请求数',
    requestsTooltip: (model: string, count: number, day: string) =>
      `${model}: ${count} 次请求（${day}）`,
    inOut: (inp: string, out: string) => `${inp} in / ${out} out`,
    fastOfTotal: (fast: string, total: string) => `${fast} fast / ${total} token`,
    readEligible: (read: string, eligible: string) => `${read} read / ${eligible} 可用`,
    exportModelUsage: '模型使用趋势',
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function shortenModel(model: string): string {
  // Strip provider prefix (claude- / openai- / gpt- is left as-is since that's
  // the common-name root) and any trailing YYYYMMDD date suffix.
  return model.replace(/^claude-/u, '').replace(/-\d{8}$/u, '');
}

function buildModelColorMap(models: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < models.length; i++) {
    map[models[i]] = CHART_COLORS[i % CHART_COLORS.length];
  }
  return map;
}

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

// ── Token Distribution Bar ───────────────────────────────────────

function TokenDistribution({
  data,
  strings: s,
}: {
  data: TokensByModel[];
  strings: (typeof STRINGS)['en'];
}) {
  const sorted = useMemo(
    () =>
      [...data].toSorted((a, b) => {
        const totalA =
          Number(a.inputTokens) +
          Number(a.cacheReadInputTokens) +
          Number(a.cacheWriteTokens) +
          Number(a.outputTokens);
        const totalB =
          Number(b.inputTokens) +
          Number(b.cacheReadInputTokens) +
          Number(b.cacheWriteTokens) +
          Number(b.outputTokens);
        return totalB - totalA;
      }),
    [data],
  );

  const globalMax = useMemo(() => {
    let max = 0;
    for (const m of sorted) {
      const total =
        Number(m.inputTokens) +
        Number(m.cacheReadInputTokens) +
        Number(m.cacheWriteTokens) +
        Number(m.outputTokens);
      if (total > max) max = total;
    }
    return max;
  }, [sorted]);

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <SectionHeader label={s.tokenDistByModel} />
      <div className="space-y-2 mt-3">
        {/* Legend */}
        <div className="flex items-center gap-4 text-3xs font-mono text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500" /> {s.input}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" /> {s.cacheRead}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500" /> {s.cacheWrite}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-500" /> {s.output}
          </span>
        </div>
        {sorted.map((m) => {
          const input = Number(m.inputTokens);
          const cacheRead = Number(m.cacheReadInputTokens);
          const cacheWrite = Number(m.cacheWriteTokens);
          const output = Number(m.outputTokens);
          const total = input + cacheRead + cacheWrite + output;
          if (total === 0) return null;

          const pctInput = (input / total) * 100;
          const pctCacheRead = (cacheRead / total) * 100;
          const pctCacheWrite = (cacheWrite / total) * 100;
          const pctOutput = (output / total) * 100;
          const barWidth = globalMax > 0 ? (total / globalMax) * 100 : 0;

          return (
            <div key={m.model} className="flex items-center gap-3">
              <div
                className="w-28 shrink-0 text-2xs font-mono text-foreground truncate"
                title={m.model}
              >
                {shortenModel(m.model)}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="flex h-5 rounded overflow-hidden"
                  style={{ width: `${Math.max(barWidth, 2)}%` }}
                >
                  {pctInput > 0 && (
                    <div
                      className="bg-sky-500 h-full"
                      style={{ width: `${pctInput}%` }}
                      title={s.inputTooltip(formatNumber(input))}
                    />
                  )}
                  {pctCacheRead > 0 && (
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${pctCacheRead}%` }}
                      title={s.cacheReadTooltip(formatNumber(cacheRead))}
                    />
                  )}
                  {pctCacheWrite > 0 && (
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${pctCacheWrite}%` }}
                      title={s.cacheWriteTooltip(formatNumber(cacheWrite))}
                    />
                  )}
                  {pctOutput > 0 && (
                    <div
                      className="bg-violet-500 h-full"
                      style={{ width: `${pctOutput}%` }}
                      title={s.outputTooltip(formatNumber(output))}
                    />
                  )}
                </div>
              </div>
              <div className="w-16 shrink-0 text-right text-3xs font-mono text-muted-foreground">
                {formatNumber(total)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Fast Mode Analysis ───────────────────────────────────────────

function FastModeAnalysis({
  data,
  strings: s,
}: {
  data: TokensByModel[];
  strings: (typeof STRINGS)['en'];
}) {
  const fastModels = useMemo(() => data.filter((m) => Number(m.fastModeCount) > 0), [data]);

  const maxTokens = useMemo(() => {
    let max = 0;
    for (const m of fastModels) {
      const regular =
        Number(m.inputTokens) -
        Number(m.fastInputTokens) +
        (Number(m.outputTokens) - Number(m.fastOutputTokens)) +
        (Number(m.cacheReadInputTokens) - Number(m.fastCacheReadInputTokens)) +
        (Number(m.cacheWriteTokens) - Number(m.fastCacheWriteTokens));
      const fast =
        Number(m.fastInputTokens) +
        Number(m.fastOutputTokens) +
        Number(m.fastCacheReadInputTokens) +
        Number(m.fastCacheWriteTokens);
      const total = regular + fast;
      if (total > max) max = total;
    }
    return max;
  }, [fastModels]);

  if (fastModels.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <SectionHeader label={s.fastModeAnalysis} />
      <div className="space-y-3 mt-3">
        {/* Legend */}
        <div className="flex items-center gap-4 text-3xs font-mono text-muted-foreground mb-1">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted" /> {s.regular}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500" /> {s.fast}
          </span>
        </div>
        {fastModels.map((m) => {
          const regularTokens =
            Number(m.inputTokens) -
            Number(m.fastInputTokens) +
            (Number(m.outputTokens) - Number(m.fastOutputTokens)) +
            (Number(m.cacheReadInputTokens) - Number(m.fastCacheReadInputTokens)) +
            (Number(m.cacheWriteTokens) - Number(m.fastCacheWriteTokens));
          const fastTokens =
            Number(m.fastInputTokens) +
            Number(m.fastOutputTokens) +
            Number(m.fastCacheReadInputTokens) +
            Number(m.fastCacheWriteTokens);
          const total = regularTokens + fastTokens;
          const barScale = maxTokens > 0 ? (total / maxTokens) * 100 : 0;
          const regularPct = total > 0 ? (regularTokens / total) * 100 : 0;
          const fastPct = total > 0 ? (fastTokens / total) * 100 : 0;

          return (
            <div key={m.model} className="flex items-center gap-3">
              <div
                className="w-28 shrink-0 text-2xs font-mono text-foreground truncate"
                title={m.model}
              >
                {shortenModel(m.model)}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="flex h-5 rounded overflow-hidden"
                  style={{ width: `${Math.max(barScale, 2)}%` }}
                >
                  {regularPct > 0 && (
                    <div
                      className="bg-muted h-full"
                      style={{ width: `${regularPct}%` }}
                      title={s.regularTooltip(formatNumber(regularTokens))}
                    />
                  )}
                  {fastPct > 0 && (
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${fastPct}%` }}
                      title={s.fastTooltip(formatNumber(fastTokens))}
                    />
                  )}
                </div>
              </div>
              <div className="w-36 shrink-0 text-right text-3xs font-mono text-muted-foreground">
                {s.regFastDetail(formatNumber(regularTokens), formatNumber(fastTokens))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Model Usage Over Time (SVG stacked bar chart) ────────────────

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

function ModelUsageChart({
  timeSeries,
  colorMap,
  allModels,
  strings: s,
}: {
  timeSeries: ModelTimeSeries[];
  colorMap: Record<string, string>;
  allModels: string[];
  strings: (typeof STRINGS)[keyof typeof STRINGS];
}) {
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const { days, maxY, yTicks } = useMemo(() => {
    // Group by day
    const dayMap = new Map<string, Record<string, number>>();
    for (const entry of timeSeries) {
      if (!dayMap.has(entry.day)) dayMap.set(entry.day, {});
      const dayData = dayMap.get(entry.day)!;
      dayData[entry.model] = (dayData[entry.model] || 0) + Number(entry.requestCount);
    }

    // Sort days
    // Days arrive as Date strings ("Wed Aug 26 2026 …"), so sort by time.
    const sortedDays = [...dayMap.keys()].toSorted((a, b) => Date.parse(a) - Date.parse(b));

    // Compute max stacked total
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
      <div className="rounded-md border border-border bg-surface p-3">
        <SectionHeader label={s.modelUsageOverTime} />
        <div className="flex items-center justify-center h-40 text-2xs font-mono text-muted-foreground">
          {s.noTimeSeriesData}
        </div>
      </div>
    );
  }

  const barWidth = Math.max(1, PLOT_W / days.length - 2);
  const barGap = PLOT_W / days.length - barWidth;

  const sx = (i: number) => MARGIN.left + i * (barWidth + barGap) + barGap / 2;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / maxY) * PLOT_H;

  // Show up to ~6 x-axis labels
  const labelInterval = Math.max(1, Math.floor(days.length / 6));

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <SectionHeader label={s.modelUsageOverTime} />
        <ExportPngButton
          locale={locale}
          onClick={() => {
            track('agentic_workload_model_usage_export');
            if (svgRef.current)
              exportSvgToPng(svgRef.current, {
                title: s.exportModelUsage,
                filename: 'model-usage-over-time.png',
                svgWidth: CHART_W,
                svgHeight: CHART_H,
              });
          }}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-3xs font-mono text-muted-foreground mb-2">
        {allModels.map((model) => (
          <span key={model} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: colorMap[model] }}
            />
            {shortenModel(model)}
          </span>
        ))}
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full">
        {/* Y-axis grid lines + labels */}
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
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              }}
            >
              {formatAxisValue(t)}
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

          for (const model of allModels) {
            const count = data[model] || 0;
            if (count === 0) continue;
            const barH = (count / maxY) * PLOT_H;
            rects.push(
              <rect
                key={`${day}-${model}`}
                x={sx(i)}
                y={sy(yOffset + count)}
                width={barWidth}
                height={barH}
                fill={colorMap[model]}
                rx={1}
              >
                <title>
                  {s.requestsTooltip(shortenModel(model), count, formatSnapshotDate(day))}
                </title>
              </rect>,
            );
            yOffset += count;
          }

          return <g key={day}>{rects}</g>;
        })}

        {/* X-axis labels */}
        {days.map(({ day }, i) => {
          if (i % labelInterval !== 0 && i !== days.length - 1) return null;
          // Format as MM/DD
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
          {s.requestsPerDay}
        </text>
      </svg>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────

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

  const colorMap = useMemo(() => buildModelColorMap(allModels), [allModels]);

  // ── Compute stats ────────────────────────────────────────────
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

  // Token share: tokensByModel covers all time, while timeSeries covers only
  // recent days, so a request share would mix windows.
  const fastModePct = totalTokens > 0 ? ((totalFastTokens / totalTokens) * 100).toFixed(1) : '0';

  const cacheHitRatio =
    totalCacheRead + totalInput > 0
      ? ((totalCacheRead / (totalCacheRead + totalInput)) * 100).toFixed(1)
      : '0';

  return (
    <div className="space-y-5">
      {/* Stats */}
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
            <StatCard
              label={t.modelsUsed}
              value={String(data.tokensByModel.length)}
              detail={allModels.map(shortenModel).join(', ')}
            />
            <StatCard
              label={t.totalTokens}
              value={formatNumber(totalTokens)}
              detail={t.inOut(formatNumber(totalInput), formatNumber(totalOutput))}
            />
            <StatCard
              label={t.fastModePct}
              value={`${fastModePct}%`}
              detail={t.fastOfTotal(formatNumber(totalFastTokens), formatNumber(totalTokens))}
            />
            <StatCard
              label={t.cacheHitRatio}
              value={`${cacheHitRatio}%`}
              detail={t.readEligible(
                formatNumber(totalCacheRead),
                formatNumber(totalCacheRead + totalInput),
              )}
            />
          </div>
        ) : (
          <div className="text-sm font-mono text-muted-foreground text-center py-8">
            {t.failedToLoad}
          </div>
        )}
      </div>

      {data && (
        <>
          {/* Token Distribution */}
          {data.tokensByModel.length > 0 && (
            <TokenDistribution data={data.tokensByModel} strings={t} />
          )}

          {/* Fast Mode Analysis */}
          <FastModeAnalysis data={data.tokensByModel} strings={t} />

          {/* Model Usage Over Time */}
          <Expandable title={t.modelUsageOverTime}>
            <ModelUsageChart
              timeSeries={data.timeSeries}
              colorMap={colorMap}
              allModels={allModels}
              strings={t}
            />
          </Expandable>
        </>
      )}
    </div>
  );
}
