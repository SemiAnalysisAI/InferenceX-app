'use client';

import * as d3 from 'd3';
import { useCallback, useMemo, useRef } from 'react';

import type { HardwareConfig } from '@/components/inference/types';
import { track } from '@/lib/analytics';
import { getHardwareConfig } from '@/lib/constants';
import { getChartWatermark } from '@/lib/data-mappings';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  D3ChartHandle,
  LayerConfig,
  RenderContext,
  ScaleConfig,
} from '@/lib/d3-chart/D3Chart/types';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';
import { escapeHtml, getDisplayLabel } from '@/lib/utils';
import { getLineLabelVendorIcon } from '@/lib/vendor-logos';

import { formatUsdCompact, type ProfitEstimatorRow } from './profit-estimator';

export type ProfitSegmentKind = 'tco' | 'labCut' | 'profit' | 'loss';

/** One rectangle of the stack. `y0`/`y1` are $/GW/yr; loss segments run below zero. */
export interface ProfitSegment {
  key: string;
  kind: ProfitSegmentKind;
  row: ProfitEstimatorRow;
  y0: number;
  y1: number;
}

/**
 * Bottom and left margins leave room for x labels rotated 50° (the longest
 * SKU label is ≈32 chars, ≈190px at the sub-label size): 190·sin50° ≈ 146px
 * of height below the axis and 190·cos50° ≈ 122px of reach left of the first
 * tick.
 */
const CHART_MARGIN = { top: 44, right: 24, bottom: 172, left: 116 };
const CHART_HEIGHT = 720;
const X_LABEL_ROTATION = -50;
/** Vendor mark beside each x label, in px; a touch larger than the label text so the logo stays legible. */
const X_LABEL_ICON_SIZE = CHART_TYPE.axisLabel;
/** Gap between the vendor mark and the label text, px. */
const X_LABEL_ICON_GAP = 4;
/** Distance from the tick to the label's end, in em (the d3 default is 0). */
const X_LABEL_DX_EM = 0.4;

/** Opacity of the license-fee segment relative to the SKU's profit colour. */
/**
 * Every segment is drawn in its SKU's colour at a different weight so a bar
 * reads as one chip: TCO is the palest tint, the license fee a mid tint, profit
 * the solid colour. Loss is a hatch in the same colour below the axis.
 */
const TCO_OPACITY = 0.22;
const LAB_CUT_OPACITY = 0.5;
const LOSS_FILL = 'var(--destructive)';
/** Segment heights below which the in-bar label drops to one line, then disappears. */
const SEGMENT_TWO_LINE_MIN_PX = 34;
const SEGMENT_ONE_LINE_MIN_PX = 17;

/** Stable SVG pattern id for a loss hatch in the SKU's colour. */
export function lossPatternId(resultKey: string): string {
  return `profit-loss-hatch-${resultKey.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}`;
}

const STRINGS = {
  en: {
    yAxis: 'US$ per all-in utility GW per year',
    revenue: 'Revenue',
    revenuePerGpuHour: 'Revenue per GPU-hour',
    gpuHours: 'GPU-hours per GW-year',
    tco: 'Compute expense (TCO)',
    grossMargin: 'Gross margin',
    labCut: 'Model license fee',
    profit: 'Operator profit',
    loss: 'Operator loss',
    marginPct: 'Operator margin',
    marginShort: 'margin',
    utilization: 'Utilization',
    labCutShare: 'License fee share',
    ofRevenue: 'of revenue',
    dismiss: 'Click anywhere to dismiss',
    instructions: 'Hover a bar for the breakdown · Click to pin',
    noData: 'No SKU can be priced for the current selection.',
  },
  zh: {
    yAxis: '每全电源配置吉瓦每年（美元）',
    revenue: '收入',
    revenuePerGpuHour: '每 GPU 小时收入',
    gpuHours: '每吉瓦年 GPU 小时数',
    tco: '算力支出（TCO）',
    grossMargin: '毛利',
    labCut: '模型许可费',
    profit: '运营方利润',
    loss: '运营方亏损',
    marginPct: '运营方利润率',
    marginShort: '利润率',
    utilization: '利用率',
    labCutShare: '许可费比例',
    ofRevenue: '（占收入）',
    dismiss: '点击任意位置关闭',
    instructions: '悬停柱形查看拆分 · 点击固定',
    noData: '当前选择下没有可定价的 SKU。',
  },
} as const;

export function profitEstimatorChartStrings(locale: Locale) {
  return STRINGS[locale];
}

/** Segment label lines that fit a given pixel height: name and amount, amount only, or none. */
export function segmentLabelLines(
  kind: ProfitSegmentKind,
  row: ProfitEstimatorRow,
  heightPx: number,
  t: { tco: string; labCut: string; profit: string; loss: string },
): string[] {
  // Profit and loss both read `row.profit`; the loss kind only changes the word.
  const amount = kind === 'tco' ? row.tco : kind === 'labCut' ? row.labCut : row.profit;
  const name =
    kind === 'tco' ? t.tco : kind === 'labCut' ? t.labCut : kind === 'profit' ? t.profit : t.loss;
  if (heightPx >= SEGMENT_TWO_LINE_MIN_PX) return [name, formatUsdCompact(amount)];
  if (heightPx >= SEGMENT_ONE_LINE_MIN_PX) return [formatUsdCompact(amount)];
  return [];
}

/**
 * Text colour that reads on a solid SKU fill. Palette colours are hex, so
 * relative luminance is available; anything unparseable gets white.
 */
function linearChannel(c: number): number {
  const v = c / 255;
  return v <= 0.039_28 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function contrastingTextColor(fill: string): string {
  const parsed = d3.color(fill)?.rgb();
  if (!parsed) return '#ffffff';
  const channel = linearChannel;
  const luminance =
    0.2126 * channel(parsed.r) + 0.7152 * channel(parsed.g) + 0.0722 * channel(parsed.b);
  return luminance > 0.45 ? '#111111' : '#ffffff';
}

/** Operator margin as a share of revenue, formatted for the label above the bar. */
export function operatorMarginLabel(row: ProfitEstimatorRow, marginWord: string): string {
  if (!(row.revenue > 0)) return '';
  return `${formatPct(row.profit / row.revenue)} ${marginWord}`;
}

/** Turn a priced row into its stacked rectangles. Pure, so it is unit-tested. */
export function buildProfitSegments(rows: readonly ProfitEstimatorRow[]): ProfitSegment[] {
  const segments: ProfitSegment[] = [];
  for (const row of rows) {
    segments.push({ key: `${row.resultKey}|tco`, kind: 'tco', row, y0: 0, y1: row.tco });
    if (row.labCut > 0) {
      segments.push({
        key: `${row.resultKey}|labCut`,
        kind: 'labCut',
        row,
        y0: row.tco,
        y1: row.tco + row.labCut,
      });
    }
    if (row.profit > 0) {
      const base = row.tco + row.labCut;
      segments.push({
        key: `${row.resultKey}|profit`,
        kind: 'profit',
        row,
        y0: base,
        y1: base + row.profit,
      });
    } else if (row.profit < 0) {
      segments.push({ key: `${row.resultKey}|loss`, kind: 'loss', row, y0: row.profit, y1: 0 });
    }
  }
  return segments;
}

/** Y domain that always includes zero, with headroom for the revenue label. */
export function profitYDomain(rows: readonly ProfitEstimatorRow[]): [number, number] {
  if (rows.length === 0) return [0, 1];
  // A loss bar stacks TCO and the license fee above the axis, and that sum can
  // exceed both revenue and TCO, so size the top to the tallest positive stack.
  const top = Math.max(0, ...rows.map((row) => Math.max(row.revenue, row.tco + row.labCut)));
  const bottom = Math.min(0, ...rows.map((row) => row.profit));
  return [bottom * 1.12, top === 0 ? 1 : top * 1.2];
}

export function rowLabel(row: ProfitEstimatorRow, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[row.hwKey] || getHardwareConfig(row.hwKey);
  const base = config ? getDisplayLabel(config) : row.hwKey;
  return row.precision ? `${base} (${row.precision.toUpperCase()})` : base;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function generateProfitTooltipHTML(
  row: ProfitEstimatorRow,
  hardwareConfig: HardwareConfig,
  assumptions: { utilizationPct: number; labCutPct: number },
  locale: Locale,
  isPinned: boolean,
  skuColor = 'var(--foreground)',
): string {
  const t = STRINGS[locale];
  const colon = locale === 'zh' ? '：' : ':';
  const label = escapeHtml(rowLabel(row, hardwareConfig));
  const line = (name: string, value: string, color?: string, opacity = 1) =>
    `<div style="display:flex; justify-content:space-between; gap:16px; color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><span>${
      color
        ? `<span style="display:inline-block; width:8px; height:8px; border-radius:2px; background:${color}; opacity:${opacity}; box-shadow: inset 0 0 0 1px ${color}; margin-right:6px; vertical-align:middle;"></span>`
        : ''
    }${name}${colon}</span><strong style="color: var(--foreground); font-variant-numeric: tabular-nums;">${value}</strong></div>`;

  const operatorMargin = row.revenue > 0 ? row.profit / row.revenue : Number.NaN;
  const profitLine =
    row.profit >= 0
      ? line(t.profit, formatUsdCompact(row.profit), skuColor)
      : line(t.loss, formatUsdCompact(row.profit), LOSS_FILL);
  const labCutLine = line(
    `${t.labCut} (${assumptions.labCutPct}% ${t.ofRevenue})`,
    formatUsdCompact(row.labCut),
    skuColor,
    LAB_CUT_OPACITY,
  );
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); min-width: 260px; max-width: 340px; pointer-events: auto; user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      <div style="color: var(--foreground); font-size: 13px; font-weight: 600; margin-bottom: 8px;">${label}</div>
      ${line(`${t.revenue} (${t.utilization} ${assumptions.utilizationPct}%)`, formatUsdCompact(row.revenue))}
      ${line(t.tco, formatUsdCompact(row.tco), skuColor, TCO_OPACITY)}
      ${line(t.grossMargin, formatUsdCompact(row.grossMargin))}
      ${labCutLine}
      ${profitLine}
      ${line(t.marginPct, Number.isFinite(operatorMargin) ? formatPct(operatorMargin) : '—')}
      <div style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;">
        ${line(t.revenuePerGpuHour, `$${row.revenuePerGpuHour.toFixed(2)}/GPU/hr`)}
        ${line(t.gpuHours, `${Math.round(row.gpuHoursPerGwYear).toLocaleString('en-US')} h`)}
      </div>
    </div>`;
}

interface ProfitEstimatorChartProps {
  rows: ProfitEstimatorRow[];
  hardwareConfig: HardwareConfig;
  colorResolver: (hwKey: string) => string;
  assumptions: { utilizationPct: number; labCutPct: number };
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
}

export default function ProfitEstimatorChart({
  rows,
  hardwareConfig,
  colorResolver,
  assumptions,
  legendElement,
  caption,
}: ProfitEstimatorChartProps) {
  const chartRef = useRef<D3ChartHandle>(null);
  const locale = useLocale();
  const t = STRINGS[locale];
  const strings = t;

  const segments = useMemo(() => buildProfitSegments(rows), [rows]);
  const yDomain = useMemo(() => profitYDomain(rows), [rows]);

  const xScaleConfig = useMemo<ScaleConfig>(
    () => ({ type: 'band', domain: rows.map((row) => row.resultKey), padding: 0.3 }),
    [rows],
  );
  const yScaleConfig = useMemo<ScaleConfig>(
    () => ({ type: 'linear', domain: yDomain, nice: true }),
    [yDomain],
  );

  const labelMap = useMemo(
    () => new Map(rows.map((row) => [row.resultKey, rowLabel(row, hardwareConfig)])),
    [rows, hardwareConfig],
  );
  const hwKeyByResultKey = useMemo(
    () => new Map(rows.map((row) => [row.resultKey, row.hwKey])),
    [rows],
  );

  const fillFor = useCallback(
    (segment: ProfitSegment): string => {
      if (segment.kind === 'loss') return `url(#${lossPatternId(segment.row.resultKey)})`;
      return colorResolver(segment.row.hwKey);
    },
    [colorResolver],
  );

  /** Resting stroke: the tinted segments (TCO, license fee) and loss are outlined in the SKU colour. */
  const outlineFor = useCallback(
    (segment: ProfitSegment): string =>
      segment.kind === 'profit' ? 'none' : colorResolver(segment.row.hwKey),
    [colorResolver],
  );

  /** In-segment text colour: neutral on the muted and translucent fills, luminance-picked on solid SKU fills. */
  const labelColorFor = useCallback(
    (segment: ProfitSegment): string => {
      if (segment.kind === 'profit') return contrastingTextColor(colorResolver(segment.row.hwKey));
      return 'var(--foreground)';
    },
    [colorResolver],
  );

  // Refs so the tooltip closure never goes stale without re-binding handlers.
  const tooltipStateRef = useRef({ hardwareConfig, assumptions, locale });
  tooltipStateRef.current = { hardwareConfig, assumptions, locale };
  const hoveredBarXRef = useRef(0);

  const layers = useMemo<LayerConfig<ProfitSegment>[]>(() => {
    const stackLayer: LayerConfig<ProfitSegment> = {
      type: 'custom',
      key: 'profit-stack',
      render: (group, ctx) => {
        const xScale = ctx.xScale as d3.ScaleBand<string>;
        const yScale = ctx.yScale as d3.ScaleLinear<number, number>;
        const bandwidth = xScale.bandwidth();

        // One diagonal-hatch pattern per losing SKU, in that SKU's colour, so a
        // loss reads as "same chip, below the line" rather than as a new colour.
        const lossRows = segments.filter((d) => d.kind === 'loss').map((d) => d.row);
        const defs = group
          .selectAll<SVGDefsElement, number>('defs.loss-patterns')
          .data([0])
          .join('defs')
          .attr('class', 'loss-patterns');
        const patterns = defs
          .selectAll<SVGPatternElement, ProfitEstimatorRow>('pattern')
          .data(lossRows, (d) => d.resultKey)
          .join((enter) => {
            const pattern = enter
              .append('pattern')
              .attr('patternUnits', 'userSpaceOnUse')
              .attr('width', 6)
              .attr('height', 6)
              .attr('patternTransform', 'rotate(45)');
            pattern.append('rect').attr('class', 'hatch-bg').attr('width', 6).attr('height', 6);
            pattern
              .append('line')
              .attr('class', 'hatch-line')
              .attr('x1', 0)
              .attr('y1', 0)
              .attr('x2', 0)
              .attr('y2', 6)
              .attr('stroke-width', 2);
            return pattern;
          })
          .attr('id', (d) => lossPatternId(d.resultKey));
        patterns
          .select('.hatch-bg')
          .attr('fill', (d) => colorResolver(d.hwKey))
          .attr('fill-opacity', 0.18);
        patterns.select('.hatch-line').attr('stroke', (d) => colorResolver(d.hwKey));

        // Zero line, drawn before the bars so loss segments sit on top of it.
        group
          .selectAll<SVGLineElement, number>('.zero-line')
          .data([0])
          .join('line')
          .attr('class', 'zero-line')
          .attr('x1', 0)
          .attr('x2', ctx.width)
          .attr('y1', yScale(0))
          .attr('y2', yScale(0))
          .attr('stroke', 'var(--foreground)')
          .attr('stroke-opacity', 0.6)
          .attr('stroke-width', 1);

        const bars = group
          .selectAll<SVGRectElement, ProfitSegment>('.bar')
          .data(segments, (d) => d.key)
          .join('rect')
          .attr('class', (d) => `bar bar-${d.kind}`)
          .attr('data-kind', (d) => d.kind)
          .attr('x', (d) => xScale(d.row.resultKey) ?? 0)
          .attr('width', bandwidth)
          .attr('y', (d) => yScale(d.y1))
          .attr('height', (d) => Math.max(0, yScale(d.y0) - yScale(d.y1)))
          .attr('fill', (d) => fillFor(d))
          .attr('fill-opacity', (d) =>
            d.kind === 'tco'
              ? TCO_OPACITY
              : d.kind === 'labCut'
                ? LAB_CUT_OPACITY
                : d.kind === 'loss'
                  ? 1
                  : 0.9,
          )
          .attr('stroke', (d) => outlineFor(d))
          .attr('stroke-width', (d) => (d.kind === 'profit' ? 0 : 1))
          .attr('rx', 1)
          .attr('cursor', 'pointer');

        // Name and amount inside every segment tall enough to hold them.
        const labelText = {
          tco: strings.tco,
          labCut: strings.labCut,
          profit: strings.profit,
          loss: strings.loss,
        };
        const segmentLabels = segments.map((d) => {
          const height = Math.max(0, yScale(d.y0) - yScale(d.y1));
          return { segment: d, lines: segmentLabelLines(d.kind, d.row, height, labelText), height };
        });
        const segmentText = group
          .selectAll<SVGTextElement, (typeof segmentLabels)[number]>('.segment-label')
          .data(segmentLabels, (d) => d.segment.key)
          .join('text')
          .attr('class', (d) => `segment-label segment-label-${d.segment.kind}`)
          .attr('x', (d) => (xScale(d.segment.row.resultKey) ?? 0) + bandwidth / 2)
          .attr('y', (d) => {
            const mid = (yScale(d.segment.y0) + yScale(d.segment.y1)) / 2;
            return d.lines.length === 2 ? mid - CHART_TYPE.annotation * 0.15 : mid;
          })
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', px(CHART_TYPE.annotation))
          .attr('pointer-events', 'none')
          .style('fill', (d) => labelColorFor(d.segment));
        segmentText
          .selectAll<SVGTSpanElement, string>('tspan')
          .data((d) => d.lines.map((line, index) => ({ line, index, count: d.lines.length })))
          .join('tspan')
          .attr('x', function () {
            return (this.parentNode as SVGTextElement).getAttribute('x');
          })
          .attr('dy', (d) => (d.count === 2 ? (d.index === 0 ? '-0.55em' : '1.15em') : '0'))
          .attr('font-weight', (d) => (d.count === 2 && d.index === 1 ? '600' : '400'))
          .text((d) => d.line);

        // Revenue above the stack with the operator margin under it; the loss
        // figure sits below the bar when the stack dips under zero.
        const labelData = segments.filter((d) => d.kind === 'tco');
        const revenueText = group
          .selectAll<SVGTextElement, ProfitSegment>('.revenue-label')
          .data(labelData, (d) => d.row.resultKey)
          .join('text')
          .attr('class', 'revenue-label')
          .attr('x', (d) => (xScale(d.row.resultKey) ?? 0) + bandwidth / 2)
          .attr('y', (d) => yScale(Math.max(d.row.revenue, d.row.tco)) - 20)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.axisLabel))
          .attr('font-weight', '700')
          .style('fill', 'var(--foreground)');
        revenueText
          .selectAll<SVGTSpanElement, ProfitSegment>('tspan')
          .data((d) => [
            { row: d.row, text: formatUsdCompact(d.row.revenue), sub: false },
            { row: d.row, text: operatorMarginLabel(d.row, strings.marginShort), sub: true },
          ])
          .join('tspan')
          .attr('class', (d) => (d.sub ? 'revenue-margin' : 'revenue-amount'))
          .attr('x', (d) => (xScale(d.row.resultKey) ?? 0) + bandwidth / 2)
          .attr('dy', (d) => (d.sub ? '1.2em' : '0'))
          .attr('font-size', (d) => (d.sub ? px(CHART_TYPE.annotation) : null))
          .attr('font-weight', (d) => (d.sub ? '500' : '700'))
          .style('fill', (d) =>
            d.sub
              ? d.row.profit < 0
                ? LOSS_FILL
                : 'var(--muted-foreground)'
              : 'var(--foreground)',
          )
          .text((d) => d.text);

        group
          .selectAll<SVGTextElement, ProfitSegment>('.loss-label')
          .data(
            labelData.filter((d) => d.row.profit < 0),
            (d) => d.row.resultKey,
          )
          .join('text')
          .attr('class', 'loss-label')
          .attr('x', (d) => (xScale(d.row.resultKey) ?? 0) + bandwidth / 2)
          .attr('y', (d) => yScale(d.row.profit) + 14)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.annotation))
          .attr('font-weight', '600')
          .style('fill', LOSS_FILL)
          .text((d) => `${strings.loss} ${formatUsdCompact(d.row.profit)}`);

        return bars;
      },
    };
    return [stackLayer];
  }, [segments, fillFor, outlineFor, labelColorFor, colorResolver, strings]);

  const tooltip = useMemo(
    () => ({
      rulerType: 'vertical' as const,
      content: (segment: ProfitSegment, isPinned: boolean) => {
        const state = tooltipStateRef.current;
        return generateProfitTooltipHTML(
          segment.row,
          state.hardwareConfig,
          state.assumptions,
          state.locale,
          isPinned,
          colorResolver(segment.row.hwKey),
        );
      },
      getRulerX: () => hoveredBarXRef.current,
      onHoverStart: (
        selection: d3.Selection<SVGRectElement, ProfitSegment, SVGGElement, unknown>,
        segment: ProfitSegment,
      ) => {
        hoveredBarXRef.current =
          Number.parseFloat(selection.attr('x') || '0') +
          Number.parseFloat(selection.attr('width') || '0') / 2;
        const svgEl = chartRef.current?.getSvgElement();
        if (!svgEl) return;
        d3.select(svgEl)
          .selectAll<SVGRectElement, ProfitSegment>('.bar')
          .attr('stroke', (d) =>
            d.row.resultKey === segment.row.resultKey ? 'var(--foreground)' : outlineFor(d),
          )
          .attr('stroke-width', (d) =>
            d.row.resultKey === segment.row.resultKey ? 1.5 : outlineFor(d) === 'none' ? 0 : 1,
          );
      },
      onHoverEnd: () => {
        const svgEl = chartRef.current?.getSvgElement();
        if (!svgEl) return;
        d3.select(svgEl)
          .selectAll<SVGRectElement, ProfitSegment>('.bar')
          .attr('stroke', (d) => outlineFor(d))
          .attr('stroke-width', (d) => (outlineFor(d) === 'none' ? 0 : 1));
      },
      onPointClick: (segment: ProfitSegment) => {
        track('profit_bar_selected', { gpu: segment.row.hwKey, segment: segment.kind });
      },
      attachToLayer: 0,
    }),
    [outlineFor, colorResolver],
  );

  const xAxisConfig = useMemo(
    () => ({
      tickFormat: (d: d3.AxisDomain) => labelMap.get(String(d)) ?? String(d),
      customize: (axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        const fontPx = CHART_TYPE.axisLabelSub;
        const ticks = axisGroup.selectAll<SVGGElement, d3.AxisDomain>('.tick');
        ticks.each(function (d) {
          const tick = d3.select(this);
          const icon = getLineLabelVendorIcon(hwKeyByResultKey.get(String(d)) ?? '');
          // The label is rotated about the tick and anchored at its end, so
          // the text runs away from the axis towards the lower left. The
          // vendor mark sits between the tick and the text, on the same
          // rotated baseline, and the text shifts left to make room for it.
          const iconOffset = icon ? icon.width + X_LABEL_ICON_GAP : 0;
          tick
            .select<SVGTextElement>('text')
            .attr('transform', `rotate(${X_LABEL_ROTATION})`)
            .attr('text-anchor', 'end')
            .attr('dx', `${-(X_LABEL_DX_EM * fontPx + iconOffset)}px`)
            .attr('dy', '0.6em')
            .attr('font-size', px(fontPx))
            .style('fill', 'var(--foreground)');
          tick.selectAll('image.vendor-mark').remove();
          if (!icon) return;
          const scale = X_LABEL_ICON_SIZE / Math.max(icon.width, icon.height);
          const w = icon.width * scale;
          const h = icon.height * scale;
          // Centre of the mark in the label's rotated frame: just before the
          // text end, vertically on the x-height (the baseline sits at dy=0.6em).
          const cx = -(X_LABEL_DX_EM * fontPx) - w / 2;
          const cy = 0.6 * fontPx - h / 2 + fontPx * 0.15;
          // Map back to the tick's frame so the mark itself stays upright.
          const theta = (X_LABEL_ROTATION * Math.PI) / 180;
          const px0 = cx * Math.cos(theta) - cy * Math.sin(theta);
          const py0 = cx * Math.sin(theta) + cy * Math.cos(theta);
          tick
            .append('image')
            .attr('class', 'vendor-mark dark:invert')
            .attr('aria-hidden', 'true')
            .attr('href', icon.href)
            .attr('width', w)
            .attr('height', h)
            .attr('x', px0 - w / 2)
            .attr('y', py0 - h / 2)
            .style('pointer-events', 'none');
        });
      },
    }),
    [labelMap, hwKeyByResultKey],
  );

  const yAxisConfig = useMemo(
    () => ({
      label: t.yAxis,
      tickFormat: (d: d3.AxisDomain) => formatUsdCompact(Number(d), 0),
      tickCount: 8,
    }),
    [t.yAxis],
  );

  const onRender = useMemo(
    () => (ctx: RenderContext) => {
      // The y-axis title is set by the shared renderer; keep tick text tabular.
      ctx.layout.yAxisGroup.selectAll('text').style('font-variant-numeric', 'tabular-nums');
    },
    [],
  );

  const dataIdentity = useMemo(() => rows.map((row) => row.resultKey).join('|'), [rows]);
  const metricIdentity = useMemo(
    () => rows.map((row) => `${row.revenue}:${row.tco}:${row.labCut}:${row.profit}`).join('|'),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-64 text-muted-foreground"
        data-testid="profit-no-data"
      >
        {t.noData}
      </div>
    );
  }

  return (
    <div className="w-full">
      <D3Chart<ProfitSegment>
        ref={chartRef}
        chartId="profit-estimator-chart"
        data={segments}
        dataIdentity={dataIdentity}
        metricIdentity={metricIdentity}
        height={CHART_HEIGHT}
        margin={CHART_MARGIN}
        watermark={getChartWatermark()}
        testId="profit-estimator-chart"
        clipContent={false}
        xScale={xScaleConfig}
        yScale={yScaleConfig}
        xAxis={xAxisConfig}
        yAxis={yAxisConfig}
        layers={layers}
        tooltip={tooltip}
        onRender={onRender}
        instructions={t.instructions}
        legendElement={legendElement}
        caption={caption}
      />
    </div>
  );
}
