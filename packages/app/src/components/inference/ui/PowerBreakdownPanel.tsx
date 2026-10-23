'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useState } from 'react';

import {
  usePowerXCompareTarget,
  usePowerXSurface,
  useSetPowerXCompareTarget,
} from './powerx-surface';

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
import { useThemeColors } from '@/hooks/useThemeColors';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics/analytics';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { CustomLayerConfig, LayerConfig } from '@/lib/d3-chart/D3Chart/types';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import type { ContinuousScale } from '@/lib/d3-chart/types';
import { exportToCsv } from '@/lib/export/csv-export';
import { useLocale } from '@/lib/i18n/use-locale';
import { SYSTEM_POWER_MODEL_REVISION } from '@/lib/power/system-power-model';
import { escapeHtml } from '@/lib/shared/utils';
import type { AggDataEntry, InferenceData } from '../types';
import {
  buildPowerBreakdowns,
  MEASURED_POWER_CATEGORIES,
  powerBreakdownInteractivity,
  powerBreakdownPointLabels,
  stackPowerBreakdown,
  type PowerBreakdownPoint,
  type PowerBreakdownSeries,
  type SystemPowerCategory,
  compareBreakdownsAt,
  defaultComparisonInteractivity,
} from '../utils/power-breakdown';

export type PowerBreakdownView = 'bars' | 'area';

const STRINGS = {
  en: {
    title: 'System power breakdown per GPU',
    subtitle:
      'Each point’s All in Measured W/GPU split into what the meter counts. Measured parts come from telemetry; the rest is modeled at that point’s measured GPU power.',
    source: 'Hardware',
    view: 'Breakdown view',
    bars: 'Stacked bars',
    area: 'Stacked area',
    xAxis: 'Median Interactivity (tok/s/user)',
    yAxis: 'Power (W/GPU)',
    total: 'All in Measured',
    share: 'Share',
    measured: 'Measured',
    modeled: 'Modeled',
    tdp: 'TDP',
    provisioned: 'All in Provisioned',
    pue: 'PUE',
    extrapolated: 'Partial chassis: the modeled chassis is shared by its measured GPUs.',
    graceModeled: 'Grace sockets are modeled (no validated socket telemetry).',
    note: (revision: string) =>
      `Power model revision ${revision}. Every part is the deployment's share divided by its allocated GPUs, so the stack equals the chart's All in Measured W/GPU. TDP and All in Provisioned are rated references, not measurements.`,
    empty:
      'No point in this view has both validated GPU telemetry and a supported system power model.',
    categories: {
      gpu: ['Measured GPU', 'GPU board power from telemetry'],
      measuredCpu: ['Measured Grace CPU', 'Grace socket telemetry'],
      server: ['Server parts', 'CPUs, memory, NICs, NVSwitch, drives'],
      fansPsu: ['Fans + PSU loss', 'Moves with load'],
      network: ['Network share', 'Scale-out switch + its optics'],
      facility: ['Facility overhead', 'PUE'],
    } satisfies Record<SystemPowerCategory, [string, string]>,
  },
  zh: {
    title: '每 GPU 系统功耗构成',
    subtitle:
      '将每个点的 All in Measured W/GPU 拆分为电表实际计量的各部分。实测部分来自遥测数据，其余部分按该点实测 GPU 功耗建模。',
    source: '硬件',
    view: '构成视图',
    bars: '堆叠柱状图',
    area: '堆叠面积图',
    xAxis: '中位交互性（tok/s/user）',
    yAxis: '功耗（W/GPU）',
    total: 'All in Measured',
    share: '占比',
    measured: '实测',
    modeled: '建模',
    tdp: 'TDP',
    provisioned: 'All in Provisioned',
    pue: 'PUE',
    extrapolated: '部分机箱：建模的整机箱功耗按实测 GPU 数分摊。',
    graceModeled: 'Grace 插槽功耗为建模值（无有效插槽遥测）。',
    note: (revision: string) =>
      `功耗模型版本 ${revision}。各部分均为部署分摊值除以已分配 GPU 数，因此堆叠总和等于图表中的 All in Measured W/GPU。TDP 和 All in Provisioned 为额定参考值，并非实测。`,
    empty: '当前视图中没有同时具备有效 GPU 遥测和受支持系统功耗模型的数据点。',
    categories: {
      gpu: ['实测 GPU', '遥测得到的 GPU 板卡功耗'],
      measuredCpu: ['实测 Grace CPU', 'Grace 插槽遥测'],
      server: ['服务器部件', 'CPU、内存、网卡、NVSwitch、硬盘'],
      fansPsu: ['风扇 + 电源损耗', '随负载变化'],
      network: ['网络分摊', 'Scale-out 交换机及其光模块'],
      facility: ['机房开销', 'PUE'],
    } satisfies Record<SystemPowerCategory, [string, string]>,
  },
};

/**
 * One color per hardware line (the same vendor color as the main chart legend);
 * parts step down in opacity like the Profit Estimator's stacked bars, and the
 * facility overhead is hatched like its loss segment. Measured parts are the
 * most opaque so the metered base reads first.
 */
export const CATEGORY_OPACITY: Record<SystemPowerCategory, number> = {
  gpu: 0.9,
  measuredCpu: 0.72,
  server: 0.5,
  fansPsu: 0.34,
  network: 0.2,
  facility: 0,
};
const HATCH_OPACITY = 0.18;
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

function hatchId(sectionId: string, category: SystemPowerCategory = 'facility') {
  return `${sectionId}-${category}-hatch`.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
}

/** Modeled parts are hatched (estimates), measured parts solid. */
const isHatched = (category: SystemPowerCategory) => !MEASURED_POWER_CATEGORIES.has(category);
const hatchBgOpacity = (category: SystemPowerCategory) =>
  category === 'facility' ? HATCH_OPACITY : CATEGORY_OPACITY[category];

/**
 * Each modeled part gets its own stripe angle, so neighbouring estimates stay
 * distinguishable without relying on opacity alone. Degrees, SVG convention:
 * the rotation applied to a vertical stripe (0 = vertical, 90 = horizontal).
 */
export const HATCH_ANGLE: Record<SystemPowerCategory, number> = {
  gpu: 45,
  measuredCpu: 45,
  server: 45,
  fansPsu: 135,
  network: 0,
  facility: 90,
};

/** CSS `repeating-linear-gradient` angle that draws the same stripes as the SVG pattern. */
export const cssHatchAngle = (category: SystemPowerCategory) => (HATCH_ANGLE[category] + 90) % 360;

export function swatchStyle(category: SystemPowerCategory, color: string): React.CSSProperties {
  if (isHatched(category)) {
    return {
      backgroundColor: `color-mix(in oklab, ${color} ${hatchBgOpacity(category) * 100}%, transparent)`,
      backgroundImage: `repeating-linear-gradient(${cssHatchAngle(category)}deg, ${color} 0 2px, transparent 2px 6px)`,
      border: `1px solid ${color}`,
    };
  }
  return {
    backgroundColor: `color-mix(in oklab, ${color} ${CATEGORY_OPACITY[category] * 100}%, transparent)`,
    border: `1px solid ${color}`,
  };
}

function tooltipHtml(
  series: PowerBreakdownSeries,
  column: Column,
  color: string,
  xLabel: string,
  t: (typeof STRINGS)['en'],
) {
  const { entry } = column;
  const rows = series.categories
    .toReversed()
    .map((key) => {
      const value = entry.wattsPerGpu[key];
      const [label] = t.categories[key];
      const suffix = key === 'facility' ? ` (${t.pue} ${entry.pue})` : '';
      const basis = MEASURED_POWER_CATEGORIES.has(key) ? t.measured : t.modeled;
      return `<tr><td class="pr-2"><span style="display:inline-block;width:8px;height:8px;border-radius:1px;margin-right:4px;vertical-align:middle;background:${isHatched(key) ? 'transparent' : color};opacity:${isHatched(key) ? 1 : CATEGORY_OPACITY[key]};border:1px ${isHatched(key) ? 'dashed' : 'solid'} ${color}"></span>${escapeHtml(label)}${escapeHtml(suffix)}</td><td class="pr-2 text-muted-foreground">${basis}</td><td class="pr-2 text-right tabular-nums">${watts(value)} W</td><td class="text-right tabular-nums text-muted-foreground">${percent(value / entry.totalWattsPerGpu)}</td></tr>`;
    })
    .join('');
  const notes = [
    entry.chassisBasis === 'extrapolated' ? t.extrapolated : null,
    entry.cpuBasis === 'modeled' ? t.graceModeled : null,
  ]
    .filter(Boolean)
    .map((note) => `<div class="mt-1 max-w-64 text-muted-foreground">${escapeHtml(note!)}</div>`)
    .join('');
  return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md" data-testid="power-breakdown-tooltip">
    <div class="font-semibold">${escapeHtml(series.label)} · ${escapeHtml(column.label)}</div>
    <div class="text-muted-foreground">${escapeHtml(xLabel)}: ${interactivityFormat(entry.interactivity)}</div>
    ${entry.configLabel ? `<div class="mb-1 max-w-72 text-muted-foreground">${escapeHtml(entry.configLabel)}</div>` : ''}
    <table><tbody>${rows}
      <tr class="border-t font-semibold"><td class="pr-2 pt-1">${t.total}</td><td></td><td class="pr-2 pt-1 text-right tabular-nums">${watts(entry.totalWattsPerGpu)} W</td><td></td></tr>
    </tbody></table>${notes}</div>`;
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
}: {
  sectionId: string;
  series: PowerBreakdownSeries;
  color: string;
  view: PowerBreakdownView;
  xLabel: string;
  t: (typeof STRINGS)['en'];
  /**
   * One evenly spaced slot per benchmark point, in interactivity order. A sweep's
   * points bunch up at low interactivity, so true positions leave slivers there.
   */
  evenSpacing?: boolean;
  /** Column the chip comparison above is reading; outlined so the two views line up. */
  markedIndex?: number | null;
  /** Clicking a column moves the chip comparison to that point's interactivity. */
  onColumnClick?: (entry: PowerBreakdownPoint) => void;
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
  const fill = (category: SystemPowerCategory) =>
    isHatched(category) ? `url(#${hatchId(sectionId, category)})` : color;
  const fillOpacity = (category: SystemPowerCategory) =>
    isHatched(category) ? 1 : CATEGORY_OPACITY[category];
  const hatchedCategories = series.categories.filter(isHatched);

  const drawDefs: NonNullable<CustomLayerConfig['render']> = (group) => {
    const pattern = group
      .selectAll<SVGPatternElement, SystemPowerCategory>('pattern.breakdown-hatch')
      .data(hatchedCategories)
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
      .attr('id', (category) => hatchId(sectionId, category))
      .attr('patternTransform', (category) => `rotate(${HATCH_ANGLE[category]})`);
    pattern
      .select('.hatch-bg')
      .attr('fill', color)
      .attr('fill-opacity', (category) => hatchBgOpacity(category));
    pattern.select('.hatch-line').attr('stroke', color);
  };

  const drawStack: NonNullable<CustomLayerConfig['render']> = (group, ctx) => {
    const x = ctx.xScale as ContinuousScale;
    const y = (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale;
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
      stackPowerBreakdown(column.entry, series.categories)
        .filter((segment) => segment.watts > 0)
        .map((segment) => ({ ...segment, column })),
    );

    group
      .selectAll<SVGRectElement, (typeof segments)[number]>('rect.breakdown-bar')
      .data(view === 'bars' ? segments : [], (d) => `${d.column.key}-${d.key}`)
      .join('rect')
      .attr('class', 'breakdown-bar')
      .attr('data-testid', 'power-breakdown-bar')
      .attr('data-category', (d) => d.key)
      .attr('x', (d) => center(d.column.key) - barWidth(d.column.key) / 2)
      .attr('width', (d) => barWidth(d.column.key))
      .attr('y', (d) => y(d.y1))
      .attr('height', (d) => Math.max(0, y(d.y0) - y(d.y1)))
      .attr('rx', 1)
      .attr('fill', (d) => fill(d.key))
      .attr('fill-opacity', (d) => fillOpacity(d.key))
      .attr('stroke', color)
      .attr('stroke-opacity', 0.9)
      .attr('stroke-width', 1);

    const areas = series.categories.map((key) => ({
      key,
      values: columns.map((column) => {
        const segment = stackPowerBreakdown(column.entry, series.categories).find(
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
      .attr('data-category', (d) => d.key)
      .attr('d', (d) => area(d.values))
      .attr('fill', (d) => fill(d.key))
      .attr('fill-opacity', (d) => fillOpacity(d.key));
    group
      .selectAll<SVGPathElement, (typeof areas)[number]>('path.breakdown-edge')
      .data(view === 'area' ? areas : [], (d) => d.key)
      .join('path')
      .attr('class', 'breakdown-edge')
      .attr('d', (d) => edge(d.values))
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-opacity', 0.9)
      .attr('stroke-width', (d) => (d.key === series.categories.at(-1) ? 2 : 1));
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

  const drawHitAreas: NonNullable<CustomLayerConfig['render']> = (group, ctx) => {
    const layout = layoutFor(ctx.xScale as ContinuousScale, ctx.width);
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
        content: (column) => tooltipHtml(series, column, color, xLabel, t),
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
  contextLabel,
  xField,
  xLabel,
  selectedKey: controlledKey,
  onSelectKey,
  heading,
}: {
  chartId: string;
  data: InferenceData[];
  contextLabel?: string;
  /** Controlled hardware line (series key); the panel keeps its own choice when omitted. */
  selectedKey?: string | null;
  onSelectKey?: (key: string) => void;
  /** Overrides the panel title and subtitle, e.g. as a drill-down under a comparison. */
  heading?: { title: string; subtitle: string };
  /** The main chart's x field; the breakdown uses it when it is an interactivity axis. */
  xField?: keyof AggDataEntry;
  xLabel?: string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const powerXSurface = usePowerXSurface();
  const interactivity = useMemo(() => powerBreakdownInteractivity(xField), [xField]);
  const interactivityLabel = interactivity.fromChart && xLabel ? xLabel : t.xAxis;
  const { getUrlParam, setUrlParams } = useUrlState();
  const [view, setView] = useState<PowerBreakdownView>(() =>
    getUrlParam('i_pbview') === 'area' ? 'area' : 'bars',
  );
  useEffect(() => {
    setUrlParams({ i_pbview: view });
  }, [view, setUrlParams]);
  const breakdowns = useMemo(
    () => buildPowerBreakdowns(data, locale, interactivity),
    [data, locale, interactivity],
  );
  const [ownKey, setOwnKey] = useState<string | null>(null);
  const selectedKey = controlledKey === undefined ? ownKey : controlledKey;
  const setSelectedKey = (key: string) => {
    setOwnKey(key);
    onSelectKey?.(key);
  };
  const series = breakdowns.find((entry) => entry.key === selectedKey) ?? breakdowns[0] ?? null;
  // PowerX: outline the point the chip comparison reads, and let a click move it.
  const compareTarget = usePowerXCompareTarget();
  const setCompareTarget = useSetPowerXCompareTarget();
  const comparedAt = setCompareTarget
    ? (compareTarget ?? defaultComparisonInteractivity(breakdowns))
    : null;
  const comparedEntry =
    series && comparedAt
      ? (compareBreakdownsAt([series], comparedAt).rows[0]?.entry ?? null)
      : null;
  const markedIndex = series && comparedEntry ? series.points.indexOf(comparedEntry) : -1;
  const sectionId = `${chartId}-power-breakdown`;
  // The main chart's vendor color for each hardware line, so a bar here reads
  // as the same series as its line and legend chip above.
  const hwKeys = useMemo(() => [...new Set(data.map((point) => point.hwKey))], [data]);
  const { resolveColor } = useThemeColors({
    highContrast: false,
    identifiers: hwKeys,
    activeKeys: hwKeys,
  });
  const colorOf = (entry: PowerBreakdownSeries) => resolveColor(entry.hwKey);
  const color = series ? colorOf(series) : 'currentColor';

  const exportCsv = () => {
    const keys = ['gpu', 'measuredCpu', 'server', 'fansPsu', 'network', 'facility'] as const;
    exportToCsv(
      'InferenceX_power_breakdown',
      [
        'series',
        'configuration',
        'concurrency',
        interactivity.field,
        'measured_gpu_w_per_gpu',
        'measured_grace_cpu_w_per_gpu',
        'server_parts_w_per_gpu',
        'fans_psu_loss_w_per_gpu',
        'network_share_w_per_gpu',
        'facility_overhead_w_per_gpu',
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
          ...keys.map((key) => point.wattsPerGpu[key]),
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
      <div className="space-y-1">
        <Heading as="h3" level="card">
          {heading?.title ?? t.title}
        </Heading>
        <p className="text-sm text-muted-foreground">{heading?.subtitle ?? t.subtitle}</p>
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
          <ul
            className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
            data-testid="power-breakdown-legend"
          >
            {series.categories.toReversed().map((key) => {
              const [label, description] = t.categories[key];
              const detail =
                key === 'facility' ? `${description} ${series.points[0].pue}` : description;
              return (
                <li key={key} className="flex min-w-0 items-baseline gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block size-3 shrink-0 translate-y-0.5 rounded-[2px]"
                    style={swatchStyle(key, color)}
                  />
                  <span className="shrink-0 font-medium whitespace-nowrap">{label}</span>
                  <span className="min-w-0 text-muted-foreground">
                    {detail} · {MEASURED_POWER_CATEGORIES.has(key) ? t.measured : t.modeled}
                  </span>
                </li>
              );
            })}
          </ul>
          <BreakdownChart
            key={`${series.key}-${view}`}
            sectionId={sectionId}
            series={series}
            color={color}
            view={view}
            xLabel={interactivityLabel}
            t={t}
            evenSpacing={powerXSurface}
            markedIndex={markedIndex >= 0 ? markedIndex : null}
            onColumnClick={
              setCompareTarget ? (entry) => setCompareTarget(entry.interactivity) : undefined
            }
          />
          <p className="text-xs text-muted-foreground">
            {t.note(SYSTEM_POWER_MODEL_REVISION.slice(0, 7))}
          </p>
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
