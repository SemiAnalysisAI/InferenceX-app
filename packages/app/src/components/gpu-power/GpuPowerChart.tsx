'use client';

import * as d3 from 'd3';
import React, { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/use-locale';
import {
  DEFAULT_TELEMETRY_DISPLAY,
  rollingTimeAverage,
  type TelemetryDisplayState,
} from './telemetry-smoothing';
import {
  type GpuMetricKey,
  type GpuMetricRow,
  ALL_METRIC_OPTIONS,
  detectTdpFromArtifactName,
  getGpuMetricLabel,
  getGpuMetricYAxisLabel,
} from './types';

const STRINGS = {
  en: {
    empty: 'No Chip metrics data to display.',
    instructions:
      'Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    seconds: 'Seconds',
    dismiss: 'Click elsewhere to dismiss',
    chip: 'Chip',
    power: 'Power',
    temp: 'Temp',
    utilization: 'Chip Util',
    rollingSuffix: (windowS: number) => `${windowS} s rolling avg`,
  },
  zh: {
    empty: '暂无可显示的芯片指标数据。',
    instructions: 'Shift+滚轮横向缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    seconds: '秒',
    dismiss: '点击其他区域关闭',
    chip: '芯片',
    power: '功耗',
    temp: '温度',
    utilization: '芯片利用率',
    rollingSuffix: (windowS: number) => `${windowS} 秒滚动平均`,
  },
} as const;

interface ParsedPoint {
  seconds: number;
  /** Absolute sample time in ms; smoothing and alignment work in this space. */
  ms: number;
  value: number;
  gpuIndex: number;
  /** The raw sample behind this point; null once the value has been averaged. */
  raw: GpuMetricRow | null;
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
  /** Raw samples vs. time-window rolling average. Defaults to raw samples. */
  display?: TelemetryDisplayState;
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
  // t=0 is the first sample of the whole series, not of the visible chips, so
  // hiding a chip never shifts the time axis under the remaining lines.
  let minTime = Infinity;
  const parsed: { row: GpuMetricRow; ms: number }[] = [];
  for (const row of data) {
    const time = parseTimestamp(row.timestamp);
    if (!time) continue;
    const ms = time.getTime();
    if (ms < minTime) minTime = ms;
    if (visibleGpus.has(row.index)) parsed.push({ row, ms });
  }

  const groups = new Map<number, ParsedPoint[]>();
  for (const { row, ms } of parsed) {
    if (!groups.has(row.index)) groups.set(row.index, []);
    groups.get(row.index)!.push({
      seconds: (ms - minTime) / 1000,
      ms,
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

/** Replace each point's value with its centered time-window mean. */
function smoothSeries(points: ParsedPoint[], windowS: number): ParsedPoint[] {
  const averaged = rollingTimeAverage(points, windowS * 1000);
  return points.map((point, i) => ({ ...point, value: averaged[i]!.value, raw: null }));
}

/** Per-chip palette shared with legends that toggle chips on and off. */
export const GPU_COLORS = d3.schemeTableau10;
const CHART_ID = 'gpu-metrics-line';
const MARGIN = { top: 24, right: 20, bottom: 60, left: 60 };

const GpuMetricsChart = React.memo(
  ({
    data,
    visibleGpus,
    metricKey,
    artifactName,
    legendElement,
    caption,
    maxPoints,
    display = DEFAULT_TELEMETRY_DISPLAY,
  }: GpuMetricsChartProps) => {
    const locale = useLocale();
    const t = STRINGS[locale];
    const metricConfig = ALL_METRIC_OPTIONS.find((m) => m.key === metricKey)!;
    const rolling = display.mode === 'rolling';

    const rawGroups = useMemo(
      () => buildGroupedData(data, visibleGpus, metricKey),
      [data, visibleGpus, metricKey],
    );

    const groupedData = useMemo(() => {
      if (!rolling) return rawGroups;
      const smoothed = new Map<number, ParsedPoint[]>();
      for (const [gpuIndex, points] of rawGroups) {
        smoothed.set(gpuIndex, smoothSeries(points, display.windowS));
      }
      return smoothed;
    }, [rawGroups, rolling, display.windowS]);

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
          <p className="text-muted-foreground text-sm">{t.empty}</p>
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
        instructions={t.instructions}
        xScale={{ type: 'linear', domain: xDomain, nice: true }}
        yScale={{ type: 'linear', domain: yDomain, nice: true }}
        xAxis={{ label: t.seconds, tickCount: 10 }}
        yAxis={{ label: getGpuMetricYAxisLabel(metricConfig, locale), tickCount: 8 }}
        layers={[
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
              strokeWidth: rolling ? 1.75 : 1.5,
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
              // Averaged mode draws lines only; the circles stay as invisible
              // hover targets so the tooltip and crosshair keep working.
              getColor: (d) =>
                rolling ? 'transparent' : GPU_COLORS[d.gpuIndex % GPU_COLORS.length],
              getRadius: () => (rolling ? 3 : 2),
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
            const sep = locale === 'zh' ? '：' : ':';
            return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 160px; user-select: ${isPinned ? 'text' : 'none'}">
              ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
              <div class="font-semibold mb-1" style="color: ${color}">${t.chip} ${d.gpuIndex}</div>
              <div class="text-muted-foreground">${d.seconds.toFixed(1)}${locale === 'zh' ? ' 秒' : 's'}</div>
              <div class="mt-1 font-medium">${getGpuMetricLabel(metricConfig, locale)}${sep} ${d.value.toFixed(1)} ${metricConfig.unit}</div>
              ${rolling ? `<div class="text-muted-foreground">${t.rollingSuffix(display.windowS)}</div>` : ''}
              ${
                d.raw
                  ? `<div class="text-muted-foreground">${t.power}${sep} ${d.raw.power.toFixed(1)} W</div>
              <div class="text-muted-foreground">${t.temp}${sep} ${d.raw.temperature}\u00B0C</div>
              <div class="text-muted-foreground">${t.utilization}${sep} ${d.raw.gpuUtil}%</div>`
                  : ''
              }
            </div>`;
          },
          getRulerX: (d, xScale) => (xScale as d3.ScaleLinear<number, number>)(d.seconds),
          getRulerY: (d, yScale) => yScale(d.value),
          onHoverStart: (sel, d) => {
            sel
              .attr('r', 5)
              .attr('fill', GPU_COLORS[d.gpuIndex % GPU_COLORS.length])
              .attr('stroke', 'white')
              .attr('stroke-width', 1);
          },
          onHoverEnd: (sel, d) => {
            sel
              .attr('r', rolling ? 3 : 2)
              .attr('fill', rolling ? 'transparent' : GPU_COLORS[d.gpuIndex % GPU_COLORS.length])
              .attr('stroke', 'none');
          },
          attachToLayer: 2,
        }}
        legendElement={legendElement}
        caption={caption}
      />
    );
  },
);

GpuMetricsChart.displayName = 'GpuMetricsChart';

export default GpuMetricsChart;
