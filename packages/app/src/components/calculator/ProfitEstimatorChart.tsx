'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';

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
import { getAxisVendorIcon } from '@/lib/vendor-logos';

import {
  formatProfitUsd,
  type ProfitBasis,
  type ProfitEstimatorAssumptions,
  type ProfitEstimatorRow,
} from './profit-estimator';

export type ProfitSegmentKind = 'tco' | 'labCut' | 'profit' | 'loss';

/** One rectangle of the stack. `y0`/`y1` are $ per basis; loss segments run below zero. */
export interface ProfitSegment {
  key: string;
  kind: ProfitSegmentKind;
  row: ProfitEstimatorRow;
  y0: number;
  y1: number;
}

/**
 * Base margins for slanted x labels. The bottom is only a floor for the
 * shortest labels (tick, one line of text and a little air); `slantedMargins`
 * grows both the bottom and the left from the actual label set, so a short
 * label set does not leave a band of dead space between the axis and the
 * formula note under the chart. The longest SKU label (≈32 chars, ≈190px at
 * the sub-label size) rotated 50° needs ≈146px of drop and ≈122px of reach.
 */
const CHART_MARGIN = { top: 12, right: 24, bottom: 40, left: 116 };
/** Bottom margin when the x labels stand upright on two lines (name / framework). */
const X_LABEL_STACKED_BOTTOM = 64;
/** Extra bottom margin for the third stacked line a compare-history date adds. */
const X_LABEL_HISTORY_LINE_PX = 16;
/** Tallest the chart gets, on a viewport with room to spare. */
export const CHART_HEIGHT = 720;
/** Shortest the chart gets; below this the in-bar labels start colliding. */
export const CHART_HEIGHT_MIN = 440;
/**
 * Viewport height not available to the chart: the sticky site nav (~56px),
 * the card header above the plot (title, subtitle, TCO badges and selling
 * price, ~170px) and card padding. The chart shrinks to fit what is left so
 * the title and the x labels share one laptop screen without scrolling.
 */
export const CHART_VIEWPORT_RESERVE = 260;
/** Below this container width the chart uses the compact margins and height. */
export const COMPACT_CHART_MAX_WIDTH = 640;
const CHART_MARGIN_COMPACT = { top: 12, right: 8, bottom: 40, left: 64 };
export const CHART_HEIGHT_COMPACT = 560;

/** Chart height for a viewport: as tall as `maxHeight`, but never taller than the space under the card header. */
export function chartHeightForViewport(
  viewportHeightPx: number | undefined,
  maxHeight: number = CHART_HEIGHT,
): number {
  if (!Number.isFinite(viewportHeightPx) || (viewportHeightPx as number) <= 0) return maxHeight;
  const available = Math.floor((viewportHeightPx as number) - CHART_VIEWPORT_RESERVE);
  return Math.min(maxHeight, Math.max(CHART_HEIGHT_MIN, available));
}

/** Window inner height, tracked across resizes; undefined before mount so SSR and first paint agree. */
function useViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return height;
}
/** Average glyph advance as a share of font size; used to test whether a label fits a bar. */
const GLYPH_WIDTH_EM = 0.55;
/** Horizontal breathing room a label needs inside its bar, in px. */
const LABEL_SIDE_PAD_PX = 4;
/** The margin line above a bar may borrow this much of the gap to each neighbour, in px. */
const X_GAP_ALLOWANCE = 12;

/** Rough rendered width of `text` at `fontPx`, for fit tests before anything is drawn. */
export function estimateTextWidth(text: string, fontPx: number): number {
  return text.length * GLYPH_WIDTH_EM * fontPx;
}
const X_LABEL_ROTATION = -50;

export type XLabelLayout = 'stacked' | 'slanted';

/**
 * Split "GB300 NVL72 (Dynamo vLLM) (FP4)" into ["GB300 NVL72", "(Dynamo vLLM) (FP4)"]
 * so the SKU name and its framework can sit on two lines under the tick.
 * A label with no parenthesis stays on one line.
 */
export function splitAxisLabel(label: string): [string, string] {
  const at = label.indexOf(' (');
  if (at === -1) return [label, ''];
  return [label.slice(0, at), label.slice(at + 1)];
}

/** Separator between a compare-history label and its run date; matches the `/inference` legend. */
export const HISTORY_LABEL_SEP = ' • ';

/**
 * Split a compare-history label "B200 (FP4) • 2026-06-14" into its config and
 * date so the date can sit on its own axis line. A label without a date has
 * an empty second half.
 */
export function splitHistoryLabel(label: string): [string, string] {
  const at = label.lastIndexOf(HISTORY_LABEL_SEP);
  if (at === -1) return [label, ''];
  return [label.slice(0, at), label.slice(at + HISTORY_LABEL_SEP.length)];
}

/**
 * Upright two-line labels when every SKU fits in its own slot; otherwise the
 * classic slanted single line. `slotPx` is the horizontal room per tick,
 * `fontPx` the label size.
 */
export function xLabelLayout(labels: string[], slotPx: number, fontPx: number): XLabelLayout {
  if (labels.length === 0 || slotPx <= 0) return 'slanted';
  const widest = Math.max(
    ...labels.map((label) => {
      const [config, date] = splitHistoryLabel(label);
      const [name, detail] = splitAxisLabel(config);
      return Math.max(
        estimateTextWidth(name, fontPx),
        estimateTextWidth(detail, fontPx),
        estimateTextWidth(date, fontPx),
      );
    }),
  );
  return widest + LABEL_SIDE_PAD_PX * 2 <= slotPx ? 'stacked' : 'slanted';
}

/** Tick length plus padding: where d3 starts the label text below the axis, px. */
const X_TICK_TEXT_OFFSET = 9;

/**
 * Margins a slanted label set needs so no glyph leaves the SVG. The widest
 * label projects `cos` of its length left of the first tick and `sin` below
 * the axis; `slotPx / 2` of the reach is already inside the plot because the
 * first tick sits half a slot in. Never smaller than `base`.
 */
export function slantedMargins(
  labels: string[],
  slotPx: number,
  fontPx: number,
  base: { top: number; right: number; bottom: number; left: number },
): { top: number; right: number; bottom: number; left: number } {
  const widest = Math.max(
    0,
    ...labels.map((label) => estimateTextWidth(label, fontPx) + X_LABEL_DX_EM * fontPx),
  );
  const rad = (Math.abs(X_LABEL_ROTATION) * Math.PI) / 180;
  const reach = widest * Math.cos(rad) - Math.max(0, slotPx) / 2 + LABEL_SIDE_PAD_PX;
  const drop = widest * Math.sin(rad) + X_TICK_TEXT_OFFSET + fontPx;
  return {
    ...base,
    left: Math.max(base.left, Math.ceil(reach)),
    bottom: Math.max(base.bottom, Math.ceil(drop)),
  };
}
/** Distance from the tick to the label's end, in em (the d3 default is 0). */
const X_LABEL_DX_EM = 0.4;
/** Band-scale padding between bars; also drives the vendor-mark size above each bar. */
const BAND_PADDING = 0.3;
/** Gap between the top of the stack and the revenue figure's baseline, in px. */
const REVENUE_LABEL_GAP = 20;
/** Smallest vendor mark above a bar, in px; what a phone-width bar gets. */
export const BAR_ICON_MIN_HEIGHT = 14;
/** Largest vendor mark above a bar, in px, however wide the bar gets. */
export const BAR_ICON_MAX_HEIGHT = 48;
/** Share of the bar width the mark grows to between those bounds. */
const BAR_ICON_WIDTH_SHARE = 0.3;
/** Gap between the vendor mark and the top of the revenue figure, in px. */
const BAR_ICON_GAP = 4;

/** Vendor mark height for a bar `bandwidthPx` wide: as big as the bar allows, within bounds. */
export function barMarkHeight(bandwidthPx: number): number {
  if (!Number.isFinite(bandwidthPx) || bandwidthPx <= 0) return BAR_ICON_MIN_HEIGHT;
  return Math.min(
    BAR_ICON_MAX_HEIGHT,
    Math.max(BAR_ICON_MIN_HEIGHT, bandwidthPx * BAR_ICON_WIDTH_SHARE),
  );
}

function barMarkWidth(
  icon: { width: number; height: number } | undefined,
  heightPx: number,
): number {
  return icon ? (icon.width / icon.height) * heightPx : 0;
}

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
    yAxis: {
      'gw-year': 'Revenue per all-in provisioned utility GW per year ($ USD)',
      'chip-hour': 'Revenue per chip per hour ($ USD)',
    },
    yAxisCompact: {
      'gw-year': 'Revenue per provisioned GW-year ($ USD)',
      'chip-hour': 'Revenue per chip-hour ($ USD)',
    },
    revenue: 'Revenue',
    revenuePerGpuHour: 'Revenue per GPU-hour',
    tco: 'Compute Expense',
    grossMargin: 'Gross Margin',
    labCut: 'Model License Fee',
    profit: 'Profit',
    loss: 'Loss',
    marginPct: 'Margin',
    marginShort: 'margin',
    utilization: 'Utilization',
    labCutShare: 'License fee share',
    ofRevenue: 'of revenue',
    dismiss: 'Click anywhere to dismiss',
    runDate: 'Run date',
    noData: 'No SKU can be priced for the current selection.',
  },
  zh: {
    yAxis: {
      'gw-year': '每全电源配置吉瓦每年收入（美元）',
      'chip-hour': '每芯片每小时收入（美元）',
    },
    yAxisCompact: {
      'gw-year': '每吉瓦每年收入（美元）',
      'chip-hour': '每芯片小时收入（美元）',
    },
    revenue: '收入',
    revenuePerGpuHour: '每 GPU 小时收入',
    tco: '算力支出',
    grossMargin: '毛利',
    labCut: '模型许可费',
    profit: '利润',
    loss: '亏损',
    marginPct: '利润率',
    marginShort: '利润率',
    utilization: '利用率',
    labCutShare: '许可费比例',
    ofRevenue: '（占收入）',
    dismiss: '点击任意位置关闭',
    runDate: '运行日期',
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
  widthPx: number = Number.POSITIVE_INFINITY,
  basis: ProfitBasis = 'gw-year',
): string[] {
  // Profit and loss both read `row.profit`; the loss kind only changes the word.
  const amount = kind === 'tco' ? row.tco : kind === 'labCut' ? row.labCut : row.profit;
  const name =
    kind === 'tco' ? t.tco : kind === 'labCut' ? t.labCut : kind === 'profit' ? t.profit : t.loss;
  const amountText = formatProfitUsd(amount, basis);
  const fits = (text: string) =>
    estimateTextWidth(text, CHART_TYPE.annotation) + LABEL_SIDE_PAD_PX <= widthPx;
  // A narrow bar (phones) drops the name first, then the amount, so text
  // never spills into the neighbouring bar.
  if (!fits(amountText)) return [];
  if (heightPx >= SEGMENT_TWO_LINE_MIN_PX && fits(name)) return [name, amountText];
  if (heightPx >= SEGMENT_ONE_LINE_MIN_PX) return [amountText];
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

/**
 * Margin as a share of revenue, formatted for the label above the bar. When
 * the bar is too narrow for the word, only the percentage is shown.
 */
export function operatorMarginLabel(
  row: ProfitEstimatorRow,
  marginWord: string,
  widthPx: number = Number.POSITIVE_INFINITY,
): string {
  if (!(row.revenue > 0)) return '';
  const pct = formatPct(row.profit / row.revenue);
  const full = `${pct} ${marginWord}`;
  return estimateTextWidth(full, CHART_TYPE.annotation) <= widthPx ? full : pct;
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

/**
 * Pixels the tallest stack needs above it: the revenue figure and margin line
 * (REVENUE_LABEL_GAP covers both), then a vendor mark `iconHeightPx` tall and its gap.
 */
export function stackHeadroomPx(iconHeightPx = BAR_ICON_MIN_HEIGHT): number {
  return REVENUE_LABEL_GAP + CHART_TYPE.axisLabel + BAR_ICON_GAP + iconHeightPx + 8;
}

/** Headroom with the smallest vendor mark; what a phone-width chart reserves. */
export const STACK_HEADROOM_PX = stackHeadroomPx();

/**
 * Y domain for the bars. The top is the tallest positive stack plus exactly the
 * pixel headroom its labels need (`headroomPx`), converted to data units through
 * `plotHeightPx` (a proportional 30% fallback when the plot has not been measured yet).
 */
export function profitYDomain(
  rows: readonly ProfitEstimatorRow[],
  plotHeightPx = 0,
  headroomPx = STACK_HEADROOM_PX,
): [number, number] {
  if (rows.length === 0) return [0, 1];
  // A loss bar stacks TCO and the license fee above the axis, and that sum can
  // exceed both revenue and TCO, so size the top to the tallest positive stack.
  const top = Math.max(0, ...rows.map((row) => Math.max(row.revenue, row.tco + row.labCut)));
  const bottom = Math.min(0, ...rows.map((row) => row.profit));
  const span = top - bottom;
  const headroom =
    plotHeightPx > headroomPx * 2 ? (span * headroomPx) / (plotHeightPx - headroomPx) : span * 0.3;
  return [bottom * 1.12, top === 0 ? 1 : top + headroom];
}

export function rowLabel(row: ProfitEstimatorRow, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[row.hwKey] || getHardwareConfig(row.hwKey);
  const base = config ? getDisplayLabel(config) : row.hwKey;
  const withPrecision = row.precision ? `${base} (${row.precision.toUpperCase()})` : base;
  // A compare-history bar names the run date it was priced on, as the
  // `/inference` legend does for its "config • date" series.
  return row.date ? `${withPrecision}${HISTORY_LABEL_SEP}${row.date}` : withPrecision;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function generateProfitTooltipHTML(
  row: ProfitEstimatorRow,
  hardwareConfig: HardwareConfig,
  assumptions: ProfitEstimatorAssumptions,
  locale: Locale,
  isPinned: boolean,
  skuColor = 'var(--foreground)',
): string {
  const t = STRINGS[locale];
  const usd = (value: number) => formatProfitUsd(value, assumptions.basis);
  const colon = locale === 'zh' ? '：' : ':';
  const label = escapeHtml(splitHistoryLabel(rowLabel(row, hardwareConfig))[0]);
  const line = (name: string, value: string, color?: string, opacity = 1) =>
    `<div style="display:flex; justify-content:space-between; gap:16px; color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><span>${
      color
        ? `<span style="display:inline-block; width:8px; height:8px; border-radius:2px; background:${color}; opacity:${opacity}; box-shadow: inset 0 0 0 1px ${color}; margin-right:6px; vertical-align:middle;"></span>`
        : ''
    }${name}${colon}</span><strong style="color: var(--foreground); font-variant-numeric: tabular-nums;">${value}</strong></div>`;

  const operatorMargin = row.revenue > 0 ? row.profit / row.revenue : Number.NaN;
  const profitLine =
    row.profit >= 0
      ? line(t.profit, usd(row.profit), skuColor)
      : line(t.loss, usd(row.profit), LOSS_FILL);
  const labCutLine = line(
    `${t.labCut} (${assumptions.labCutPct}% ${t.ofRevenue})`,
    usd(row.labCut),
    skuColor,
    LAB_CUT_OPACITY,
  );
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); min-width: 260px; max-width: 340px; pointer-events: auto; user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      <div style="color: var(--foreground); font-size: 13px; font-weight: 600; margin-bottom: 8px;">${label}</div>
      ${row.date ? line(t.runDate, escapeHtml(row.date)) : ''}
      ${line(`${t.revenue} (${t.utilization} ${assumptions.utilizationPct}%)`, usd(row.revenue))}
      ${line(t.tco, usd(row.tco), skuColor, TCO_OPACITY)}
      ${line(t.grossMargin, usd(row.grossMargin))}
      ${labCutLine}
      ${profitLine}
      ${line(t.marginPct, Number.isFinite(operatorMargin) ? formatPct(operatorMargin) : '—')}
      ${
        // Per chip-hour the bar already is the $/GPU/hr figure.
        assumptions.basis === 'gw-year'
          ? `<div style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;">
        ${line(t.revenuePerGpuHour, `$${row.revenuePerGpuHour.toFixed(2)}/GPU/hr`)}
      </div>`
          : ''
      }
    </div>`;
}

interface ProfitEstimatorChartProps {
  rows: ProfitEstimatorRow[];
  hardwareConfig: HardwareConfig;
  /**
   * Colour of a row's bar. Keyed by the whole row, not just the hwKey, so a
   * compare-history view can shade a chip's older dates lighter than today's.
   */
  colorResolver: (row: ProfitEstimatorRow) => string;
  assumptions: ProfitEstimatorAssumptions;
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
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: CHART_HEIGHT });
  const compact = dimensions.width > 0 && dimensions.width < COMPACT_CHART_MAX_WIDTH;
  const viewportHeight = useViewportHeight();
  const chartHeight = chartHeightForViewport(
    viewportHeight,
    compact ? CHART_HEIGHT_COMPACT : CHART_HEIGHT,
  );
  const locale = useLocale();
  const t = STRINGS[locale];
  const strings = t;
  const basis = assumptions.basis;

  const segments = useMemo(() => buildProfitSegments(rows), [rows]);

  const xScaleConfig = useMemo<ScaleConfig>(
    () => ({ type: 'band', domain: rows.map((row) => row.resultKey), padding: BAND_PADDING }),
    [rows],
  );
  const labelMap = useMemo(
    () => new Map(rows.map((row) => [row.resultKey, rowLabel(row, hardwareConfig)])),
    [rows, hardwareConfig],
  );

  const fillFor = useCallback(
    (segment: ProfitSegment): string => {
      if (segment.kind === 'loss') return `url(#${lossPatternId(segment.row.resultKey)})`;
      return colorResolver(segment.row);
    },
    [colorResolver],
  );

  /** Resting stroke: the tinted segments (TCO, license fee) and loss are outlined in the SKU colour. */
  const outlineFor = useCallback(
    (segment: ProfitSegment): string =>
      segment.kind === 'profit' ? 'none' : colorResolver(segment.row),
    [colorResolver],
  );

  /** In-segment text colour: neutral on the muted and translucent fills, luminance-picked on solid SKU fills. */
  const labelColorFor = useCallback(
    (segment: ProfitSegment): string => {
      if (segment.kind === 'profit') return contrastingTextColor(colorResolver(segment.row));
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
          .attr('fill', (d) => colorResolver(d))
          .attr('fill-opacity', 0.18);
        patterns.select('.hatch-line').attr('stroke', (d) => colorResolver(d));

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
          return {
            segment: d,
            lines: segmentLabelLines(d.kind, d.row, height, labelText, bandwidth, basis),
            height,
          };
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

        // Revenue above the stack with the margin under it; the loss figure
        // sits below the bar when the stack dips under zero. The vendor's
        // full-color mark sits above the revenue figure.
        const labelData = segments.filter((d) => d.kind === 'tco');
        const stackTopPx = (d: ProfitSegment) => yScale(Math.max(d.row.revenue, d.row.tco));
        const revenueBaselineY = (d: ProfitSegment) => stackTopPx(d) - REVENUE_LABEL_GAP;
        // Same size the y domain reserved headroom for (both derive from the band width).
        const iconHeight = barMarkHeight(bandwidth);
        group
          .selectAll<SVGImageElement, ProfitSegment>('image.bar-vendor-mark')
          .data(
            labelData.filter((d) => getAxisVendorIcon(d.row.hwKey)),
            (d) => d.row.resultKey,
          )
          .join('image')
          .attr('class', (d) =>
            getAxisVendorIcon(d.row.hwKey)?.monochrome
              ? 'bar-vendor-mark dark:invert'
              : 'bar-vendor-mark',
          )
          .attr('aria-hidden', 'true')
          .attr('href', (d) => getAxisVendorIcon(d.row.hwKey)?.href ?? '')
          .attr('width', (d) => barMarkWidth(getAxisVendorIcon(d.row.hwKey), iconHeight))
          .attr('height', iconHeight)
          .attr('x', (d) => {
            const w = barMarkWidth(getAxisVendorIcon(d.row.hwKey), iconHeight);
            return (xScale(d.row.resultKey) ?? 0) + bandwidth / 2 - w / 2;
          })
          .attr('y', (d) => revenueBaselineY(d) - CHART_TYPE.axisLabel - BAR_ICON_GAP - iconHeight)
          .attr('pointer-events', 'none');
        const revenueText = group
          .selectAll<SVGTextElement, ProfitSegment>('.revenue-label')
          .data(labelData, (d) => d.row.resultKey)
          .join('text')
          .attr('class', 'revenue-label')
          .attr('x', (d) => (xScale(d.row.resultKey) ?? 0) + bandwidth / 2)
          .attr('y', revenueBaselineY)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.axisLabel))
          .attr('font-weight', '700')
          .style('fill', 'var(--foreground)');
        revenueText
          .selectAll<SVGTSpanElement, ProfitSegment>('tspan')
          .data((d) => [
            { row: d.row, text: formatProfitUsd(d.row.revenue, basis), sub: false },
            {
              row: d.row,
              text: operatorMarginLabel(d.row, strings.marginShort, bandwidth + X_GAP_ALLOWANCE),
              sub: true,
            },
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
          .text((d) => `${strings.loss} ${formatProfitUsd(d.row.profit, basis)}`);

        return bars;
      },
    };
    return [stackLayer];
  }, [segments, fillFor, outlineFor, labelColorFor, colorResolver, strings, basis]);

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
          colorResolver(segment.row),
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

  const baseMargin = compact ? CHART_MARGIN_COMPACT : CHART_MARGIN;
  // Upright two-line labels when each SKU has room for them; slanted otherwise.
  const labelLayout = useMemo<XLabelLayout>(() => {
    const plotWidth = dimensions.width - baseMargin.left - baseMargin.right;
    const slot = rows.length > 0 ? plotWidth / rows.length : 0;
    return xLabelLayout([...labelMap.values()], slot, CHART_TYPE.axisLabelSub);
  }, [dimensions.width, baseMargin, rows.length, labelMap]);
  const margin = useMemo(() => {
    if (labelLayout === 'stacked') {
      const dated = [...labelMap.values()].some((label) => splitHistoryLabel(label)[1] !== '');
      return {
        ...baseMargin,
        bottom: X_LABEL_STACKED_BOTTOM + (dated ? X_LABEL_HISTORY_LINE_PX : 0),
      };
    }
    const plotWidth = dimensions.width - baseMargin.left - baseMargin.right;
    const slot = rows.length > 0 ? plotWidth / rows.length : 0;
    return slantedMargins([...labelMap.values()], slot, CHART_TYPE.axisLabelSub, baseMargin);
  }, [baseMargin, labelLayout, dimensions.width, rows.length, labelMap]);
  const plotHeight = chartHeight - margin.top - margin.bottom;
  // The vendor mark grows with the bar, so the headroom above the tallest stack
  // has to be sized from the same band width the renderer will see.
  const bandwidth = useMemo(() => {
    const plotWidth = dimensions.width - margin.left - margin.right;
    if (plotWidth <= 0 || rows.length === 0) return 0;
    return d3
      .scaleBand<string>()
      .domain(rows.map((row) => row.resultKey))
      .range([0, plotWidth])
      .padding(BAND_PADDING)
      .bandwidth();
  }, [dimensions.width, margin, rows]);
  const yDomain = useMemo(
    () => profitYDomain(rows, plotHeight, stackHeadroomPx(barMarkHeight(bandwidth))),
    [rows, plotHeight, bandwidth],
  );
  const yScaleConfig = useMemo<ScaleConfig>(
    () => ({ type: 'linear', domain: yDomain, nice: true }),
    [yDomain],
  );

  const xAxisConfig = useMemo(
    () => ({
      tickFormat: (d: d3.AxisDomain) => labelMap.get(String(d)) ?? String(d),
      customize: (axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => {
        const fontPx = CHART_TYPE.axisLabelSub;
        axisGroup.selectAll<SVGGElement, d3.AxisDomain>('.tick').each(function (d) {
          const text = d3
            .select(this)
            .select<SVGTextElement>('text')
            .attr('font-size', px(fontPx))
            .style('fill', 'var(--foreground)');
          if (labelLayout === 'stacked') {
            // Two upright lines centred on the tick: SKU name, then the
            // framework and precision in parentheses.
            const [config, date] = splitHistoryLabel(labelMap.get(String(d)) ?? String(d));
            const [name, detail] = splitAxisLabel(config);
            text
              .attr('transform', null)
              .attr('text-anchor', 'middle')
              .attr('dx', null)
              .attr('dy', '0.9em')
              .text(null);
            text.append('tspan').attr('x', 0).text(name);
            if (detail) text.append('tspan').attr('x', 0).attr('dy', '1.2em').text(detail);
            // Compare-history bars carry their run date on a third, muted line.
            if (date) {
              text
                .append('tspan')
                .attr('x', 0)
                .attr('dy', '1.2em')
                .attr('class', 'history-date')
                .style('fill', 'var(--muted-foreground)')
                .text(date);
            }
            return;
          }
          // One line rotated about the tick and anchored at its end, so the
          // text runs away from the axis towards the lower left.
          text
            .attr('transform', `rotate(${X_LABEL_ROTATION})`)
            .attr('text-anchor', 'end')
            .attr('dx', `${-(X_LABEL_DX_EM * fontPx)}px`)
            .attr('dy', '0.6em');
        });
      },
    }),
    [labelMap, labelLayout],
  );

  // The full axis label is longer than a phone-height plot; the compact
  // chart uses the short form.
  const yAxisConfig = useMemo(
    () => ({
      label: compact ? t.yAxisCompact[basis] : t.yAxis[basis],
      tickFormat: (d: d3.AxisDomain) => formatProfitUsd(Number(d), basis, 0),
      tickCount: 8,
    }),
    [compact, basis, t.yAxis, t.yAxisCompact],
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
    <div className="w-full" ref={setContainerRef}>
      <D3Chart<ProfitSegment>
        ref={chartRef}
        chartId="profit-estimator-chart"
        data={segments}
        dataIdentity={dataIdentity}
        metricIdentity={metricIdentity}
        height={chartHeight}
        margin={margin}
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
        // No hover hint: the bars carry their own labels and the tooltip is discoverable.
        instructions=""
        legendElement={legendElement}
        caption={caption}
      />
    </div>
  );
}
