'use client';

import * as d3 from 'd3';
import React, { useCallback, useMemo, useRef } from 'react';

import { ChartPointDetails } from '@/components/ui/chart-point-details';
import { formatLargeNumber } from '@/lib/charts/chart-rendering';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import type { AnyScale } from '@/lib/d3-chart/chart-update';
import {
  D3Chart,
  type AxisConfig,
  type D3ChartHandle,
  type LayerConfig,
  type RenderContext,
  type ScaleConfig,
} from '@/lib/d3-chart/D3Chart';
import { chartTooltipShell, chartTooltipTitle } from '@/lib/d3-chart/tooltip-shell';
import { escapeHtml } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  isBreakEvenAnchored,
  metricValue,
  MS_PER_MONTH,
  valueAtMonth,
  type LifecycleMetric,
  type LifecyclePoint,
  type LifecycleSeries,
} from './lifecycle';

const CHART_MARGIN = { top: 20, right: 104, bottom: 50, left: 70 };

const LABEL_MIN_GAP = 13;

const LABEL_HALF_HEIGHT = 6;

const DATE_FORMATS = {
  en: { axis: '%b %Y', tooltip: '%d %b %Y' },
  zh: { axis: '%Y年%-m月', tooltip: '%Y年%-m月%-d日' },
} as const;

export interface LifecycleChartSeries {
  key: string;
  label: string;
  color: string;
  series: LifecycleSeries;
  stepInfo: Map<number, { date: string; config: string; factor: number; runUrls: string[] }>;
}

interface StepMarker {
  x: number;
  y: number;
  precision: string;
  seriesKey: string;
  month: number;
}

const HOVER_SLICE_COUNT = 1200;

const STEP_MATCH_SLICES = 4;

interface HoverSlice {
  x: number;
  seriesKey?: string;
}

interface StepAt {
  x: number;
  seriesKey: string;
  month: number;
}

interface SliceReading {
  label: string;
  color: string;
  value: number;
  cumulative: number;
}

export type { LifecycleMetric } from './lifecycle';

interface FleetLifecycleChartProps {
  data: LifecycleChartSeries[];
  metric: LifecycleMetric;
  anchorMs: number;
  yLabel: string;
  labels: {
    date: string;
    config: string;
    marginPerDay: string;
    marginPerMw: string;
    revenuePerDay: string;
    revenuePerMw: string;
    cumulativeRevenue: string;
    costPerDay: string;
    cumulative: string;
    sinceFirst: string;
    runLink: string;
  };
  breakEvenLabel: string;
  instructions: string;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
}

const safeKey = (key: string) => key.replaceAll(/[|_\s]/gu, '-');

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
    footer,
  }: FleetLifecycleChartProps) => {
    const locale = useLocale();
    const dateFormats = DATE_FORMATS[locale];
    const chartRef = useRef<D3ChartHandle | null>(null);
    const toMs = useCallback((month: number) => anchorMs + month * MS_PER_MONTH, [anchorMs]);
    const valueOf = useCallback((point: LifecyclePoint) => metricValue(point, metric), [metric]);

    const { lineDataRecord, markers, bySafeKey } = useMemo(() => {
      const record: Record<string, { x: number; y: number }[]> = {};
      const flat: StepMarker[] = [];
      const lookup = new Map<string, LifecycleChartSeries>();

      for (const entry of data) {
        const key = safeKey(entry.key);
        lookup.set(key, entry);
        record[key] = entry.series.points.map((p) => ({ x: toMs(p.month), y: valueOf(p) }));
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
      const span = max - min || Math.max(Math.abs(max), 1);
      return { type: 'linear', domain: [min - span * 0.05, max + span * 0.05], nice: true };
    }, [data, valueOf]);

    const drawZeroRule = useCallback(
      (
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: RenderContext,
        yScale: d3.ScaleLinear<number, number>,
      ) => {
        const y = yScale(0);
        zoomGroup.selectAll('.lifecycle-zero-rule').remove();
        if (!isBreakEvenAnchored(latest.current.metric)) return;
        if (!Number.isFinite(y)) return;

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

    const drawSeriesLabels = useCallback(
      (
        ctx: RenderContext,
        xScale: d3.ScaleTime<number, number>,
        yScale: d3.ScaleLinear<number, number>,
      ) => {
        const group = ctx.layout.g;
        group.selectAll('.lifecycle-series-label').remove();

        const edge = Number(xScale.invert(ctx.width));

        const { lineDataRecord: lines, bySafeKey: lookup } = latest.current;
        const placed = Object.entries(lines)
          .flatMap(([key, points]) => {
            const entry = lookup.get(key);
            const last = points.at(-1);
            const first = points[0];
            if (!entry || !last || !first) return [];
            if (first.x > edge) return [];

            let value = last.y;
            let x = xScale(last.x);
            if (last.x > edge) {
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

        for (let i = 1; i < placed.length; i += 1) {
          const previous = placed[i - 1]!;
          const current = placed[i]!;
          if (current.y - previous.y < LABEL_MIN_GAP) current.y = previous.y + LABEL_MIN_GAP;
        }

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

    const layers = useMemo<LayerConfig<HoverSlice>[]>(
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
            curve: d3.curveLinear,
          },
        },
        {
          type: 'scatter' as const,
          key: 'lifecycle-steps',
          data: markers,
          config: {
            getColor: (d: HoverSlice & { precision: string; y: number }) =>
              bySafeKey.get(d.seriesKey ?? '')?.color ?? '#888',
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

    const readingAt = useCallback(
      (entry: LifecycleChartSeries, month: number): SliceReading | null => {
        const points = entry.series.points;
        const value = valueAtMonth(points, month, valueOf);
        const cumulative = valueAtMonth(points, month, (p) => p.cumulative);
        if (value === null || cumulative === null) return null;
        return { label: entry.label, color: entry.color, value, cumulative };
      },
      [valueOf],
    );

    const sliceDate = useMemo(() => d3.timeFormat(dateFormats.tooltip), [dateFormats]);

    const tooltipConfig = useMemo(() => {
      const valueHeader =
        metric === 'revenue'
          ? labels.revenuePerDay
          : metric === 'revenuePerMw'
            ? labels.revenuePerMw
            : metric === 'cumulativeRevenue'
              ? labels.cumulativeRevenue
              : metric === 'marginPerMw'
                ? labels.marginPerMw
                : labels.marginPerDay;
      const sliceAt = (d: HoverSlice) => {
        const month = (d.x - anchorMs) / MS_PER_MONTH;
        const readings: SliceReading[] = [];
        for (const entry of data) {
          const reading = readingAt(entry, month);
          if (reading) readings.push(reading);
        }
        readings.sort((a, b) => b.value - a.value);
        const tolerance = sliceSpacing * STEP_MATCH_SLICES;
        const steps = stepsOnAxis
          .filter((step) => Math.abs(step.x - d.x) <= tolerance)
          .flatMap((step) => {
            const entry = bySafeKey.get(step.seriesKey);
            const info = entry?.stepInfo.get(step.month);
            return entry && info ? [{ entry, info }] : [];
          });
        return { date: sliceDate(new Date(d.x)), readings, steps };
      };
      return {
        rulerType: 'vertical' as const,
        proximityHover: true,
        getDataX: (d: HoverSlice) => d.x,
        content: (d: HoverSlice) => {
          const { date, readings } = sliceAt(d);
          const rows = readings
            .map(
              (r) =>
                `<tr><td style="padding: 1px 12px 1px 0; white-space: nowrap;"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: ${escapeHtml(r.color)}; margin-right: 6px;"></span>${escapeHtml(r.label)}</td><td style="padding: 1px 12px 1px 0; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; color: var(--foreground);">${money(r.value)}</td><td style="text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--muted-foreground);">${money(r.cumulative)}</td></tr>`,
            )
            .join('');
          return chartTooltipShell(
            `${chartTooltipTitle(escapeHtml(date))}${
              rows
                ? `<table style="width: 100%; font-size: 11px; line-height: 15px; border-collapse: collapse;"><thead><tr style="color: var(--muted-foreground);"><th></th><th style="padding-right: 12px; text-align: right; font-weight: 400;">${escapeHtml(valueHeader)}</th><th style="text-align: right; font-weight: 400;">${escapeHtml(labels.cumulative)}</th></tr></thead><tbody>${rows}</tbody></table>`
                : ''
            }`,
            { minWidth: 220, maxWidth: 320 },
          );
        },
        details: (d: HoverSlice, _isOverlay: boolean, close: () => void) => {
          const { date, readings, steps } = sliceAt(d);
          return (
            <ChartPointDetails title={date} metrics={[]} onClose={close}>
              {readings.length > 0 && (
                <table className="mt-3 w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th />
                      <th className="pr-3 text-right font-normal">{valueHeader}</th>
                      <th className="text-right font-normal">{labels.cumulative}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((r) => (
                      <tr key={r.label}>
                        <td className="py-0.5 pr-3 whitespace-nowrap">
                          <span
                            aria-hidden
                            className="mr-1.5 inline-block size-2 rounded-full"
                            style={{ backgroundColor: r.color }}
                          />
                          {r.label}
                        </td>
                        <td className="pr-3 text-right font-semibold tabular-nums whitespace-nowrap text-foreground">
                          {money(r.value)}
                        </td>
                        <td className="text-right tabular-nums whitespace-nowrap text-muted-foreground">
                          {money(r.cumulative)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {steps.length > 0 && (
                <ul className="mt-2.5 space-y-1.5 border-t border-border/50 pt-2.5">
                  {steps.map(({ entry, info }) => (
                    <li key={`${entry.key}-${info.date}`}>
                      <span className="font-medium" style={{ color: entry.color }}>
                        {entry.label}
                      </span>{' '}
                      <span className="text-muted-foreground">
                        {labels.config}: {info.config}
                        {info.factor > 1.005 ? ` (${info.factor.toFixed(2)}x)` : ''} · {labels.date}{' '}
                        {info.date}
                      </span>
                      {info.runUrls.map((url, i) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {labels.runLink}
                          {info.runUrls.length > 1 ? ` ${i + 1}` : ''} ↗
                        </a>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </ChartPointDetails>
          );
        },
        getRulerX: (d: HoverSlice, xScale: any) => xScale(d.x),
      };
    }, [
      anchorMs,
      bySafeKey,
      data,
      labels,
      metric,
      readingAt,
      sliceDate,
      sliceSpacing,
      stepsOnAxis,
    ]);

    const xAxisConfig = useMemo<AxisConfig>(
      () => ({
        tickFormat: d3.timeFormat(dateFormats.axis) as any,
        tickCount: 8,
        ...(locale === 'zh'
          ? {
              tickValues: (scale: AnyScale) => {
                const timeScale = scale as d3.ScaleTime<number, number>;
                const ticks = timeScale.ticks(8);
                let previousX = -Infinity;
                return ticks.filter((tick) => {
                  const x = timeScale(tick);
                  if (x - previousX < 96) return false;
                  previousX = x;
                  return true;
                });
              },
            }
          : {}),
      }),
      [dateFormats, locale],
    );

    const yAxisConfig = useMemo(
      () => ({
        label: yLabel,
        tickFormat: (v: d3.AxisDomain) => money(v as number),
        tickCount: 8,
      }),
      [yLabel],
    );

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
        legendElement={legendElement}
        caption={caption}
        footer={footer}
      />
    );
  },
);

FleetLifecycleChart.displayName = 'FleetLifecycleChart';

export default FleetLifecycleChart;
