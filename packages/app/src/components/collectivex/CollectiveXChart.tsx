'use client';

import * as d3 from 'd3';
import { useMemo, useRef } from 'react';

import { globalParetoFrontier } from '@/lib/charts/pareto-frontier';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';

import {
  chartPoints,
  collectiveXColorKey,
  collectiveXRunDasharray,
  fitAlphaBeta,
  type CollectiveXRangeBand,
} from './data';
import type {
  CollectiveXChartPoint,
  CollectiveXOperation,
  CollectiveXPercentile,
  CollectiveXRunSeries,
  CollectiveXYAxis,
} from './types';

interface CollectiveXChartProps {
  chartId: string;
  series: CollectiveXRunSeries[];
  /** When set, draw these SKU ranges (band plus median line) instead of one line per series. */
  ranges?: CollectiveXRangeBand[];
  /** `range` draws each band and its median; `best` draws only the best value at each point. */
  rangeMode?: 'range' | 'best';
  colors: Record<string, string>;
  operation: CollectiveXOperation;
  percentile: CollectiveXPercentile;
  yAxis: CollectiveXYAxis;
  caption?: React.ReactNode;
  legendElement?: React.ReactNode;
  testId?: string;
}

const STRINGS = {
  en: {
    operation: {
      dispatch: 'Dispatch',
      stage: 'Stage',
      combine: 'Combine',
      roundtrip: 'Round trip (measured)',
    },
    yAxis: {
      latency: 'Latency (µs)',
      'tokens-per-second': 'Token rate at selected latency percentile (tokens/s)',
      'activation-rate': 'Activation-data rate at selected latency percentile (GB/s)',
      'payload-rate': 'Payload bandwidth at selected latency percentile (GB/s, per chip)',
    },
    xAxis: 'Source tokens / rank (log)',
    unavailable: (operation: string) => `${operation} is unavailable for the selected series.`,
    noSeries: 'No matching CollectiveX series.',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    dismiss: 'Click elsewhere to dismiss',
    atLatency: (percentile: string) => `at ${percentile} latency`,
    tokenCounts: (perRank: string, global: string) =>
      `${perRank} tokens/rank · ${global} global tokens`,
    latencyRanks: 'Latency p50 / p90 / p95 / p99',
    fit: (beta: string, alpha: string) => `Fit β=${beta} GB/s · α=${alpha} µs (p50, per chip)`,
    unavailableValue: 'unavailable',
    measured: ' (measured)',
    roundTrip: 'Round trip',
    rangeHeading: 'Range across libraries',
    rangeMedian: 'Median',
    rangeCount: (n: number) => `${n} librar${n === 1 ? 'y' : 'ies'} at this point`,
    best: 'Best',
    aria: 'CollectiveX expert-parallel performance chart',
  },
  zh: {
    operation: {
      dispatch: '分发',
      stage: '中间处理',
      combine: '合并',
      roundtrip: '往返（实测）',
    },
    yAxis: {
      latency: '延迟（µs）',
      'tokens-per-second': '所选延迟分位点的 token 速率（tokens/s）',
      'activation-rate': '所选延迟分位点的激活数据速率（GB/s）',
      'payload-rate': '所选延迟分位点的载荷带宽（GB/s，每芯片）',
    },
    xAxis: '每 rank 源 token 数（对数）',
    unavailable: (operation: string) => `所选序列没有可用的${operation}数据。`,
    noSeries: '没有匹配的 CollectiveX 序列。',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    dismiss: '点击其他区域关闭',
    atLatency: (percentile: string) => `（${percentile} 延迟分位点）`,
    tokenCounts: (perRank: string, global: string) =>
      `每 rank ${perRank} 个 token · 全局 ${global} 个 token`,
    latencyRanks: '延迟 p50 / p90 / p95 / p99',
    fit: (beta: string, alpha: string) => `拟合 β=${beta} GB/s · α=${alpha} µs（p50，每芯片）`,
    unavailableValue: '不可用',
    measured: '（实测）',
    roundTrip: '往返',
    rangeHeading: '各集合通信库的范围',
    rangeMedian: '中位数',
    rangeCount: (n: number) => `该点共 ${n} 个集合通信库`,
    best: '最佳',
    aria: 'CollectiveX 专家并行性能图表',
  },
} as const;

function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [1, 10];
  const min = d3.min(values) ?? 1;
  const max = d3.max(values) ?? 1;
  return min === max ? [min / 2, max * 2] : [min / 1.08, max * 1.08];
}

function formatCompact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(value < 1e10 ? 1 : 0)}G`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value < 1e7 ? 1 : 0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(value < 1e4 ? 1 : 0)}k`;
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return value.toFixed(value < 3 ? 1 : 0);
  return value.toFixed(2);
}

function formatTokenCount(value: number, locale: Locale): string {
  return Number.isInteger(value)
    ? value.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
    : formatCompact(value);
}

function formatMetric(value: number, yAxis: CollectiveXYAxis): string {
  if (yAxis === 'latency') return `${value.toFixed(value >= 100 ? 0 : 1)} µs`;
  if (yAxis === 'tokens-per-second') return `${formatCompact(value)} tok/s`;
  return `${value.toFixed(value >= 100 ? 0 : 2)} GB/s`;
}

function formatPercentiles(
  value: CollectiveXRunSeries['points'][number]['components']['dispatch'],
  unavailable: string,
): string {
  if (value === null) return unavailable;
  const { p50, p90, p95, p99 } = value.latency_us;
  const us = (v: number | null) => (v === null ? unavailable : v.toFixed(1));
  return `${us(p50)} / ${us(p90)} / ${us(p95)} / ${us(p99)} µs`;
}

// Light enough that overlapping SKUs stay readable; a hovered or pinned point lifts its own band
// and fades the rest.
const BAND_FILL = 0.16;
const BAND_STROKE = 0.6;
const BAND_FOCUS_FILL = 0.3;
const BAND_FOCUS_STROKE = 0.95;
const BAND_FADED_FILL = 0.03;
const BAND_FADED_STROKE = 0.15;

/**
 * Like the inference charts, a line follows the Pareto frontier of its points: more tokens at
 * lower latency, or a higher rate at fewer tokens, is better. Sorted by x.
 */
function paretoLine<T extends { x: number; y: number }>(
  points: readonly T[],
  yAxis: CollectiveXYAxis,
): T[] {
  const lowerIsBetter = yAxis === 'latency';
  return globalParetoFrontier(points, lowerIsBetter, !lowerIsBetter);
}

/** Mean log-height of a band, i.e. how wide it looks on the log y axis. */
function bandSpread(band: CollectiveXRangeBand): number {
  if (band.points.length === 0) return 0;
  let total = 0;
  for (const item of band.points) total += Math.log(item.hi / item.lo);
  return total / band.points.length;
}

/** Lift the band `focusId` and fade the others; null restores every band. */
function highlightBands(root: Element | null, focusId: string | null): void {
  if (!root) return;
  d3.select(root)
    .selectAll<SVGPathElement, { id: string }>('path.collectivex-range-band')
    .attr('fill-opacity', (band) =>
      focusId === null ? BAND_FILL : band.id === focusId ? BAND_FOCUS_FILL : BAND_FADED_FILL,
    )
    .attr('stroke-opacity', (band) =>
      focusId === null ? BAND_STROKE : band.id === focusId ? BAND_FOCUS_STROKE : BAND_FADED_STROKE,
    )
    .attr('data-focused', (band) => (focusId !== null && band.id === focusId ? 'true' : null));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function CollectiveXChart({
  chartId,
  series,
  ranges,
  rangeMode = 'range',
  colors,
  operation,
  percentile,
  yAxis,
  caption,
  legendElement,
  testId,
}: CollectiveXChartProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const points = useMemo<CollectiveXChartPoint[]>(
    () =>
      ranges
        ? ranges.flatMap((band) =>
            band.points.map((item) => ({
              seriesId: band.id,
              seriesLabel: band.label,
              colorKey: band.colorKey,
              x: item.x,
              y: rangeMode === 'best' ? item.members[0].y : item.mid,
              point: item.members[0].point,
              range: {
                lo: item.lo,
                hi: item.hi,
                libraries: item.libraries,
                members: item.members.map(({ label, y }) => ({ label, y })),
              },
            })),
          )
        : chartPoints(series, operation, percentile, yAxis, locale),
    [ranges, rangeMode, series, operation, percentile, yAxis, locale],
  );
  const seriesById = useMemo(() => new Map(series.map((item) => [item.series_id, item])), [series]);
  const fitsBySeries = useMemo(
    () => new Map(series.map((item) => [item.series_id, fitAlphaBeta(item, operation)])),
    [series, operation],
  );
  // Each line follows its series' Pareto frontier; dominated points keep their dot.
  const lines = useMemo(() => {
    const bySeries: Record<string, { x: number; y: number }[]> = {};
    for (const point of points) {
      (bySeries[point.seriesId] ??= []).push({ x: point.x, y: point.y });
    }
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const [id, line] of Object.entries(bySeries)) result[id] = paretoLine(line, yAxis);
    return result;
  }, [points, yAxis]);

  const xDomain = useMemo(() => paddedDomain(points.map((point) => point.x)), [points]);
  const yDomain = useMemo(
    () =>
      paddedDomain(
        points.flatMap((point) =>
          point.range && rangeMode === 'range' ? [point.range.lo, point.range.hi] : [point.y],
        ),
      ),
    [points],
  );
  const chartSvgRef = useRef<SVGSVGElement | null>(null);
  // Always mounted, so leaving the range view redraws it empty: D3Chart keeps a removed custom
  // layer's elements on screen.
  const rangeLayer = useMemo(() => {
    // Widest first, so it paints at the bottom and narrower bands stay visible on top of it.
    const bands =
      rangeMode === 'range' ? (ranges ?? []).toSorted((a, b) => bandSpread(b) - bandSpread(a)) : [];
    const draw = (
      group: d3.Selection<SVGGElement, unknown, null, undefined>,
      xScale: unknown,
      yScale: unknown,
    ) => {
      const x = xScale as d3.ScaleLogarithmic<number, number>;
      const y = yScale as d3.ScaleLogarithmic<number, number>;
      // Each edge follows its own Pareto frontier with the same monotone curve as the lines; the
      // lower edge runs back right to left to close the shape.
      const edge = d3
        .line<{ x: number; y: number }>()
        .x((item) => x(item.x))
        .y((item) => y(item.y))
        .curve(d3.curveMonotoneX);
      const area = (bandPoints: CollectiveXRangeBand['points']) => {
        const hi = paretoLine(
          bandPoints.map((item) => ({ x: item.x, y: item.hi })),
          yAxis,
        );
        const lo = paretoLine(
          bandPoints.map((item) => ({ x: item.x, y: item.lo })),
          yAxis,
        ).toReversed();
        if (hi.length === 0 || lo.length === 0) return null;
        return `${edge(hi)}L${edge(lo)!.slice(1)}Z`;
      };
      group
        .selectAll<SVGPathElement, CollectiveXRangeBand>('path.collectivex-range-band')
        .data(bands, (band) => band.id)
        .join('path')
        .attr('class', 'collectivex-range-band')
        .attr('data-testid', 'collectivex-range-band')
        .attr('fill', (band) => colors[band.colorKey] ?? '#888')
        .attr('fill-opacity', BAND_FILL)
        .attr('stroke', (band) => colors[band.colorKey] ?? '#888')
        .attr('stroke-opacity', BAND_STROKE)
        .attr('stroke-width', 1)
        .attr('pointer-events', 'none')
        .attr('d', (band) => area(band.points))
        .order();
    };
    return {
      type: 'custom' as const,
      key: 'collectivex-range-bands',
      render: (
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: { xScale: unknown; yScale: unknown; tooltipElement: HTMLDivElement },
      ) => {
        draw(group, ctx.xScale, ctx.yScale);
        // Dismissing a pinned tooltip (a click elsewhere) fires no hover end, so restore the
        // bands once the click has dismissed it.
        const svg = group.node()?.ownerSVGElement ?? null;
        chartSvgRef.current = svg;
        d3.select(svg).on('click.collectivex-range', () => {
          setTimeout(() => {
            const shown =
              ctx.tooltipElement.style.display !== 'none' &&
              ctx.tooltipElement.style.opacity !== '0';
            if (!shown) highlightBands(svg, null);
          }, 0);
        });
      },
      onZoom: (
        group: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: { newXScale: unknown; newYScale: unknown },
      ) => {
        draw(group, ctx.newXScale, ctx.newYScale);
      },
    };
  }, [ranges, rangeMode, colors, yAxis]);
  const xTickValues = useMemo(
    () => [...new Set(points.map((point) => point.x))].toSorted((a, b) => a - b),
    [points],
  );

  const noDataOverlay =
    points.length === 0 ? (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p className="text-sm text-muted-foreground">
          {series.length > 0 ? t.unavailable(t.operation[operation]) : t.noSeries}
        </p>
      </div>
    ) : undefined;

  return (
    <div role="group" aria-label={t.aria}>
      <D3Chart<CollectiveXChartPoint>
        chartId={chartId}
        data={points}
        height={560}
        margin={{ top: 24, right: 20, bottom: 62, left: 78 }}
        watermark="logo"
        testId={testId}
        grabCursor
        instructions={t.instructions}
        xScale={{ type: 'log', domain: xDomain, nice: false }}
        yScale={{ type: 'log', domain: yDomain, nice: false }}
        xAxis={{
          label: t.xAxis,
          tickCount: 8,
          tickValues: xTickValues,
          tickFormat: (value) => formatTokenCount(Number(value), locale),
        }}
        yAxis={{
          label: t.yAxis[yAxis],
          tickCount: 5,
          tickFormat: (value) => formatCompact(Number(value)),
        }}
        layers={[
          rangeLayer,
          {
            type: 'line',
            key: 'collectivex-lines',
            lines,
            config: {
              getColor: (key) => {
                const band = ranges?.find((item) => item.id === key);
                if (band) return colors[band.colorKey] ?? '#888';
                const item = seriesById.get(key);
                return colors[item ? collectiveXColorKey(item) : ''] ?? '#888';
              },
              getStrokeDasharray: (key) => {
                const band = ranges?.find((item) => item.id === key);
                if (band) return collectiveXRunDasharray(band.runIndex);
                const item = seriesById.get(key);
                return item ? collectiveXRunDasharray(item.run_index) : 'none';
              },
              strokeWidth: 2.25,
              curve: d3.curveMonotoneX,
            },
          },
          {
            type: 'point',
            key: 'collectivex-points',
            data: points,
            config: {
              getCx: () => 0,
              getCy: () => 0,
              getX: (point) => point.x,
              getY: (point) => point.y,
              getColor: (point) => colors[point.colorKey] ?? '#888',
              getRadius: () => 3.5,
              stroke: 'var(--background)',
              strokeWidth: 1,
              keyFn: (point) => `${point.seriesId}-${point.x}`,
              maxPoints: Infinity,
            },
          },
        ]}
        zoom={{
          enabled: true,
          axes: 'both',
          scaleExtent: [1, 20],
          resetEventName: `collectivex_zoom_reset_${chartId}`,
        }}
        tooltip={{
          rulerType: 'crosshair',
          attachToLayer: 2,
          content: (point, isPinned) => {
            const color = colors[point.colorKey] ?? '#888';
            const pinnedNote = isPinned
              ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>`
              : '';
            if (point.range) {
              const rows = point.range.members
                .map(
                  (member) =>
                    `<span>${escapeHtml(member.label)}</span><span>${formatMetric(member.y, yAxis)}</span>`,
                )
                .join('');
              // Two-column grid, so every value starts at the same left edge.
              const table = `<div class="grid text-muted-foreground" style="grid-template-columns: max-content max-content; column-gap: 1.5rem">${rows}</div>`;
              return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${pinnedNote}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${escapeHtml(t.operation[operation])} ${yAxis === 'latency' ? percentile : t.atLatency(percentile)}</div>
            ${
              rangeMode === 'best'
                ? `<div>${t.best}: <strong>${formatMetric(point.y, yAxis)}</strong> · ${escapeHtml(point.range.members[0].label)}</div>`
                : `<div>${t.rangeMedian}: <strong>${formatMetric(point.y, yAxis)}</strong></div>`
            }
            <div>${t.rangeHeading}: ${formatMetric(point.range.lo, yAxis)} – ${formatMetric(point.range.hi, yAxis)}</div>
            <div class="text-muted-foreground">${t.tokenCounts(locale === 'zh' ? point.point.tokens_per_rank.toLocaleString('zh-CN') : String(point.point.tokens_per_rank), locale === 'zh' ? point.point.global_tokens.toLocaleString('zh-CN') : String(point.point.global_tokens))}</div>
            <div class="mt-1 text-muted-foreground">${t.rangeCount(point.range.libraries)}</div>
            ${table}
          </div>`;
            }
            const measurement = point.point;
            const measuredRoundtrip = measurement.components.roundtrip;
            const fit = fitsBySeries.get(point.seriesId);
            const fitLine = fit
              ? `<div class="mt-1 text-muted-foreground">${t.fit(fit.betaGbps.toFixed(fit.betaGbps >= 100 ? 0 : 1), fit.alphaUs.toFixed(1))}</div>`
              : '';
            return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 230px; max-width: 380px; user-select: ${isPinned ? 'text' : 'none'}">
            ${pinnedNote}
            <div class="font-semibold mb-1" style="color: ${color}">${escapeHtml(point.seriesLabel)}</div>
            <div>${escapeHtml(t.operation[operation])} ${yAxis === 'latency' ? percentile : t.atLatency(percentile)}: <strong>${formatMetric(point.y, yAxis)}</strong></div>
            <div class="text-muted-foreground">${t.tokenCounts(locale === 'zh' ? measurement.tokens_per_rank.toLocaleString('zh-CN') : String(measurement.tokens_per_rank), locale === 'zh' ? measurement.global_tokens.toLocaleString('zh-CN') : String(measurement.global_tokens))}</div>
            <div class="mt-1 text-muted-foreground">${t.latencyRanks}</div>
            <div class="text-muted-foreground">${t.operation.dispatch}: ${formatPercentiles(measurement.components.dispatch, t.unavailableValue)}</div>
            <div class="text-muted-foreground">${t.operation.stage}: ${formatPercentiles(measurement.components.stage, t.unavailableValue)}</div>
            <div class="text-muted-foreground">${t.operation.combine}: ${formatPercentiles(measurement.components.combine, t.unavailableValue)}</div>
            <div class="text-muted-foreground">${t.roundTrip}: ${formatPercentiles(measuredRoundtrip, t.unavailableValue)}${measuredRoundtrip ? t.measured : ''}</div>
            ${fitLine}
          </div>`;
          },
          getRulerX: (point, scale) =>
            (scale as d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>)(
              point.x,
            ),
          getRulerY: (point, scale) => scale(point.y),
          onHoverStart: (selection, point) => {
            selection.attr('r', 6);
            if (point.range)
              highlightBands(selection.node()?.ownerSVGElement ?? null, point.seriesId);
          },
          onHoverEnd: (selection, point) => {
            selection.attr('r', 3.5);
            if (point.range) highlightBands(selection.node()?.ownerSVGElement ?? null, null);
          },
          // Hover callbacks stop while a point is pinned, so pinning another point focuses its
          // band here.
          onPointClick: (point) => {
            highlightBands(chartSvgRef.current, point.range ? point.seriesId : null);
          },
        }}
        transitionDuration={200}
        legendElement={legendElement}
        noDataOverlay={noDataOverlay}
        caption={caption}
      />
    </div>
  );
}
