'use client';

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import * as d3 from 'd3';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LineLayerConfig, PointLayerConfig } from '@/lib/d3-chart/D3Chart/types';

type InteractivitySeries = Record<string, { interactivity: number; throughput: number }[]>;

interface InteractivityChartProps {
  children?: ReactNode;
  /** JSON string: { "series": { "NVIDIA B200": [{"interactivity":10,"throughput":5000},...] } } */
  data: string;
}

const SERIES_COLORS = [
  'oklch(0.72 0.17 145)',
  'oklch(0.68 0.19 25)',
  'oklch(0.65 0.15 260)',
  'oklch(0.70 0.15 60)',
  'oklch(0.65 0.18 320)',
];

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

interface ParsedData {
  lines: Record<string, { x: number; y: number }[]>;
  points: { x: number; y: number; key: string }[];
  keys: string[];
  maxInteractivity: number;
  maxThroughput: number;
}

function parseData(dataJson: string): ParsedData | null {
  try {
    const parsed = JSON.parse(dataJson) as { series: InteractivitySeries };
    const lines: Record<string, { x: number; y: number }[]> = {};
    const points: ParsedData['points'] = [];

    for (const [key, entries] of Object.entries(parsed.series)) {
      const sorted = entries.toSorted((a, b) => a.interactivity - b.interactivity);
      const mapped = sorted.map((e) => ({ x: e.interactivity, y: e.throughput }));
      lines[key] = mapped;
      for (const pt of mapped) points.push({ ...pt, key });
    }

    if (Object.keys(lines).length === 0) return null;
    const maxX = Math.max(...points.map((p) => p.x));
    const maxY = Math.max(...points.map((p) => p.y));
    return { lines, points, keys: Object.keys(lines), maxInteractivity: maxX, maxThroughput: maxY };
  } catch {
    return null;
  }
}

export function InteractivityChart({ data: dataJson }: InteractivityChartProps) {
  const parsed = useMemo(() => parseData(dataJson), [dataJson]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!parsed) return null;

  const height = 350;
  if (!mounted) return <div className="my-6 not-prose" style={{ height }} />;

  return <InteractivityChartInner parsed={parsed} height={height} />;
}

function InteractivityChartInner({ parsed, height }: { parsed: ParsedData; height: number }) {
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

  const tooltipContent = (d: ParsedData['points'][number], isPinned: boolean): string => `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 4px;">${d.key}</div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 2px;"><strong>Interactivity:</strong> ${formatNumber(d.x)} tok/s/user</div>
      <div style="color: var(--muted-foreground); font-size: 11px;"><strong>Throughput:</strong> ${formatNumber(d.y)} tok/s/GPU</div>
    </div>
  `;

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
        chartId="interactivity-chart"
        data={parsed.points}
        height={height}
        margin={{ top: 16, right: 24, bottom: 48, left: 70 }}
        watermark="logo"
        grabCursor
        instructions=""
        xScale={{
          type: 'linear',
          domain: [0, parsed.maxInteractivity * 1.15],
          nice: true,
        }}
        yScale={{
          type: 'linear',
          domain: [0, parsed.maxThroughput * 1.15],
          nice: true,
        }}
        xAxis={{
          label: 'Interactivity (tok/s/user)',
          tickFormat: (d: d3.AxisDomain) => formatNumber(d as number),
          tickCount: 6,
        }}
        yAxis={{
          label: 'Throughput/GPU (tok/s)',
          tickFormat: (d: d3.AxisDomain) => formatNumber(d as number),
        }}
        layers={[lineLayer, pointLayer]}
        zoom={{
          enabled: true,
          axes: 'both',
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
