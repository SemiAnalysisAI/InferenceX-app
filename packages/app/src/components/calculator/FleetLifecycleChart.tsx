'use client';

import * as d3 from 'd3';
import React, { useCallback, useMemo, useRef } from 'react';

import { formatLargeNumber } from '@/lib/chart-rendering';
import { getChartWatermark } from '@/lib/data-mappings';
import {
  D3Chart,
  type D3ChartHandle,
  type RenderContext,
  type ScaleConfig,
} from '@/lib/d3-chart/D3Chart';
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

/**
 * Hover positions the readout can snap to: a uniform grid across the window.
 *
 * The alternative — snapping to the sample points themselves — reads badly here,
 * because sample density varies by two orders of magnitude along a line. Each
 * rollout carries 24 samples over its ramp (a day or two apart) while a plateau
 * carries a single sample spanning months, so the cursor would crawl through a
 * riser and then jump a year. A uniform grid moves at a constant speed, and at
 * this count each slice is well under a pixel wide unzoomed.
 */
const HOVER_SLICE_COUNT = 1200;

/**
 * How near a slice must be to a step for the readout to include that step's
 * config and run links, in slices.
 *
 * A step's own instant almost never coincides with a grid slice, and at this
 * density a slice is a fraction of a pixel — so matching by equality would make
 * the run links unreachable by pointing at the dot, which is the only place a
 * reader would think to look for them. Four slices is about three pixels
 * unzoomed: near enough to mean "that dot", far enough to be hittable.
 */
const STEP_MATCH_SLICES = 4;

/** One position on the time axis the readout can rest at. */
interface HoverSlice {
  /** Timestamp, ms. */
  x: number;
}

/** A measured config change, placed on the time axis. */
interface StepAt {
  x: number;
  seriesKey: string;
  month: number;
}

/** One series' state at a hovered slice. */
interface SliceReading {
  label: string;
  color: string;
  value: number;
  cumulative: number;
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
  };
  breakEvenLabel: string;
  /** Localised hint under the chart. */
  instructions: string;
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
    instructions,
    legendElement,
    caption,
  }: FleetLifecycleChartProps) => {
    const chartRef = useRef<D3ChartHandle | null>(null);
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

    /** The grid the hover readout snaps to, plus where the steps sit on it. */
    const { hoverSlices, stepsOnAxis, sliceSpacing } = useMemo(() => {
      let min = Infinity;
      let max = -Infinity;
      for (const entry of data) {
        min = Math.min(min, toMs(entry.series.startMonth));
        max = Math.max(max, toMs(entry.series.endMonth));
      }
      if (!Number.isFinite(min) || !(max > min)) {
        return { hoverSlices: [], stepsOnAxis: [], sliceSpacing: 0 };
      }

      const spacing = (max - min) / HOVER_SLICE_COUNT;
      const slices: HoverSlice[] = Array.from({ length: HOVER_SLICE_COUNT + 1 }, (_, i) => ({
        x: min + i * spacing,
      }));
      const steps: StepAt[] = [];
      for (const entry of data) {
        for (const point of entry.series.points) {
          if (!point.isStep) continue;
          steps.push({ x: toMs(point.month), seriesKey: safeKey(entry.key), month: point.month });
        }
      }
      return { hoverSlices: slices, stepsOnAxis: steps, sliceSpacing: spacing };
    }, [data, toMs]);

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

    /**
     * A series' plotted rate and cumulative margin at an arbitrary instant.
     *
     * Interpolates linearly between samples, which is exactly what the line does
     * (`curveLinear`), so the readout always agrees with the pixel under the rule.
     * Returns null outside the series' own window — a chip first measured a year
     * after release has no line, and so no number, before then.
     */
    const readingAt = useCallback(
      (entry: LifecycleChartSeries, month: number): SliceReading | null => {
        const points = entry.series.points;
        const first = points[0];
        const last = points.at(-1);
        if (!first || !last) return null;
        if (month < first.month || month > last.month) return null;

        let lo = 0;
        let hi = points.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (points[mid]!.month <= month) lo = mid;
          else hi = mid - 1;
        }
        const before = points[lo]!;
        const after = points[Math.min(lo + 1, points.length - 1)]!;
        const span = after.month - before.month;
        const t = span > 0 ? (month - before.month) / span : 0;
        const lerp = (a: number, b: number) => a + (b - a) * t;
        return {
          label: entry.label,
          color: entry.color,
          value: lerp(valueOf(before), valueOf(after)),
          cumulative: lerp(before.cumulative, after.cumulative),
        };
      },
      [valueOf],
    );

    const sliceDate = useMemo(() => d3.timeFormat('%d %b %Y'), []);

    /**
     * Was the readout frozen when the current click started?
     *
     * Written by a capture-phase listener on the SVG, so it is settled before the
     * plot overlay's own bubble-phase handler pins the new slice. Reading the
     * pinned state afterwards would always say "frozen" and the toggle below could
     * never tell a freeze from a release.
     */
    const wasFrozen = useRef(false);

    const handleRender = useCallback((ctx: RenderContext) => {
      // Named listener, so re-renders replace it rather than stacking copies.
      ctx.layout.svg.on(
        'click.lifecycle-freeze',
        () => {
          wasFrozen.current = chartRef.current?.isPinned() ?? false;
        },
        { capture: true },
      );
    }, []);

    /**
     * The hover readout: every visible chip's number at the instant under the
     * rule, in one popup.
     *
     * Per-point tooltips answered "what is this dot?", which is the wrong question
     * for this chart — the lines are only interesting against each other, and a
     * reader comparing two chips at one date had to hover twice and hold the first
     * number in their head. This reads every line at once. Steps keep their
     * detail: any step nearest this slice contributes its config and, once frozen,
     * its run links, so the per-rung audit trail survives.
     */
    const tooltipConfig = useMemo(
      () => ({
        rulerType: 'vertical' as const,
        proximityHover: true,
        getDataX: (d: HoverSlice) => d.x,
        content: (d: HoverSlice, isPinned: boolean) => {
          const month = (d.x - anchorMs) / MS_PER_MONTH;
          const readings: SliceReading[] = [];
          for (const entry of data) {
            const reading = readingAt(entry, month);
            if (reading) readings.push(reading);
          }
          readings.sort((a, b) => b.value - a.value);

          const valueHeader = metric === 'revenue' ? labels.revenuePerDay : labels.marginPerDay;
          const rows = readings
            .map(
              (r) =>
                `<tr><td class="pr-3 whitespace-nowrap" style="color: ${escapeHtml(r.color)}">${escapeHtml(r.label)}</td>
                <td class="pr-3 text-right tabular-nums font-medium">${money(r.value)}</td>
                <td class="text-right tabular-nums text-muted-foreground">${money(r.cumulative)}</td></tr>`,
            )
            .join('');

          // Config detail is frozen-only. On hover the popup is a scanning tool —
          // one line per chip, the same shape wherever the cursor is — and a step
          // block appearing under it as the cursor crosses a dot both reflows the
          // rows and buries the comparison the reader came for. A click says "tell
          // me about this instant", and that is when the detail belongs.
          const tolerance = sliceSpacing * STEP_MATCH_SLICES;
          const steps = isPinned
            ? stepsOnAxis
                .filter((step) => Math.abs(step.x - d.x) <= tolerance)
                .flatMap((step) => {
                  const entry = bySafeKey.get(step.seriesKey);
                  const info = entry?.stepInfo.get(step.month);
                  if (!entry || !info) return [];
                  const factor = info.factor > 1.005 ? ` (${info.factor.toFixed(2)}x)` : '';
                  // Every rung links its run, not just the first and last. The
                  // table only links the opening and closing sweeps, so without
                  // this the intermediate rungs — exactly where an anomalous run
                  // that was never purged would sit — have no audit trail
                  // anywhere in the UI.
                  const links = info.runUrls
                    .map(
                      (url, i) =>
                        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-primary underline mr-2">${escapeHtml(labels.runLink)}${
                          info.runUrls.length > 1 ? ` ${i + 1}` : ''
                        }</a>`,
                    )
                    .join('');
                  return [
                    `<div class="mt-1">
                  <span style="color: ${escapeHtml(entry.color)}">${escapeHtml(entry.label)}</span>
                  <span class="text-muted-foreground"> ${escapeHtml(labels.config)}: ${escapeHtml(info.config)}${escapeHtml(factor)} · ${escapeHtml(labels.date)} ${escapeHtml(info.date)}</span>${links ? ` ${links}` : ''}
                </div>`,
                  ];
                })
                .join('')
            : '';

          return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 240px; user-select: ${isPinned ? 'text' : 'none'};">
            <div class="font-semibold mb-1">${escapeHtml(sliceDate(new Date(d.x)))}</div>
            ${
              rows
                ? `<table class="w-full"><thead><tr class="text-muted-foreground font-normal">
                    <th></th>
                    <th class="pr-3 text-right font-normal">${escapeHtml(valueHeader)}</th>
                    <th class="text-right font-normal">${escapeHtml(labels.cumulative)}</th>
                  </tr></thead><tbody>${rows}</tbody></table>`
                : ''
            }
            ${steps}
          </div>`;
        },
        getRulerX: (d: HoverSlice, xScale: any) => xScale(d.x),
        onPointClick: () => {
          // The overlay pins on every click, so a second click would just re-pin.
          // `wasFrozen` is read in the capture phase, before that pin lands, which
          // makes the same gesture a toggle: click to freeze, click to release.
          if (!wasFrozen.current) return;
          chartRef.current?.dismissTooltip();
          chartRef.current?.hideTooltip();
        },
      }),
      [anchorMs, bySafeKey, data, labels, metric, readingAt, sliceDate, sliceSpacing, stepsOnAxis],
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
      <D3Chart<HoverSlice>
        ref={chartRef}
        chartId="fleet-lifecycle"
        data={hoverSlices}
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
        instructions={instructions}
        tooltip={tooltipConfig}
        onRender={handleRender}
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);

FleetLifecycleChart.displayName = 'FleetLifecycleChart';

export default FleetLifecycleChart;
