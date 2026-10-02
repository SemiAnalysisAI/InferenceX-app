'use client';

import * as d3 from 'd3';

import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { CustomLayerConfig, LayerConfig } from '@/lib/d3-chart/D3Chart/types';
import type { ContinuousScale } from '@/lib/d3-chart/types';

/** One observed or derived value drawn as a marker. */
export interface PanelMarker {
  x: number;
  y: number;
  /** Series identity; the colour comes from `markerColor(key)`. */
  key: string;
  selected?: boolean;
  /** Tooltip HTML; callers escape any source text. */
  tooltip?: string;
}

/**
 * A polyline drawn beneath the markers (series connections, fit lines). A
 * non-finite y breaks the line; it never bridges a missing value.
 */
export interface PanelLine {
  key: string;
  points: { x: number; y: number }[];
  color: string;
  dash?: string;
}

const MARGIN = { top: 20, right: 18, bottom: 64, left: 65 };
const compactNumber = d3.format('~g');
const compact = (value: d3.AxisDomain) => compactNumber(Number(value));

/** d3's log labelling: the 1× and 2× steps of each decade get labels, other ticks stay bare. */
function logTickFormat(domain: [number, number]) {
  const format = d3.scaleLog().domain(domain).tickFormat(5, '~g');
  return (value: d3.AxisDomain) => format(Number(value));
}

function logDomain(values: number[]): [number, number] {
  const positive = values.filter((value) => value > 0 && Number.isFinite(value));
  if (positive.length === 0) return [1, 10];
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  return min === max ? [min / 2, max * 2] : [min / 1.25, max * 1.25];
}

/** Observed x range; a single value widens from zero so the marker is not on an edge. */
function linearXDomain(values: number[]): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return min === max ? [0, max * 1.05 || 1] : [min, max];
}

/** Values plus zero and the reference, padded by a tenth of the span; never below zero for non-negative data. */
function linearYDomain(values: number[], include: number[]): [number, number] {
  const finite = [...values, ...include].filter(Number.isFinite);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const pad = (max - min || 1) * 0.1;
  return [min >= 0 ? 0 : min - pad, max + pad];
}

/**
 * Small D3 plot shared by the PowerX comparison panels: markers, optional
 * connecting or fitted lines, and one dashed reference value (0 %, 50 %…).
 * Log axes drop non-positive values instead of clamping them.
 */
export function PowerPanelPlot({
  chartId,
  markers,
  lines = [],
  markerColor,
  xLabel,
  yLabel,
  reference = null,
  xLog = false,
  yLog = false,
  xDomain,
  yDomain,
  xTickValues,
  height = 320,
}: {
  chartId: string;
  markers: PanelMarker[];
  lines?: PanelLine[];
  markerColor: (key: string) => string;
  xLabel: string;
  yLabel: string;
  reference?: number | null;
  xLog?: boolean;
  yLog?: boolean;
  xDomain?: [number, number];
  yDomain?: [number, number];
  /** Explicit x ticks, e.g. the observed concurrencies of a load sweep. */
  xTickValues?: number[];
  height?: number;
}) {
  const visible = (point: { x: number; y: number }) =>
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    (!xLog || point.x > 0) &&
    (!yLog || point.y > 0);
  const drawn = markers.filter(visible);
  const drawnLines = lines.filter((line) => line.points.filter(visible).length > 1);
  const everything = [...drawn, ...drawnLines.flatMap((line) => line.points.filter(visible))];
  const xs = everything.map((point) => point.x);
  const ys = everything.map((point) => point.y);
  const x = xDomain ?? (xLog ? logDomain(xs) : linearXDomain(xs));
  const y =
    yDomain ??
    (yLog ? logDomain(ys) : linearYDomain(ys, reference === null ? [0] : [0, reference]));
  const colors = Object.fromEntries(drawnLines.map((line) => [line.key, line.color]));
  const dashes = Object.fromEntries(drawnLines.map((line) => [line.key, line.dash ?? '']));
  const drawReference: NonNullable<CustomLayerConfig['render']> = (group, ctx) => {
    const scale = (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale;
    group
      .selectAll('line')
      .data(reference === null ? [] : [reference])
      .join('line')
      .attr('x1', 0)
      .attr('x2', ctx.width)
      .attr('y1', (value) => scale(value))
      .attr('y2', (value) => scale(value))
      .attr('stroke', 'currentColor')
      .attr('stroke-dasharray', '5,4')
      .attr('opacity', 0.6);
  };
  const layers: LayerConfig<PanelMarker>[] = [
    { type: 'custom', key: 'reference', render: drawReference },
    {
      type: 'line',
      key: 'lines',
      lines: Object.fromEntries(drawnLines.map((line) => [line.key, line.points])),
      config: {
        curve: d3.curveLinear,
        getColor: (key) => colors[key],
        getStrokeDasharray: (key) => dashes[key] || 'none',
        isDefined: visible,
      },
    },
    {
      type: 'point',
      key: 'markers',
      data: drawn,
      config: {
        getCx: () => 0,
        getCy: () => 0,
        getX: (point) => point.x,
        getY: (point) => point.y,
        getRadius: (point) => (point.selected ? 6 : 3),
        getColor: (point) => markerColor(point.key),
      },
    },
  ];
  const hasTooltips = drawn.some((point) => point.tooltip);
  return (
    <D3Chart<PanelMarker>
      chartId={`${chartId}-plot`}
      data={drawn}
      height={height}
      testId={`${chartId}-plot`}
      watermark="logo"
      zoom={{ enabled: false }}
      grabCursor={false}
      instructions=""
      margin={MARGIN}
      xScale={{ type: xLog ? 'log' : 'linear', domain: x, nice: !xLog }}
      yScale={{ type: yLog ? 'log' : 'linear', domain: y, nice: !yLog }}
      xAxis={{
        label: xLabel,
        tickCount: 4,
        ...(xTickValues ? { tickValues: xTickValues, tickFormat: compact } : {}),
      }}
      yAxis={{
        label: yLabel,
        tickCount: 5,
        ...(yLog ? { tickFormat: logTickFormat(y) } : {}),
      }}
      layers={layers}
      {...(hasTooltips
        ? {
            tooltip: {
              rulerType: 'none' as const,
              content: (point: PanelMarker) =>
                `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md">${point.tooltip ?? ''}</div>`,
              attachToLayer: 2,
            },
          }
        : {})}
    />
  );
}
