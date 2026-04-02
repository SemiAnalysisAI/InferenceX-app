'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

import { track } from '@/lib/analytics';
import type { SubmissionVolumeRow } from '@/lib/submissions-types';

import {
  computeCumulative,
  groupVolumeByWeek,
  type CumulativePoint,
  type WeeklyVolume,
} from './submissions-utils';

type ChartMode = 'weekly' | 'cumulative';

interface SubmissionsChartProps {
  volume: SubmissionVolumeRow[];
}

const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 };
const NVIDIA_COLOR = '#76b900';
const AMD_COLOR = '#ed1c24';
const TOTAL_COLOR = '#6b7280';

export default function SubmissionsChart({ volume }: SubmissionsChartProps) {
  const [mode, setMode] = useState<ChartMode>('weekly');
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  const weeklyData = useMemo(() => groupVolumeByWeek(volume), [volume]);
  const cumulativeData = useMemo(() => computeCumulative(volume), [volume]);

  const handleModeChange = useCallback((newMode: ChartMode) => {
    setMode(newMode);
    track('submissions_chart_toggled', { mode: newMode });
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = 300;

    const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);

    svg.selectAll('*').remove();

    const fg = resolvedTheme === 'dark' ? '#a1a1aa' : '#71717a';
    const gridColor = resolvedTheme === 'dark' ? '#27272a' : '#e4e4e7';

    if (mode === 'weekly') {
      drawWeeklyChart(svg, weeklyData, width, height, fg, gridColor);
    } else {
      drawCumulativeChart(svg, cumulativeData, width, height, fg, gridColor);
    }
  }, [mode, weeklyData, cumulativeData, resolvedTheme]);

  // Resize
  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;
    const observer = new ResizeObserver(() => {
      // Trigger re-render by changing a dep — the main effect handles drawing
      const svg = svgRef.current;
      if (svg) svg.setAttribute('width', String(containerRef.current!.clientWidth));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Submission Activity</h3>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => handleModeChange('weekly')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${mode === 'weekly' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Weekly
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('cumulative')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${mode === 'cumulative' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Cumulative
          </button>
        </div>
      </div>
      <div ref={containerRef} className="w-full">
        <svg ref={svgRef} className="w-full" />
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5" style={{ backgroundColor: NVIDIA_COLOR }} />
          NVIDIA
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5" style={{ backgroundColor: AMD_COLOR }} />
          AMD
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-0.5 border-t border-dashed"
            style={{ borderColor: TOTAL_COLOR }}
          />
          Total
        </span>
      </div>
    </div>
  );
}

function drawWeeklyChart(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  data: WeeklyVolume[],
  width: number,
  height: number,
  fg: string,
  gridColor: string,
) {
  if (data.length === 0) return;
  const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
  const w = width - MARGIN.left - MARGIN.right;
  const h = height - MARGIN.top - MARGIN.bottom;

  const x = d3
    .scaleTime()
    .domain(d3.extent(data, (d) => new Date(d.week)) as [Date, Date])
    .range([0, w]);

  const maxVal = d3.max(data, (d) => d.total) ?? 0;
  const y = d3
    .scaleLinear()
    .domain([0, maxVal * 1.1])
    .range([h, 0]);

  // Grid
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(y)
        .tickSize(-w)
        .tickFormat(() => ''),
    )
    .call((g) => g.selectAll('.domain').remove())
    .call((g) =>
      g.selectAll('.tick line').attr('stroke', gridColor).attr('stroke-dasharray', '2,2'),
    );

  // Lines
  const line = (accessor: (d: WeeklyVolume) => number) =>
    d3
      .line<WeeklyVolume>()
      .x((d) => x(new Date(d.week)))
      .y((d) => y(accessor(d)))
      .curve(d3.curveMonotoneX);

  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', NVIDIA_COLOR)
    .attr('stroke-width', 1.5)
    .attr(
      'd',
      line((d) => d.nvidia),
    );
  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', AMD_COLOR)
    .attr('stroke-width', 1.5)
    .attr(
      'd',
      line((d) => d.nonNvidia),
    );
  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', TOTAL_COLOR)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '4,2')
    .attr(
      'd',
      line((d) => d.total),
    );

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(6))
    .call((g) => g.selectAll('text').attr('fill', fg).style('font-size', '10px'));
  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .call((g) => g.selectAll('text').attr('fill', fg).style('font-size', '10px'));
  g.selectAll('.domain').attr('stroke', fg);
}

function drawCumulativeChart(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  data: CumulativePoint[],
  width: number,
  height: number,
  fg: string,
  gridColor: string,
) {
  if (data.length === 0) return;
  const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
  const w = width - MARGIN.left - MARGIN.right;
  const h = height - MARGIN.top - MARGIN.bottom;

  const x = d3
    .scaleTime()
    .domain(d3.extent(data, (d) => new Date(d.date)) as [Date, Date])
    .range([0, w]);

  const maxVal = d3.max(data, (d) => d.total) ?? 0;
  const y = d3
    .scaleLinear()
    .domain([0, maxVal * 1.05])
    .range([h, 0]);

  // Grid
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(y)
        .tickSize(-w)
        .tickFormat(() => ''),
    )
    .call((g) => g.selectAll('.domain').remove())
    .call((g) =>
      g.selectAll('.tick line').attr('stroke', gridColor).attr('stroke-dasharray', '2,2'),
    );

  // Area fills
  const area = (accessor: (d: CumulativePoint) => number) =>
    d3
      .area<CumulativePoint>()
      .x((d) => x(new Date(d.date)))
      .y0(h)
      .y1((d) => y(accessor(d)))
      .curve(d3.curveMonotoneX);

  g.append('path')
    .datum(data)
    .attr('fill', TOTAL_COLOR)
    .attr('fill-opacity', 0.08)
    .attr(
      'd',
      area((d) => d.total),
    );

  // Lines
  const line = (accessor: (d: CumulativePoint) => number) =>
    d3
      .line<CumulativePoint>()
      .x((d) => x(new Date(d.date)))
      .y((d) => y(accessor(d)))
      .curve(d3.curveMonotoneX);

  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', NVIDIA_COLOR)
    .attr('stroke-width', 1.5)
    .attr(
      'd',
      line((d) => d.nvidia),
    );
  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', AMD_COLOR)
    .attr('stroke-width', 1.5)
    .attr(
      'd',
      line((d) => d.nonNvidia),
    );
  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', TOTAL_COLOR)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '4,2')
    .attr(
      'd',
      line((d) => d.total),
    );

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(6))
    .call((g) => g.selectAll('text').attr('fill', fg).style('font-size', '10px'));
  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .call((g) => g.selectAll('text').attr('fill', fg).style('font-size', '10px'));
  g.selectAll('.domain').attr('stroke', fg);
}
