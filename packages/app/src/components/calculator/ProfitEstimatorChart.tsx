'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';

import type { HardwareConfig } from '@/components/inference/types';
import { track } from '@/lib/analytics/analytics';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  D3ChartHandle,
  LayerConfig,
  RenderContext,
  ScaleConfig,
} from '@/lib/d3-chart/D3Chart/types';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { escapeHtml, getDisplayLabel } from '@/lib/shared/utils';
import { getAxisVendorIcon } from '@/lib/catalog/vendor-logos';

import {
  formatProfitUsd,
  type ProfitBasis,
  type ProfitEstimatorAssumptions,
  type ProfitEstimatorRow,
} from './profit-estimator';
import type { ProfitPowerSource } from './profit-power';

export type ProfitSegmentKind = 'tco' | 'labCut' | 'profit' | 'loss';

export interface ProfitSegment {
  key: string;
  kind: ProfitSegmentKind;
  row: ProfitEstimatorRow;
  y0: number;
  y1: number;
}

const CHART_MARGIN = { top: 12, right: 24, bottom: 40, left: 116 };
const X_LABEL_STACKED_BOTTOM = 64;
const X_LABEL_HISTORY_LINE_PX = 16;
export const CHART_HEIGHT = 720;
export const CHART_HEIGHT_MIN = 440;
export const CHART_VIEWPORT_RESERVE = 260;
export const COMPACT_CHART_MAX_WIDTH = 640;
const CHART_MARGIN_COMPACT = { top: 12, right: 8, bottom: 40, left: 64 };
export const CHART_HEIGHT_COMPACT = 560;

export function chartHeightForViewport(
  viewportHeightPx: number | undefined,
  maxHeight: number = CHART_HEIGHT,
): number {
  if (!Number.isFinite(viewportHeightPx) || (viewportHeightPx as number) <= 0) return maxHeight;
  const available = Math.floor((viewportHeightPx as number) - CHART_VIEWPORT_RESERVE);
  return Math.min(maxHeight, Math.max(CHART_HEIGHT_MIN, available));
}

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
const GLYPH_WIDTH_EM = 0.55;
const LABEL_SIDE_PAD_PX = 4;
const X_GAP_ALLOWANCE = 12;
const MIN_BAR_STEP_PX = 96;

export function barLabelSlotPx(bandwidthPx: number, stepPx: number): number {
  if (!Number.isFinite(bandwidthPx) || bandwidthPx <= 0) return 0;
  const step = Number.isFinite(stepPx) && stepPx > bandwidthPx ? stepPx : bandwidthPx;
  return Math.max(0, Math.min(bandwidthPx + X_GAP_ALLOWANCE, step - LABEL_SIDE_PAD_PX));
}

export function estimateTextWidth(text: string, fontPx: number): number {
  return text.length * GLYPH_WIDTH_EM * fontPx;
}
const X_LABEL_ROTATION = -50;

export type XLabelLayout = 'stacked' | 'slanted';

export function splitAxisLabel(label: string): [string, string] {
  const at = label.indexOf(' (');
  if (at === -1) return [label, ''];
  return [label.slice(0, at), label.slice(at + 1)];
}

export const HISTORY_LABEL_SEP = ' • ';

export function splitHistoryLabel(label: string): [string, string] {
  const at = label.lastIndexOf(HISTORY_LABEL_SEP);
  if (at === -1) return [label, ''];
  return [label.slice(0, at), label.slice(at + HISTORY_LABEL_SEP.length)];
}

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

const X_TICK_TEXT_OFFSET = 9;

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
const X_LABEL_DX_EM = 0.4;
const BAND_PADDING = 0.3;
const REVENUE_LABEL_GAP = 20;
export const BAR_ICON_MIN_HEIGHT = 14;
export const BAR_ICON_MAX_HEIGHT = 48;
const BAR_ICON_WIDTH_SHARE = 0.3;
const BAR_ICON_GAP = 4;

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

const TCO_OPACITY = 0.22;
const LAB_CUT_OPACITY = 0.5;
const LOSS_FILL = 'var(--destructive)';
const SEGMENT_TWO_LINE_MIN_PX = 34;
const SEGMENT_ONE_LINE_MIN_PX = 17;

export function lossPatternId(resultKey: string): string {
  return `profit-loss-hatch-${resultKey.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}`;
}

const STRINGS = {
  en: {
    yAxisModeled: 'Revenue per all-in utility GW per year ($ USD)',
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
    powerBasis: 'Power basis',
    powerBasisLabels: {
      chassis: 'measured GPU board; CPU, DRAM, networking, storage, board, fans and PSU modeled',
      'nvl72-tray':
        'measured GPU board and Grace socket; tray networking, storage, fans and conversion, NVSwitch trays and power shelves modeled',
      'nvl72-tray-modeled-cpu':
        'measured GPU board; Grace CPU and memory, tray networking, storage, fans and conversion, NVSwitch trays and power shelves modeled',
    },
    noData: 'No SKU can be priced for the current selection.',
    scrollHint: 'Scroll horizontally to view the full chart.',
  },
  zh: {
    yAxisModeled: '每吉瓦设施总功耗对应的年收入（美元）',
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
    powerBasis: '功耗口径',
    powerBasisLabels: {
      chassis: '实测 GPU 板卡功耗；CPU、DRAM、网络、存储、主板、风扇和 PSU 由模型估算',
      'nvl72-tray':
        '实测 GPU 板卡和 Grace socket 功耗；tray 内网络、存储、风扇和电源转换，以及 NVSwitch tray 和电源架由模型估算',
      'nvl72-tray-modeled-cpu':
        '实测 GPU 板卡功耗；Grace CPU 和内存、tray 内网络、存储、风扇和电源转换，以及 NVSwitch tray 和电源架由模型估算',
    },
    noData: '当前选择下没有可定价的 SKU。',
    scrollHint: '横向滚动查看完整图表。',
  },
} as const;

export function profitEstimatorChartStrings(locale: Locale) {
  return STRINGS[locale];
}

export function powerBasisLabel(source: ProfitPowerSource, locale: Locale): string {
  const labels = STRINGS[locale].powerBasisLabels;
  if (source.topology === 'nvl72-tray' && source.cpu === 'modeled') {
    return labels['nvl72-tray-modeled-cpu'];
  }
  return labels[source.topology];
}

export function segmentLabelLines(
  kind: ProfitSegmentKind,
  row: ProfitEstimatorRow,
  heightPx: number,
  t: { tco: string; labCut: string; profit: string; loss: string },
  widthPx: number = Number.POSITIVE_INFINITY,
  basis: ProfitBasis = 'gw-year',
): string[] {
  const amount = kind === 'tco' ? row.tco : kind === 'labCut' ? row.labCut : row.profit;
  const name =
    kind === 'tco' ? t.tco : kind === 'labCut' ? t.labCut : kind === 'profit' ? t.profit : t.loss;
  const amountText = formatProfitUsd(amount, basis);
  const fits = (text: string) =>
    estimateTextWidth(text, CHART_TYPE.annotation) + LABEL_SIDE_PAD_PX <= widthPx;
  if (!fits(amountText)) return [];
  if (heightPx >= SEGMENT_TWO_LINE_MIN_PX && fits(name)) return [name, amountText];
  if (heightPx >= SEGMENT_ONE_LINE_MIN_PX) return [amountText];
  return [];
}

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

export interface RevenueLabelStyle {
  digits: number;
  fontPx: number;
}

const REVENUE_LABEL_FULL: RevenueLabelStyle = { digits: 1, fontPx: CHART_TYPE.axisLabel };
const REVENUE_LABEL_SMALLEST: RevenueLabelStyle = { digits: 0, fontPx: CHART_TYPE.annotation };
const REVENUE_LABEL_LADDER: readonly RevenueLabelStyle[] = [
  REVENUE_LABEL_FULL,
  { digits: 1, fontPx: CHART_TYPE.annotation },
  { digits: 0, fontPx: CHART_TYPE.axisLabel },
  REVENUE_LABEL_SMALLEST,
];
const BOLD_WIDTH_FACTOR = 1.1;
function boldWidth(text: string, fontPx: number): number {
  return estimateTextWidth(text, fontPx) * BOLD_WIDTH_FACTOR;
}

export function revenueLabelStyle(
  rows: readonly Pick<ProfitEstimatorRow, 'revenue'>[],
  basis: ProfitBasis,
  slotPx: number = Number.POSITIVE_INFINITY,
): RevenueLabelStyle {
  for (const style of REVENUE_LABEL_LADDER) {
    const widest = Math.max(
      0,
      ...rows.map((row) =>
        boldWidth(formatProfitUsd(row.revenue, basis, style.digits), style.fontPx),
      ),
    );
    if (widest <= slotPx) return style;
  }
  return REVENUE_LABEL_SMALLEST;
}

export interface LossLabelStyle {
  word: boolean;
  digits: number;
}

const LOSS_LABEL_FULL: LossLabelStyle = { word: true, digits: 1 };
const LOSS_LABEL_SMALLEST: LossLabelStyle = { word: false, digits: 0 };
const LOSS_LABEL_LADDER: readonly LossLabelStyle[] = [
  LOSS_LABEL_FULL,
  { word: true, digits: 0 },
  { word: false, digits: 1 },
  LOSS_LABEL_SMALLEST,
];

export function lossLabelText(
  profit: number,
  lossWord: string,
  basis: ProfitBasis,
  style: LossLabelStyle = LOSS_LABEL_FULL,
  slotPx?: number,
): string {
  if (style.digits === 0 && slotPx !== undefined) {
    const precise = lossTextIn(profit, lossWord, basis, { word: style.word, digits: 1 });
    if (lossTextWidth(precise) <= slotPx) return precise;
  }
  return lossTextIn(profit, lossWord, basis, style);
}

function lossTextIn(
  profit: number,
  lossWord: string,
  basis: ProfitBasis,
  style: LossLabelStyle,
): string {
  const amount = formatProfitUsd(profit, basis, style.digits);
  return style.word ? `${lossWord} ${amount}` : amount;
}

function lossTextWidth(text: string): number {
  return boldWidth(text, CHART_TYPE.annotation);
}

export function lossLabelStyle(
  rows: readonly Pick<ProfitEstimatorRow, 'profit'>[],
  lossWord: string,
  basis: ProfitBasis,
  slotPx: number = Number.POSITIVE_INFINITY,
): LossLabelStyle {
  const losing = rows.filter((row) => row.profit < 0);
  for (const style of LOSS_LABEL_LADDER) {
    const widest = Math.max(
      0,
      ...losing.map((row) => lossTextWidth(lossTextIn(row.profit, lossWord, basis, style))),
    );
    if (widest <= slotPx) return style;
  }
  return LOSS_LABEL_SMALLEST;
}

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

export function stackTopValue(row: ProfitEstimatorRow): number {
  return Math.max(row.revenue, row.tco + row.labCut);
}

export function stackHeadroomPx(iconHeightPx = BAR_ICON_MIN_HEIGHT): number {
  return REVENUE_LABEL_GAP + CHART_TYPE.axisLabel + BAR_ICON_GAP + iconHeightPx + 8;
}

export const STACK_HEADROOM_PX = stackHeadroomPx();

const LOSS_LABEL_DY = 14;
export const LOSS_FOOTROOM_PX = LOSS_LABEL_DY + CHART_TYPE.annotation;

export function profitYDomain(
  rows: readonly ProfitEstimatorRow[],
  plotHeightPx = 0,
  headroomPx = STACK_HEADROOM_PX,
): [number, number] {
  if (rows.length === 0) return [0, 1];
  const top = Math.max(0, ...rows.map(stackTopValue));
  const bottom = Math.min(0, ...rows.map((row) => row.profit));
  const span = top - bottom;
  const footroomPx = bottom < 0 ? LOSS_FOOTROOM_PX : 0;
  const reservedPx = headroomPx + footroomPx;
  if (plotHeightPx > reservedPx * 2) {
    const unitsPerPx = span / (plotHeightPx - reservedPx);
    return [bottom - unitsPerPx * footroomPx, top === 0 ? 1 : top + unitsPerPx * headroomPx];
  }
  return [bottom * 1.12, top === 0 ? 1 : top + span * 0.3];
}

export function rowLabel(
  row: Pick<ProfitEstimatorRow, 'hwKey' | 'precision' | 'powerLabel' | 'date' | 'dateLabel'>,
  hardwareConfig: HardwareConfig,
): string {
  const config = hardwareConfig[row.hwKey] || getHardwareConfig(row.hwKey);
  const base = config ? getDisplayLabel(config) : row.hwKey;
  const precisionLabel = row.precision ? `${base} (${row.precision.toUpperCase()})` : base;
  const withPrecision = row.powerLabel ? `${precisionLabel} (${row.powerLabel})` : precisionLabel;
  const dateLabel = row.dateLabel ?? row.date;
  return dateLabel ? `${withPrecision}${HISTORY_LABEL_SEP}${dateLabel}` : withPrecision;
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
      ${row.date ? line(t.runDate, escapeHtml(row.dateLabel ?? row.date)) : ''}
      ${row.powerSource ? line(t.powerBasis, escapeHtml(powerBasisLabel(row.powerSource, locale))) : ''}
      ${line(`${t.revenue} (${t.utilization} ${assumptions.utilizationPct}%)`, usd(row.revenue))}
      ${line(t.tco, usd(row.tco), skuColor, TCO_OPACITY)}
      ${line(t.grossMargin, usd(row.grossMargin))}
      ${labCutLine}
      ${profitLine}
      ${line(t.marginPct, Number.isFinite(operatorMargin) ? formatPct(operatorMargin) : '—')}
      ${
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

  const outlineFor = useCallback(
    (segment: ProfitSegment): string =>
      segment.kind === 'profit' ? 'none' : colorResolver(segment.row),
    [colorResolver],
  );

  const labelColorFor = useCallback(
    (segment: ProfitSegment): string => {
      if (segment.kind === 'profit') return contrastingTextColor(colorResolver(segment.row));
      return 'var(--foreground)';
    },
    [colorResolver],
  );

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
        const labelSlot = barLabelSlotPx(bandwidth, xScale.step());

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

        const labelData = segments.filter((d) => d.kind === 'tco');
        const stackTopPx = (d: ProfitSegment) => yScale(stackTopValue(d.row));
        const revenueBaselineY = (d: ProfitSegment) => stackTopPx(d) - REVENUE_LABEL_GAP;
        const iconHeight = barMarkHeight(bandwidth);
        const revenueStyle = revenueLabelStyle(
          labelData.map((d) => d.row),
          basis,
          labelSlot,
        );
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
          .attr('font-size', px(revenueStyle.fontPx))
          .attr('font-weight', '700')
          .style('fill', 'var(--foreground)');
        revenueText
          .selectAll<SVGTSpanElement, ProfitSegment>('tspan')
          .data((d) => [
            {
              row: d.row,
              text: formatProfitUsd(d.row.revenue, basis, revenueStyle.digits),
              sub: false,
            },
            {
              row: d.row,
              text: operatorMarginLabel(d.row, strings.marginShort, labelSlot),
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

        const lossStyle = lossLabelStyle(
          labelData.map((d) => d.row),
          strings.loss,
          basis,
          labelSlot,
        );
        group
          .selectAll<SVGTextElement, ProfitSegment>('.loss-label')
          .data(
            labelData.filter((d) => d.row.profit < 0),
            (d) => d.row.resultKey,
          )
          .join('text')
          .attr('class', 'loss-label')
          .attr('x', (d) => (xScale(d.row.resultKey) ?? 0) + bandwidth / 2)
          .attr('y', (d) => yScale(d.row.profit) + LOSS_LABEL_DY)
          .attr('text-anchor', 'middle')
          .attr('font-size', px(CHART_TYPE.annotation))
          .attr('font-weight', '600')
          .style('fill', LOSS_FILL)
          .text((d) => lossLabelText(d.row.profit, strings.loss, basis, lossStyle, labelSlot));

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
  const minimumMargin = slantedMargins(
    [...labelMap.values()],
    MIN_BAR_STEP_PX,
    CHART_TYPE.axisLabelSub,
    baseMargin,
  );
  const chartWidth = Math.max(
    dimensions.width,
    rows.length * MIN_BAR_STEP_PX + minimumMargin.left + minimumMargin.right,
  );
  const labelLayout = useMemo<XLabelLayout>(() => {
    const plotWidth = chartWidth - baseMargin.left - baseMargin.right;
    const slot = rows.length > 0 ? plotWidth / rows.length : 0;
    return xLabelLayout([...labelMap.values()], slot, CHART_TYPE.axisLabelSub);
  }, [chartWidth, baseMargin, rows.length, labelMap]);
  const margin = useMemo(() => {
    if (labelLayout === 'stacked') {
      const dated = [...labelMap.values()].some((label) => splitHistoryLabel(label)[1] !== '');
      return {
        ...baseMargin,
        bottom: X_LABEL_STACKED_BOTTOM + (dated ? X_LABEL_HISTORY_LINE_PX : 0),
      };
    }
    const plotWidth = chartWidth - baseMargin.left - baseMargin.right;
    const slot = rows.length > 0 ? plotWidth / rows.length : 0;
    return slantedMargins([...labelMap.values()], slot, CHART_TYPE.axisLabelSub, baseMargin);
  }, [baseMargin, labelLayout, chartWidth, rows.length, labelMap]);
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const bandwidth = useMemo(() => {
    const plotWidth = chartWidth - margin.left - margin.right;
    if (plotWidth <= 0 || rows.length === 0) return 0;
    return d3
      .scaleBand<string>()
      .domain(rows.map((row) => row.resultKey))
      .range([0, plotWidth])
      .padding(BAND_PADDING)
      .bandwidth();
  }, [chartWidth, margin, rows]);
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
      grid: false,
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

  const yAxisConfig = useMemo(
    () => ({
      label:
        basis === 'gw-year' && assumptions.powerBasis && assumptions.powerBasis !== 'provisioned'
          ? t.yAxisModeled
          : compact
            ? t.yAxisCompact[basis]
            : t.yAxis[basis],
      tickFormat: (d: d3.AxisDomain) => formatProfitUsd(Number(d), basis, 0),
      tickCount: 8,
    }),
    [compact, basis, assumptions.powerBasis, t.yAxis, t.yAxisCompact, t.yAxisModeled],
  );

  const onRender = useMemo(
    () => (ctx: RenderContext) => {
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
        instructions=""
        legendElement={legendElement}
        caption={caption}
        scrollablePlot={{
          minWidth: chartWidth,
          label: t.scrollHint,
          enabled: chartWidth > dimensions.width,
        }}
      />
    </div>
  );
}
