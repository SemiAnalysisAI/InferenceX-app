'use client';

import * as d3 from 'd3';
import React, { useMemo } from 'react';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { RenderContext } from '@/lib/d3-chart/D3Chart/types';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/use-locale';
import {
  DEFAULT_TELEMETRY_DISPLAY,
  estimateSampleIntervalMs,
  meanAcrossSeries,
  nearestSample,
  rollingTimeAverage,
  type TelemetryDisplayState,
  type TimedSample,
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
    meanChips: 'Mean of visible chips',
    meanCount: (n: number) => `${n} chips`,
    rightAxis: 'right axis',
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
    meanChips: '可见芯片均值',
    meanCount: (n: number) => `${n} 个芯片`,
    rightAxis: '右轴',
  },
} as const;

/** A second time series drawn over the telemetry on its own right-hand axis. */
export interface TelemetryOverlaySeries {
  key: string;
  label: string;
  unit: string;
  color: string;
  /** Absolute-time samples; the chart re-bases them onto its own t=0. */
  points: TimedSample[];
}

interface ParsedPoint {
  seconds: number;
  /** Absolute sample time in ms; smoothing and alignment work in this space. */
  ms: number;
  value: number;
  gpuIndex: number;
  /** The raw sample behind this point; null once the value has been averaged. */
  raw: GpuMetricRow | null;
  /** For the mean line: how many chips contributed at this timestamp. */
  count?: number;
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
  /** Optional secondary series (e.g. decode throughput) on a right y-axis. */
  overlay?: TelemetryOverlaySeries | null;
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
): { t0Ms: number; groups: Map<number, ParsedPoint[]> } {
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
  return { t0Ms: minTime, groups };
}

/** Mean across the visible chips, aligned by nearest sample within one poll interval. */
function buildMeanSeries(groups: Map<number, ParsedPoint[]>, t0Ms: number): ParsedPoint[] {
  const arrays = [...groups.values()];
  if (arrays.length === 0) return [];
  const longest = arrays.reduce((a, b) => (b.length > a.length ? b : a));
  const mean = meanAcrossSeries(arrays, estimateSampleIntervalMs(longest));
  return mean.map((p) => ({
    seconds: (p.ms - t0Ms) / 1000,
    ms: p.ms,
    value: p.value,
    gpuIndex: MEAN_INDEX,
    raw: null,
    count: p.count,
  }));
}

/** Replace each point's value with its centered time-window mean. */
function smoothSeries(points: ParsedPoint[], windowS: number): ParsedPoint[] {
  const averaged = rollingTimeAverage(points, windowS * 1000);
  return points.map((point, i) => ({ ...point, value: averaged[i]!.value, raw: null }));
}

/** Per-chip palette shared with legends that toggle chips on and off. */
export const GPU_COLORS = d3.schemeTableau10;
/** Pseudo chip index and line key for the mean across visible chips. */
const MEAN_INDEX = -1;
const MEAN_KEY = 'mean';
const MEAN_COLOR = 'var(--foreground)';

function lineKey(gpuIndex: number): string {
  return gpuIndex === MEAN_INDEX ? MEAN_KEY : String(gpuIndex);
}

function colorFor(gpuIndex: number): string {
  return gpuIndex === MEAN_INDEX ? MEAN_COLOR : GPU_COLORS[gpuIndex % GPU_COLORS.length]!;
}
const CHART_ID = 'gpu-metrics-line';
const MARGIN = { top: 24, right: 20, bottom: 60, left: 60 };
/** Room for the overlay's right axis ticks and rotated title. */
const MARGIN_WITH_OVERLAY = { ...MARGIN, right: 84 };

interface OverlayPoint {
  x: number;
  y: number;
}

function overlayYScale(points: OverlayPoint[], height: number): d3.ScaleLinear<number, number> {
  const max = d3.max(points, (p) => p.y) ?? 0;
  return d3
    .scaleLinear()
    .domain([0, max > 0 ? max * 1.05 : 1])
    .range([height, 0])
    .nice();
}

function overlayLine(
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
): d3.Line<OverlayPoint> {
  return d3
    .line<OverlayPoint>()
    .x((p) => xScale(p.x))
    .y((p) => yScale(p.y))
    .curve(d3.curveMonotoneX);
}

/**
 * Draw the overlay path inside the clipped zoom group and its axis in the
 * unclipped root group. Both are removed first so toggling the overlay off
 * (or re-rendering) never leaves a stale axis behind.
 */
function renderOverlay(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  ctx: RenderContext,
  overlay: TelemetryOverlaySeries | null | undefined,
  points: OverlayPoint[],
): void {
  group.selectAll('.telemetry-overlay').remove();
  ctx.layout.g.selectAll('.telemetry-overlay-axis').remove();
  if (!overlay || points.length === 0) return;
  const xScale = ctx.xScale as d3.ScaleLinear<number, number>;
  const yScale = overlayYScale(points, ctx.height);
  group
    .append('path')
    .attr('class', 'telemetry-overlay')
    .attr('fill', 'none')
    .attr('stroke', overlay.color)
    .attr('stroke-width', 1.75)
    .attr('opacity', 0.9)
    .attr('pointer-events', 'none')
    .attr('d', overlayLine(xScale, yScale)(points));

  const axis = ctx.layout.g
    .append('g')
    .attr('class', 'telemetry-overlay-axis')
    .attr('transform', `translate(${ctx.width},0)`)
    .call(d3.axisRight(yScale).ticks(6).tickSize(4).tickFormat(d3.format('~s')));
  axis.select('.domain').attr('stroke', overlay.color);
  axis.selectAll('.tick line').attr('stroke', overlay.color);
  axis
    .selectAll('.tick text')
    .attr('fill', overlay.color)
    .attr('font-size', px(CHART_TYPE.axisLabel));
  axis
    .append('text')
    .attr('class', 'telemetry-overlay-axis-label')
    .attr('transform', `translate(${ctx.layout.margin.right - 14},${ctx.height / 2}) rotate(90)`)
    .attr('text-anchor', 'middle')
    .attr('fill', overlay.color)
    .attr('font-size', px(CHART_TYPE.axisLabel))
    .text(`${overlay.label} (${overlay.unit})`);
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
    display = DEFAULT_TELEMETRY_DISPLAY,
    overlay,
  }: GpuMetricsChartProps) => {
    const locale = useLocale();
    const t = STRINGS[locale];
    const metricConfig = ALL_METRIC_OPTIONS.find((m) => m.key === metricKey)!;
    const rolling = display.mode === 'rolling';
    const showChips = display.series !== 'mean';
    const showMean = display.series !== 'chips';

    const { t0Ms, groups: rawGroups } = useMemo(
      () => buildGroupedData(data, visibleGpus, metricKey),
      [data, visibleGpus, metricKey],
    );

    // Displayed series keyed by chip index (MEAN_INDEX for the mean line):
    // per-chip and/or mean, then optionally smoothed.
    const groupedData = useMemo(() => {
      const series = new Map<number, ParsedPoint[]>();
      if (showChips) for (const [gpuIndex, points] of rawGroups) series.set(gpuIndex, points);
      if (showMean) {
        const mean = buildMeanSeries(rawGroups, t0Ms);
        if (mean.length > 0) series.set(MEAN_INDEX, mean);
      }
      if (!rolling) return series;
      const smoothed = new Map<number, ParsedPoint[]>();
      for (const [gpuIndex, points] of series) {
        smoothed.set(gpuIndex, smoothSeries(points, display.windowS));
      }
      return smoothed;
    }, [rawGroups, t0Ms, showChips, showMean, rolling, display.windowS]);

    const allPoints = useMemo(() => {
      const pts: ParsedPoint[] = [];
      for (const points of groupedData.values()) pts.push(...points);
      return pts;
    }, [groupedData]);

    // Build line data as Record<string, {x,y}[]> for the line layer
    const lineData = useMemo(() => {
      const result: Record<string, { x: number; y: number }[]> = {};
      for (const [gpuIndex, points] of groupedData) {
        result[lineKey(gpuIndex)] = points.map((p) => ({ x: p.seconds, y: p.value }));
      }
      return result;
    }, [groupedData]);

    // Overlay samples, smoothed with the same window as the chip lines when
    // averaging so both series answer the same "how much over N seconds"
    // question, then re-based onto the telemetry's t=0.
    const overlaySamples = useMemo<TimedSample[]>(() => {
      if (!overlay) return [];
      return rolling ? rollingTimeAverage(overlay.points, display.windowS * 1000) : overlay.points;
    }, [overlay, rolling, display.windowS]);
    const overlayPoints = useMemo<OverlayPoint[]>(
      () => overlaySamples.map((p) => ({ x: (p.ms - t0Ms) / 1000, y: p.value })),
      [overlaySamples, t0Ms],
    );
    const hasOverlay = Boolean(overlay) && overlayPoints.length > 0;

    const hasMeanLine = groupedData.has(MEAN_INDEX);
    const keyRow =
      hasMeanLine || hasOverlay ? (
        <div
          className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
          data-testid="gpu-metrics-chart-keys"
        >
          {hasMeanLine && (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: MEAN_COLOR }}
              />
              {t.meanChips}
            </span>
          )}
          {hasOverlay && overlay && (
            <span
              className="inline-flex items-center gap-1.5"
              data-testid="gpu-metrics-overlay-key"
            >
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: overlay.color }}
              />
              {overlay.label} ({overlay.unit} · {t.rightAxis})
            </span>
          )}
        </div>
      ) : null;
    const resolvedCaption =
      caption || keyRow ? (
        <>
          {caption}
          {keyRow}
        </>
      ) : undefined;

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
        margin={hasOverlay ? MARGIN_WITH_OVERLAY : MARGIN}
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
              getColor: (key) => (key === MEAN_KEY ? MEAN_COLOR : colorFor(parseInt(key, 10))),
              getStrokeWidth: (key) => (key === MEAN_KEY ? 2.5 : rolling ? 1.75 : 1.5),
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
              getColor: (d) => (rolling ? 'transparent' : colorFor(d.gpuIndex)),
              getRadius: () => (rolling ? 3 : 2),
              maxPoints,
            },
          },
          // Secondary series on a right-hand axis (e.g. decode throughput)
          {
            type: 'custom',
            key: 'telemetry-overlay',
            render: (group, ctx) => {
              renderOverlay(group, ctx, hasOverlay ? overlay : null, overlayPoints);
            },
            onZoom: (group, ctx) => {
              if (!hasOverlay) return;
              const xScale = ctx.newXScale as d3.ScaleLinear<number, number>;
              group
                .select<SVGPathElement>('.telemetry-overlay')
                .attr(
                  'd',
                  overlayLine(xScale, overlayYScale(overlayPoints, ctx.height))(overlayPoints),
                );
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
            const color = colorFor(d.gpuIndex);
            const sep = locale === 'zh' ? '：' : ':';
            const title =
              d.gpuIndex === MEAN_INDEX
                ? `${t.meanChips}${d.count ? ` · ${t.meanCount(d.count)}` : ''}`
                : `${t.chip} ${d.gpuIndex}`;
            const overlayAt = hasOverlay ? nearestSample(overlaySamples, d.ms) : null;
            const overlayRow =
              overlay && overlayAt
                ? `<div class="mt-1" style="color: ${overlay.color}">${overlay.label}${sep} ${
                    overlayAt.value >= 100 ? overlayAt.value.toFixed(0) : overlayAt.value.toFixed(1)
                  } ${overlay.unit}</div>`
                : '';
            return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 160px; user-select: ${isPinned ? 'text' : 'none'}">
              ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
              <div class="font-semibold mb-1" style="color: ${color}">${title}</div>
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
              ${overlayRow}
            </div>`;
          },
          getRulerX: (d, xScale) => (xScale as d3.ScaleLinear<number, number>)(d.seconds),
          getRulerY: (d, yScale) => yScale(d.value),
          onHoverStart: (sel, d) => {
            sel
              .attr('r', 5)
              .attr('fill', colorFor(d.gpuIndex))
              .attr('stroke', 'white')
              .attr('stroke-width', 1);
          },
          onHoverEnd: (sel, d) => {
            sel
              .attr('r', rolling ? 3 : 2)
              .attr('fill', rolling ? 'transparent' : colorFor(d.gpuIndex))
              .attr('stroke', 'none');
          },
          attachToLayer: 2,
        }}
        legendElement={legendElement}
        caption={resolvedCaption}
      />
    );
  },
);

GpuMetricsChart.displayName = 'GpuMetricsChart';

export default GpuMetricsChart;
