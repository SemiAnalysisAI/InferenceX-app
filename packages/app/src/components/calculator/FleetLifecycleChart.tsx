'use client';

import * as d3 from 'd3';
import React, { useCallback, useMemo } from 'react';

import { formatLargeNumber } from '@/lib/chart-rendering';
import { getChartWatermark } from '@/lib/data-mappings';
import { D3Chart, type RenderContext, type ScaleConfig } from '@/lib/d3-chart/D3Chart';
import { escapeHtml } from '@/lib/utils';

import type { LifecycleSeries } from './lifecycle';

const CHART_MARGIN = { top: 20, right: 30, bottom: 50, left: 70 };

/** One plotted series: an hwKey's margin-per-day curve over its life. */
export interface LifecycleChartSeries {
  key: string;
  label: string;
  color: string;
  /** Winning run date, shown in the tooltip since it is no longer the caption's date. */
  date: string;
  disagg: boolean;
  series: LifecycleSeries;
}

/** A hovered sample. `precision` is required by the scatter layer's shape logic. */
interface LifecyclePoint {
  x: number;
  y: number;
  precision: string;
  seriesKey: string;
}

interface FleetLifecycleChartProps {
  data: LifecycleChartSeries[];
  yLabel: string;
  /** Localised tooltip row labels. */
  labels: {
    month: string;
    marginPerDay: string;
    revenuePerDay: string;
    costPerDay: string;
    cumulative: string;
    measured: string;
  };
  breakEvenLabel: string;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
}

/** Marker every N months — enough to hover, sparse enough not to be a rug. */
const MARKER_INTERVAL_MONTHS = 3;

/** CSS class names are derived from series keys, so strip separators as TrendChart does. */
const safeKey = (key: string) => key.replaceAll(/[|_\s]/gu, '-');

/** Signed money, negative rendered as -$X rather than $-X. */
const money = (value: number) => `${value < 0 ? '-$' : '$'}${formatLargeNumber(Math.abs(value))}`;

const FleetLifecycleChart = React.memo(
  ({ data, yLabel, labels, breakEvenLabel, legendElement, caption }: FleetLifecycleChartProps) => {
    const { lineDataRecord, markers, bySafeKey } = useMemo(() => {
      const record: Record<string, { x: number; y: number }[]> = {};
      const flat: LifecyclePoint[] = [];
      const lookup = new Map<string, LifecycleChartSeries>();

      for (const entry of data) {
        const key = safeKey(entry.key);
        lookup.set(key, entry);
        record[key] = entry.series.points.map((p) => ({ x: p.month, y: p.margin }));

        let nextMarker = 0;
        for (const p of entry.series.points) {
          if (p.month + 1e-9 < nextMarker) continue;
          nextMarker = p.month + MARKER_INTERVAL_MONTHS;
          flat.push({ x: p.month, y: p.margin, precision: 'fp4', seriesKey: key });
        }
      }
      return { lineDataRecord: record, markers: flat, bySafeKey: lookup };
    }, [data]);

    const xScaleConfig = useMemo<ScaleConfig>(() => {
      const maxMonth = Math.max(1, ...data.map((d) => d.series.endMonth));
      return { type: 'linear', domain: [0, maxMonth] };
    }, [data]);

    const yScaleConfig = useMemo<ScaleConfig>(() => {
      let min = 0;
      let max = 0;
      for (const entry of data) {
        for (const p of entry.series.points) {
          if (p.margin < min) min = p.margin;
          if (p.margin > max) max = p.margin;
        }
      }
      // Always include zero: the whole chart is about which side of it you are on.
      const span = max - min || Math.max(Math.abs(max), 1);
      return { type: 'linear', domain: [min - span * 0.05, max + span * 0.05], nice: true };
    }, [data]);

    /** The break-even rule, plus its label. No reference-line layer exists to reuse. */
    const renderZeroRule = useCallback(
      (zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: RenderContext) => {
        const y = (ctx.yScale as d3.ScaleLinear<number, number>)(0);
        if (!Number.isFinite(y)) return;

        const group = zoomGroup.append('g').attr('class', 'lifecycle-zero-rule');
        group
          .append('line')
          .attr('x1', 0)
          .attr('x2', ctx.width)
          .attr('y1', y)
          .attr('y2', y)
          .attr('stroke', 'currentColor')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4 3')
          .attr('opacity', 0.55);
        group
          .append('text')
          .attr('x', ctx.width - 4)
          .attr('y', y - 5)
          .attr('text-anchor', 'end')
          .attr('fill', 'currentColor')
          .attr('opacity', 0.7)
          .attr('font-size', 10)
          .text(breakEvenLabel);
      },
      [breakEvenLabel],
    );

    const layers = useMemo(
      () => [
        {
          type: 'custom' as const,
          key: 'lifecycle-zero',
          render: renderZeroRule,
        },
        {
          type: 'line' as const,
          key: 'lifecycle-lines',
          lines: lineDataRecord,
          config: {
            getColor: (key: string) => bySafeKey.get(key)?.color ?? '#888',
            strokeWidth: 2,
            curve: d3.curveMonotoneX,
            // Disaggregated configs are not power-normalised the same way, so
            // they are drawn dashed as well as flagged in the banner.
            getStrokeDasharray: (key: string) => (bySafeKey.get(key)?.disagg ? '6 3' : 'none'),
          },
        },
        {
          type: 'scatter' as const,
          key: 'lifecycle-markers',
          data: markers,
          config: {
            getColor: (d: LifecyclePoint) => bySafeKey.get(d.seriesKey)?.color ?? '#888',
          },
        },
      ],
      [renderZeroRule, lineDataRecord, markers, bySafeKey],
    );

    const tooltipConfig = useMemo(
      () => ({
        rulerType: 'crosshair' as const,
        content: (d: LifecyclePoint, isPinned: boolean) => {
          const entry = bySafeKey.get(d.seriesKey);
          if (!entry) return '';
          const point =
            entry.series.points.find((p) => Math.abs(p.month - d.x) < 1e-6) ??
            entry.series.points[0]!;
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 200px; user-select: ${isPinned ? 'text' : 'none'};">
            <div class="font-semibold mb-1" style="color: ${escapeHtml(entry.color)}">${escapeHtml(entry.label)}</div>
            <div class="text-muted-foreground">${escapeHtml(labels.measured)} ${escapeHtml(entry.date)}</div>
            <div class="mt-1">${escapeHtml(labels.month)}: ${point.month.toFixed(1)}</div>
            <div class="font-medium">${escapeHtml(labels.marginPerDay)}: ${money(point.margin)}</div>
            <div class="text-muted-foreground">${escapeHtml(labels.revenuePerDay)}: ${money(point.revenue)}</div>
            <div class="text-muted-foreground">${escapeHtml(labels.costPerDay)}: ${money(point.cost)}</div>
            <div class="mt-1">${escapeHtml(labels.cumulative)}: ${money(point.cumulative)}</div>
          </div>`;
        },
        getRulerX: (d: LifecyclePoint, xScale: any) => xScale(d.x),
        getRulerY: (d: LifecyclePoint, yScale: any) => yScale(d.y),
        attachToLayer: 2,
      }),
      [bySafeKey, labels],
    );

    const xAxisConfig = useMemo(() => ({ label: labels.month, tickCount: 10 }), [labels.month]);

    const yAxisConfig = useMemo(
      () => ({
        label: yLabel,
        tickFormat: (v: d3.AxisDomain) => {
          const n = v as number;
          return `${n < 0 ? '-$' : '$'}${formatLargeNumber(Math.abs(n))}`;
        },
        tickCount: 8,
      }),
      [yLabel],
    );

    return (
      <D3Chart<LifecyclePoint>
        chartId="fleet-lifecycle"
        data={markers}
        height={420}
        margin={CHART_MARGIN}
        watermark={getChartWatermark()}
        testId="calculator-lifecycle-chart-svg"
        xScale={xScaleConfig}
        yScale={yScaleConfig}
        xAxis={xAxisConfig}
        yAxis={yAxisConfig}
        layers={layers}
        tooltip={tooltipConfig}
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);

FleetLifecycleChart.displayName = 'FleetLifecycleChart';

export default FleetLifecycleChart;
