'use client';

import * as d3 from 'd3';
import { useTheme } from 'next-themes';
import { type ReactNode, useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';
import { VENDOR_LABELS, vendorColor, type Vendor } from '@/lib/charts/dynamic-colors';
import { isDarkTheme } from '@/lib/themes/themes';
import ChartLegend from '@/components/ui/chart-legend';
import {
  D3Chart,
  type LayerConfig,
  type RenderContext,
  type ZoomContext,
} from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { ChartPointDetails } from '@/components/ui/chart-point-details';
import type { SubmissionVolumeRow } from '@/lib/submissions/submissions-types';

import {
  computeCumulative,
  groupVolumeByWeek,
  ON_CHANGE_ONLY_START_DATE,
  selectVolumeRows,
  type VendorCounts,
  volumeVendors,
} from './submissions-utils';

export type ChartMode = 'weekly' | 'cumulative';

interface SubmissionsChartProps {
  volume: SubmissionVolumeRow[];
  mode: ChartMode;
  caption?: ReactNode;
  footer?: ReactNode;
}

const TOTAL_COLOR = { light: '#6b7280', dark: '#a1a7ab' } as const;
const CHART_MARGIN = { top: 24, right: 24, bottom: 60, left: 60 };
const CHART_ID = 'submissions-chart';
const NIGHTLY_END_DATE = new Date(ON_CHANGE_ONLY_START_DATE).getTime();
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
  vendors: VendorCounts;
  total: number;
}

const SUBMISSION_DATE_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }),
  zh: new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }),
};

export function formatSubmissionDate(date: number | Date, locale: Locale): string {
  return SUBMISSION_DATE_FORMATTERS[locale].format(new Date(date));
}

function submissionMetrics(d: ChartPoint, vendors: readonly Vendor[], locale: Locale) {
  const numberLocale = locale === 'zh' ? 'zh-CN' : 'en-US';
  return [
    ...vendors.map((vendor) => ({
      value: (d.vendors[vendor] ?? 0).toLocaleString(numberLocale),
      label: VENDOR_LABELS[vendor],
    })),
    { value: d.total.toLocaleString(numberLocale), label: SUBMISSIONS_STRINGS[locale].total },
  ];
}

const SUBMISSIONS_STRINGS = {
  en: {
    onChangeOnly: 'On-change only',
    total: 'Total',
    markerLine1: 'Switched to',
    markerLine2: 'on-change runs',
    noData: 'No submission data to display',
    instructions: 'Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset',
    aria: 'Benchmark submission activity chart',
    yAxis: 'Datapoints',
    xAxis: { weekly: 'Week', cumulative: 'Date' },
  },
  zh: {
    onChangeOnly: '仅显示变更触发的运行',
    total: '合计',
    markerLine1: '自此改为',
    markerLine2: '仅在变更时运行',
    noData: '暂无可显示的提交数据',
    instructions: 'Shift+滚轮横向缩放 · 拖动平移 · 双击重置',
    aria: '基准测试提交活动图表',
    yAxis: '数据点数量',
    xAxis: { weekly: '周', cumulative: '日期' },
  },
} as const;

export default function SubmissionsChart({ volume, mode, caption, footer }: SubmissionsChartProps) {
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [hiddenLines, setHiddenLines] = useState<ReadonlySet<string>>(new Set());
  const [onChangeOnly, setOnChangeOnly] = useState(true);
  const locale = useLocale();
  const isNarrowViewport = useNarrowViewport();
  const legendT = SUBMISSIONS_STRINGS[locale];
  const { resolvedTheme } = useTheme();
  const theme = isDarkTheme(resolvedTheme) ? 'dark' : 'light';
  const vendors = useMemo(() => volumeVendors(volume), [volume]);
  const lineKeys = useMemo(() => [...vendors, 'total'], [vendors]);

  const lineColor = useCallback(
    (key: string) => (key === 'total' ? TOTAL_COLOR[theme] : vendorColor(key as Vendor, theme)),
    [theme],
  );

  const toggleLine = useCallback((name: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
    track('submissions_line_toggled', { line: name });
  }, []);

  const legendItems = useMemo(
    () =>
      lineKeys.map((key) => ({
        name: key,
        label: key === 'total' ? legendT.total : VENDOR_LABELS[key as Vendor],
        color: lineColor(key),
        isActive: !hiddenLines.has(key),
        onClick: toggleLine,
      })),
    [lineKeys, hiddenLines, legendT.total, lineColor, toggleLine],
  );

  const { chartPoints, lineData, xDomain, yDomain } = useMemo(() => {
    const selected = selectVolumeRows(volume, mode, onChangeOnly);
    const source = (mode === 'weekly' ? groupVolumeByWeek : computeCumulative)(selected).map(
      (d) => ({ date: new Date(d.date).getTime(), vendors: d.vendors, total: d.total }),
    );
    const lines: Record<string, { x: number; y: number }[]> = {};
    for (const key of lineKeys) {
      if (hiddenLines.has(key)) continue;
      lines[key] = source.map((p) => ({
        x: p.date,
        y: key === 'total' ? p.total : (p.vendors[key as Vendor] ?? 0),
      }));
    }

    const xExt = d3.extent(source, (d) => d.date) as [number, number];
    const markerLead = (xExt[1] - xExt[0]) * (isNarrowViewport ? 0.04 : 0.02);
    const visibleMax = d3.max(Object.values(lines).flat(), (p) => p.y) ?? 0;
    const yPad = mode === 'weekly' ? 1.1 : 1.05;

    return {
      chartPoints: source,
      lineData: lines,
      xDomain: [Math.min(xExt[0], NIGHTLY_END_DATE - markerLead), xExt[1]] as [number, number],
      yDomain: [0, visibleMax * yPad] as [number, number],
    };
  }, [volume, mode, onChangeOnly, lineKeys, hiddenLines, isNarrowViewport]);

  const layers: LayerConfig<ChartPoint>[] = useMemo(
    () => [
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

          const label = g.append('g').attr('transform', `translate(${x + 13}, 11)`);
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
            .text(formatSubmissionDate(NIGHTLY_END_DATE, locale));
          const bbox = (text.node() as SVGTextElement).getBBox();
          label
            .insert('rect', 'text')
            .attr('x', bbox.x - 5)
            .attr('y', bbox.y - 3)
            .attr('width', bbox.width + 10)
            .attr('height', bbox.height + 6)
            .attr('rx', 6)
            .attr('fill', 'var(--card)')
            .attr('stroke', 'var(--border)')
            .attr('stroke-opacity', 0.5)
            .attr('stroke-width', 1);
        },
        onZoom: (group: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: ZoomContext) => {
          const newXScale = ctx.newXScale as unknown as d3.ScaleTime<number, number>;
          const x = newXScale(NIGHTLY_END_DATE);

          group.select('.nightly-marker line').attr('x1', x).attr('x2', x);
          group.select('.nightly-marker g').attr('transform', `translate(${x + 13}, 11)`);
        },
      },
      {
        type: 'line' as const,
        key: 'submission-lines',
        lines: lineData,
        config: {
          getColor: lineColor,
          getStrokeWidth: (key: string) => (key === 'total' ? 2 : 1.5),
          curve: mode === 'weekly' ? d3.curveLinear : d3.curveMonotoneX,
        },
      },
    ],
    [legendT.markerLine1, legendT.markerLine2, lineData, lineColor, locale, mode],
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
        xAxis={{
          label: legendT.xAxis[mode],
          tickCount: isNarrowViewport ? 3 : 6,
          tickValues: isNarrowViewport
            ? d3.utcMonth.every(6)!.range(new Date(xDomain[0]), new Date(xDomain[1] + 1))
            : undefined,
          tickFormat: (value) => formatSubmissionDate(Number(value), locale),
        }}
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
          content: (point) =>
            chartHoverCard({
              title: formatSubmissionDate(point.date, locale),
              metrics: submissionMetrics(point, vendors, locale),
            }),
          details: (point, _isOverlay, close) => (
            <ChartPointDetails
              title={formatSubmissionDate(point.date, locale)}
              metrics={submissionMetrics(point, vendors, locale)}
              onClose={close}
            />
          ),
          getRulerX: (d, xScale) => (xScale as unknown as d3.ScaleTime<number, number>)(d.date),
          getRulerY: (d, yScale) => yScale(d.total),
          proximityHover: true,
          getDataX: (d) => d.date,
        }}
        caption={caption}
        footer={footer}
        legendElement={
          <ChartLegend
            variant="sidebar"
            legendItems={legendItems}
            isLegendExpanded={isLegendExpanded}
            onExpandedChange={(expanded) => {
              setIsLegendExpanded(expanded);
              track('submissions_legend_expanded', { enabled: expanded });
            }}
            reset={{
              id: 'submissions-reset-filter',
              disabled: hiddenLines.size === 0,
              onClick: () => {
                setHiddenLines(new Set());
                track('submissions_legend_filter_reset');
              },
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
