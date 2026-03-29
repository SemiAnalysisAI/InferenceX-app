'use client';

import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import React, { useCallback, useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { RenderContext, ZoomContext, ScaleConfig } from '@/lib/d3-chart/D3Chart';
import {
  applyHoverState,
  applyNormalState,
  formatLargeNumber,
  logTickFormat,
} from '@/lib/chart-rendering';

import { TrendDataPoint, TrendLineConfig } from '../types';

interface TrendChartProps {
  trendLines: Map<string, TrendDataPoint[]>;
  lineConfigs: TrendLineConfig[];
  yLabel: string;
  logScale: boolean;
  /** Unique ID for this chart instance (used for SVG clip path IDs). Defaults to 'trend'. */
  chartId?: string;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
}

const CHART_MARGIN = { top: 20, right: 30, bottom: 50, left: 60 };

/** Prepared line data point with parsed date and timestamp for D3 scales. */
interface PreparedPoint {
  date: Date;
  value: number;
  /** Interactivity value from interpolation. */
  interactivity: number;
  raw: TrendDataPoint;
  /** Timestamp in ms — used as the x-coordinate in line/point layers. */
  ts: number;
  /** Precision string for shape rendering. */
  precision: string;
  /** Mapped for renderScatterPoints: x = ts, y = value. */
  x: number;
  y: number;
}

const TrendChart = React.memo(
  ({
    trendLines,
    lineConfigs,
    yLabel,
    logScale,
    chartId = 'trend',
    legendElement,
    caption,
  }: TrendChartProps) => {
    // All data points flattened for computing axis domains — only from VISIBLE configs
    const visibleConfigIds = useMemo(() => new Set(lineConfigs.map((c) => c.id)), [lineConfigs]);

    const allPoints = useMemo(() => {
      const points: { date: Date; value: number; configId: string }[] = [];
      for (const [configId, trendData] of trendLines) {
        if (!visibleConfigIds.has(configId)) continue;
        for (const point of trendData) {
          points.push({
            date: new Date(point.date),
            value: point.value,
            configId,
          });
        }
      }
      return points;
    }, [trendLines, visibleConfigIds]);

    // Prepare line data: Record<safeId, PreparedPoint[]> and a flat array for renderPoints
    const { lineDataRecord, flatPointData } = useMemo(() => {
      const record: Record<string, { x: number; y: number }[]> = {};
      const flat: PreparedPoint[] = [];
      for (const config of lineConfigs) {
        const data = trendLines.get(config.id);
        if (!data || data.length === 0) continue;
        const safeId = config.id.replace(/[|]/g, '_');
        const precision = config.precision ?? 'fp4';
        const prepared = data
          .map((d) => {
            const date = new Date(d.date);
            const ts = date.getTime();
            return {
              date,
              value: d.value,
              interactivity: d.x,
              raw: d,
              ts,
              precision,
              x: ts,
              y: d.value,
            } as PreparedPoint;
          })
          .sort((a, b) => a.ts - b.ts);
        record[safeId] = prepared.map((p) => ({ x: p.ts, y: p.value }));
        for (const p of prepared) {
          if (p.value != null && !isNaN(p.value) && !p.raw.synthetic) flat.push(p);
        }
      }
      return { lineDataRecord: record, flatPointData: flat };
    }, [lineConfigs, trendLines]);

    // Reverse lookup: safeId -> config
    const safeIdToConfig = useMemo(() => {
      const map = new Map<string, TrendLineConfig>();
      for (const c of lineConfigs) map.set(c.id.replace(/[|]/g, '_'), c);
      return map;
    }, [lineConfigs]);

    // Stable callback to find which config a PreparedPoint belongs to
    const getPointConfig = useCallback(
      (d: PreparedPoint): TrendLineConfig | undefined => {
        for (const config of lineConfigs) {
          const data = trendLines.get(config.id);
          if (data && data.includes(d.raw)) return config;
        }
        return undefined;
      },
      [lineConfigs, trendLines],
    );

    // Compute scale domains
    const xScaleConfig = useMemo<ScaleConfig>(() => {
      if (allPoints.length === 0) {
        return { type: 'time', domain: [new Date(), new Date()] };
      }
      const dateExtent = d3.extent(allPoints, (d) => d.date) as [Date, Date];
      return { type: 'time', domain: dateExtent, nice: true };
    }, [allPoints]);

    const yScaleConfig = useMemo<ScaleConfig>(() => {
      if (allPoints.length === 0) {
        return logScale ? { type: 'log', domain: [0.1, 1] } : { type: 'linear', domain: [0, 1] };
      }
      const valueExtent = d3.extent(allPoints, (d) => d.value) as [number, number];
      const yRange = valueExtent[1] - valueExtent[0];
      let yMin: number;
      if (logScale) {
        const dataMin = valueExtent[0];
        if (dataMin <= 0) {
          yMin = 0.1;
        } else if (dataMin < 1) {
          yMin = Math.pow(10, Math.floor(Math.log10(dataMin)));
        } else {
          yMin = dataMin * 0.95;
        }
      } else {
        yMin = Math.max(0, valueExtent[0] - yRange * 0.05);
      }
      const yMax = valueExtent[1] + yRange * 0.05;
      return logScale
        ? { type: 'log', domain: [yMin, yMax], nice: true }
        : { type: 'linear', domain: [yMin, yMax], nice: true };
    }, [allPoints, logScale]);

    // Apply logTickFormat to the y-axis after render (needs the built scale)
    const applyLogTickFormat = useCallback(
      (ctx: Pick<RenderContext, 'layout' | 'yScale'>) => {
        if (!logScale) return;
        const scale = ctx.yScale as d3.ScaleLogarithmic<number, number>;
        const fmt = logTickFormat(scale);
        ctx.layout.yAxisGroup.call(d3.axisLeft(scale).ticks(8).tickFormat(fmt));
      },
      [logScale],
    );

    const onRender = useCallback(
      (ctx: RenderContext) => applyLogTickFormat(ctx),
      [applyLogTickFormat],
    );

    const onZoom = useCallback(
      (_event: d3.D3ZoomEvent<SVGSVGElement, unknown>, ctx: ZoomContext) => {
        if (!logScale) return;
        const scale = ctx.newYScale as d3.ScaleLogarithmic<number, number>;
        const fmt = logTickFormat(scale);
        ctx.layout.yAxisGroup.call(d3.axisLeft(scale).ticks(8).tickFormat(fmt));
      },
      [logScale],
    );

    const layers = useMemo(
      () => [
        {
          type: 'line' as const,
          key: 'trend-lines',
          lines: lineDataRecord,
          config: {
            getColor: (key: string) => safeIdToConfig.get(key)?.color ?? '#888',
            strokeWidth: 2,
            curve: d3.curveMonotoneX,
            isDefined: (d: { x: number; y: number }) =>
              d.y != null && !isNaN(d.y) && (logScale ? d.y > 0 : true),
          },
        },
        {
          type: 'scatter' as const,
          key: 'trend-points',
          data: flatPointData,
          config: {
            getColor: (d: PreparedPoint) => getPointConfig(d)?.color ?? '#888',
          },
        },
      ],
      [lineDataRecord, flatPointData, safeIdToConfig, getPointConfig, logScale],
    );

    const tooltipConfig = useMemo(
      () => ({
        rulerType: 'crosshair' as const,
        content: (d: PreparedPoint, isPinned: boolean) =>
          `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 160px; user-select: ${isPinned ? 'text' : 'none'};">
            ${isPinned ? '<div class="text-muted-foreground text-[10px] mb-1 italic">Click elsewhere to dismiss</div>' : ''}
            <div class="font-semibold mb-1" style="color: ${getPointConfig(d)?.color ?? '#888'}">${getPointConfig(d)?.label ?? ''}</div>
            <div class="text-muted-foreground">${d.raw.date}</div>
            <div class="mt-1 font-medium">${yLabel}: ${formatLargeNumber(d.value)}</div>
          </div>`,
        getRulerX: (d: PreparedPoint, xScale: any) => xScale(d.x),
        getRulerY: (d: PreparedPoint, yScale: any) => yScale(d.y),
        onHoverStart: (sel: d3.Selection<any, PreparedPoint, any, any>, d: PreparedPoint) =>
          applyHoverState(sel.select('.visible-shape') as any, d.precision),
        onHoverEnd: (sel: d3.Selection<any, PreparedPoint, any, any>, d: PreparedPoint) =>
          applyNormalState(sel.select('.visible-shape') as any, d.precision),
        onPointClick: (d: PreparedPoint) => {
          const config = getPointConfig(d);
          if (config)
            track('inference_trend_point_clicked', { config: config.hwKey, date: d.raw.date });
        },
        attachToLayer: 1,
      }),
      [getPointConfig, yLabel],
    );

    const xAxisConfig = useMemo(
      () => ({
        tickFormat: d3.timeFormat('%b %d') as any,
        tickCount: 10,
        customize: (g: d3.Selection<SVGGElement, unknown, null, undefined>) => {
          g.selectAll('.tick text').attr('transform', 'rotate(-30)').attr('text-anchor', 'end');
        },
      }),
      [],
    );

    const yAxisConfig = useMemo(
      () => ({
        label: yLabel,
        tickFormat: (d: d3.AxisDomain) => formatLargeNumber(d as number),
        tickCount: 8,
      }),
      [yLabel],
    );

    const zoomConfig = useMemo(
      () => ({
        enabled: true,
        axes: 'x' as const,
        scaleExtent: [1, 10] as [number, number],
        onZoom,
      }),
      [onZoom],
    );

    if (allPoints.length === 0) {
      return (
        <div className="relative w-full min-h-[200px] flex items-center justify-center">
          <p className="text-muted-foreground text-sm">
            No historical data found for the tracked configurations.
          </p>
        </div>
      );
    }

    return (
      <D3Chart<PreparedPoint>
        chartId={chartId}
        data={flatPointData}
        height={600}
        margin={CHART_MARGIN}
        watermark="logo"
        testId="trend-chart-svg"
        grabCursor
        instructions="Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset"
        xScale={xScaleConfig}
        yScale={yScaleConfig}
        xAxis={xAxisConfig}
        yAxis={yAxisConfig}
        layers={layers}
        zoom={zoomConfig}
        tooltip={tooltipConfig}
        onRender={onRender}
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);

TrendChart.displayName = 'TrendChart';

export default TrendChart;
