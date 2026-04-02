'use client';

import * as d3 from 'd3';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import ChartLegend from '@/components/ui/chart-legend';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type { LayerConfig, RenderContext, ZoomContext } from '@/lib/d3-chart/D3Chart';
import type { SubmissionVolumeRow } from '@/lib/submissions-types';

import { computeCumulative, groupVolumeByWeek } from './submissions-utils';

export type ChartMode = 'weekly' | 'cumulative';

interface SubmissionsChartProps {
  volume: SubmissionVolumeRow[];
  mode: ChartMode;
  caption?: ReactNode;
}

const NVIDIA_COLOR = '#76b900';
const AMD_COLOR = '#ed1c24';
const TOTAL_COLOR = '#6b7280';
const CHART_MARGIN = { top: 24, right: 24, bottom: 40, left: 60 };
const CHART_ID = 'submissions-chart';
const NIGHTLY_END_DATE = new Date('2025-12-16').getTime();

type ChartPoint = { date: number; nvidia: number; amd: number; total: number };

function lineColor(key: string): string {
  if (key === 'nvidia') return NVIDIA_COLOR;
  if (key === 'amd') return AMD_COLOR;
  return TOTAL_COLOR;
}

const LINE_KEYS = ['nvidia', 'amd', 'total'] as const;
type LineKey = (typeof LINE_KEYS)[number];

const LINE_META: Record<LineKey, { label: string; color: string }> = {
  nvidia: { label: 'NVIDIA', color: NVIDIA_COLOR },
  amd: { label: 'AMD', color: AMD_COLOR },
  total: { label: 'Total', color: TOTAL_COLOR },
};

function generateTooltipContent(d: ChartPoint, isPinned: boolean): string {
  const dateStr = new Date(d.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); min-width: 160px; user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${dateStr}</div>
      <div style="display: flex; align-items: center; gap: 6px; color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${NVIDIA_COLOR};"></span>
        <span>NVIDIA:</span> <strong>${d.nvidia.toLocaleString()}</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${AMD_COLOR};"></span>
        <span>AMD:</span> <strong>${d.amd.toLocaleString()}</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; color: var(--muted-foreground); font-size: 11px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${TOTAL_COLOR};"></span>
        <span>Total:</span> <strong>${d.total.toLocaleString()}</strong>
      </div>
    </div>`;
}

export default function SubmissionsChart({ volume, mode, caption }: SubmissionsChartProps) {
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [enabledLines, setEnabledLines] = useState<Set<LineKey>>(new Set(LINE_KEYS));

  const toggleLine = useCallback((name: string) => {
    setEnabledLines((prev) => {
      const next = new Set(prev);
      if (next.has(name as LineKey)) {
        next.delete(name as LineKey);
      } else {
        next.add(name as LineKey);
      }
      return next;
    });
    track('submissions_line_toggled', { line: name });
  }, []);

  const legendItems = useMemo(
    () =>
      LINE_KEYS.map((key) => ({
        name: key,
        label: LINE_META[key].label,
        color: LINE_META[key].color,
        isActive: enabledLines.has(key),
        onClick: toggleLine,
      })),
    [enabledLines, toggleLine],
  );

  const weeklyData = useMemo(() => groupVolumeByWeek(volume), [volume]);
  const cumulativeData = useMemo(() => computeCumulative(volume), [volume]);

  const { chartPoints, lineData, xDomain, yDomain } = useMemo(() => {
    const source =
      mode === 'weekly'
        ? weeklyData.map((d) => ({
            date: new Date(d.week).getTime(),
            nvidia: d.nvidia,
            amd: d.nonNvidia,
            total: d.total,
          }))
        : cumulativeData.map((d) => ({
            date: new Date(d.date).getTime(),
            nvidia: d.nvidia,
            amd: d.nonNvidia,
            total: d.total,
          }));

    const lines: Record<string, { x: number; y: number }[]> = {};
    if (enabledLines.has('nvidia')) lines.nvidia = source.map((p) => ({ x: p.date, y: p.nvidia }));
    if (enabledLines.has('amd')) lines.amd = source.map((p) => ({ x: p.date, y: p.amd }));
    if (enabledLines.has('total')) lines.total = source.map((p) => ({ x: p.date, y: p.total }));

    const xExt = d3.extent(source, (d) => d.date) as [number, number];
    const visibleMax =
      d3.max(source, (d) => {
        let max = 0;
        if (enabledLines.has('nvidia')) max = Math.max(max, d.nvidia);
        if (enabledLines.has('amd')) max = Math.max(max, d.amd);
        if (enabledLines.has('total')) max = Math.max(max, d.total);
        return max;
      }) ?? 0;
    const yPad = mode === 'weekly' ? 1.1 : 1.05;

    return {
      chartPoints: source,
      lineData: lines,
      xDomain: xExt,
      yDomain: [0, visibleMax * yPad] as [number, number],
    };
  }, [mode, weeklyData, cumulativeData, enabledLines]);

  const layers: LayerConfig<ChartPoint>[] = useMemo(
    () => [
      // Date marker — nightly runs ended
      {
        type: 'custom' as const,
        key: 'nightly-marker',
        render: (
          group: d3.Selection<SVGGElement, unknown, null, undefined>,
          ctx: RenderContext,
        ) => {
          const xScale = ctx.xScale as unknown as d3.ScaleTime<number, number>;
          const x = xScale(NIGHTLY_END_DATE);

          group.selectAll('.nightly-marker').remove();
          const g = group.append('g').attr('class', 'nightly-marker');

          g.append('line')
            .attr('x1', x)
            .attr('x2', x)
            .attr('y1', 0)
            .attr('y2', ctx.height)
            .attr('stroke', 'var(--muted-foreground)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '6,4')
            .attr('opacity', 0.6);

          const label = g.append('g').attr('transform', `translate(${x + 8}, 8)`);
          const text = label
            .append('text')
            .attr('fill', 'var(--foreground)')
            .attr('font-size', '11px')
            .attr('font-weight', '500');
          text.append('tspan').attr('x', 0).attr('dy', '0.8em').text('Switched to');
          text.append('tspan').attr('x', 0).attr('dy', '1.3em').text('on-change runs');
          text
            .append('tspan')
            .attr('x', 0)
            .attr('dy', '1.3em')
            .attr('font-size', '9px')
            .attr('font-weight', '400')
            .attr('fill', 'var(--muted-foreground)')
            .text('Dec 16, 2025');
          const bbox = (text.node() as SVGTextElement).getBBox();
          label
            .insert('rect', 'text')
            .attr('x', bbox.x - 5)
            .attr('y', bbox.y - 3)
            .attr('width', bbox.width + 10)
            .attr('height', bbox.height + 6)
            .attr('rx', 4)
            .attr('fill', 'var(--muted)')
            .attr('stroke', 'var(--border)')
            .attr('stroke-width', 1)
            .attr('opacity', 0.9);
        },
        onZoom: (group: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: ZoomContext) => {
          const newXScale = ctx.newXScale as unknown as d3.ScaleTime<number, number>;
          const x = newXScale(NIGHTLY_END_DATE);

          group.select('.nightly-marker line').attr('x1', x).attr('x2', x);
          group.select('.nightly-marker g').attr('transform', `translate(${x + 8}, 8)`);
        },
      },
      {
        type: 'line' as const,
        key: 'submission-lines',
        lines: lineData,
        config: {
          getColor: lineColor,
          strokeWidth: 1.5,
          curve: d3.curveMonotoneX,
        },
      },
    ],
    [lineData],
  );

  if (chartPoints.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <p className="text-muted-foreground text-sm">No submission data to display.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <D3Chart<ChartPoint>
        chartId={CHART_ID}
        data={chartPoints}
        height={600}
        margin={CHART_MARGIN}
        watermark="logo"
        testId="submissions-chart-svg"
        grabCursor
        instructions="Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Click a point to pin tooltip"
        xScale={{ type: 'time', domain: [new Date(xDomain[0]), new Date(xDomain[1])], nice: false }}
        yScale={{ type: 'linear', domain: yDomain, nice: true }}
        xAxis={{ tickCount: 6 }}
        yAxis={{
          tickCount: 5,
          tickFormat: (d) => {
            const n = d as number;
            return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
          },
        }}
        layers={layers}
        zoom={{
          enabled: true,
          axes: 'x',
          scaleExtent: [1, 10],
          resetEventName: `d3chart_zoom_reset_${CHART_ID}`,
        }}
        tooltip={{
          rulerType: 'vertical',
          content: generateTooltipContent,
          getRulerX: (d, xScale) => (xScale as unknown as d3.ScaleTime<number, number>)(d.date),
          getRulerY: (d, yScale) => yScale(d.total),
          proximityHover: true,
          getDataX: (d) => d.date,
        }}
        caption={caption}
        legendElement={
          <ChartLegend
            variant="sidebar"
            legendItems={legendItems}
            isLegendExpanded={isLegendExpanded}
            onExpandedChange={(expanded) => {
              setIsLegendExpanded(expanded);
              track('submissions_legend_expanded', { expanded });
            }}
          />
        }
      />
    </div>
  );
}
