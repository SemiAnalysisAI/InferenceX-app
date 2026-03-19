'use client';

import * as d3 from 'd3';
import React, { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { GpuMetricKey, GpuMetricRow } from './types';
import { ALL_METRIC_OPTIONS } from './types';

interface CorrelationPoint {
  x: number;
  y: number;
  gpuIndex: number;
  raw: GpuMetricRow;
}

interface GpuCorrelationChartProps {
  data: GpuMetricRow[];
  visibleGpus: Set<number>;
  xMetric: GpuMetricKey;
  yMetric: GpuMetricKey;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
  maxPoints?: number;
}

const GPU_COLORS = d3.schemeTableau10;
const CHART_ID = 'gpu-metrics-correlation';
const MARGIN = { top: 24, right: 20, bottom: 60, left: 60 };
const GpuCorrelationChart = React.memo(
  ({
    data,
    visibleGpus,
    xMetric,
    yMetric,
    legendElement,
    caption,
    maxPoints,
  }: GpuCorrelationChartProps) => {
    const xConfig = ALL_METRIC_OPTIONS.find((m) => m.key === xMetric)!;
    const yConfig = ALL_METRIC_OPTIONS.find((m) => m.key === yMetric)!;

    const points = useMemo(() => {
      return data
        .filter((r) => visibleGpus.has(r.index))
        .map((r) => ({ x: r[xMetric] ?? 0, y: r[yMetric] ?? 0, gpuIndex: r.index, raw: r }));
    }, [data, visibleGpus, xMetric, yMetric]);

    const xDomain = useMemo(() => {
      if (points.length === 0) return [0, 100] as [number, number];
      return d3.extent(points, (d) => d.x) as [number, number];
    }, [points]);

    const yDomain = useMemo(() => {
      if (points.length === 0) return [0, 100] as [number, number];
      return d3.extent(points, (d) => d.y) as [number, number];
    }, [points]);

    if (points.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-[600px]">
          <p className="text-muted-foreground text-sm">No data to display.</p>
        </div>
      );
    }

    return (
      <D3Chart<CorrelationPoint>
        chartId={CHART_ID}
        data={points}
        height={600}
        margin={MARGIN}
        watermark="logo"
        grabCursor={true}
        testId="gpu-metrics-correlation"
        instructions="Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip"
        xScale={{ type: 'linear', domain: xDomain, nice: true }}
        yScale={{ type: 'linear', domain: yDomain, nice: true }}
        xAxis={{ label: xConfig.yAxisLabel, tickCount: 10 }}
        yAxis={{ label: yConfig.yAxisLabel, tickCount: 8 }}
        layers={[
          // Trend line (linear regression)
          {
            type: 'custom',
            key: 'trend-line',
            render: (group, ctx) => {
              if (points.length < 2) return;
              const n = points.length;
              const sumX = points.reduce((a, p) => a + p.x, 0);
              const sumY = points.reduce((a, p) => a + p.y, 0);
              const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
              const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
              const denom = n * sumX2 - sumX * sumX;
              if (Math.abs(denom) < 1e-10) return;
              const slope = (n * sumXY - sumX * sumY) / denom;
              const intercept = (sumY - slope * sumX) / n;
              const xScale = ctx.xScale as d3.ScaleLinear<number, number>;
              const yScale = ctx.yScale as d3.ScaleLinear<number, number>;
              group.selectAll('.trend-line').remove();
              group
                .append('line')
                .attr('class', 'trend-line')
                .attr('x1', xScale(xDomain[0]))
                .attr('y1', yScale(slope * xDomain[0] + intercept))
                .attr('x2', xScale(xDomain[1]))
                .attr('y2', yScale(slope * xDomain[1] + intercept))
                .style('stroke', 'var(--foreground)')
                .attr('stroke-opacity', 0.2)
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '6,4');
            },
          },
          // Scatter points
          {
            type: 'point',
            key: 'corr-points',
            data: points,
            config: {
              getCx: () => 0,
              getCy: () => 0,
              getX: (d) => d.x,
              getY: (d) => d.y,
              getColor: (d) => GPU_COLORS[d.gpuIndex % GPU_COLORS.length],
              getRadius: () => 2.5,
              maxPoints,
            },
          },
        ]}
        zoom={{
          enabled: true,
          axes: 'both',
          scaleExtent: [1, 20],
          resetEventName: `gpu_metrics_zoom_reset_${CHART_ID}`,
        }}
        tooltip={{
          rulerType: 'crosshair',
          content: (d: CorrelationPoint, isPinned: boolean) => {
            const color = GPU_COLORS[d.gpuIndex % GPU_COLORS.length];
            return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width:160px; user-select: ${isPinned ? 'text' : 'none'}">
            ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
            <div class="font-semibold mb-1" style="color:${color}">GPU ${d.gpuIndex}</div>
            <div>${xConfig.label}: ${d.x.toFixed(1)} ${xConfig.unit}</div>
            <div>${yConfig.label}: ${d.y.toFixed(1)} ${yConfig.unit}</div>
          </div>`;
          },
          getRulerX: (d, xScale) => (xScale as d3.ScaleLinear<number, number>)(d.x),
          getRulerY: (d, yScale) => yScale(d.y),
          onHoverStart: (sel) => {
            sel.attr('r', 5).attr('opacity', 1).attr('stroke', 'white').attr('stroke-width', 1);
          },
          onHoverEnd: (sel) => {
            sel.attr('r', 2.5).attr('opacity', 0.7).attr('stroke', 'none');
          },
          attachToLayer: 1,
        }}
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);

GpuCorrelationChart.displayName = 'GpuCorrelationChart';

export default GpuCorrelationChart;
