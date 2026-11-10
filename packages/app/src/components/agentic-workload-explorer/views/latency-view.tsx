'use client';

import { Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { scaleBand, scaleLinear } from 'd3';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import {
  ChartHoverCardBody,
  type ChartHoverCardMetricItem,
} from '@/components/ui/chart-hover-card';
import { useDashboardData } from '@/hooks/agentic-workload-explorer/use-dashboard-data';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import {
  formatNumber,
  formatDuration,
  formatPrefillSpeed,
  formatPrefillSpeedCompact,
} from '@/lib/agentic-workload-explorer/format';
import { useModelFilter } from '@/hooks/agentic-workload-explorer/use-model-filter';
import { ModelFilter } from '@/components/agentic-workload-explorer/model-filter';
import {
  useTraceVersion,
  appendTraceVersion,
} from '@/hooks/agentic-workload-explorer/use-trace-version';
import type {
  GraphHistogram,
  PerformancePercentileStats,
} from '@/lib/agentic-workload-explorer/api-types';
import { SectionHeader } from '@/components/agentic-workload-explorer/section-header';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import {
  ChartActions,
  ExpandContext,
  Expandable,
  ExpandableChart,
  ExpandTrigger,
} from '@/components/agentic-workload-explorer/expandable-chart';
import { DistributionHistogram } from '@/components/agentic-workload-explorer/distribution-histogram';
import {
  formatAxisNumber,
  formatHourLabel,
  TrendsLineChart,
  type LineSeries,
} from '@/components/agentic-workload-explorer/trends-charts';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { HideSmallToggle } from '@/components/agentic-workload-explorer/hide-small-toggle';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { CURSOR_LINE_PROPS } from '@/lib/d3-chart/cursor';
import { readableTextColor } from '@/lib/d3-chart/contrast-colors';
import { chartFont, measureTextWidth, useFontsVersion } from '@/lib/d3-chart/dynamic-margins';

interface StreamingStats {
  p50: number;
  p95: number;
  avg: number;
  count: number;
}

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  requestsToday: number;
  streaming: StreamingStats;
  nonStreaming: StreamingStats;
}

interface CacheReadBucket {
  bucket: number;
  count: number;
  p50: number;
  p95: number;
  p90: number;
  avg: number;
}

interface HeatmapCell {
  readBucket: number;
  writeBucket: number;
  count: number;
  p90: number;
}

interface HeatmapByOutputCell {
  readBucket: number;
  writeBucket: number;
  outputBucket: number;
  count: number;
  p90: number;
}

interface InteractivityCell {
  cacheTotalBucket: number;
  outputBucket: number;
  count: number;
  p90Interactivity: number;
}

interface LatencyData {
  stats: LatencyStats;
  distribution: GraphHistogram;
  hourly: { hour: string; p50: number; p95: number; avg: number; count: number }[];
  byModel: { model: string; p50: number; p95: number; avg: number; count: number }[];
  cacheReadVsLatency: CacheReadBucket[];
  cacheHeatmap: HeatmapCell[];
  cacheHeatmapByOutput: HeatmapByOutputCell[];
  ttftDistribution: GraphHistogram;
  tpotDistribution: GraphHistogram;
  ttftStats: PerformancePercentileStats;
  tpotStats: PerformancePercentileStats;
  cacheHeatmapTTFT: HeatmapCell[];
  cacheHeatmapPrefillSpeed: HeatmapCell[];
  prefillSpeedDistribution: GraphHistogram;
  prefillSpeedStats: PerformancePercentileStats;
  cacheTotalVsOutputInteractivity: InteractivityCell[];
  interactivityDistribution: GraphHistogram;
}

const STRINGS = {
  en: {
    yLatency: 'Latency',
    stats: 'Stats',
    distributions: 'Distributions',
    failedToLoad: 'Failed to load latency data',
    e2eMedian: 'E2E median (p50)',
    e2eP95: 'E2E p95',
    e2eP99: 'E2E p99',
    noE2eDistribution: 'No E2E latency distribution data available',
    noData: 'No data available',
    noHourlyData: 'No hourly E2E latency data available',
    noModelData: 'No model E2E latency data available',
    streaming: 'Streaming',
    nonStreaming: 'Non-streaming',
    medianP50: 'Median (p50)',
    p95: 'P95',
    average: 'Average',
    requestsLabel: 'Requests',
    hiddenCells: 'Under 5 requests, hidden',
    colorScale: 'Color scale',
    hoverRead: 'read',
    hoverWrite: 'write',
    hoverOutput: 'output',
    hoverCacheTotal: 'cache total',
    global: 'Global',
    local: 'Local',
    cacheHeatmapLabel: 'Cache read × write → p90 E2E latency',
    cacheHeatmapDetail: 'heatmap',
    facetedLabel: 'Cache × output → p90 E2E latency',
    facetedDetail: 'faceted by output tokens',
    cacheTtftLabel: 'Cache read × write → p90 TTFT',
    cacheTtftDetail: 'streaming requests only',
    cachePrefillLabel: 'Cache read × write → p90 prefill speed',
    cachePrefillDetail: 'streaming requests with cache · input tok/s/query',
    interactivityHeatmapLabel: 'Cache total × output → p90 interactivity',
    interactivityHeatmapDetail: 'output tok/s/user · streaming requests',
    cacheReadLabel: 'Cache read vs E2E latency',
    cacheReadDetail: 'Cache write < 4K tokens',
    e2eDistLabel: 'E2E latency distribution',
    samples: (n: string) => `${n} samples`,
    ttftDistLabel: 'TTFT distribution',
    streamingSamples: (n: string) => `${n} streaming samples`,
    tpotDistLabel: 'TPOT distribution',
    prefillDistLabel: 'Prefill speed distribution',
    prefillDistDetail: (n: string) => `${n} streaming samples · input tok/s/query`,
    interactDistLabel: 'Interactivity distribution',
    interactDistDetail: (n: string) => `${n} streaming samples · output tok/s/user`,
    hourlyLabel: 'E2E latency over time',
    hourlyDetail: 'Final 48 hours, hourly, UTC',
    modelLabel: 'E2E latency by model',
    modelDetail: (count: number) => `${count} model${count === 1 ? '' : 's'}`,
    streamVsNonLabel: 'Streaming vs non-streaming',
    cacheReadAxisTitle: 'Cache read tokens',
    cacheWriteAxisTitle: 'Cache write tokens',
    outputTokensAxis: 'Output tokens',
    cacheReadWriteAxis: 'Cache read + write tokens',
    p90E2eLatencyAxis: 'p90 E2E latency (s)',
    cacheReadBarAxisLabel: 'Cache read tokens (cache write < 4K)',
    sharedScale: 'shared scale',
    perFacetScale: 'per-facet scale',
    facetFooter: (scaleLabel: string) =>
      `x is cache read, y is cache write, color is p90 E2E latency (s), ${scaleLabel}`,
    legendE2e: 'p90 E2E latency',
    legendTtft: 'p90 TTFT',
    legendPrefill: 'p90 prefill speed (input tok/s/query)',
    legendInteractivity: 'p90 interactivity (output tok/s/user)',
    e2eAxis: 'E2E latency',
    ttftAxis: 'Time to first token',
    tpotAxis: 'TPOT (ms/tok)',
    prefillAxis: 'input tok/s/query',
    interactAxis: 'output tok/s/user',
    heatmapAria: (title: string) => `${title} heatmap`,
    cacheReadAria: 'p90 E2E latency by cache read bucket',
    outputLabels: {
      0: '0–1K out',
      1000: '1K–5K out',
      5000: '5K–20K out',
      20000: '20K+ out',
    } as Record<number, string>,
  },
  zh: {
    yLatency: '延迟',
    stats: '统计',
    distributions: '分布',
    failedToLoad: '延迟数据加载失败',
    e2eMedian: '端到端中位数 (p50)',
    e2eP95: '端到端 P95',
    e2eP99: '端到端 P99',
    noE2eDistribution: '暂无端到端延迟分布数据',
    noData: '暂无数据',
    noHourlyData: '暂无逐小时端到端延迟数据',
    noModelData: '暂无模型端到端延迟数据',
    streaming: '流式',
    nonStreaming: '非流式',
    medianP50: '中位数 (p50)',
    p95: 'P95',
    average: '平均值',
    requestsLabel: '请求数',
    hiddenCells: '少于 5 个请求，已隐藏',
    colorScale: '色标',
    hoverRead: '读取',
    hoverWrite: '写入',
    hoverOutput: '输出',
    hoverCacheTotal: '缓存总量',
    global: '全局',
    local: '局部',
    cacheHeatmapLabel: '缓存读取 × 写入 → p90 端到端延迟',
    cacheHeatmapDetail: '热力图',
    facetedLabel: '缓存 × 输出 → p90 端到端延迟',
    facetedDetail: '按 output token 分面',
    cacheTtftLabel: '缓存读取 × 写入 → p90 TTFT',
    cacheTtftDetail: '仅限流式请求',
    cachePrefillLabel: '缓存读取 × 写入 → p90 Prefill 速度',
    cachePrefillDetail: '含缓存的流式请求 · input tok/s/query',
    interactivityHeatmapLabel: '缓存总量 × 输出 → p90 交互性',
    interactivityHeatmapDetail: 'output tok/s/user · 流式请求',
    cacheReadLabel: '缓存读取 vs 端到端延迟',
    cacheReadDetail: '缓存写入 < 4K token',
    e2eDistLabel: '端到端延迟分布',
    samples: (n: string) => `${n} 个样本`,
    ttftDistLabel: 'TTFT 分布',
    streamingSamples: (n: string) => `${n} 个流式样本`,
    tpotDistLabel: 'TPOT 分布',
    prefillDistLabel: 'Prefill 速度分布',
    prefillDistDetail: (n: string) => `${n} 个流式样本 · input tok/s/query`,
    interactDistLabel: '交互性分布',
    interactDistDetail: (n: string) => `${n} 个流式样本 · output tok/s/user`,
    hourlyLabel: '端到端延迟趋势',
    hourlyDetail: '最后 48 小时，按小时，UTC',
    modelLabel: '按模型的端到端延迟',
    modelDetail: (count: number) => `${count} 个模型`,
    streamVsNonLabel: '流式 vs 非流式',
    cacheReadAxisTitle: '缓存读取 token',
    cacheWriteAxisTitle: '缓存写入 token',
    outputTokensAxis: '输出 token',
    cacheReadWriteAxis: '缓存读取 + 写入 token',
    p90E2eLatencyAxis: 'p90 端到端延迟 (s)',
    cacheReadBarAxisLabel: '缓存读取 token（缓存写入 < 4K）',
    sharedScale: '统一色标',
    perFacetScale: '分面色标',
    facetFooter: (scaleLabel: string) =>
      `x 为缓存读取，y 为缓存写入，颜色为 p90 端到端延迟 (s)，${scaleLabel}`,
    legendE2e: 'p90 端到端延迟',
    legendTtft: 'p90 TTFT',
    legendPrefill: 'p90 Prefill 速度（input tok/s/query）',
    legendInteractivity: 'p90 交互性（output tok/s/user）',
    e2eAxis: '端到端延迟',
    ttftAxis: '首 token 延迟',
    tpotAxis: 'TPOT (ms/tok)',
    prefillAxis: 'input tok/s/query',
    interactAxis: 'output tok/s/user',
    heatmapAria: (title: string) => `${title}热力图`,
    cacheReadAria: '按缓存读取分桶的 p90 端到端延迟',
    outputLabels: {
      0: '0–1K 输出',
      1000: '1K–5K 输出',
      5000: '5K–20K 输出',
      20000: '20K+ 输出',
    } as Record<number, string>,
  },
};

type Strings = (typeof STRINGS)['en'];

const LATENCY_COLOR = CHART_COLORS[0];
const P95_COLOR = CHART_COLORS[1];
const SPEED_COLOR = CHART_COLORS[2];
const MIN_SAMPLES = 5;

const HEATMAP_COLORS = [
  '#083344',
  '#0e4a5c',
  '#155e75',
  '#0e7490',
  '#06b6d4',
  '#22d3ee',
  '#67e8f9',
  '#fbbf24',
  '#f59e0b',
  '#ea580c',
  '#dc2626',
];

const INTERACTIVITY_COLORS = [
  '#dc2626',
  '#ea580c',
  '#f59e0b',
  '#fbbf24',
  '#a3e635',
  '#22c55e',
  '#10b981',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
];

function stepColor(palette: string[], t: number): string {
  return palette[Math.min(Math.floor(t * (palette.length - 1)), palette.length - 2)];
}

function truncateModel(model: string, maxLen = 28): string {
  if (model.length <= maxLen) return model;
  return `${model.slice(0, maxLen - 1)}...`;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTpot(v: number): string {
  return `${v.toFixed(1)}ms`;
}

function formatTokPerSec(v: number): string {
  return v.toFixed(1);
}

function extent(values: number[]): { min: number; max: number; range: number } {
  if (values.length === 0) return { min: 0, max: 0, range: 1 };
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max, range: max - min || 1 };
}

function ColorScaleLegend({
  title,
  palette,
  min,
  max,
  hiddenLabel,
}: {
  title: string;
  palette: string[];
  min?: string;
  max?: string;
  hiddenLabel?: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium">{title}</span>
      {min !== undefined && <span className="tabular-nums">{min}</span>}
      <span
        aria-hidden="true"
        className="h-2.5 w-32 rounded-sm"
        style={{ background: `linear-gradient(to right, ${palette.slice(0, -1).join(', ')})` }}
      />
      {max !== undefined && <span className="tabular-nums">{max}</span>}
      {hiddenLabel && (
        <span className="ml-2 inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-muted" />
          {hiddenLabel}
        </span>
      )}
    </div>
  );
}

const HIDDEN_FILL = 'var(--muted)';

interface GridCell {
  key: string;
  col: number;
  row: number;
  fill: string;
  text?: string;
  hover?: { title: string; metrics: ChartHoverCardMetricItem[]; summary?: string };
}

function LatencyCardHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const inline = useContext(ExpandContext) !== null;
  return (
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        {inline && (
          <div className="min-w-0 grow basis-48">
            <CardTitle>{title}</CardTitle>
            {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        )}
        {children && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {children}
          </div>
        )}
      </div>
    </CardHeader>
  );
}

function EmptyLatencyCard({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = STRINGS[useLocale()];
  return (
    <Card>
      <LatencyCardHeader title={title} subtitle={subtitle} />
      <EmptyState bare>{t.noData}</EmptyState>
    </Card>
  );
}

function hiddenCell(
  cell: Pick<GridCell, 'key' | 'col' | 'row'>,
  title: string,
  count: number,
  t: Strings,
): GridCell {
  return {
    ...cell,
    fill: HIDDEN_FILL,
    hover: {
      title,
      metrics: [{ value: formatNumber(count), label: t.requestsLabel }],
      summary: t.hiddenCells,
    },
  };
}

const AXIS_TITLE_SPACE = 18;
const TICK_GAP = 6;
const textColorCache = new Map<string, string>();

function cellTextColor(fill: string): string {
  let color = textColorCache.get(fill);
  if (!color) {
    color = readableTextColor(fill);
    textColorCache.set(fill, color);
  }
  return color;
}

function HeatmapGrid({
  xLabels,
  yLabels,
  cells,
  xTitle,
  yTitle,
  ariaLabel,
  compact = false,
  labelTexts,
}: {
  xLabels: string[];
  yLabels: string[];
  cells: GridCell[];
  xTitle?: string;
  yTitle?: string;
  ariaLabel: string;
  compact?: boolean;
  labelTexts?: string[];
}) {
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: 0 });
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  useFontsVersion();
  const width = dimensions.width;

  let body = null;
  if (width > 0 && xLabels.length > 0 && yLabels.length > 0) {
    const tickFont = chartFont(CHART_TYPE.axisLabel);
    const cellFont = chartFont(CHART_TYPE.axisLabel, 600);
    const cellFontSub = chartFont(CHART_TYPE.axisLabelSub, 600);
    const yTickWidth = Math.max(...yLabels.map((l) => measureTextWidth(l, tickFont)));
    const xTickWidth = Math.max(...xLabels.map((l) => measureTextWidth(l, tickFont)));
    const left = (yTitle ? AXIS_TITLE_SPACE : 0) + yTickWidth + TICK_GAP;
    const top = 2;
    const cellW = Math.max(4, (width - left - 2) / xLabels.length);
    const cellH = compact
      ? Math.min(40, Math.max(18, cellW * 0.8))
      : Math.min(52, Math.max(26, cellW * 0.7));
    const plotH = cellH * yLabels.length;
    const tickY = top + plotH + TICK_GAP + CHART_TYPE.axisLabel;
    const height = tickY + (xTitle ? AXIS_TITLE_SPACE + 4 : 4);
    const xStep = Math.max(1, Math.ceil((xTickWidth + TICK_GAP) / cellW));
    const hovered = hover ? cells[hover.index] : undefined;
    const texts =
      labelTexts ?? cells.flatMap((cell) => (cell.text === undefined ? [] : [cell.text]));
    const fits = (font: string, size: number) =>
      cellH >= size + 6 && texts.every((text) => measureTextWidth(text, font) + 6 <= cellW);
    const cellLabelSize = fits(cellFont, CHART_TYPE.axisLabel)
      ? CHART_TYPE.axisLabel
      : fits(cellFontSub, CHART_TYPE.axisLabelSub)
        ? CHART_TYPE.axisLabelSub
        : null;
    const showLabels = cellLabelSize !== null;

    body = (
      <>
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          {yLabels.map((label, row) => (
            <text
              key={`y-${label}`}
              x={left - TICK_GAP}
              y={top + row * cellH + cellH / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={CHART_TYPE.axisLabel}
              className="fill-muted-foreground tabular-nums"
            >
              {label}
            </text>
          ))}
          {xLabels.map((label, col) => {
            if (col % xStep !== 0) return null;
            const half = measureTextWidth(label, tickFont) / 2;
            const center = left + col * cellW + cellW / 2;
            return (
              <text
                key={`x-${label}`}
                x={Math.max(left + half, Math.min(center, width - half))}
                y={tickY}
                textAnchor="middle"
                fontSize={CHART_TYPE.axisLabel}
                className="fill-muted-foreground tabular-nums"
              >
                {label}
              </text>
            );
          })}
          {cells.map((cell, index) => {
            const x = left + cell.col * cellW;
            const y = top + cell.row * cellH;
            const showText = showLabels && cell.text !== undefined;
            return (
              <g key={cell.key}>
                <rect
                  x={x + 1}
                  y={y + 1}
                  width={Math.max(0, cellW - 2)}
                  height={Math.max(0, cellH - 2)}
                  rx={2}
                  fill={cell.fill}
                  className={cell.hover ? 'cursor-pointer' : undefined}
                  onPointerMove={
                    cell.hover ? (e) => setHover({ index, x: e.clientX, y: e.clientY }) : undefined
                  }
                  onPointerDown={
                    cell.hover ? (e) => setHover({ index, x: e.clientX, y: e.clientY }) : undefined
                  }
                  onPointerLeave={cell.hover ? () => setHover(null) : undefined}
                />
                {showText && (
                  <text
                    x={x + cellW / 2}
                    y={y + cellH / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={cellLabelSize ?? undefined}
                    fontWeight={600}
                    fill={cellTextColor(cell.fill)}
                    className="pointer-events-none tabular-nums"
                  >
                    {cell.text}
                  </text>
                )}
              </g>
            );
          })}
          {hovered && (
            <rect
              x={left + hovered.col * cellW + 0.75}
              y={top + hovered.row * cellH + 0.75}
              width={Math.max(0, cellW - 1.5)}
              height={Math.max(0, cellH - 1.5)}
              rx={2}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={1.5}
              className="pointer-events-none"
            />
          )}
          {xTitle && (
            <text
              x={left + (cellW * xLabels.length) / 2}
              y={height - 4}
              textAnchor="middle"
              fontSize={CHART_TYPE.axisLabel}
              className="fill-muted-foreground"
            >
              {xTitle}
            </text>
          )}
          {yTitle && (
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="hanging"
              fontSize={CHART_TYPE.axisLabel}
              transform={`translate(0, ${top + plotH / 2}) rotate(-90)`}
              className="fill-muted-foreground"
            >
              {yTitle}
            </text>
          )}
        </svg>
        {hover && hovered?.hover && (
          <FloatingTooltip x={hover.x} y={hover.y} placement="above">
            <ChartHoverCardBody
              title={hovered.hover.title}
              color={hovered.fill}
              metrics={hovered.hover.metrics}
              summary={hovered.hover.summary}
            />
          </FloatingTooltip>
        )}
      </>
    );
  }

  return (
    <div ref={setContainerRef} className="w-full min-w-0">
      {body}
    </div>
  );
}

function CacheHeatmap({
  title,
  subtitle,
  data,
  legendTitle,
  formatValue = formatSeconds,
  formatCell = (v) => formatSeconds(v),
}: {
  title: string;
  subtitle?: string;
  data: HeatmapCell[];
  legendTitle: string;
  formatValue?: (v: number) => string;
  formatCell?: (v: number) => string;
}) {
  const t = STRINGS[useLocale()];
  const [hideSmall, setHideSmall] = useState(true);

  if (data.length === 0) {
    return <EmptyLatencyCard title={title} subtitle={subtitle} />;
  }

  const readBuckets = [...new Set(data.map((d) => d.readBucket))].toSorted((a, b) => a - b);
  const writeBuckets = [...new Set(data.map((d) => d.writeBucket))].toSorted((a, b) => a - b);
  const shown = hideSmall ? data.filter((d) => d.count >= MIN_SAMPLES) : data;
  const scale = extent(shown.map((d) => d.p90));
  const cells: GridCell[] = data.map((cell) => {
    const position = {
      key: `${cell.readBucket}-${cell.writeBucket}`,
      col: readBuckets.indexOf(cell.readBucket),
      row: writeBuckets.indexOf(cell.writeBucket),
    };
    const cellTitle = `${t.hoverRead} ${formatAxisNumber(cell.readBucket)}+ · ${t.hoverWrite} ${formatAxisNumber(cell.writeBucket)}+`;
    if (hideSmall && cell.count < MIN_SAMPLES)
      return hiddenCell(position, cellTitle, cell.count, t);
    const fill = stepColor(HEATMAP_COLORS, (cell.p90 - scale.min) / scale.range);
    return {
      ...position,
      fill,
      text: formatCell(cell.p90),
      hover: {
        title: cellTitle,
        metrics: [
          { value: formatValue(cell.p90), label: 'p90', color: fill },
          { value: formatNumber(cell.count), label: t.requestsLabel },
        ],
      },
    };
  });

  return (
    <Card>
      <LatencyCardHeader title={title} subtitle={subtitle}>
        <HideSmallToggle
          threshold={MIN_SAMPLES}
          pressed={hideSmall}
          onPressedChange={(enabled) => {
            setHideSmall(enabled);
            track('agentic_workload_latency_heatmap_hide_small_toggled', { enabled });
          }}
        />
        <ChartActions
          fileName="cache-heatmap"
          onExportPng={() => track('agentic_workload_latency_heatmap_export_png')}
        />
      </LatencyCardHeader>
      <HeatmapGrid
        xLabels={readBuckets.map(formatAxisNumber)}
        yLabels={writeBuckets.map(formatAxisNumber)}
        cells={cells}
        xTitle={t.cacheReadAxisTitle}
        yTitle={t.cacheWriteAxisTitle}
        ariaLabel={t.heatmapAria(legendTitle)}
      />
      <ColorScaleLegend
        title={legendTitle}
        palette={HEATMAP_COLORS}
        min={formatCell(scale.min)}
        max={formatCell(scale.max)}
        hiddenLabel={hideSmall ? t.hiddenCells : undefined}
      />
    </Card>
  );
}

function InteractivityHeatmap({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: InteractivityCell[];
}) {
  const t = STRINGS[useLocale()];
  const [hideSmall, setHideSmall] = useState(true);

  if (data.length === 0) {
    return <EmptyLatencyCard title={title} subtitle={subtitle} />;
  }

  const cacheBuckets = [...new Set(data.map((d) => d.cacheTotalBucket))].toSorted((a, b) => a - b);
  const outputBuckets = [...new Set(data.map((d) => d.outputBucket))].toSorted((a, b) => a - b);
  const shown = hideSmall ? data.filter((d) => d.count >= MIN_SAMPLES) : data;
  const scale = extent(shown.map((d) => d.p90Interactivity));
  const cells: GridCell[] = data.map((cell) => {
    const position = {
      key: `${cell.cacheTotalBucket}-${cell.outputBucket}`,
      col: cacheBuckets.indexOf(cell.cacheTotalBucket),
      row: outputBuckets.indexOf(cell.outputBucket),
    };
    const cellTitle = `${t.hoverCacheTotal} ${formatAxisNumber(cell.cacheTotalBucket)}+ · ${t.hoverOutput} ${formatAxisNumber(cell.outputBucket)}+`;
    if (hideSmall && cell.count < MIN_SAMPLES)
      return hiddenCell(position, cellTitle, cell.count, t);
    const fill = stepColor(INTERACTIVITY_COLORS, (cell.p90Interactivity - scale.min) / scale.range);
    return {
      ...position,
      fill,
      text: cell.p90Interactivity.toFixed(0),
      hover: {
        title: cellTitle,
        metrics: [
          {
            value: `${cell.p90Interactivity.toFixed(0)} tok/s`,
            label: 'p90',
            color: fill,
          },
          { value: formatNumber(cell.count), label: t.requestsLabel },
        ],
      },
    };
  });

  return (
    <Card>
      <LatencyCardHeader title={title} subtitle={subtitle}>
        <HideSmallToggle
          threshold={MIN_SAMPLES}
          pressed={hideSmall}
          onPressedChange={(enabled) => {
            setHideSmall(enabled);
            track('agentic_workload_latency_interactivity_hide_small_toggled', { enabled });
          }}
        />
        <ExpandTrigger />
      </LatencyCardHeader>
      <HeatmapGrid
        xLabels={cacheBuckets.map(formatAxisNumber)}
        yLabels={outputBuckets.map(formatAxisNumber)}
        cells={cells}
        xTitle={t.cacheReadWriteAxis}
        yTitle={t.outputTokensAxis}
        ariaLabel={t.heatmapAria(t.legendInteractivity)}
      />
      <ColorScaleLegend
        title={t.legendInteractivity}
        palette={INTERACTIVITY_COLORS}
        min={scale.min.toFixed(0)}
        max={scale.max.toFixed(0)}
        hiddenLabel={hideSmall ? t.hiddenCells : undefined}
      />
    </Card>
  );
}

function facetText(p90: number): string {
  return (p90 / 1000).toFixed(1);
}

function FacetedHeatmap({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: HeatmapByOutputCell[];
}) {
  const t = STRINGS[useLocale()];
  const [globalScale, setGlobalScale] = useState(true);
  const [hideSmall, setHideSmall] = useState(true);

  if (data.length === 0) {
    return <EmptyLatencyCard title={title} subtitle={subtitle} />;
  }

  const outputBuckets = [...new Set(data.map((d) => d.outputBucket))].toSorted((a, b) => a - b);
  const readBuckets = [...new Set(data.map((d) => d.readBucket))].toSorted((a, b) => a - b);
  const writeBuckets = [...new Set(data.map((d) => d.writeBucket))].toSorted((a, b) => a - b);
  const xLabels = readBuckets.map(formatAxisNumber);
  const yLabels = writeBuckets.map(formatAxisNumber);
  const shown = hideSmall ? data.filter((d) => d.count >= MIN_SAMPLES) : data;
  const labelTexts = shown.map((d) => facetText(d.p90));
  const global = extent(shown.map((d) => d.p90));
  const outputLabel = (ob: number) => t.outputLabels[ob] || `${formatAxisNumber(ob)}+`;

  return (
    <Card>
      <LatencyCardHeader title={title} subtitle={subtitle}>
        <HideSmallToggle
          threshold={MIN_SAMPLES}
          pressed={hideSmall}
          onPressedChange={(enabled) => {
            setHideSmall(enabled);
            track('agentic_workload_latency_faceted_hide_small_toggled', { enabled });
          }}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t.colorScale}</span>
          <SegmentedToggle
            role="group"
            ariaLabel={t.colorScale}
            value={globalScale ? 'global' : 'local'}
            onValueChange={(scale) => {
              setGlobalScale(scale === 'global');
              track('agentic_workload_latency_faceted_scale_changed', { scale });
            }}
            options={[
              { value: 'global', label: t.global },
              { value: 'local', label: t.local },
            ]}
          />
        </div>
        <ExpandTrigger />
      </LatencyCardHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {outputBuckets.map((ob) => {
          const facetData = data.filter((d) => d.outputBucket === ob);
          const local = extent(shown.filter((d) => d.outputBucket === ob).map((d) => d.p90));
          const scale = globalScale ? global : local;
          const present = new Set(facetData.map((d) => `${d.readBucket}-${d.writeBucket}`));
          const cells: GridCell[] = [];
          readBuckets.forEach((rb, col) =>
            writeBuckets.forEach((wb, row) => {
              if (!present.has(`${rb}-${wb}`)) {
                cells.push({ key: `${rb}-${wb}`, col, row, fill: 'var(--border-alt)' });
              }
            }),
          );
          for (const cell of facetData) {
            const position = {
              key: `${cell.readBucket}-${cell.writeBucket}`,
              col: readBuckets.indexOf(cell.readBucket),
              row: writeBuckets.indexOf(cell.writeBucket),
            };
            const cellTitle = `${outputLabel(ob)} · ${t.hoverRead} ${formatAxisNumber(cell.readBucket)}+ · ${t.hoverWrite} ${formatAxisNumber(cell.writeBucket)}+`;
            if (hideSmall && cell.count < MIN_SAMPLES) {
              cells.push(hiddenCell(position, cellTitle, cell.count, t));
              continue;
            }
            const fill = stepColor(HEATMAP_COLORS, (cell.p90 - scale.min) / scale.range);
            cells.push({
              ...position,
              fill,
              text: facetText(cell.p90),
              hover: {
                title: cellTitle,
                metrics: [
                  { value: formatSeconds(cell.p90), label: 'p90', color: fill },
                  { value: formatNumber(cell.count), label: t.requestsLabel },
                ],
              },
            });
          }

          return (
            <div key={ob} className="min-w-0">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span className="font-medium text-foreground">{outputLabel(ob)}</span>
                {!globalScale && local.max > 0 && (
                  <span className="tabular-nums text-muted-foreground">
                    {formatSeconds(local.min)}–{formatSeconds(local.max)}
                  </span>
                )}
              </div>
              <HeatmapGrid
                compact
                xLabels={xLabels}
                yLabels={yLabels}
                cells={cells}
                labelTexts={labelTexts}
                ariaLabel={t.heatmapAria(`${t.facetedLabel}, ${outputLabel(ob)}`)}
              />
            </div>
          );
        })}
      </div>

      <ColorScaleLegend
        title={t.legendE2e}
        palette={HEATMAP_COLORS}
        min={globalScale ? formatSeconds(global.min) : undefined}
        max={globalScale ? formatSeconds(global.max) : undefined}
        hiddenLabel={hideSmall ? t.hiddenCells : undefined}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        {t.facetFooter(globalScale ? t.sharedScale : t.perFacetScale)}
      </p>
    </Card>
  );
}

const BAR_CHART_HEIGHT = 280;
const BAR_MARGIN = { top: 20, right: 8, bottom: 56 };

function CacheReadLatencyChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: CacheReadBucket[];
}) {
  const t = STRINGS[useLocale()];
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({
    height: BAR_CHART_HEIGHT,
  });
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  useFontsVersion();

  if (data.length === 0) {
    return <EmptyLatencyCard title={title} subtitle={subtitle} />;
  }

  const width = dimensions.width;
  let body = null;
  if (width > 0) {
    const y = scaleLinear()
      .domain([0, Math.max(1, ...data.map((d) => d.p90))])
      .nice()
      .range([BAR_CHART_HEIGHT - BAR_MARGIN.bottom, BAR_MARGIN.top]);
    const yTicks = y.ticks(5);
    const tickFont = chartFont(CHART_TYPE.axisLabel);
    const left =
      AXIS_TITLE_SPACE +
      Math.max(...yTicks.map((v) => measureTextWidth(formatSeconds(v), tickFont))) +
      TICK_GAP * 2;
    const x = scaleBand<number>()
      .domain(data.map((_, i) => i))
      .range([left, width - BAR_MARGIN.right])
      .padding(0.2);
    const baseY = y(0);
    const hovered = hover ? data[hover.index] : undefined;
    const hoverX = hover ? (x(hover.index) ?? 0) + x.bandwidth() / 2 : 0;

    body = (
      <>
        <svg
          width={width}
          height={BAR_CHART_HEIGHT}
          role="img"
          aria-label={t.cacheReadAria}
          className="block"
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={left}
                x2={width - BAR_MARGIN.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={left - TICK_GAP}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={CHART_TYPE.axisLabel}
                className="fill-muted-foreground tabular-nums"
              >
                {formatSeconds(v)}
              </text>
            </g>
          ))}
          {hovered && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={BAR_MARGIN.top}
              y2={baseY}
              {...CURSOR_LINE_PROPS}
              className="pointer-events-none"
            />
          )}
          {data.map((d, i) => {
            const bx = x(i) ?? 0;
            const isHovered = hover?.index === i;
            return (
              <g key={d.bucket}>
                <rect
                  x={bx}
                  y={y(d.p90)}
                  width={x.bandwidth()}
                  height={Math.max(0, baseY - y(d.p90))}
                  rx={2}
                  fill={LATENCY_COLOR}
                  opacity={hover === null || isHovered ? 0.9 : 0.5}
                />
                {measureTextWidth(formatSeconds(d.p90), tickFont) <= x.bandwidth() && (
                  <text
                    x={bx + x.bandwidth() / 2}
                    y={y(d.p90) - 4}
                    textAnchor="middle"
                    fontSize={CHART_TYPE.axisLabel}
                    className="fill-muted-foreground tabular-nums"
                  >
                    {formatSeconds(d.p90)}
                  </text>
                )}
                <text
                  x={bx + x.bandwidth() / 2}
                  y={baseY + TICK_GAP + CHART_TYPE.axisLabel}
                  textAnchor="middle"
                  fontSize={CHART_TYPE.axisLabel}
                  className="fill-muted-foreground tabular-nums"
                >
                  {formatAxisNumber(d.bucket)}
                </text>
                <rect
                  x={bx - (x.step() - x.bandwidth()) / 2}
                  y={BAR_MARGIN.top}
                  width={x.step()}
                  height={baseY - BAR_MARGIN.top}
                  fill="transparent"
                  className="cursor-pointer"
                  onPointerMove={(e) => setHover({ index: i, x: e.clientX, y: e.clientY })}
                  onPointerDown={(e) => setHover({ index: i, x: e.clientX, y: e.clientY })}
                />
              </g>
            );
          })}
          <text
            x={(left + width - BAR_MARGIN.right) / 2}
            y={BAR_CHART_HEIGHT - 8}
            textAnchor="middle"
            fontSize={CHART_TYPE.axisLabel}
            className="fill-muted-foreground"
          >
            {t.cacheReadBarAxisLabel}
          </text>
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="hanging"
            fontSize={CHART_TYPE.axisLabel}
            transform={`translate(0, ${(BAR_MARGIN.top + baseY) / 2}) rotate(-90)`}
            className="fill-muted-foreground"
          >
            {t.p90E2eLatencyAxis}
          </text>
        </svg>
        {hover && hovered && (
          <FloatingTooltip x={hover.x} y={hover.y} placement="above">
            <ChartHoverCardBody
              title={`${t.cacheReadAxisTitle} ${formatAxisNumber(hovered.bucket)}+`}
              metrics={[
                { value: formatSeconds(hovered.p90), label: 'p90', color: LATENCY_COLOR },
                { value: formatSeconds(hovered.p50), label: 'p50' },
                { value: formatSeconds(hovered.p95), label: 'p95' },
                { value: formatNumber(hovered.count), label: t.requestsLabel },
              ]}
            />
          </FloatingTooltip>
        )}
      </>
    );
  }

  return (
    <Card>
      <LatencyCardHeader title={title} subtitle={subtitle}>
        <ExpandTrigger />
      </LatencyCardHeader>
      <div ref={setContainerRef} className="w-full min-w-0" style={{ minHeight: BAR_CHART_HEIGHT }}>
        {body}
      </div>
    </Card>
  );
}

function LatencyHistogram({
  title,
  subtitle,
  histogram,
  axisLabel,
  format,
  color,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  histogram: GraphHistogram;
  axisLabel: string;
  format: (v: number) => string;
  color: string;
  emptyLabel: string;
}) {
  return (
    <ExpandableChart sharedZoom title={title} subtitle={subtitle}>
      {(expanded) =>
        histogram.buckets.length === 0 ? (
          <EmptyState bare className="py-8">
            {emptyLabel}
          </EmptyState>
        ) : (
          <DistributionHistogram
            buckets={histogram.buckets}
            percentiles={histogram.percentiles}
            format={format}
            axisLabel={axisLabel}
            total={histogram.n}
            color={color}
            expanded={expanded}
          />
        )
      }
    </ExpandableChart>
  );
}

function ModelLatencyChart({ byModel, t }: { byModel: LatencyData['byModel']; t: Strings }) {
  const sorted = [...byModel].toSorted((a, b) => b.p95 - a.p95);

  if (sorted.length === 0) {
    return (
      <EmptyState bare className="py-8">
        {t.noModelData}
      </EmptyState>
    );
  }

  const maxP95 = Math.max(...sorted.map((m) => m.p95), 1);

  return (
    <div className="space-y-1.5">
      {sorted.map((m) => {
        const p50Pct = (m.p50 / maxP95) * 100;
        const p95Pct = (m.p95 / maxP95) * 100;
        return (
          <div key={m.model} className="flex items-center gap-2">
            <span className="text-xs text-foreground shrink-0 w-[180px] truncate" title={m.model}>
              {truncateModel(m.model)}
            </span>
            <div className="flex-1 h-5 bg-border/30 rounded-sm overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${Math.max(p95Pct, 1)}%`, backgroundColor: P95_COLOR }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${Math.max(p50Pct, 1)}%`, backgroundColor: LATENCY_COLOR }}
              />
            </div>
            <span className="text-xs tabular-nums whitespace-nowrap text-foreground shrink-0 min-w-28 text-right">
              {formatDuration(m.p50)} / {formatDuration(m.p95)}
            </span>
          </div>
        );
      })}

      <div className="flex gap-x-4 mt-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: LATENCY_COLOR }} />
          p50
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: P95_COLOR }} />
          p95
        </span>
      </div>
    </div>
  );
}

function StreamingComparison({ stats, t }: { stats: LatencyStats; t: Strings }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {(
        [
          [t.streaming, stats.streaming],
          [t.nonStreaming, stats.nonStreaming],
        ] as const
      ).map(([label, s]) => (
        <Card key={label}>
          <div className="text-xs font-medium text-muted-foreground mb-2">{label}</div>
          <dl className="space-y-1.5 text-xs">
            {(
              [
                [t.medianP50, formatDuration(s.p50)],
                [t.p95, formatDuration(s.p95)],
                [t.average, formatDuration(s.avg)],
              ] as const
            ).map(([name, value]) => (
              <div key={name} className="flex justify-between">
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
            <div className="h-px bg-border/30 my-1" />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t.requestsLabel}</dt>
              <dd className="tabular-nums text-foreground">{formatNumber(s.count)}</dd>
            </div>
          </dl>
        </Card>
      ))}
    </div>
  );
}

export default function LatencyPage() {
  return (
    <Suspense>
      <LatencyPageContent />
    </Suspense>
  );
}

function LatencyPageContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { models, selectedModel, setSelectedModel, buildUrl } = useModelFilter();
  const { apiParam: traceVersionParam } = useTraceVersion();

  const { data, loading, error } = useDashboardData<LatencyData>({
    fetcher: async (signal) => {
      const r = await fetch(
        appendTraceVersion(
          buildUrl('/api/v1/agentic-workload-explorer/latency'),
          traceVersionParam,
        ),
        {
          signal,
        },
      );
      if (!r.ok) throw new Error('Failed to fetch latency data');
      return r.json();
    },
    key: `${selectedModel ?? ''}-${traceVersionParam}`,
  });

  const hourlySeries = useMemo<LineSeries[]>(() => {
    const hourly = data?.hourly ?? [];
    return [
      {
        key: 'p50',
        label: 'p50',
        color: LATENCY_COLOR,
        points: hourly.map((h) => ({ day: h.hour, value: h.p50 })),
      },
      {
        key: 'p95',
        label: 'p95',
        color: P95_COLOR,
        points: hourly.map((h) => ({ day: h.hour, value: h.p95 })),
      },
    ];
  }, [data]);
  const formatHour = useCallback((hour: string) => formatHourLabel(hour, locale), [locale]);

  return (
    <div className="space-y-6">
      {models.length > 0 && (
        <div className="flex items-center gap-2">
          <ModelFilter
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      )}
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
          <EmptyState>{t.failedToLoad}</EmptyState>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat
              boxed
              label={t.e2eMedian}
              value={formatDuration(data.stats.p50)}
              detail={`avg ${formatDuration(data.stats.avg)}`}
            />
            <Stat boxed label={t.e2eP95} value={formatDuration(data.stats.p95)} />
            <Stat boxed label={t.e2eP99} value={formatDuration(data.stats.p99)} />
          </dl>
        )}
      </div>

      {data && (
        <>
          <Expandable title={t.cacheHeatmapLabel} subtitle={t.cacheHeatmapDetail}>
            <CacheHeatmap
              title={t.cacheHeatmapLabel}
              subtitle={t.cacheHeatmapDetail}
              data={data.cacheHeatmap}
              legendTitle={t.legendE2e}
            />
          </Expandable>

          <Expandable title={t.facetedLabel} subtitle={t.facetedDetail}>
            <FacetedHeatmap
              title={t.facetedLabel}
              subtitle={t.facetedDetail}
              data={data.cacheHeatmapByOutput}
            />
          </Expandable>

          <Expandable title={t.cacheTtftLabel} subtitle={t.cacheTtftDetail}>
            <CacheHeatmap
              title={t.cacheTtftLabel}
              subtitle={t.cacheTtftDetail}
              data={data.cacheHeatmapTTFT}
              legendTitle={t.legendTtft}
            />
          </Expandable>

          <Expandable title={t.cachePrefillLabel} subtitle={t.cachePrefillDetail}>
            <CacheHeatmap
              title={t.cachePrefillLabel}
              subtitle={t.cachePrefillDetail}
              data={data.cacheHeatmapPrefillSpeed}
              legendTitle={t.legendPrefill}
              formatValue={formatPrefillSpeed}
              formatCell={formatPrefillSpeedCompact}
            />
          </Expandable>

          <Expandable title={t.interactivityHeatmapLabel} subtitle={t.interactivityHeatmapDetail}>
            <InteractivityHeatmap
              title={t.interactivityHeatmapLabel}
              subtitle={t.interactivityHeatmapDetail}
              data={data.cacheTotalVsOutputInteractivity}
            />
          </Expandable>

          <Expandable title={t.cacheReadLabel} subtitle={t.cacheReadDetail}>
            <CacheReadLatencyChart
              title={t.cacheReadLabel}
              subtitle={t.cacheReadDetail}
              data={data.cacheReadVsLatency}
            />
          </Expandable>

          <div>
            <SectionHeader label={t.distributions} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LatencyHistogram
                title={t.e2eDistLabel}
                subtitle={t.samples(formatNumber(data.distribution.n))}
                histogram={data.distribution}
                axisLabel={t.e2eAxis}
                format={formatDuration}
                color={LATENCY_COLOR}
                emptyLabel={t.noE2eDistribution}
              />
              <LatencyHistogram
                title={t.ttftDistLabel}
                subtitle={t.streamingSamples(formatNumber(data.ttftDistribution.n))}
                histogram={data.ttftDistribution}
                axisLabel={t.ttftAxis}
                format={formatDuration}
                color={LATENCY_COLOR}
                emptyLabel={t.noData}
              />
              <LatencyHistogram
                title={t.tpotDistLabel}
                subtitle={t.streamingSamples(formatNumber(data.tpotDistribution.n))}
                histogram={data.tpotDistribution}
                axisLabel={t.tpotAxis}
                format={formatTpot}
                color={LATENCY_COLOR}
                emptyLabel={t.noData}
              />
              <LatencyHistogram
                title={t.prefillDistLabel}
                subtitle={t.prefillDistDetail(formatNumber(data.prefillSpeedDistribution.n))}
                histogram={data.prefillSpeedDistribution}
                axisLabel={t.prefillAxis}
                format={formatPrefillSpeedCompact}
                color={SPEED_COLOR}
                emptyLabel={t.noData}
              />
              <LatencyHistogram
                title={t.interactDistLabel}
                subtitle={t.interactDistDetail(formatNumber(data.interactivityDistribution.n))}
                histogram={data.interactivityDistribution}
                axisLabel={t.interactAxis}
                format={formatTokPerSec}
                color={SPEED_COLOR}
                emptyLabel={t.noData}
              />
            </div>
          </div>

          <TrendsLineChart
            title={t.hourlyLabel}
            subtext={t.hourlyDetail}
            series={hourlySeries}
            yFormatter={formatDuration}
            yLabel={t.yLatency}
            xFormatter={formatHour}
            filename="e2e-latency-over-time"
            emptyLabel={t.noHourlyData}
          />

          <div>
            <SectionHeader label={t.modelLabel} detail={t.modelDetail(data.byModel.length)} />
            <Card>
              <ModelLatencyChart byModel={data.byModel} t={t} />
            </Card>
          </div>

          <div>
            <SectionHeader label={t.streamVsNonLabel} />
            <StreamingComparison stats={data.stats} t={t} />
          </div>
        </>
      )}
    </div>
  );
}
