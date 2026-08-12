'use client';

import * as d3 from 'd3';
import React, { useCallback, useMemo } from 'react';

import { formatLargeNumber } from '@/lib/chart-rendering';
import { getChartWatermark } from '@/lib/data-mappings';
import { D3Chart, type RenderContext, type ScaleConfig } from '@/lib/d3-chart/D3Chart';
import { escapeHtml } from '@/lib/utils';

import type { LifecyclePoint, LifecycleSeries } from './lifecycle';

const CHART_MARGIN = { top: 20, right: 40, bottom: 50, left: 70 };

/** One plotted series: an hwKey's margin staircase since the model shipped. */
export interface LifecycleChartSeries {
  key: string;
  label: string;
  color: string;
  series: LifecycleSeries;
  /** Run date and config label for each step riser, keyed by month. */
  stepInfo: Map<number, { date: string; config: string; factor: number }>;
}

/** A hovered step riser — one measured config improvement. */
interface StepMarker {
  x: number;
  y: number;
  precision: string;
  seriesKey: string;
  month: number;
}

interface FleetLifecycleChartProps {
  data: LifecycleChartSeries[];
  /** Anchor for the x axis — the model's release date, as a timestamp. */
  anchorMs: number;
  yLabel: string;
  labels: {
    date: string;
    config: string;
    marginPerDay: string;
    revenuePerDay: string;
    costPerDay: string;
    cumulative: string;
    sinceFirst: string;
  };
  breakEvenLabel: string;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
}

const MS_PER_MONTH = (365.25 / 12) * 24 * 3600 * 1000;

/** CSS class names derive from series keys, so strip separators as TrendChart does. */
const safeKey = (key: string) => key.replaceAll(/[|_\s]/gu, '-');

/** Signed money, negative rendered as -$X rather than $-X. */
const money = (value: number) => `${value < 0 ? '-$' : '$'}${formatLargeNumber(Math.abs(value))}`;

const FleetLifecycleChart = React.memo(
  ({
    data,
    anchorMs,
    yLabel,
    labels,
    breakEvenLabel,
    legendElement,
    caption,
  }: FleetLifecycleChartProps) => {
    const toMs = useCallback((month: number) => anchorMs + month * MS_PER_MONTH, [anchorMs]);

    const { lineDataRecord, rampDataRecord, markers, bySafeKey } = useMemo(() => {
      const record: Record<string, { x: number; y: number }[]> = {};
      const ramp: Record<string, { x: number; y: number }[]> = {};
      const flat: StepMarker[] = [];
      const lookup = new Map<string, LifecycleChartSeries>();

      for (const entry of data) {
        const key = safeKey(entry.key);
        lookup.set(key, entry);
        const { rampEndMonth } = entry.series;
        // The ramp is a continuous curve and the steps are not, so they are drawn
        // as separate layers with different interpolations. They share the
        // junction point, which keeps the join seamless.
        const steady = entry.series.points.filter((p) => p.month >= rampEndMonth);
        record[key] = steady.map((p) => ({ x: toMs(p.month), y: p.margin }));
        const rampPoints = entry.series.points.filter((p) => p.month <= rampEndMonth);
        if (rampPoints.length > 1) {
          ramp[key] = rampPoints.map((p) => ({ x: toMs(p.month), y: p.margin }));
        }
        // Markers mark measured config changes and nothing else — no rug of
        // synthetic samples, and every dot is a sweep the user can look up.
        for (const p of entry.series.points) {
          if (!p.isStep) continue;
          flat.push({
            x: toMs(p.month),
            y: p.margin,
            precision: 'fp4',
            seriesKey: key,
            month: p.month,
          });
        }
      }
      return { lineDataRecord: record, rampDataRecord: ramp, markers: flat, bySafeKey: lookup };
    }, [data, toMs]);

    const xScaleConfig = useMemo<ScaleConfig>(() => {
      let min = Infinity;
      let max = -Infinity;
      for (const entry of data) {
        min = Math.min(min, toMs(entry.series.startMonth));
        max = Math.max(max, toMs(entry.series.endMonth));
      }
      if (!Number.isFinite(min)) return { type: 'time', domain: [new Date(), new Date()] };
      // nice defaults to true in scale-builders, which rounds a multi-year span
      // out to whole years and leaves dead space before the release date and
      // after the horizon. The domain here is meaningful on both ends.
      return { type: 'time', domain: [new Date(min), new Date(max)], nice: false };
    }, [data, toMs]);

    const yScaleConfig = useMemo<ScaleConfig>(() => {
      let min = 0;
      let max = 0;
      for (const entry of data) {
        for (const p of entry.series.points) {
          if (p.margin < min) min = p.margin;
          if (p.margin > max) max = p.margin;
        }
      }
      // Always include zero: the chart is about which side of it you are on.
      const span = max - min || Math.max(Math.abs(max), 1);
      return { type: 'linear', domain: [min - span * 0.05, max + span * 0.05], nice: true };
    }, [data]);

    /**
     * The break-even rule. No reference-line layer exists to reuse, and a custom
     * layer must be idempotent: the chart re-renders into the same zoom group, so
     * appending unconditionally leaves a stale rule behind at the previous
     * y-scale on every data change.
     */
    const renderZeroRule = useCallback(
      (zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: RenderContext) => {
        const y = (ctx.yScale as d3.ScaleLinear<number, number>)(0);
        zoomGroup.selectAll('.lifecycle-zero-rule').remove();
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
          .attr('x', 2)
          .attr('y', y - 5)
          .attr('text-anchor', 'start')
          .attr('fill', 'currentColor')
          .attr('opacity', 0.7)
          .attr('font-size', 10)
          .text(breakEvenLabel);
      },
      [breakEvenLabel],
    );

    /**
     * The ramp segment, drawn by hand rather than as a second `line` layer.
     *
     * Every layer renders into one shared group and `renderLines` joins on
     * `.line-path` keyed by series, so a second line layer with the same series
     * keys would match the first layer's paths and overwrite their geometry —
     * one of the two segments would simply vanish. A custom layer owns its own
     * class, which sidesteps that entirely.
     *
     * Idempotent for the same reason the zero rule is: this re-renders into the
     * group it already drew into.
     */
    const renderRamp = useCallback(
      (zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: RenderContext) => {
        zoomGroup.selectAll('.lifecycle-ramp').remove();
        const entries = Object.entries(rampDataRecord);
        if (entries.length === 0) return;

        const line = d3
          .line<{ x: number; y: number }>()
          .x((d) => (ctx.xScale as d3.ScaleTime<number, number>)(d.x))
          .y((d) => (ctx.yScale as d3.ScaleLinear<number, number>)(d.y))
          // Load builds continuously, so this half really is a curve.
          .curve(d3.curveMonotoneX);

        const group = zoomGroup.append('g').attr('class', 'lifecycle-ramp');
        for (const [key, points] of entries) {
          const path = line(points);
          if (!path) continue;
          group
            .append('path')
            .attr('class', `lifecycle-ramp-path lifecycle-ramp-${key}`)
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', bySafeKey.get(key)?.color ?? '#888')
            .attr('stroke-width', 2);
        }
      },
      [rampDataRecord, bySafeKey],
    );

    const layers = useMemo(
      () => [
        { type: 'custom' as const, key: 'lifecycle-zero', render: renderZeroRule },
        { type: 'custom' as const, key: 'lifecycle-ramp', render: renderRamp },
        {
          type: 'line' as const,
          key: 'lifecycle-lines',
          lines: lineDataRecord,
          config: {
            getColor: (key: string) => bySafeKey.get(key)?.color ?? '#888',
            strokeWidth: 2,
            // A config holds until the next one lands, so this half is a step,
            // not a smooth ramp. Drawing it curved would imply the fleet got
            // gradually faster between sweeps, which is not what happened.
            curve: d3.curveStepAfter,
          },
        },
        {
          type: 'scatter' as const,
          key: 'lifecycle-steps',
          data: markers,
          config: {
            getColor: (d: StepMarker) => bySafeKey.get(d.seriesKey)?.color ?? '#888',
          },
        },
      ],
      [renderZeroRule, renderRamp, lineDataRecord, markers, bySafeKey],
    );

    const tooltipConfig = useMemo(
      () => ({
        rulerType: 'crosshair' as const,
        content: (d: StepMarker, isPinned: boolean) => {
          const entry = bySafeKey.get(d.seriesKey);
          if (!entry) return '';
          const point =
            entry.series.points.find((p) => p.isStep && p.month === d.month) ??
            (entry.series.points[0] as LifecyclePoint);
          const info = entry.stepInfo.get(d.month);
          const factor = info && info.factor > 1.005 ? ` (${info.factor.toFixed(2)}x)` : '';
          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 220px; user-select: ${isPinned ? 'text' : 'none'};">
            <div class="font-semibold mb-1" style="color: ${escapeHtml(entry.color)}">${escapeHtml(entry.label)}</div>
            <div class="text-muted-foreground">${escapeHtml(labels.date)}: ${escapeHtml(info?.date ?? '')}</div>
            ${info?.config ? `<div class="text-muted-foreground">${escapeHtml(labels.config)}: ${escapeHtml(info.config)}</div>` : ''}
            <div class="mt-1 font-medium">${escapeHtml(labels.marginPerDay)}: ${money(point.margin)}</div>
            <div class="text-muted-foreground">${escapeHtml(labels.revenuePerDay)}: ${money(point.revenue)}</div>
            <div class="text-muted-foreground">${escapeHtml(labels.costPerDay)}: ${money(point.cost)}</div>
            <div class="mt-1">${escapeHtml(labels.cumulative)}: ${money(point.cumulative)}</div>
            ${factor ? `<div class="text-muted-foreground">${escapeHtml(labels.sinceFirst)}:${escapeHtml(factor)}</div>` : ''}
          </div>`;
        },
        getRulerX: (d: StepMarker, xScale: any) => xScale(d.x),
        getRulerY: (d: StepMarker, yScale: any) => yScale(d.y),
        attachToLayer: 3,
      }),
      [bySafeKey, labels],
    );

    const xAxisConfig = useMemo(
      () => ({
        tickFormat: d3.timeFormat('%b %Y') as any,
        tickCount: 8,
      }),
      [],
    );

    const yAxisConfig = useMemo(
      () => ({
        label: yLabel,
        tickFormat: (v: d3.AxisDomain) => money(v as number),
        tickCount: 8,
      }),
      [yLabel],
    );

    return (
      <D3Chart<StepMarker>
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
