'use client';

import { useMemo } from 'react';
import * as d3 from 'd3';

import { D3ChartCard } from '@/components/ui/d3-chart-card';
import type { D3ChartProps, LayerConfig, RenderContext } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { escapeHtml } from '@/lib/shared/utils';

export interface SlaChartPoint {
  /** Load of the point. */
  x: number;
  y: number;
  /** Filled when the point meets the targets, hollow otherwise. */
  meets: boolean;
  seriesLabel: string;
  color: string;
  loadLabel: string;
  statusLabel: string;
  metrics: { value: string; label: string }[];
  /**
   * A tested load that produced no measurement. It has no value on the y axis:
   * it is drawn as a cross above the plot, never as a point at zero.
   */
  noMeasurement?: boolean;
}

/** A tested load of a series that failed or was excluded, with what was recorded about it. */
export type SlaChartGap = Pick<
  SlaChartPoint,
  'x' | 'seriesLabel' | 'color' | 'loadLabel' | 'statusLabel'
>;

export interface SlaChartSeries {
  key: string;
  label: string;
  color: string;
  /** Drawn dashed: the observed values cannot support a verdict. */
  exploratory: boolean;
  points: SlaChartPoint[];
  /** Tested loads without a measurement. */
  gaps: SlaChartGap[];
}

const MARGIN = { top: 20, right: 20, bottom: 46, left: 62 };
/** Half the width of the cross that marks a load without a measurement, px. */
const GAP_MARK = 3.5;
/** How far above the plot area the cross sits, px. */
const GAP_OFFSET = 9;
const Y_TICKS = 5;
/** Loads spanning more than this ratio are spread on a log axis. */
const LOG_AXIS_RATIO = 8;
/** Smallest ratio between neighbouring tick loads on a log axis, so labels do not collide. */
const LOG_TICK_RATIO = 1.9;

type Continuous = d3.ScaleContinuousNumeric<number, number>;

function loadTicks(loads: number[], log: boolean): number[] {
  if (!log) return loads;
  const ticks: number[] = [];
  for (const load of loads) {
    if (ticks.length === 0 || load / ticks.at(-1)! >= LOG_TICK_RATIO) ticks.push(load);
  }
  return ticks;
}

export function SlaLoadChart({
  title,
  subtitle,
  series,
  xLabel,
  yLabel,
  yTick,
  yDomain,
  threshold,
  filename,
  emptyLabel,
  legendNote,
  testId,
}: {
  title: string;
  subtitle: string;
  series: SlaChartSeries[];
  xLabel: string;
  yLabel: string;
  yTick: (value: number) => string;
  /** Fixed y domain; the upper bound is fitted to the data when omitted. */
  yDomain?: [number, number];
  /** Horizontal reference line with its label. */
  threshold?: { value: number; label: string };
  filename: string;
  emptyLabel: string;
  legendNote: string;
  testId: string;
}) {
  const chart = useMemo<Omit<D3ChartProps<SlaChartPoint>, 'chartId'>>(() => {
    const measured = series.flatMap((entry) => entry.points);
    const yMax = d3.max(measured, (point) => point.y) ?? 0;
    const domain: [number, number] = yDomain ?? [
      0,
      d3
        .scaleLinear()
        .domain([0, yMax > 0 ? yMax * 1.08 : 1])
        .nice(Y_TICKS)
        .domain()[1],
    ];
    // A load without a measurement sits at the top edge so it can be hovered;
    // it takes no part in the y domain and in no line.
    const gaps = series.flatMap((entry) =>
      entry.gaps.map((gap): SlaChartPoint => ({
        ...gap,
        y: domain[1],
        meets: false,
        metrics: [],
        noMeasurement: true,
      })),
    );
    const data = [...measured, ...gaps].toSorted((a, b) => a.x - b.x);
    const loads = [...new Set(data.map((point) => point.x))];
    const xMin = loads[0] ?? 1;
    const xMax = loads.at(-1) ?? 1;
    const log = xMin > 0 && xMax / xMin > LOG_AXIS_RATIO;

    const renderMarks = (
      group: d3.Selection<SVGGElement, unknown, null, undefined>,
      ctx: RenderContext,
    ) => {
      const x = ctx.xScale as Continuous;
      const y = ctx.yScale as Continuous;
      const layer = group
        .selectAll<SVGGElement, null>('g.sla-marks')
        .data([null])
        .join('g')
        .attr('class', 'sla-marks');
      layer.selectAll('*').remove();
      if (threshold) {
        const lineY = y(threshold.value);
        layer
          .append('line')
          .attr('x1', 0)
          .attr('x2', ctx.width)
          .attr('y1', lineY)
          .attr('y2', lineY)
          .attr('stroke', 'var(--muted-foreground)')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4 3');
        layer
          .append('text')
          .attr('x', ctx.width)
          // Above the line, or below it when the line sits at the top of the plot.
          .attr('y', lineY < 18 ? lineY + 14 : lineY - 5)
          .attr('text-anchor', 'end')
          .attr('fill', 'var(--muted-foreground)')
          .attr('font-size', CHART_TYPE.axisLabel)
          .text(threshold.label);
      }
      const cross = layer
        .selectAll('g.sla-gap')
        .data(gaps)
        .join('g')
        .attr('class', 'sla-gap')
        .attr('data-testid', 'sla-chart-gap')
        // Above the plot area, off the value scale: at the top edge of an
        // attainment chart it would read as 100%.
        .attr('transform', (gap) => `translate(${x(gap.x)},${-GAP_OFFSET})`)
        .attr('stroke', (gap) => gap.color)
        .attr('stroke-width', 1.5)
        .attr('stroke-linecap', 'round');
      // A faint guide down to the axis ties the cross to its load.
      cross
        .append('line')
        .attr('x1', 0)
        .attr('y1', GAP_MARK + 2)
        .attr('x2', 0)
        .attr('y2', GAP_OFFSET + ctx.height)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2 4')
        .attr('opacity', 0.45);
      cross
        .append('line')
        .attr('x1', -GAP_MARK)
        .attr('y1', -GAP_MARK)
        .attr('x2', GAP_MARK)
        .attr('y2', GAP_MARK);
      cross
        .append('line')
        .attr('x1', -GAP_MARK)
        .attr('y1', GAP_MARK)
        .attr('x2', GAP_MARK)
        .attr('y2', -GAP_MARK);
      layer
        .selectAll('circle')
        .data(measured)
        .join('circle')
        .attr('cx', (point) => x(point.x))
        .attr('cy', (point) => y(point.y))
        .attr('r', 3.5)
        .attr('fill', (point) => (point.meets ? point.color : 'var(--card)'))
        .attr('stroke', (point) => point.color)
        .attr('stroke-width', 1.5);
    };

    const layers: LayerConfig<SlaChartPoint>[] = [
      {
        type: 'line',
        lines: Object.fromEntries(series.map((entry, index) => [String(index), entry.points])),
        config: {
          getColor: (key) => series[Number(key)].color,
          getStrokeDasharray: (key) => (series[Number(key)].exploratory ? '5 4' : ''),
          strokeWidth: 1.5,
          curve: d3.curveLinear,
        },
      },
      { type: 'custom', key: 'sla-marks', render: renderMarks },
    ];

    return {
      data,
      testId,
      height: 280,
      margin: MARGIN,
      watermark: 'none',
      xScale: log
        ? { type: 'log', domain: [xMin, xMax], nice: false }
        : {
            type: 'linear',
            domain: xMin === xMax ? [xMin - 0.5, xMax + 0.5] : [xMin, xMax],
            nice: false,
          },
      yScale: { type: 'linear', domain, nice: false },
      xAxis: {
        label: xLabel,
        tickValues: loadTicks(loads, log),
        tickFormat: (value) => Number(value).toLocaleString('en-US'),
      },
      yAxis: { label: yLabel, tickCount: Y_TICKS, tickFormat: (value) => yTick(Number(value)) },
      layers,
      zoom: { enabled: false },
      // Crosses for loads without a measurement sit in the top margin; with zoom
      // off nothing else can leave the plot area.
      clipContent: false,
      tooltip: {
        rulerType: 'none',
        proximityHover: true,
        getDataX: (point) => point.x,
        getDataY: (point) => point.y,
        content: (point) =>
          chartHoverCard({
            title: point.seriesLabel,
            subtitle: point.loadLabel,
            color: point.color,
            metrics: point.metrics.map((metric) => ({
              value: escapeHtml(metric.value),
              label: metric.label,
            })),
            summary: point.statusLabel,
          }),
      },
      footer: <p className="mt-2 px-2 text-center text-xs text-muted-foreground">{legendNote}</p>,
      noDataOverlay:
        measured.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">{emptyLabel}</p>
        ) : undefined,
    };
  }, [series, xLabel, yLabel, yTick, yDomain, threshold, emptyLabel, legendNote, testId]);

  return (
    <D3ChartCard
      title={title}
      subtitle={subtitle}
      analyticsPrefix="sla_targets"
      chart={chart}
      filename={filename}
    />
  );
}
