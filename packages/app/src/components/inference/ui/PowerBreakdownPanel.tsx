'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  usePowerXCompareTarget,
  usePowerXIncludeFacility,
  usePowerXSurface,
} from './powerx-surface';
import { usePowerLayerHighlight } from './power-layer-highlight';
import PowerPartsList from './PowerPartsList';

import { ChartButtons } from '@/components/ui/chart-buttons';
import { Heading } from '@/components/ui/heading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useIsCoarsePointer } from '@/hooks/useMediaQuery';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics/analytics';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { CustomLayerConfig, LayerConfig } from '@/lib/d3-chart/D3Chart/types';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { exportToCsv } from '@/lib/export/csv-export';
import { useLocale } from '@/lib/i18n/use-locale';
import { SYSTEM_POWER_MODEL_REVISION } from '@/lib/power/system-power-model';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import { escapeHtml } from '@/lib/shared/utils';
import type { AggDataEntry, InferenceData } from '../types';
import {
  bandAtWatts,
  bandPartsAt,
  bandTarget,
  breakdownPointAtConcurrency,
  breakdownSeriesAtBoundary,
  buildPowerBreakdownsWithOverlays,
  compareBreakdownsAt,
  cssHatchAngle,
  defaultComparisonInteractivity,
  HATCH_ANGLE,
  isHatchedBand,
  MEASURED_POWER_BANDS,
  nearestBreakdownPoint,
  POWER_BAND_OPACITY,
  POWER_LAYER_FADED_OPACITY,
  powerBandFillOpacity,
  powerBandsOf,
  powerBreakdownInteractivity,
  powerBreakdownPointLabels,
  powerLayerEmphasis,
  powerLayerFill,
  stackedBandsAt,
  stackPowerBands,
  SYSTEM_POWER_CATEGORIES,
  type PowerBand,
  type PowerBreakdownDisplaySeries,
  type PowerBreakdownPoint,
  type PowerBreakdownSeries,
  type PowerComparedPoints,
  type PowerLayerEmphasis,
  type PowerLayerHighlight,
  type PowerLayerTarget,
  type SystemPowerCategory,
} from '../utils/power-breakdown';

export type PowerBreakdownView = 'bars' | 'area';

const STRINGS = {
  en: {
    title: 'System power breakdown per GPU',
    subtitle: 'Each point’s whole-system power per GPU, split by what the meter counts.',
    source: 'Hardware',
    view: 'Breakdown view',
    collapse: 'Collapse',
    bars: 'Stacked bars',
    area: 'Stacked area',
    xAxis: 'Median Interactivity (tok/s/user)',
    yAxis: 'Power (W/GPU)',
    total: 'All in Measured',
    totalIt: 'IT (no PUE)',
    share: 'Share',
    measured: 'Measured',
    modeled: 'Modeled',
    pinned: 'Pinned',
    tdp: 'TDP',
    provisioned: 'All in Provisioned',
    pue: 'PUE',
    extrapolated: 'Partial chassis: the modeled chassis is shared by its measured GPUs.',
    graceModeled: 'Grace sockets are modeled (no validated socket telemetry).',
    note: (revision: string) =>
      `Power model revision ${revision}. Every part is the deployment's share divided by its allocated GPUs, so the stack equals the chart's All in Measured W/GPU. TDP and All in Provisioned are rated references, not measurements.`,
    empty:
      'No point in this view has both validated GPU telemetry and a supported system power model.',
    bands: {
      gpu: ['Measured GPU', 'GPU board power from telemetry'],
      measuredCpu: ['Measured Grace CPU', 'Grace socket telemetry'],
      server: ['Server parts', 'CPUs, memory, NICs, NVSwitch, drives'],
      fansPsu: ['Fans + PSU loss', 'Moves with load'],
      network: ['Network share', 'Scale-out switch + its optics'],
      facility: ['Facility overhead', 'PUE'],
    } satisfies Record<PowerBand, [string, string]>,
    categories: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      cpu: 'CPU',
      memory: 'Memory',
      nic: 'NICs',
      nvswitch: 'NVSwitch',
      storage: 'Storage',
      other: 'PCIe & misc',
      fans: 'Fans',
      psuLoss: 'PSU loss',
      network: 'Network share',
      facility: 'Facility overhead',
    } satisfies Record<SystemPowerCategory, string>,
  },
  zh: {
    title: '每 GPU 系统功耗构成',
    subtitle: '每个点按每 GPU 计的整体系统功耗，拆分为电表计量的各部分。',
    source: '硬件',
    view: '构成视图',
    collapse: '收起',
    bars: '堆叠柱状图',
    area: '堆叠面积图',
    xAxis: '中位交互性（tok/s/user）',
    yAxis: '功耗（W/GPU）',
    total: 'All in Measured',
    totalIt: 'IT（不含 PUE）',
    share: '占比',
    measured: '实测',
    modeled: '建模',
    pinned: '已固定',
    tdp: 'TDP',
    provisioned: 'All in Provisioned',
    pue: 'PUE',
    extrapolated: '部分机箱：建模的整机箱功耗按实测 GPU 数分摊。',
    graceModeled: 'Grace 插槽功耗为建模值（无有效插槽遥测）。',
    note: (revision: string) =>
      `功耗模型版本 ${revision}。各部分均为部署分摊值除以已分配 GPU 数，因此堆叠总和等于图表中的 All in Measured W/GPU。TDP 和 All in Provisioned 为额定参考值，并非实测。`,
    empty: '当前视图中没有同时具备有效 GPU 遥测和受支持系统功耗模型的数据点。',
    bands: {
      gpu: ['实测 GPU', '遥测得到的 GPU 板卡功耗'],
      measuredCpu: ['实测 Grace CPU', 'Grace 插槽遥测'],
      server: ['服务器部件', 'CPU、内存、网卡、NVSwitch、硬盘'],
      fansPsu: ['风扇 + 电源损耗', '随负载变化'],
      network: ['网络分摊', 'Scale-out 交换机及其光模块'],
      facility: ['机房开销', 'PUE'],
    } satisfies Record<PowerBand, [string, string]>,
    categories: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      cpu: 'CPU',
      memory: '内存',
      nic: '网卡',
      nvswitch: 'NVSwitch',
      storage: '存储',
      other: 'PCIe 及其他',
      fans: '风扇',
      psuLoss: '电源损耗',
      network: '网络分摊',
      facility: '机房开销',
    } satisfies Record<SystemPowerCategory, string>,
  },
};

/**
 * One color per hardware line (the same vendor color as the main chart
 * legend); the six layers step down in opacity of that colour like the Profit
 * Estimator's stacked bars (`POWER_BAND_OPACITY`), modeled layers are hatched
 * at their own stripe angle like its loss segment (`HATCH_ANGLE`), measured
 * layers are solid. The parts list beside the plot carries the per-component
 * detail; hovering a layer, a legend row or a list row raises that layer and
 * fades the rest, and a click pins it.
 */
const LAYER_STROKE_OPACITY = 0.9;
const HIGHLIGHT_STROKE_WIDTH = 1.5;
const SEGMENT_LABEL_MIN_PX = 15;
const SEGMENT_LABEL_MIN_BAND = 30;
const MAX_BAR_PX = 48;
const MARGIN = { top: 40, right: 18, bottom: 56, left: 65 };

/** Minimum free width around a column before its total label is drawn. */
const TOTAL_LABEL_MIN_GAP_PX = 46;
const MIN_BAR_PX = 6;
const X_TICK_SPACING_PX = 70;
const REFERENCE_LABEL_CHAR_PX = 6.5;
const REFERENCE_LABEL_CLEARANCE_PX = 34;
const BAR_GAP_FRACTION = 0.72;
/** The label that follows the pointer along a layer: name and W/GPU there. */
const CURSOR_LABEL_LINE_HEIGHT = 12;
const CURSOR_LABEL_FONT = `${CHART_TYPE.annotation}px sans-serif`;
const CURSOR_LABEL_CHAR_PX = 6.2;

const CSV_COLUMNS: Record<SystemPowerCategory, string> = {
  gpu: 'measured_gpu_w_per_gpu',
  measuredCpu: 'measured_grace_cpu_w_per_gpu',
  cpu: 'cpu_w_per_gpu',
  memory: 'memory_w_per_gpu',
  nic: 'nic_w_per_gpu',
  nvswitch: 'nvswitch_w_per_gpu',
  storage: 'storage_w_per_gpu',
  other: 'pcie_misc_w_per_gpu',
  fans: 'fans_w_per_gpu',
  psuLoss: 'psu_loss_w_per_gpu',
  network: 'network_share_w_per_gpu',
  facility: 'facility_overhead_w_per_gpu',
};

const watts = d3.format(',.0f');
const percent = d3.format('.0%');
const interactivityFormat = d3.format(',.1f');

interface Column {
  key: string;
  label: string;
  entry: PowerBreakdownPoint;
}

/**
 * Bars sit at each point's interactivity. A bar is as wide as the room to its
 * nearest neighbor allows (capped), so a sweep's tight high-concurrency
 * cluster stays separable while isolated low-concurrency bars stay readable;
 * width carries no data. Each column's hover band runs to the midpoints.
 */
export function interactivityColumnLayout(positions: readonly number[], plotWidth: number) {
  return positions.map((center, index) => {
    const left = index === 0 ? 0 : (positions[index - 1] + center) / 2;
    const right = index === positions.length - 1 ? plotWidth : (center + positions[index + 1]) / 2;
    const room = Math.min(
      index === 0 ? Infinity : center - positions[index - 1],
      index === positions.length - 1 ? Infinity : positions[index + 1] - center,
    );
    const edge = 2 * Math.max(0, Math.min(center, plotWidth - center));
    const barWidth = Math.max(
      MIN_BAR_PX,
      Math.min(MAX_BAR_PX, edge, (Number.isFinite(room) ? room : plotWidth) * BAR_GAP_FRACTION),
    );
    return { center, barWidth, hitX: left, hitWidth: Math.max(1, right - left), room };
  });
}

function hatchId(sectionId: string, band: PowerBand) {
  return `${sectionId}-${band}-hatch`.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
}

export interface LayerStyle {
  emphasis: PowerLayerEmphasis;
  /** The layer's own step (a hatched layer's pattern already carries its tint). */
  fillOpacity: number;
  /** Whole-element opacity: faded siblings of a highlighted layer. */
  opacity: number;
  strokeWidth: number;
  strokeOpacity: number;
}

/** How a layer is drawn under a highlight: its step and hatch stay, the rest fades. */
export function layerStyle(band: PowerBand, highlight: PowerLayerHighlight | null | undefined) {
  const emphasis = powerLayerEmphasis(band, highlight);
  const fillOpacity = isHatchedBand(band) ? 1 : POWER_BAND_OPACITY[band];
  if (emphasis === 'highlighted') {
    return {
      emphasis,
      fillOpacity,
      opacity: 1,
      strokeWidth: HIGHLIGHT_STROKE_WIDTH,
      strokeOpacity: 1,
    } satisfies LayerStyle;
  }
  return {
    emphasis,
    fillOpacity,
    opacity: emphasis === 'faded' ? POWER_LAYER_FADED_OPACITY : 1,
    strokeWidth: 1,
    strokeOpacity: LAYER_STROKE_OPACITY,
  } satisfies LayerStyle;
}

/**
 * A layer as a CSS box (legend swatch, comparison segment): the chip colour at
 * the layer's step, striped at its hatch angle when modeled, outlined in the
 * chip colour; faded like the plot's layer under a highlight.
 */
export function swatchStyle(
  band: PowerBand,
  color: string,
  highlight: PowerLayerHighlight | null = null,
): React.CSSProperties {
  const { opacity } = layerStyle(band, highlight);
  if (isHatchedBand(band)) {
    return {
      backgroundColor: powerLayerFill(color, powerBandFillOpacity(band)),
      backgroundImage: `repeating-linear-gradient(${cssHatchAngle(band)}deg, ${color} 0 2px, transparent 2px 6px)`,
      border: `1px solid ${color}`,
      opacity,
    };
  }
  return {
    backgroundColor: powerLayerFill(color, POWER_BAND_OPACITY[band]),
    border: `1px solid ${color}`,
    opacity,
  };
}

let textMeasurer: CanvasRenderingContext2D | null | undefined;
/** Pixel width of a label; a per-character estimate where canvas text is unavailable. */
function measureLabel(text: string, font: string): number {
  try {
    if (textMeasurer === undefined) {
      textMeasurer =
        typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    }
    if (textMeasurer) {
      textMeasurer.font = font;
      const width = textMeasurer.measureText(text).width;
      if (Number.isFinite(width) && width > 0) return width;
    }
  } catch {
    textMeasurer = null;
  }
  return text.length * CURSOR_LABEL_CHAR_PX;
}

/** The tooltip's layer swatch: a solid tint when measured, a dashed outline when modeled. */
const tooltipSwatch = (band: PowerBand, color: string) =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:1px;margin-right:4px;vertical-align:middle;background:${isHatchedBand(band) ? 'transparent' : color};opacity:${isHatchedBand(band) ? 1 : POWER_BAND_OPACITY[band]};border:1px ${isHatchedBand(band) ? 'dashed' : 'solid'} ${color}"></span>`;

function tooltipHtml(
  series: PowerBreakdownSeries,
  column: Column,
  color: string,
  xLabel: string,
  t: (typeof STRINGS)['en'],
  totalLabel: string = t.total,
  highlight: PowerLayerHighlight | null = null,
) {
  const { entry } = column;
  const bands = powerBandsOf(series.categories);
  const cell = (value: number) =>
    `<td class="pr-2 text-right tabular-nums">${watts(value)} W</td><td class="text-right tabular-nums text-muted-foreground">${percent(value / entry.totalWattsPerGpu)}</td>`;
  // Top layer first, as the stack reads; a layer made of several parts lists them under
  // its subtotal, a single-part layer is its own row.
  const rows = stackPowerBands(entry, bands)
    .toReversed()
    .map((band) => {
      const [label] = t.bands[band.key];
      const basis = MEASURED_POWER_BANDS.has(band.key) ? t.measured : t.modeled;
      const bold = highlight?.band === band.key && highlight.category === null;
      const parts = bandPartsAt(entry, band.key);
      const suffix = band.key === 'facility' ? ` (${t.pue} ${entry.pue})` : '';
      const partRows =
        parts.length > 1
          ? parts
              .toReversed()
              .map(
                (part) =>
                  `<tr data-category="${part.category}" class="${highlight?.category === part.category ? 'font-semibold' : 'text-muted-foreground'}"><td class="pr-2 pl-4">${escapeHtml(t.categories[part.category])}</td><td></td>${cell(part.watts)}</tr>`,
              )
              .join('')
          : '';
      return `<tr data-band="${band.key}" class="font-semibold${bold ? ' bg-muted/60' : ''}"><td class="pr-2">${tooltipSwatch(band.key, color)}${escapeHtml(label)}${escapeHtml(suffix)}</td><td class="pr-2 font-normal text-muted-foreground">${basis}</td>${cell(band.watts)}</tr>${partRows}`;
    })
    .join('');
  // The model revision and the rated-reference caveat live here rather than
  // under the chart, so the panel reads as data first.
  const notes = [
    entry.chassisBasis === 'extrapolated' ? t.extrapolated : null,
    entry.cpuBasis === 'modeled' ? t.graceModeled : null,
    t.note(SYSTEM_POWER_MODEL_REVISION.slice(0, 7)),
  ]
    .filter(Boolean)
    .map((note) => `<div class="mt-1 max-w-64 text-muted-foreground">${escapeHtml(note!)}</div>`)
    .join('');
  return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md" data-testid="power-breakdown-tooltip">
    <div class="font-semibold">${escapeHtml(series.label)} · ${escapeHtml(column.label)}</div>
    <div class="text-muted-foreground">${escapeHtml(xLabel)}: ${interactivityFormat(entry.interactivity)}</div>
    ${entry.configLabel ? `<div class="mb-1 max-w-72 text-muted-foreground">${escapeHtml(entry.configLabel)}</div>` : ''}
    <table><tbody>${rows}
      <tr class="border-t font-semibold"><td class="pr-2 pt-1">${escapeHtml(totalLabel)}</td><td></td><td class="pr-2 pt-1 text-right tabular-nums">${watts(entry.totalWattsPerGpu)} W</td><td></td></tr>
    </tbody></table>${notes}</div>`;
}

interface CursorLabel {
  band: PowerBand;
  x: number;
  y: number;
  watts: number;
}

function BreakdownChart({
  sectionId,
  series,
  color,
  view,
  xLabel,
  t,
  evenSpacing = false,
  markedIndex = null,
  onColumnClick,
  totalLabel,
  highlight,
  onHover,
  onTogglePin,
  onUnpin,
  coarsePointer,
}: {
  sectionId: string;
  series: PowerBreakdownSeries;
  color: string;
  view: PowerBreakdownView;
  xLabel: string;
  t: (typeof STRINGS)['en'];
  /** What the stack total is called in the tooltip (All in Measured, or IT without PUE). */
  totalLabel?: string;
  /**
   * One evenly spaced slot per benchmark point, in interactivity order. A sweep's
   * points bunch up at low interactivity, so true positions leave slivers there.
   */
  evenSpacing?: boolean;
  /** Column the chip comparison above is reading; outlined so the two views line up. */
  markedIndex?: number | null;
  /** Clicking a column pins the chip comparison's row for this chip to that point. */
  onColumnClick?: (entry: PowerBreakdownPoint) => void;
  /** The layer being told apart (legend, plot or parts list), hovered or pinned. */
  highlight: PowerLayerHighlight | null;
  onHover: (target: PowerLayerTarget | null) => void;
  onTogglePin: (target: PowerLayerTarget) => void;
  onUnpin: () => void;
  /** Touch: a tap on a layer hovers and pins it in one go. */
  coarsePointer: boolean;
}) {
  const labels = powerBreakdownPointLabels(series.points);
  const columns: Column[] = series.points.map((entry, index) => ({
    key: `${index}`,
    label: labels[index],
    entry,
  }));
  const positionOf = (column: Column) =>
    evenSpacing ? Number(column.key) : column.entry.interactivity;
  const xValues = columns.map(positionOf);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const xPad = Math.max((xMax - xMin) * 0.06, xMax * 0.02);
  const xDomain: [number, number] = evenSpacing
    ? [-0.6, columns.length - 0.4]
    : [Math.max(0, xMin - xPad), xMax + xPad];
  const layoutFor = (x: ContinuousScale, width: number) =>
    interactivityColumnLayout(
      columns.map((column) => x(positionOf(column))),
      width,
    );
  const references = [
    series.tdpWattsPerGpu === null
      ? null
      : { key: 'tdp', label: t.tdp, value: series.tdpWattsPerGpu, dash: '6,4' },
    series.allInProvisionedWattsPerGpu === null
      ? null
      : {
          key: 'provisioned',
          label: t.provisioned,
          value: series.allInProvisionedWattsPerGpu,
          dash: '2,4',
        },
  ].filter((reference) => reference !== null);
  const yMax =
    Math.max(
      ...columns.map((column) => column.entry.totalWattsPerGpu),
      ...references.map((reference) => reference.value),
    ) * 1.08;
  const bands = powerBandsOf(series.categories);
  const nameOf = (band: PowerBand) => t.bands[band][0];
  const fill = (band: PowerBand) =>
    isHatchedBand(band) ? `url(#${hatchId(sectionId, band)})` : color;
  const hatchedBands = bands.filter(isHatchedBand);

  // The latest highlight the plot shows, hovered from the plot or set from outside, so
  // the hit handlers can style layers before React has re-rendered.
  const liveHighlight = useRef<PowerLayerHighlight | null>(highlight);
  liveHighlight.current = highlight;
  const cursor = useRef<CursorLabel | null>(null);
  const tooltipElement = useRef<HTMLDivElement | null>(null);

  const applyEmphasis = (
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    current: PowerLayerHighlight | null,
  ) => {
    const styleOf = (band: PowerBand) => layerStyle(band, current);
    group
      .selectAll<SVGElement, { key: PowerBand }>('.breakdown-area, .breakdown-bar')
      .each(function (d) {
        const style = styleOf(d.key);
        d3.select(this)
          .attr('data-emphasis', style.emphasis)
          .attr('opacity', style.opacity)
          .attr('stroke-width', style.strokeWidth)
          .attr('stroke-opacity', style.strokeOpacity);
      });
    group.selectAll<SVGPathElement, { key: PowerBand }>('.breakdown-edge').each(function (d) {
      const style = styleOf(d.key);
      const top = d.key === bands.at(-1);
      d3.select(this)
        .attr('opacity', style.opacity)
        .attr('stroke-width', top ? Math.max(2, style.strokeWidth) : style.strokeWidth)
        .attr('stroke-opacity', top ? LAYER_STROKE_OPACITY : style.strokeOpacity);
    });
    group
      .selectAll<SVGTextElement, { key: PowerBand }>('.breakdown-segment-label')
      .attr('opacity', (d) => styleOf(d.key).opacity);
    if (tooltipElement.current) {
      const tooltip = d3.select(tooltipElement.current);
      tooltip
        .selectAll<HTMLTableRowElement, unknown>('tr[data-band]')
        .classed('bg-muted/60', function () {
          return (
            current !== null && this.dataset.band === current.band && current.category === null
          );
        });
      tooltip
        .selectAll<HTMLTableRowElement, unknown>('tr[data-category]')
        .classed('font-semibold', function () {
          return this.dataset.category === current?.category;
        })
        .classed('text-muted-foreground', function () {
          return this.dataset.category !== current?.category;
        });
    }
  };

  const drawCursorLabel = (
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number,
  ) => {
    const label = cursor.current;
    const text = label ? `${nameOf(label.band)} · ${watts(label.watts)} W` : '';
    const textWidth = measureLabel(text, CURSOR_LABEL_FONT);
    const x = label ? Math.min(Math.max(0, label.x), Math.max(0, width - textWidth)) : 0;
    const y = label ? Math.min(Math.max(CURSOR_LABEL_LINE_HEIGHT, label.y), height - 2) : 0;
    group
      .selectAll<SVGTextElement, CursorLabel>('text.breakdown-cursor-label')
      .data(label ? [label] : [])
      .join('text')
      .attr('class', 'breakdown-cursor-label')
      .attr('data-testid', 'power-breakdown-cursor-label')
      .attr('data-band', (d) => d.band)
      .attr('x', x)
      .attr('y', y)
      .attr('font-size', CHART_TYPE.annotation)
      .attr('font-weight', 600)
      .attr('fill', 'var(--foreground)')
      .attr('stroke', 'var(--background)')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none')
      .text(text)
      .raise();
  };

  const drawDefs: NonNullable<CustomLayerConfig['render']> = (group) => {
    const pattern = group
      .selectAll<SVGPatternElement, PowerBand>('pattern.breakdown-hatch')
      .data(hatchedBands)
      .join((enter) => {
        const created = enter
          .append('pattern')
          .attr('class', 'breakdown-hatch')
          .attr('patternUnits', 'userSpaceOnUse')
          .attr('width', 6)
          .attr('height', 6);
        created.append('rect').attr('class', 'hatch-bg').attr('width', 6).attr('height', 6);
        created
          .append('line')
          .attr('class', 'hatch-line')
          .attr('x1', 0)
          .attr('y1', 0)
          .attr('x2', 0)
          .attr('y2', 6)
          .attr('stroke-width', 2);
        return created;
      })
      .attr('id', (band) => hatchId(sectionId, band))
      .attr('data-band', (band) => band)
      .attr('patternTransform', (band) => `rotate(${HATCH_ANGLE[band]})`);
    pattern
      .select('.hatch-bg')
      .attr('fill', color)
      .attr('fill-opacity', (band) => powerBandFillOpacity(band));
    pattern.select('.hatch-line').attr('stroke', color);
  };

  const drawStack: NonNullable<CustomLayerConfig['render']> = (group, ctx) => {
    const x = ctx.xScale as ContinuousScale;
    const y = (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale;
    tooltipElement.current = ctx.tooltipElement;
    const layout = layoutFor(x, ctx.width);
    const barWidth = (key: string) => layout[Number(key)].barWidth;
    const center = (key: string) => layout[Number(key)].center;
    const referenceBoxes = [...placeReferenceLabels(ctx).values()].map(({ box }) => box);
    // Concurrency + total labels for a column, unless they would sit under a reference label.
    const labelledColumns = columns.filter((column) => {
      const { room } = layout[Number(column.key)];
      if (room < TOTAL_LABEL_MIN_GAP_PX) return false;
      const top = y(column.entry.totalWattsPerGpu);
      const box = {
        left: center(column.key) - TOTAL_LABEL_MIN_GAP_PX / 2,
        right: center(column.key) + TOTAL_LABEL_MIN_GAP_PX / 2,
        top: top - REFERENCE_LABEL_CLEARANCE_PX,
        bottom: top,
      };
      return !referenceBoxes.some(
        (other) =>
          box.left < other.right &&
          other.left < box.right &&
          box.top < other.bottom &&
          other.top < box.bottom,
      );
    });
    const segments = columns.flatMap((column) =>
      stackPowerBands(column.entry, bands)
        .filter((segment) => segment.watts > 0)
        .map((segment) => ({ ...segment, column })),
    );

    group
      .selectAll<SVGRectElement, (typeof segments)[number]>('rect.breakdown-bar')
      .data(view === 'bars' ? segments : [], (d) => `${d.column.key}-${d.key}`)
      .join('rect')
      .attr('class', 'breakdown-bar')
      .attr('data-testid', 'power-breakdown-bar')
      .attr('data-band', (d) => d.key)
      .attr('x', (d) => center(d.column.key) - barWidth(d.column.key) / 2)
      .attr('width', (d) => barWidth(d.column.key))
      .attr('y', (d) => y(d.y1))
      .attr('height', (d) => Math.max(0, y(d.y0) - y(d.y1)))
      .attr('rx', 1)
      .attr('fill', (d) => fill(d.key))
      .attr('fill-opacity', (d) => layerStyle(d.key, null).fillOpacity)
      .attr('stroke', color);

    const areas = bands.map((key) => ({
      key,
      values: columns.map((column) => {
        const segment = stackPowerBands(column.entry, bands).find(
          (candidate) => candidate.key === key,
        )!;
        return { x: center(column.key), y0: segment.y0, y1: segment.y1 };
      }),
    }));
    const area = d3
      .area<{ x: number; y0: number; y1: number }>()
      .x((d) => d.x)
      .y0((d) => y(d.y0))
      .y1((d) => y(d.y1))
      .curve(d3.curveMonotoneX);
    const edge = d3
      .line<{ x: number; y1: number }>()
      .x((d) => d.x)
      .y((d) => y(d.y1))
      .curve(d3.curveMonotoneX);
    group
      .selectAll<SVGPathElement, (typeof areas)[number]>('path.breakdown-area')
      .data(view === 'area' ? areas : [], (d) => d.key)
      .join('path')
      .attr('class', 'breakdown-area')
      .attr('data-testid', 'power-breakdown-area')
      .attr('data-band', (d) => d.key)
      .attr('d', (d) => area(d.values))
      .attr('fill', (d) => fill(d.key))
      .attr('fill-opacity', (d) => layerStyle(d.key, null).fillOpacity)
      .attr('stroke', 'none');
    // Each layer's top edge, 1 px in the chip colour; the stack's top edge is the chip's total.
    group
      .selectAll<SVGPathElement, (typeof areas)[number]>('path.breakdown-edge')
      .data(view === 'area' ? areas : [], (d) => d.key)
      .join('path')
      .attr('class', 'breakdown-edge')
      .attr('data-band', (d) => d.key)
      .attr('d', (d) => edge(d.values))
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('pointer-events', 'none');
    group
      .selectAll<SVGCircleElement, Column>('circle.breakdown-total-dot')
      .data(view === 'area' ? columns : [], (d) => d.key)
      .join('circle')
      .attr('class', 'breakdown-total-dot')
      .attr('cx', (d) => center(d.key))
      .attr('cy', (d) => y(d.entry.totalWattsPerGpu))
      .attr('r', 3)
      .attr('fill', color);

    const segmentLabels =
      view === 'bars'
        ? segments.filter(
            (segment) =>
              barWidth(segment.column.key) >= SEGMENT_LABEL_MIN_BAND &&
              y(segment.y0) - y(segment.y1) >= SEGMENT_LABEL_MIN_PX,
          )
        : [];
    group
      .selectAll<SVGTextElement, (typeof segments)[number]>('text.breakdown-segment-label')
      .data(segmentLabels, (d) => `${d.column.key}-${d.key}`)
      .join('text')
      .attr('class', 'breakdown-segment-label')
      .attr('x', (d) => center(d.column.key))
      .attr('y', (d) => (y(d.y0) + y(d.y1)) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', CHART_TYPE.annotation)
      .attr('fill', 'var(--foreground)')
      .attr('stroke', 'var(--background)')
      .attr('stroke-width', 3)
      .attr('stroke-opacity', 0.75)
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none')
      .text((d) => watts(d.watts));

    group
      .selectAll<SVGTextElement, Column>('text.breakdown-total-label')
      .data(labelledColumns, (d) => d.key)
      .join('text')
      .attr('class', 'breakdown-total-label')
      .attr('data-testid', 'power-breakdown-total')
      .attr('x', (d) => center(d.key))
      .attr('y', (d) => y(d.entry.totalWattsPerGpu) - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', CHART_TYPE.annotation)
      .attr('font-weight', 600)
      .attr('fill', 'var(--foreground)')
      .attr('stroke', 'var(--background)')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none')
      .text((d) => `${watts(d.entry.totalWattsPerGpu)} W`);

    // Concurrency above the total, so a bar still reads as "c14" on an interactivity axis.
    group
      .selectAll<SVGTextElement, Column>('text.breakdown-concurrency-label')
      .data(labelledColumns, (d) => d.key)
      .join('text')
      .attr('class', 'breakdown-concurrency-label')
      .attr('data-testid', 'power-breakdown-concurrency')
      .attr('x', (d) => center(d.key))
      .attr('y', (d) => y(d.entry.totalWattsPerGpu) - 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', CHART_TYPE.annotation)
      .attr('fill', 'var(--muted-foreground)')
      .attr('stroke', 'var(--background)')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none')
      .text((d) => d.label);

    applyEmphasis(group, liveHighlight.current);
    drawCursorLabel(group, ctx.width, ctx.height);
  };

  const referenceText = (reference: (typeof references)[number]) =>
    `${reference.label} ${watts(reference.value)} W`;

  // A reference label goes where no bar (or its concurrency/total labels)
  // reaches up into it: the right end, else the left end, else the widest
  // clear gap along the line.
  const referenceLabelPlacement = (
    ctx: Parameters<NonNullable<CustomLayerConfig['render']>>[1],
    layout: ReturnType<typeof layoutFor>,
    y: ContinuousScale,
    value: number,
    text: string,
  ): { x: number; anchor: 'start' | 'end' } => {
    const labelWidth = text.length * REFERENCE_LABEL_CHAR_PX + 6;
    const lineY = y(value);
    const blocked = (from: number, to: number) =>
      columns.some((column) => {
        const { center, barWidth, room } = layout[Number(column.key)];
        if (center + barWidth / 2 < from || center - barWidth / 2 > to) return false;
        const labelled = room >= TOTAL_LABEL_MIN_GAP_PX ? REFERENCE_LABEL_CLEARANCE_PX : 0;
        return y(column.entry.totalWattsPerGpu) - labelled < lineY + 2;
      });
    if (!blocked(ctx.width - labelWidth, ctx.width)) {
      return { x: ctx.width - 2, anchor: 'end' };
    }
    if (!blocked(0, labelWidth)) return { x: 2, anchor: 'start' };
    const gap = layout
      .slice(1)
      .map((right, index) => {
        const left = layout[index];
        return {
          from: left.center + left.barWidth / 2 + 4,
          to: right.center - right.barWidth / 2 - 4,
        };
      })
      .filter(({ from, to }) => to - from >= labelWidth && !blocked(from, to))
      .toSorted((a, b) => b.to - b.from - (a.to - a.from))[0];
    return gap ? { x: gap.to, anchor: 'end' } : { x: ctx.width - 2, anchor: 'end' };
  };

  /** Reference label positions plus their boxes, so column labels under them can yield. */
  const placeReferenceLabels = (ctx: Parameters<NonNullable<CustomLayerConfig['render']>>[1]) => {
    const y = (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale;
    const layout = layoutFor(ctx.xScale as ContinuousScale, ctx.width);
    return new Map(
      references.map((reference) => {
        const text = referenceText(reference);
        const width = text.length * REFERENCE_LABEL_CHAR_PX + 6;
        const { x, anchor } = referenceLabelPlacement(ctx, layout, y, reference.value, text);
        const left = anchor === 'end' ? x - width : x;
        const top = y(reference.value) - 4 - 12;
        return [
          reference.key,
          { x, anchor, box: { left, right: left + width, top, bottom: top + 14 } },
        ];
      }),
    );
  };

  const drawReferences: NonNullable<CustomLayerConfig['render']> = (group, ctx) => {
    const y = (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale;
    const placement = placeReferenceLabels(ctx);
    group
      .selectAll<SVGLineElement, (typeof references)[number]>('line.breakdown-reference')
      .data(references, (d) => d.key)
      .join('line')
      .attr('class', 'breakdown-reference')
      .attr('data-testid', (d) => `power-breakdown-${d.key}-line`)
      .attr('x1', 0)
      .attr('x2', ctx.width)
      .attr('y1', (d) => y(d.value))
      .attr('y2', (d) => y(d.value))
      .attr('stroke', 'currentColor')
      .attr('stroke-dasharray', (d) => d.dash)
      .attr('opacity', 0.6)
      .attr('pointer-events', 'none');
    group
      .selectAll<SVGTextElement, (typeof references)[number]>('text.breakdown-reference-label')
      .data(references, (d) => d.key)
      .join('text')
      .attr('class', 'breakdown-reference-label')
      .attr('x', (d) => placement.get(d.key)!.x)
      .attr('y', (d) => y(d.value) - 4)
      .attr('text-anchor', (d) => placement.get(d.key)!.anchor)
      .attr('font-size', CHART_TYPE.annotation)
      .attr('fill', 'var(--muted-foreground)')
      .attr('stroke', 'var(--background)')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('pointer-events', 'none')
      .text(referenceText);
  };

  /**
   * The layer under a plot position: the hovered column's segment on bars, or
   * the stack interpolated at that x on the area, plus where its label goes.
   */
  const bandAt = (
    ctx: Parameters<NonNullable<CustomLayerConfig['render']>>[1],
    column: Column,
    mx: number,
    my: number,
  ): CursorLabel | null => {
    const x = ctx.xScale as ContinuousScale;
    const y = (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale;
    const layout = layoutFor(x, ctx.width);
    const value = y.invert(my);
    if (view === 'bars') {
      const { center, barWidth } = layout[Number(column.key)];
      const band = bandAtWatts(stackPowerBands(column.entry, bands), value);
      return band
        ? {
            band: band.key,
            x: center + barWidth / 2 + 6,
            y: (y(band.y0) + y(band.y1)) / 2,
            watts: band.watts,
          }
        : null;
    }
    const stack = stackedBandsAt(
      columns.map((entry) => ({ x: layout[Number(entry.key)].center, entry: entry.entry })),
      mx,
      bands,
    );
    const band = bandAtWatts(stack, value);
    return band ? { band: band.key, x: mx + 12, y: my - 10, watts: band.watts } : null;
  };

  const drawHitAreas: NonNullable<CustomLayerConfig['render']> = (group, ctx) => {
    const layout = layoutFor(ctx.xScale as ContinuousScale, ctx.width);
    const showLabel = (label: CursorLabel | null) => {
      cursor.current = label;
      drawCursorLabel(group, ctx.width, ctx.height);
    };
    const y = (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale;
    const hoverBand = (event: MouseEvent, column: Column) => {
      const [mx, my] = d3.pointer(event, group.node());
      const pinned = liveHighlight.current?.pinned ? liveHighlight.current : null;
      if (pinned) {
        // The pinned layer keeps the highlight; its label tracks the pointer's x along it.
        const { center, barWidth } = layout[Number(column.key)];
        const stack =
          view === 'bars'
            ? stackPowerBands(column.entry, bands)
            : stackedBandsAt(
                columns.map((entry) => ({
                  x: layout[Number(entry.key)].center,
                  entry: entry.entry,
                })),
                mx,
                bands,
              );
        const band = stack.find((candidate) => candidate.key === pinned.band);
        showLabel(
          band && band.watts > 0
            ? {
                band: band.key,
                x: view === 'bars' ? center + barWidth / 2 + 6 : mx + 12,
                y: (y(band.y0) + y(band.y1)) / 2,
                watts: band.watts,
              }
            : null,
        );
        return;
      }
      const found = bandAt(ctx, column, mx, my);
      const next = found ? { ...bandTarget(found.band), pinned: false } : null;
      if (next?.band !== liveHighlight.current?.band || liveHighlight.current?.category) {
        liveHighlight.current = next;
        applyEmphasis(group, next);
        onHover(next ? bandTarget(next.band) : null);
      }
      showLabel(found);
    };
    return group
      .selectAll<SVGRectElement, Column>('rect.breakdown-hit')
      .data(columns, (d) => d.key)
      .join('rect')
      .attr('class', 'breakdown-hit')
      .attr('data-testid', 'power-breakdown-hit')
      .attr('x', (d) => layout[Number(d.key)].hitX)
      .attr('width', (d) => layout[Number(d.key)].hitWidth)
      .attr('y', 0)
      .attr('height', ctx.height)
      .attr('fill', 'var(--foreground)')
      .attr('fill-opacity', 0)
      .style('cursor', onColumnClick ? 'pointer' : 'default')
      .on('mousemove.layer', (event: MouseEvent, d) => hoverBand(event, d))
      .on('mouseleave.layer', (event: MouseEvent) => {
        // Crossing into the next column is not leaving the plot.
        const next = event.relatedTarget;
        if (next instanceof Element && next.classList.contains('breakdown-hit')) return;
        showLabel(null);
        if (liveHighlight.current?.pinned) return;
        if (liveHighlight.current !== null) {
          liveHighlight.current = null;
          applyEmphasis(group, null);
          onHover(null);
        }
      })
      .on('click.layer', (event: MouseEvent, d) => {
        // Touch: a tap on a layer hovers and pins it; a tap above the stack, or any
        // mouse click on the plot, drops a pinned layer.
        const [mx, my] = d3.pointer(event, group.node());
        const found = coarsePointer ? bandAt(ctx, d, mx, my) : null;
        if (found) {
          showLabel(found);
          onTogglePin(bandTarget(found.band));
        } else {
          onUnpin();
        }
      })
      .on('click.compare', (_event, d) => onColumnClick?.(d.entry));
  };

  const drawMarker: NonNullable<CustomLayerConfig['render']> = (group, ctx) => {
    const layout = layoutFor(ctx.xScale as ContinuousScale, ctx.width);
    const y = ctx.yScale as ContinuousScale;
    const marked = markedIndex === null ? [] : columns.filter((c) => Number(c.key) === markedIndex);
    group
      .selectAll<SVGRectElement, Column>('rect.breakdown-compared')
      .data(marked, (d) => d.key)
      .join('rect')
      .attr('class', 'breakdown-compared')
      .attr('data-testid', 'power-breakdown-compared')
      .attr('x', (d) => layout[Number(d.key)].center - layout[Number(d.key)].barWidth / 2 - 4)
      .attr('width', (d) => layout[Number(d.key)].barWidth + 8)
      .attr('y', (d) => y(d.entry.totalWattsPerGpu) - 30)
      .attr('height', (d) => Math.max(0, ctx.height - y(d.entry.totalWattsPerGpu) + 34))
      .attr('rx', 4)
      .attr('fill', 'none')
      .attr('stroke', 'var(--foreground)')
      .attr('stroke-opacity', 0.55)
      .attr('stroke-dasharray', '4,3')
      .attr('pointer-events', 'none');
  };

  const layers: LayerConfig<Column>[] = [
    { type: 'custom', key: 'defs', render: drawDefs },
    { type: 'custom', key: `stack-${view}`, render: drawStack },
    { type: 'custom', key: 'references', render: drawReferences },
    { type: 'custom', key: 'marker', render: drawMarker },
    { type: 'custom', key: 'hit', render: drawHitAreas },
  ];

  return (
    <D3Chart<Column>
      chartId={`${sectionId}-plot`}
      data={columns}
      height={380}
      testId={`${sectionId}-plot`}
      watermark="logo"
      zoom={{ enabled: false }}
      grabCursor={false}
      instructions=""
      margin={MARGIN}
      xScale={{ type: 'linear', domain: xDomain }}
      yScale={{ type: 'linear', domain: [0, yMax], nice: true }}
      xAxis={{
        label: xLabel,
        ...(evenSpacing && {
          // Each slot is labelled with its point's interactivity; thin out on narrow plots.
          tickFormat: (d: d3.AxisDomain) => watts(columns[Number(d)]?.entry.interactivity ?? 0),
        }),
        // One tick per ~70px so phone widths never run interactivity labels together.
        tickValues: (scale) => {
          if (evenSpacing) {
            const [start, end] = (scale as d3.ScaleLinear<number, number>).range();
            const room = Math.abs(end - start) / Math.max(1, columns.length);
            const step = Math.max(1, Math.ceil(44 / Math.max(1, room)));
            return columns.map((_, index) => index).filter((index) => index % step === 0);
          }
          const linear = scale as d3.ScaleLinear<number, number>;
          const [start, end] = linear.range();
          return linear.ticks(Math.max(2, Math.floor(Math.abs(end - start) / X_TICK_SPACING_PX)));
        },
      }}
      yAxis={{ label: t.yAxis, tickCount: 5 }}
      layers={layers}
      tooltip={{
        rulerType: 'none',
        content: (column) =>
          tooltipHtml(series, column, color, xLabel, t, totalLabel, liveHighlight.current),
        attachToLayer: 4,
        onHoverStart: (selection) => selection.attr('fill-opacity', 0.05),
        onHoverEnd: (selection) => selection.attr('fill-opacity', 0),
      }}
    />
  );
}

export default function PowerBreakdownPanel({
  chartId,
  data,
  overlayData = [],
  contextLabel,
  xField,
  xLabel,
  selectedKey: controlledKey,
  onSelectKey,
  heading,
  compact = false,
  onCollapse,
  layerHighlight,
  onLayerHighlight,
  comparedPoints,
  onPinComparedPoint,
}: {
  chartId: string;
  data: InferenceData[];
  /** Unofficial-run overlay points within `data`: their series take the run's colour. */
  overlayData?: readonly InferenceData[];
  contextLabel?: string;
  /**
   * Inline drill-down under a chip-compare bar (PowerX v2): the compare legend above the
   * bars already explains the stack, so the legend list is dropped and the title row is
   * one line; the Hardware select and the Stacked bars | Stacked area toggle stay, and a
   * Collapse button closes it.
   */
  compact?: boolean;
  onCollapse?: () => void;
  /** Controlled hardware line (series key); the panel keeps its own choice when omitted. */
  selectedKey?: string | null;
  onSelectKey?: (key: string) => void;
  /** Overrides the panel title and subtitle, e.g. as a drill-down under a comparison. */
  heading?: { title: string; subtitle: string };
  /** The main chart's x field; the breakdown uses it when it is an interactivity axis. */
  xField?: keyof AggDataEntry;
  xLabel?: string;
  /** Shared with the chip comparison's legend on the Where view; own state when omitted. */
  layerHighlight?: PowerLayerHighlight | null;
  onLayerHighlight?: (next: PowerLayerHighlight | null) => void;
  /** Chips compared at a pinned point (series key → concurrency) instead of the slider's. */
  comparedPoints?: PowerComparedPoints;
  /** A column was clicked: the owner pins this chip's compared point to it. */
  onPinComparedPoint?: (series: PowerBreakdownDisplaySeries, entry: PowerBreakdownPoint) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const powerXSurface = usePowerXSurface();
  const interactivity = useMemo(() => powerBreakdownInteractivity(xField), [xField]);
  const interactivityLabel = interactivity.fromChart && xLabel ? xLabel : t.xAxis;
  const { getUrlParam, setUrlParams } = useUrlState();
  // Stacked area by default: one chip's layers read as bands across load.
  const [view, setView] = useState<PowerBreakdownView>(() =>
    getUrlParam('i_pbview') === 'bars' ? 'bars' : 'area',
  );
  useEffect(() => {
    setUrlParams({ i_pbview: view });
  }, [view, setUrlParams]);
  // PowerX counts IT only until Include facility is on; elsewhere the facility meter.
  const includeFacility = usePowerXIncludeFacility();
  const { runIndexByUrl, unofficialRunInfos } = useUnofficialRun();
  const breakdowns = useMemo(
    () =>
      buildPowerBreakdownsWithOverlays(
        data,
        overlayData.length > 0
          ? { points: overlayData, runIndexByUrl, runInfos: unofficialRunInfos ?? [] }
          : undefined,
        locale,
        interactivity,
      ).map((entry): PowerBreakdownDisplaySeries => ({
        ...breakdownSeriesAtBoundary(entry, includeFacility),
        overlayRunIndex: entry.overlayRunIndex,
      })),
    [data, overlayData, runIndexByUrl, unofficialRunInfos, locale, interactivity, includeFacility],
  );
  const [ownKey, setOwnKey] = useState<string | null>(null);
  const selectedKey = controlledKey === undefined ? ownKey : controlledKey;
  const setSelectedKey = (key: string) => {
    setOwnKey(key);
    onSelectKey?.(key);
  };
  const series = breakdowns.find((entry) => entry.key === selectedKey) ?? breakdowns[0] ?? null;
  // The point the chip comparison reads for this chip: its pinned point, else (PowerX)
  // the one nearest the shared slider. Outlined in the plot; a click pins another.
  const compareTarget = usePowerXCompareTarget();
  const comparedAt = powerXSurface
    ? (compareTarget ?? defaultComparisonInteractivity(breakdowns))
    : null;
  const pinnedConcurrency = series ? comparedPoints?.[series.key] : undefined;
  const pinnedEntry =
    series && pinnedConcurrency !== undefined
      ? breakdownPointAtConcurrency(series, pinnedConcurrency, comparedAt)
      : null;
  const comparedEntry =
    pinnedEntry ??
    (series && comparedAt
      ? (compareBreakdownsAt([series], comparedAt).rows[0]?.entry ?? null)
      : null);
  const markedIndex = series && comparedEntry ? series.points.indexOf(comparedEntry) : -1;
  // The parts list reads the compared point; off the comparison's range (a chip picked
  // in the Hardware select that has no bar near the slider) it reads the nearest point.
  const listAt = compareTarget ?? defaultComparisonInteractivity(breakdowns);
  const listEntry =
    comparedEntry ??
    (series && listAt !== null ? nearestBreakdownPoint(series, listAt) : null) ??
    series?.points.at(-1) ??
    null;
  const sectionId = `${chartId}-power-breakdown`;
  // The main chart's vendor color for each hardware line, so a bar here reads
  // as the same series as its line and legend chip above; overlay lines keep
  // their run colour.
  const hwKeys = useMemo(() => [...new Set(data.map((point) => point.hwKey))], [data]);
  const { resolveColor } = useThemeColors({
    highContrast: false,
    identifiers: hwKeys,
    activeKeys: hwKeys,
  });
  const colorOf = (entry: PowerBreakdownDisplaySeries) =>
    entry.overlayRunIndex === undefined
      ? resolveColor(entry.hwKey)
      : overlayRunColor(entry.overlayRunIndex);
  const color = series ? colorOf(series) : 'currentColor';
  const layers = usePowerLayerHighlight(layerHighlight, onLayerHighlight);
  const coarsePointer = useIsCoarsePointer();

  const exportCsv = () => {
    exportToCsv(
      'InferenceX_power_breakdown',
      [
        'series',
        'configuration',
        'concurrency',
        interactivity.field,
        ...SYSTEM_POWER_CATEGORIES.map((key) => CSV_COLUMNS[key]),
        'all_in_measured_w_per_gpu',
        'pue',
        'chassis_basis',
        'cpu_basis',
        'power_model_revision',
      ],
      breakdowns.flatMap((entry) =>
        entry.points.map((point) => [
          entry.label,
          point.configLabel,
          point.concurrency,
          point.interactivity,
          ...SYSTEM_POWER_CATEGORIES.map((key) => point.wattsPerGpu[key]),
          point.totalWattsPerGpu,
          point.pue,
          point.chassisBasis,
          point.cpuBasis,
          SYSTEM_POWER_MODEL_REVISION,
        ]),
      ),
      contextLabel ? [contextLabel] : [],
    );
  };

  return (
    <section id={sectionId} className="min-w-0 space-y-3" data-testid="power-breakdown-panel">
      <div className={compact ? 'flex flex-wrap items-baseline gap-x-3 gap-y-1' : 'space-y-1'}>
        <Heading as="h3" level="card">
          {heading?.title ?? t.title}
        </Heading>
        <p className={compact ? 'text-xs text-muted-foreground' : 'text-sm text-muted-foreground'}>
          {heading?.subtitle ?? t.subtitle}
        </p>
        {compact && onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            data-testid="power-breakdown-collapse"
            className="ml-auto min-h-11 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground hover:text-foreground md:min-h-8"
          >
            {t.collapse}
          </button>
        )}
      </div>
      <p className="export-only hidden text-sm text-muted-foreground">{contextLabel}</p>
      {series === null ? (
        <p className="py-6 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <>
          <div className="no-export flex min-w-0 flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-64 space-y-1">
              <label
                htmlFor={`${sectionId}-source`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t.source}
              </label>
              <Select
                value={series.key}
                onValueChange={(value) => {
                  setSelectedKey(value);
                  track('inference_power_breakdown_source_selected');
                }}
              >
                <SelectTrigger
                  id={`${sectionId}-source`}
                  data-testid="power-breakdown-source"
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  {breakdowns.map((entry) => (
                    <SelectItem key={entry.key} value={entry.key}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colorOf(entry) }}
                        />
                        <span className="truncate">{entry.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SegmentedToggle<PowerBreakdownView>
              value={view}
              ariaLabel={t.view}
              testId="power-breakdown-view"
              role="group"
              onValueChange={(next) => {
                setView(next);
                track('inference_power_breakdown_view_changed', { view: next });
              }}
              options={[
                { value: 'bars', label: t.bars, testId: 'power-breakdown-view-bars' },
                { value: 'area', label: t.area, testId: 'power-breakdown-view-area' },
              ]}
            />
          </div>
          {!compact && (
            <ul
              className="flex flex-wrap gap-x-1 gap-y-0.5 text-xs"
              data-testid="power-breakdown-legend"
            >
              {/* Top layer first, as the stack reads. */}
              {powerBandsOf(series.categories)
                .toReversed()
                .map((band) => {
                  const [label, description] = t.bands[band];
                  const detail =
                    band === 'facility' ? `${description} ${series.points[0].pue}` : description;
                  const basis = MEASURED_POWER_BANDS.has(band) ? t.measured : t.modeled;
                  const pinned =
                    layers.highlight?.pinned === true &&
                    layers.highlight.band === band &&
                    layers.highlight.category === null;
                  const emphasis = powerLayerEmphasis(band, layers.highlight);
                  return (
                    <li key={band} className="flex min-w-0">
                      <button
                        type="button"
                        data-testid="power-breakdown-legend-item"
                        data-band={band}
                        data-emphasis={emphasis}
                        aria-pressed={pinned}
                        onMouseEnter={() => layers.hover(bandTarget(band))}
                        onMouseLeave={() => layers.hover(null)}
                        onFocus={() => layers.hover(bandTarget(band))}
                        onBlur={() => layers.hover(null)}
                        onClick={() => layers.togglePin(bandTarget(band))}
                        className={`flex min-h-7 min-w-0 items-baseline gap-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60 ${
                          pinned ? 'bg-muted ring-1 ring-border' : ''
                        }`}
                      >
                        <span
                          aria-hidden
                          className="inline-block size-3 shrink-0 translate-y-0.5 rounded-[2px]"
                          title={`${basis}${pinned ? ` · ${t.pinned}` : ''}`}
                          style={swatchStyle(band, color, layers.highlight)}
                        />
                        <span
                          className={`shrink-0 whitespace-nowrap ${
                            emphasis === 'faded' ? 'text-muted-foreground' : 'font-medium'
                          }`}
                        >
                          {label}
                        </span>
                        <span className="min-w-0 text-muted-foreground">
                          {detail} · {basis}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
          {/* Overview left, detail right from `lg`; the list stacks under the plot below. */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
            <div className="min-w-0">
              <BreakdownChart
                key={`${series.key}-${view}`}
                sectionId={sectionId}
                series={series}
                color={color}
                view={view}
                xLabel={interactivityLabel}
                t={t}
                evenSpacing={powerXSurface}
                totalLabel={includeFacility ? t.total : t.totalIt}
                markedIndex={markedIndex >= 0 ? markedIndex : null}
                onColumnClick={
                  onPinComparedPoint ? (entry) => onPinComparedPoint(series, entry) : undefined
                }
                highlight={layers.highlight}
                onHover={layers.hover}
                onTogglePin={layers.togglePin}
                onUnpin={layers.unpin}
                coarsePointer={coarsePointer}
              />
            </div>
            {listEntry && (
              <PowerPartsList
                series={series}
                entry={listEntry}
                color={color}
                highlight={layers.highlight}
                onHover={layers.hover}
                onTogglePin={layers.togglePin}
              />
            )}
          </div>
          <div className="max-h-0 overflow-hidden">
            <div id={`${sectionId}-export`} className="p-4" />
          </div>
          <ChartButtons
            chartId={sectionId}
            analyticsPrefix="power_breakdown"
            hideZoomReset
            onExportCsv={exportCsv}
          />
        </>
      )}
    </section>
  );
}
