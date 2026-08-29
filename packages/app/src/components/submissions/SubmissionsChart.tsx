'use client';

import * as d3 from 'd3';
import { type ReactNode, useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';
import ChartLegend from '@/components/ui/chart-legend';
import {
  D3Chart,
  type LayerConfig,
  type RenderContext,
  type ZoomContext,
} from '@/lib/d3-chart/D3Chart';
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
const NARROW_VIEWPORT_QUERY = '(max-width: 39.999rem)';
const NOOP = () => {};

function subscribeToNarrowViewport(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return NOOP;
  const mediaQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getNarrowViewportSnapshot(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(NARROW_VIEWPORT_QUERY).matches
  );
}

function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribeToNarrowViewport, getNarrowViewportSnapshot, () => false);
}

interface ChartPoint {
  date: number;
  nvidia: number;
  amd: number;
  total: number;
}

function lineColor(key: string): string {
  if (key === 'nvidia') return NVIDIA_COLOR;
  if (key === 'amd') return AMD_COLOR;
  return TOTAL_COLOR;
}

const LINE_KEYS = ['nvidia', 'amd', 'total'] as const;
type LineKey = (typeof LINE_KEYS)[number];

export function formatSubmissionTooltipDate(date: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}

function generateTooltipContent(d: ChartPoint, isPinned: boolean, locale: Locale): string {
  const t = SUBMISSIONS_STRINGS[locale];
  const numberLocale = locale === 'zh' ? 'zh-CN' : 'en-US';
  const dateStr = formatSubmissionTooltipDate(d.date, locale);
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); min-width: 160px; user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${dateStr}</div>
      <div style="display: flex; align-items: center; gap: 6px; color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${NVIDIA_COLOR};"></span>
        <span>NVIDIA:</span> <strong>${d.nvidia.toLocaleString(numberLocale)}</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${AMD_COLOR};"></span>
        <span>AMD:</span> <strong>${d.amd.toLocaleString(numberLocale)}</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; color: var(--muted-foreground); font-size: 11px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${TOTAL_COLOR};"></span>
        <span>${t.total}:</span> <strong>${d.total.toLocaleString(numberLocale)}</strong>
      </div>
    </div>`;
}

const SUBMISSIONS_STRINGS = {
  en: {
    onChangeOnly: 'On-change only',
    total: 'Total',
    dismiss: 'Click elsewhere to dismiss',
    markerLine1: 'Switched to',
    markerLine2: 'on-change runs',
    noData: 'No submission data to display.',
    instructions:
      'Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    aria: 'Benchmark submission activity chart',
    yAxis: 'Datapoints',
  },
  zh: {
    onChangeOnly: '仅显示变更触发的运行',
    total: '合计',
    dismiss: '点击其他区域关闭',
    markerLine1: '自此改为',
    markerLine2: '仅在变更时运行',
    noData: '暂无可显示的提交数据。',
    instructions: 'Shift+滚轮横向缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    aria: '基准测试提交活动图表',
    yAxis: '数据点数量',
  },
} as const;

export default function SubmissionsChart({ volume, mode, caption }: SubmissionsChartProps) {
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [enabledLines, setEnabledLines] = useState<Set<LineKey>>(new Set(LINE_KEYS));
  const [onChangeOnly, setOnChangeOnly] = useState(true);
  const locale = useLocale();
  const isNarrowViewport = useNarrowViewport();
  const legendT = SUBMISSIONS_STRINGS[locale];
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
    [locale],
  );

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
        label: key === 'total' ? legendT.total : key === 'nvidia' ? 'NVIDIA' : 'AMD',
        color: lineColor(key),
        isActive: enabledLines.has(key),
        onClick: toggleLine,
      })),
    [enabledLines, legendT.total, toggleLine],
  );

  const filteredVolume = useMemo(() => {
    if (!onChangeOnly || mode !== 'weekly') return volume;
    const cutoff = '2025-12-16';
    return volume.filter((r) => r.date >= cutoff);
  }, [volume, onChangeOnly, mode]);

  const weeklyData = useMemo(() => groupVolumeByWeek(filteredVolume), [filteredVolume]);
  const cumulativeData = useMemo(() => computeCumulative(filteredVolume), [filteredVolume]);

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
          text.append('tspan').attr('x', 0).attr('dy', '0.8em').text(legendT.markerLine1);
          text.append('tspan').attr('x', 0).attr('dy', '1.3em').text(legendT.markerLine2);
          text
            .append('tspan')
            .attr('x', 0)
            .attr('dy', '1.3em')
            .attr('font-size', '9px')
            .attr('font-weight', '400')
            .attr('fill', 'var(--muted-foreground)')
            .text(dateFormatter.format(new Date(NIGHTLY_END_DATE)));
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
    [dateFormatter, legendT.markerLine1, legendT.markerLine2, lineData],
  );

  if (chartPoints.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <p className="text-muted-foreground text-sm">{legendT.noData}</p>
      </div>
    );
  }

  return (
    <div className="relative" role="group" aria-label={legendT.aria}>
      <D3Chart<ChartPoint>
        chartId={CHART_ID}
        data={chartPoints}
        height={600}
        margin={CHART_MARGIN}
        watermark="logo"
        testId="submissions-chart-svg"
        grabCursor
        instructions={legendT.instructions}
        xScale={{ type: 'time', domain: [new Date(xDomain[0]), new Date(xDomain[1])], nice: false }}
        yScale={{ type: 'linear', domain: yDomain, nice: true }}
        xAxis={
          locale === 'zh'
            ? {
                tickCount: isNarrowViewport ? 3 : 6,
                tickFormat: (value) => dateFormatter.format(new Date(Number(value))),
              }
            : { tickCount: 6 }
        }
        yAxis={{
          label: locale === 'zh' ? legendT.yAxis : undefined,
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
          content: (point, isPinned) => generateTooltipContent(point, isPinned, locale),
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
            switches={
              mode === 'weekly'
                ? [
                    {
                      id: 'submissions-on-change-only',
                      label: legendT.onChangeOnly,
                      checked: onChangeOnly,
                      onCheckedChange: (checked) => {
                        setOnChangeOnly(checked);
                        track('submissions_on_change_filter', { enabled: checked });
                      },
                    },
                  ]
                : undefined
            }
          />
        }
      />
    </div>
  );
}
