'use client';

import * as d3 from 'd3';
import React, { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { type AlignedWindow, alignWindowToTrace } from './power-window';
import {
  type GpuMetricKey,
  type GpuMetricRow,
  type PowerWindow,
  ALL_METRIC_OPTIONS,
  detectTdpFromArtifactName,
} from './types';

interface ParsedPoint {
  seconds: number;
  value: number;
  gpuIndex: number;
  raw: GpuMetricRow;
}

export interface MeasurementWindowLabels {
  window: string;
  warmup: string;
  after: string;
}

interface GpuMetricsChartProps {
  data: GpuMetricRow[];
  visibleGpus: Set<number>;
  metricKey: GpuMetricKey;
  artifactName: string;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
  /** Max interactive points before LTTB downsampling. Infinity to disable. */
  maxPoints?: number;
  /** Formal power-measurement window (unix epoch bounds) to shade, when known. */
  measurementWindow?: PowerWindow | null;
  windowLabels?: MeasurementWindowLabels;
}

function parseTimestamp(raw: string): Date | null {
  const isoDate = new Date(raw);
  if (!isNaN(isoDate.getTime())) return isoDate;
  const numeric = parseFloat(raw);
  if (!isNaN(numeric)) {
    return numeric < 1e12 ? new Date(numeric * 1000) : new Date(numeric);
  }
  return null;
}

function buildGroupedData(
  data: GpuMetricRow[],
  visibleGpus: Set<number>,
  metricKey: GpuMetricKey,
): Map<number, ParsedPoint[]> {
  let minTime = Infinity;
  const parsed: { row: GpuMetricRow; ms: number }[] = [];
  for (const row of data) {
    if (!visibleGpus.has(row.index)) continue;
    const time = parseTimestamp(row.timestamp);
    if (!time) continue;
    const ms = time.getTime();
    parsed.push({ row, ms });
    if (ms < minTime) minTime = ms;
  }

  const groups = new Map<number, ParsedPoint[]>();
  for (const { row, ms } of parsed) {
    if (!groups.has(row.index)) groups.set(row.index, []);
    groups.get(row.index)!.push({
      seconds: (ms - minTime) / 1000,
      value: row[metricKey] ?? 0,
      gpuIndex: row.index,
      raw: row,
    });
  }
  for (const points of groups.values()) {
    points.sort((a, b) => a.seconds - b.seconds);
  }
  return groups;
}

const GPU_COLORS = d3.schemeTableau10;
const CHART_ID = 'gpu-metrics-line';
const MARGIN = { top: 24, right: 20, bottom: 60, left: 60 };

const WINDOW_COLOR = '#10b981';
const DIM_COLOR = '#6b7280';
const DEFAULT_WINDOW_LABELS: MeasurementWindowLabels = {
  window: 'Measurement window',
  warmup: 'Warmup / ramp',
  after: 'Post-benchmark',
};
/** Minimum region width (px) before its label is worth drawing. */
const WINDOW_LABEL_MIN_PX = 60;

/**
 * Draw (or clear) the measurement-window band, dashed bounds, and dimmed
 * warmup/post overlays. Re-invoked with `ctx.newXScale` on every x-zoom; the
 * group is kept as the first child so re-draws stay beneath the data layers.
 */
function drawMeasurementWindow(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleLinear<number, number>,
  width: number,
  height: number,
  aligned: AlignedWindow | null,
  labels: MeasurementWindowLabels,
): void {
  group.selectAll('g.measurement-window').remove();
  if (!aligned || width <= 0) return;

  const clampX = (x: number) => Math.max(0, Math.min(width, x));
  const xStart = clampX(xScale(aligned.startSeconds));
  const xEnd = clampX(xScale(aligned.endSeconds));
  if (xEnd <= xStart) return;

  const windowGroup = group
    .insert('g', ':first-child')
    .attr('class', 'measurement-window')
    .attr('pointer-events', 'none');

  const addRegionLabel = (x0: number, x1: number, text: string, color: string) => {
    if (x1 - x0 < WINDOW_LABEL_MIN_PX) return;
    windowGroup
      .append('text')
      .attr('x', (x0 + x1) / 2)
      .attr('y', 12)
      .attr('text-anchor', 'middle')
      .attr('fill', color)
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .text(text);
  };

  // Dimmed warmup/post regions outside the formal window
  if (xStart > 0) {
    windowGroup
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', xStart)
      .attr('height', height)
      .attr('fill', DIM_COLOR)
      .attr('opacity', 0.05);
    addRegionLabel(0, xStart, labels.warmup, DIM_COLOR);
  }
  if (xEnd < width) {
    windowGroup
      .append('rect')
      .attr('x', xEnd)
      .attr('y', 0)
      .attr('width', width - xEnd)
      .attr('height', height)
      .attr('fill', DIM_COLOR)
      .attr('opacity', 0.05);
    addRegionLabel(xEnd, width, labels.after, DIM_COLOR);
  }

  // Measurement window band + dashed boundary lines
  windowGroup
    .append('rect')
    .attr('x', xStart)
    .attr('y', 0)
    .attr('width', xEnd - xStart)
    .attr('height', height)
    .attr('fill', WINDOW_COLOR)
    .attr('opacity', 0.08);
  for (const x of [xStart, xEnd]) {
    windowGroup
      .append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', WINDOW_COLOR)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3');
  }
  addRegionLabel(xStart, xEnd, labels.window, WINDOW_COLOR);
}

const GpuMetricsChart = React.memo(
  ({
    data,
    visibleGpus,
    metricKey,
    artifactName,
    legendElement,
    caption,
    maxPoints,
    measurementWindow,
    windowLabels,
  }: GpuMetricsChartProps) => {
    const metricConfig = ALL_METRIC_OPTIONS.find((m) => m.key === metricKey)!;

    const groupedData = useMemo(
      () => buildGroupedData(data, visibleGpus, metricKey),
      [data, visibleGpus, metricKey],
    );

    // Align over the same visible-GPU row set buildGroupedData consumes so the
    // seconds origin matches the rendered axis (UTC vs viewer-TZ parsing only
    // shifts every sample by the same constant, so relative seconds agree).
    const alignedWindow = useMemo(() => {
      if (!measurementWindow) return null;
      const visibleRows = data.filter((row) => visibleGpus.has(row.index));
      return alignWindowToTrace(visibleRows, measurementWindow);
    }, [data, visibleGpus, measurementWindow]);

    const allPoints = useMemo(() => {
      const pts: ParsedPoint[] = [];
      for (const points of groupedData.values()) pts.push(...points);
      return pts;
    }, [groupedData]);

    // Build line data as Record<string, {x,y}[]> for the line layer
    const lineData = useMemo(() => {
      const result: Record<string, { x: number; y: number }[]> = {};
      for (const [gpuIndex, points] of groupedData) {
        result[String(gpuIndex)] = points.map((p) => ({ x: p.seconds, y: p.value }));
      }
      return result;
    }, [groupedData]);

    // Scale domains
    const xDomain = useMemo(() => {
      if (allPoints.length === 0) return [0, 100] as [number, number];
      const ext = d3.extent(allPoints, (d) => d.seconds) as [number, number];
      return ext;
    }, [allPoints]);

    const tdpInfo = metricKey === 'power' ? detectTdpFromArtifactName(artifactName) : null;

    const yDomain = useMemo(() => {
      if (allPoints.length === 0) return [0, 100] as [number, number];
      const ext = d3.extent(allPoints, (d) => d.value) as [number, number];
      const range = ext[1] - ext[0];
      const yMin = Math.max(0, ext[0] - range * 0.05);
      let yMax = ext[1] + range * 0.05;
      if (tdpInfo && tdpInfo.tdp > yMax) yMax = tdpInfo.tdp * 1.05;
      return [yMin, yMax] as [number, number];
    }, [allPoints, tdpInfo]);

    if (allPoints.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-[600px]">
          <p className="text-muted-foreground text-sm">No Chip metrics data to display.</p>
        </div>
      );
    }

    return (
      <D3Chart<ParsedPoint>
        chartId={CHART_ID}
        data={allPoints}
        height={600}
        margin={MARGIN}
        watermark="logo"
        testId="gpu-metrics-chart-svg"
        grabCursor={true}
        instructions="Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Click a point to pin tooltip"
        xScale={{ type: 'linear', domain: xDomain, nice: true }}
        yScale={{ type: 'linear', domain: yDomain, nice: true }}
        xAxis={{ label: 'Seconds', tickCount: 10 }}
        yAxis={{ label: metricConfig.yAxisLabel, tickCount: 8 }}
        layers={[
          // Measurement-window shading (drawn first so it sits beneath data).
          // The render function always runs so a stale band is cleared when
          // the window disappears (artifact switch, alignment loss).
          {
            type: 'custom',
            key: 'measurement-window',
            render: (group, ctx) => {
              drawMeasurementWindow(
                group,
                ctx.xScale as d3.ScaleLinear<number, number>,
                ctx.width,
                ctx.height,
                alignedWindow,
                windowLabels ?? DEFAULT_WINDOW_LABELS,
              );
            },
            onZoom: alignedWindow
              ? (group, ctx) => {
                  drawMeasurementWindow(
                    group,
                    ctx.newXScale as d3.ScaleLinear<number, number>,
                    ctx.width,
                    ctx.height,
                    alignedWindow,
                    windowLabels ?? DEFAULT_WINDOW_LABELS,
                  );
                }
              : null,
          },
          // TDP reference line (power metric only)
          {
            type: 'custom',
            key: 'tdp-line',
            render: tdpInfo
              ? (group, ctx) => {
                  const yScale = ctx.yScale as d3.ScaleLinear<number, number>;
                  const tdpY = yScale(tdpInfo.tdp);
                  group.selectAll('.tdp-line').remove();
                  const tdpGroup = group.append('g').attr('class', 'tdp-line');
                  tdpGroup
                    .append('line')
                    .attr('x1', 0)
                    .attr('x2', ctx.width)
                    .attr('y1', tdpY)
                    .attr('y2', tdpY)
                    .attr('stroke', '#ef4444')
                    .attr('stroke-width', 1.5)
                    .attr('stroke-dasharray', '6,4');
                  tdpGroup
                    .append('text')
                    .attr('x', ctx.width - 4)
                    .attr('y', tdpY - 6)
                    .attr('text-anchor', 'end')
                    .attr('fill', '#ef4444')
                    .attr('font-size', '11px')
                    .attr('font-weight', '600')
                    .text(`${tdpInfo.sku} TDP: ${tdpInfo.tdp}W`);
                }
              : null,
          },
          // GPU lines
          {
            type: 'line',
            key: 'gpu-lines',
            lines: lineData,
            config: {
              getColor: (key) => GPU_COLORS[parseInt(key, 10) % GPU_COLORS.length],
              strokeWidth: 1.5,
              curve: d3.curveMonotoneX,
            },
          },
          // GPU data points
          {
            type: 'point',
            key: 'gpu-points',
            data: allPoints,
            config: {
              getCx: () => 0, // overridden by getX at render time via onRender
              getCy: () => 0,
              getX: (d) => d.seconds,
              getY: (d) => d.value,
              getColor: (d) => GPU_COLORS[d.gpuIndex % GPU_COLORS.length],
              getRadius: () => 2,
              maxPoints,
            },
          },
        ]}
        zoom={{
          enabled: true,
          axes: 'x',
          scaleExtent: [1, 20],
          resetEventName: `gpu_metrics_zoom_reset_${CHART_ID}`,
        }}
        tooltip={{
          rulerType: 'crosshair',
          content: (d: ParsedPoint, isPinned: boolean) => {
            const color = GPU_COLORS[d.gpuIndex % GPU_COLORS.length];
            return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 160px; user-select: ${isPinned ? 'text' : 'none'}">
              ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
              <div class="font-semibold mb-1" style="color: ${color}">Chip ${d.gpuIndex}</div>
              <div class="text-muted-foreground">${d.seconds.toFixed(1)}s</div>
              <div class="mt-1 font-medium">${metricConfig.label}: ${d.value.toFixed(1)} ${metricConfig.unit}</div>
              <div class="text-muted-foreground">Power: ${d.raw.power.toFixed(1)} W</div>
              <div class="text-muted-foreground">Temp: ${d.raw.temperature}\u00B0C</div>
              <div class="text-muted-foreground">Chip Util: ${d.raw.gpuUtil}%</div>
            </div>`;
          },
          getRulerX: (d, xScale) => (xScale as d3.ScaleLinear<number, number>)(d.seconds),
          getRulerY: (d, yScale) => yScale(d.value),
          onHoverStart: (sel) => {
            sel.attr('r', 5).attr('stroke', 'white').attr('stroke-width', 1);
          },
          onHoverEnd: (sel) => {
            sel.attr('r', 2).attr('stroke', 'none');
          },
          // gpu-points layer index (measurement-window layer shifted it by one)
          attachToLayer: 3,
        }}
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);

GpuMetricsChart.displayName = 'GpuMetricsChart';

export default GpuMetricsChart;
