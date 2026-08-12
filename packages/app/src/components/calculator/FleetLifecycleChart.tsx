'use client';

import * as d3 from 'd3';
import React, { useCallback, useMemo, useRef } from 'react';

import { formatLargeNumber } from '@/lib/chart-rendering';
import { getChartWatermark } from '@/lib/data-mappings';
import { D3Chart, type RenderContext, type ScaleConfig } from '@/lib/d3-chart/D3Chart';
import { escapeHtml } from '@/lib/utils';

import type { LifecyclePoint, LifecycleSeries } from './lifecycle';

// Right margin holds the end-of-line chip labels, which sit outside the plot.
const CHART_MARGIN = { top: 20, right: 104, bottom: 50, left: 70 };

/** Minimum vertical gap between end-of-line labels, px. */
const LABEL_MIN_GAP = 13;

/**
 * Half the label's cap height, near enough. Labels are centred on their line's
 * end value, so a series plateauing at the very top of the domain would have
 * half its glyphs above the SVG edge without this inset.
 */
const LABEL_HALF_HEIGHT = 6;

/** One plotted series: an hwKey's margin staircase since the model shipped. */
export interface LifecycleChartSeries {
  key: string;
  label: string;
  color: string;
  series: LifecycleSeries;
  /** Run date, config label and run links for each step riser, keyed by month. */
  stepInfo: Map<number, { date: string; config: string; factor: number; runUrls: string[] }>;
}

/** A hovered step riser — one measured config improvement. */
interface StepMarker {
  x: number;
  y: number;
  precision: string;
  seriesKey: string;
  month: number;
}

/** Which per-day rate the y axis plots. */
export type LifecycleMetric = 'margin' | 'revenue';

interface FleetLifecycleChartProps {
  data: LifecycleChartSeries[];
  metric: LifecycleMetric;
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
    runLink: string;
    runHint: string;
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
    metric,
    anchorMs,
    yLabel,
    labels,
    breakEvenLabel,
    legendElement,
    caption,
  }: FleetLifecycleChartProps) => {
    const toMs = useCallback((month: number) => anchorMs + month * MS_PER_MONTH, [anchorMs]);
    const valueOf = useCallback(
      (point: LifecyclePoint) => (metric === 'revenue' ? point.revenue : point.margin),
      [metric],
    );

    const { lineDataRecord, markers, bySafeKey } = useMemo(() => {
      const record: Record<string, { x: number; y: number }[]> = {};
      const flat: StepMarker[] = [];
      const lookup = new Map<string, LifecycleChartSeries>();

      for (const entry of data) {
        const key = safeKey(entry.key);
        lookup.set(key, entry);
        record[key] = entry.series.points.map((p) => ({ x: toMs(p.month), y: valueOf(p) }));
        // Markers mark measured config changes and nothing else — no rug of
        // synthetic samples, and every dot is a sweep the user can look up.
        for (const p of entry.series.points) {
          if (!p.isStep) continue;
          flat.push({
            x: toMs(p.month),
            y: valueOf(p),
            precision: 'fp4',
            seriesKey: key,
            month: p.month,
          });
        }
      }
      return { lineDataRecord: record, markers: flat, bySafeKey: lookup };
    }, [data, toMs, valueOf]);

    /**
     * What the custom layers should draw *now*.
     *
     * The zoom behaviour installed by a render captures that render's layer
     * callbacks, and `d3.zoom`'s double-click reset is a transition — so its
     * trailing events can fire after a later render has already redrawn. A stale
     * callback then re-appends what the new render just removed: switch the axis to
     * revenue mid-reset and the break-even rule comes back and stays, because
     * nothing renders again afterwards. Reading through a ref keeps every draw,
     * stale closure or not, consistent with the current props.
     */
    const latest = useRef({ metric, lineDataRecord, bySafeKey });
    latest.current = { metric, lineDataRecord, bySafeKey };

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
          const value = valueOf(p);
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      // Always include zero. For margin that is the whole question — which side of
      // break-even a fleet is on; for revenue it is the floor a rollout starts from.
      const span = max - min || Math.max(Math.abs(max), 1);
      return { type: 'linear', domain: [min - span * 0.05, max + span * 0.05], nice: true };
    }, [data, valueOf]);

    /**
     * The break-even rule. No reference-line layer exists to reuse, and a custom
     * layer must be idempotent: the chart re-renders into the same zoom group, so
     * appending unconditionally leaves a stale rule behind at the previous
     * y-scale on every data change.
     */
    const drawZeroRule = useCallback(
      (
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: RenderContext,
        yScale: d3.ScaleLinear<number, number>,
      ) => {
        const y = yScale(0);
        zoomGroup.selectAll('.lifecycle-zero-rule').remove();
        // Zero is break-even only for margin. On a revenue axis it is just the
        // bottom of the scale, and labelling it "break-even" would be a lie: each
        // chip breaks even at its own cost line, not at zero revenue.
        if (latest.current.metric !== 'margin') return;
        if (!Number.isFinite(y)) return;

        // Lowered explicitly: `renderLines` keeps its paths in place across
        // re-renders via a data join, while this layer removes and re-appends, so
        // without this the rule climbs above the lines after the first repaint.
        const group = zoomGroup.append('g').attr('class', 'lifecycle-zero-rule').lower();
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

    const renderZeroRule = useCallback(
      (zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: RenderContext) =>
        drawZeroRule(zoomGroup, ctx, ctx.yScale as d3.ScaleLinear<number, number>),
      [drawZeroRule],
    );

    // Without this the rule stays pinned to the base scale while the lines move,
    // so a zoomed chart shows break-even in the wrong place.
    const zoomZeroRule = useCallback(
      (zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: RenderContext) =>
        drawZeroRule(
          zoomGroup,
          ctx,
          ((ctx as { newYScale?: unknown }).newYScale ?? ctx.yScale) as d3.ScaleLinear<
            number,
            number
          >,
        ),
      [drawZeroRule],
    );

    /**
     * Chip names at the right end of each line, so a series can be identified
     * without crossing back to the legend.
     *
     * Drawn into `ctx.layout.g` rather than the zoom group: layers render into a
     * clipped group (`clipContent` defaults to true), and these sit past the plot
     * width, so they would be clipped away entirely.
     */
    const drawSeriesLabels = useCallback(
      (
        ctx: RenderContext,
        xScale: d3.ScaleTime<number, number>,
        yScale: d3.ScaleLinear<number, number>,
      ) => {
        const group = ctx.layout.g;
        group.selectAll('.lifecycle-series-label').remove();

        // Where the plot is cut off, in data units. Panning moves it, so the label
        // must follow the line's *visible* end, not its last data point.
        const edge = Number(xScale.invert(ctx.width));

        const { lineDataRecord: lines, bySafeKey: lookup } = latest.current;
        const placed = Object.entries(lines)
          .flatMap(([key, points]) => {
            const entry = lookup.get(key);
            const last = points.at(-1);
            const first = points[0];
            if (!entry || !last || !first) return [];
            // Panned entirely past the right edge: there is no line to name.
            if (first.x > edge) return [];

            let value = last.y;
            let x = xScale(last.x);
            if (last.x > edge) {
              // The line runs off the edge. Interpolate the segment that straddles
              // it, so the label sits level with where the line actually leaves.
              x = ctx.width;
              for (let i = 1; i < points.length; i += 1) {
                const before = points[i - 1]!;
                const after = points[i]!;
                if (after.x < edge) continue;
                const span = after.x - before.x;
                const t = span > 0 ? (edge - before.x) / span : 0;
                value = before.y + (after.y - before.y) * t;
                break;
              }
            }

            const y = yScale(value);
            if (!Number.isFinite(y) || !Number.isFinite(x)) return [];
            // Zooming the y axis can push the end value outside the visible range;
            // pin the label to the nearest edge rather than let it escape.
            const top = LABEL_HALF_HEIGHT;
            const bottom = ctx.height - LABEL_HALF_HEIGHT;
            return [
              {
                label: entry.label,
                color: entry.color,
                x: Math.min(Math.max(x, 0), ctx.width) + 6,
                y: Math.min(Math.max(y, top), bottom),
              },
            ];
          })
          .toSorted((a, b) => a.y - b.y);

        // Nudge downwards so near-identical end values stay legible.
        for (let i = 1; i < placed.length; i += 1) {
          const previous = placed[i - 1]!;
          const current = placed[i]!;
          if (current.y - previous.y < LABEL_MIN_GAP) current.y = previous.y + LABEL_MIN_GAP;
        }

        // Nudging only ever pushes down, so the stack can run off the bottom.
        // Slide the whole block back up by the overflow, keeping the gaps.
        const overflow = (placed.at(-1)?.y ?? 0) - (ctx.height - LABEL_HALF_HEIGHT);
        if (overflow > 0) {
          for (const entry of placed) entry.y = Math.max(entry.y - overflow, LABEL_HALF_HEIGHT);
        }

        for (const { label, color, x, y } of placed) {
          group
            .append('text')
            .attr('class', 'lifecycle-series-label')
            .attr('x', x)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('fill', color)
            .attr('font-size', 11)
            .attr('font-weight', 500)
            .text(label);
        }
      },
      [],
    );

    const renderSeriesLabels = useCallback(
      (_zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: RenderContext) =>
        drawSeriesLabels(
          ctx,
          ctx.xScale as d3.ScaleTime<number, number>,
          ctx.yScale as d3.ScaleLinear<number, number>,
        ),
      [drawSeriesLabels],
    );

    const zoomSeriesLabels = useCallback(
      (_zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: RenderContext) => {
        const zoomed = ctx as { newXScale?: unknown; newYScale?: unknown };
        drawSeriesLabels(
          ctx,
          (zoomed.newXScale ?? ctx.xScale) as d3.ScaleTime<number, number>,
          (zoomed.newYScale ?? ctx.yScale) as d3.ScaleLinear<number, number>,
        );
      },
      [drawSeriesLabels],
    );

    const layers = useMemo(
      () => [
        {
          type: 'custom' as const,
          key: 'lifecycle-zero',
          render: renderZeroRule,
          onZoom: zoomZeroRule,
        },
        {
          type: 'line' as const,
          key: 'lifecycle-lines',
          lines: lineDataRecord,
          config: {
            getColor: (key: string) => bySafeKey.get(key)?.color ?? '#888',
            strokeWidth: 2,
            // Every riser is a rollout curve and every plateau is flat, and the
            // samples already carry that shape — so interpolate linearly and draw
            // exactly what was computed. A step curve would flatten the rollouts
            // into stairs; a spline would overshoot on the near-vertical ones.
            curve: d3.curveLinear,
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
        {
          type: 'custom' as const,
          key: 'lifecycle-series-labels',
          render: renderSeriesLabels,
          onZoom: zoomSeriesLabels,
        },
      ],
      [
        renderZeroRule,
        zoomZeroRule,
        renderSeriesLabels,
        zoomSeriesLabels,
        lineDataRecord,
        markers,
        bySafeKey,
      ],
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
            ${
              // Lead with whichever rate the axis is plotting; the other two stay
              // as context so the tooltip never depends on the axis to be read.
              metric === 'revenue'
                ? `<div class="mt-1 font-medium">${escapeHtml(labels.revenuePerDay)}: ${money(point.revenue)}</div>
            <div class="text-muted-foreground">${escapeHtml(labels.marginPerDay)}: ${money(point.margin)}</div>`
                : `<div class="mt-1 font-medium">${escapeHtml(labels.marginPerDay)}: ${money(point.margin)}</div>
            <div class="text-muted-foreground">${escapeHtml(labels.revenuePerDay)}: ${money(point.revenue)}</div>`
            }
            <div class="text-muted-foreground">${escapeHtml(labels.costPerDay)}: ${money(point.cost)}</div>
            <div class="mt-1">${escapeHtml(labels.cumulative)}: ${money(point.cumulative)}</div>
            ${factor ? `<div class="text-muted-foreground">${escapeHtml(labels.sinceFirst)}:${escapeHtml(factor)}</div>` : ''}
            ${
              // Every rung links its run, not just the first and last. The table
              // only links the opening and closing sweeps, so without this the
              // intermediate rungs — exactly where an anomalous run that was never
              // purged would sit — have no audit trail anywhere in the UI. Pin the
              // tooltip (click the dot) to follow one.
              isPinned && info?.runUrls.length
                ? `<div class="mt-1">${info.runUrls
                    .map(
                      (url, i) =>
                        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-primary underline mr-2">${escapeHtml(labels.runLink)}${
                          info.runUrls.length > 1 ? ` ${i + 1}` : ''
                        }</a>`,
                    )
                    .join('')}</div>`
                : info?.runUrls.length
                  ? `<div class="mt-1 text-muted-foreground">${escapeHtml(labels.runHint)}</div>`
                  : ''
            }
          </div>`;
        },
        getRulerX: (d: StepMarker, xScale: any) => xScale(d.x),
        getRulerY: (d: StepMarker, yScale: any) => yScale(d.y),
        attachToLayer: 2,
      }),
      [bySafeKey, labels, metric],
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

    // x only: the y axis is a money scale whose zero line is the whole point, and
    // rescaling it would move break-even under the reader. Matches TrendChart.
    const zoomConfig = useMemo(
      () => ({ enabled: true, axes: 'x' as const, scaleExtent: [1, 10] as [number, number] }),
      [],
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
        zoom={zoomConfig}
        instructions="Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Click a point to pin tooltip"
        tooltip={tooltipConfig}
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);

FleetLifecycleChart.displayName = 'FleetLifecycleChart';

export default FleetLifecycleChart;
