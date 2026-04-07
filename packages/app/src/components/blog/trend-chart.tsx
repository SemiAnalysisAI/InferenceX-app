'use client';

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import * as d3 from 'd3';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LineLayerConfig, PointLayerConfig } from '@/lib/d3-chart/D3Chart/types';
type TrendSeries = Record<string, { date: string; value: number }[]>;

interface TrendChartProps {
  children?: ReactNode;
  /** JSON string: { "series": { "NVIDIA B200": [{"date":"2026-01-01","value":5000},...] } } */
  data: string;
  /** Y-axis label */
  metric?: string;
}

const SERIES_COLORS = [
  'oklch(0.72 0.17 145)', // green (nvidia-ish)
  'oklch(0.68 0.19 25)', // red-orange (amd-ish)
  'oklch(0.65 0.15 260)', // blue
  'oklch(0.70 0.15 60)', // yellow
  'oklch(0.65 0.18 320)', // purple
];

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

interface ParsedData {
  lines: Record<string, { x: number; y: number }[]>;
  points: { x: number; y: number; key: string }[];
  keys: string[];
  minDate: Date;
  maxDate: Date;
  maxValue: number;
}

function parseSeriesData(dataJson: string): ParsedData | null {
  try {
    const parsed = JSON.parse(dataJson) as { series: TrendSeries };
    const lines: Record<string, { x: number; y: number }[]> = {};
    const points: ParsedData['points'] = [];

    for (const [key, entries] of Object.entries(parsed.series)) {
      const sorted = entries.toSorted(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const mapped = sorted.map((e) => ({
        x: new Date(e.date).getTime(),
        y: e.value,
      }));
      lines[key] = mapped;
      for (const pt of mapped) points.push({ ...pt, key });
    }

    if (Object.keys(lines).length === 0) return null;

    const allTs = points.map((p) => p.x);
    const minTs = Math.min(...allTs);
    const maxTs = Math.max(...allTs);
    const maxValue = Math.max(...points.map((p) => p.y));
    const pad = (maxTs - minTs) * 0.05 || 86400000;
    return {
      lines,
      points,
      keys: Object.keys(lines),
      minDate: new Date(minTs - pad),
      maxDate: new Date(maxTs + pad),
      maxValue,
    };
  } catch {
    return null;
  }
}

export function TrendChart({ data: dataJson, metric = 'Throughput/GPU (tok/s)' }: TrendChartProps) {
  const parsed = useMemo(() => parseSeriesData(dataJson), [dataJson]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!parsed) return null;

  const height = 300;
  if (!mounted) return <div className="my-6 not-prose" style={{ height }} />;

  return <TrendChartInner parsed={parsed} metric={metric} height={height} />;
}

function TrendChartInner({
  parsed,
  metric,
  height,
}: {
  parsed: ParsedData;
  metric: string;
  height: number;
}) {
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [i, key] of parsed.keys.entries()) {
      map[key] = SERIES_COLORS[i % SERIES_COLORS.length];
    }
    return map;
  }, [parsed.keys]);

  const lineLayer: LineLayerConfig = useMemo(
    () => ({
      type: 'line',
      lines: parsed.lines,
      config: {
        getColor: (key) => colorMap[key] ?? SERIES_COLORS[0],
        strokeWidth: 2.5,
        curve: d3.curveMonotoneX,
      },
    }),
    [parsed.lines, colorMap],
  );

  const pointLayer: PointLayerConfig<ParsedData['points'][number]> = useMemo(
    () => ({
      type: 'point',
      data: parsed.points,
      config: {
        getCx: (d) => d.x,
        getCy: (d) => d.y,
        getX: (d) => d.x,
        getY: (d) => d.y,
        getColor: (d) => colorMap[d.key] ?? SERIES_COLORS[0],
        getRadius: () => 4,
        keyFn: (d) => `${d.key}-${d.x}`,
      },
    }),
    [parsed.points, colorMap],
  );

  const tooltipContent = (d: ParsedData['points'][number], isPinned: boolean): string => {
    const date = new Date(d.x).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `
      <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
        ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
        <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 4px;">${d.key}</div>
        <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 2px;"><strong>Date:</strong> ${date}</div>
        <div style="color: var(--muted-foreground); font-size: 11px;"><strong>${metric}:</strong> ${formatNumber(d.y)}</div>
      </div>
    `;
  };

  // Legend HTML below the chart
  const legend = (
    <div className="flex flex-wrap gap-4 mt-2 ml-16">
      {parsed.keys.map((key) => (
        <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm" style={{ background: colorMap[key] }} />
          {key}
        </div>
      ))}
    </div>
  );

  return (
    <div className="my-6 not-prose">
      <D3Chart<ParsedData['points'][number]>
        chartId="trend-chart"
        data={parsed.points}
        height={height}
        margin={{ top: 16, right: 24, bottom: 40, left: 70 }}
        watermark="logo"
        grabCursor
        instructions=""
        xScale={{ type: 'time', domain: [parsed.minDate, parsed.maxDate], nice: true }}
        yScale={{
          type: 'linear',
          domain: [0, parsed.maxValue * 1.15],
          nice: true,
        }}
        xAxis={{
          tickFormat: (d: d3.AxisDomain) => {
            const date = d instanceof Date ? d : new Date(d as number);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          },
          tickCount: 6,
        }}
        yAxis={{
          label: metric,
          tickFormat: (d: d3.AxisDomain) => formatNumber(d as number),
        }}
        layers={[lineLayer, pointLayer]}
        zoom={{
          enabled: true,
          axes: 'x',
          scaleExtent: [1, 10],
        }}
        tooltip={{
          rulerType: 'crosshair',
          content: tooltipContent,
          attachToLayer: 1,
          proximityHover: true,
          getDataX: (d) => d.x,
        }}
      />
      {legend}
    </div>
  );
}
