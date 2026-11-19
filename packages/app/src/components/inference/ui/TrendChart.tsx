'use client';

import { track } from '@/lib/analytics/analytics';
import * as d3 from 'd3';
import React, { useCallback, useMemo } from 'react';

import {
  D3Chart,
  type RenderContext,
  type ZoomContext,
  type ScaleConfig,
} from '@/lib/d3-chart/D3Chart';
import type { AnyScale } from '@/lib/d3-chart/chart-update';
import { chartFont, measureTextWidth } from '@/lib/d3-chart/dynamic-margins';
import { axisLabelUnit, chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { ChartPointDetails } from '@/components/ui/chart-point-details';
import { formatLargeNumber, logTickFormat } from '@/lib/charts/chart-rendering';
import { SERIES_LINE_PATTERNS, frameworkDasharray } from '@/lib/charts/framework-dash';
import { type Precision, getChartWatermark, getPrecisionLabel } from '@/lib/catalog/data-mappings';
import { updateRepoUrl } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';
import { fmt as formatExact } from '@/components/inference/utils/tooltipUtils';

import type { TrendDataPoint, TrendLineConfig } from '../types';

export interface TrendChartProps {
  trendLines: Map<string, TrendDataPoint[]>;
  lineConfigs: TrendLineConfig[];
  yLabel: string;
  logScale: boolean;
  chartId?: string;
  legendElement?: React.ReactNode;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
  selectedPrecisions?: readonly string[];
  lowerIsBetter?: boolean;
}

const CHART_MARGIN = { top: 20, right: 30, bottom: 64, left: 66 };

const DAY_MS = 86_400_000;
const DAY_TICK_STEPS = [1, 2, 3, 7, 14];
const MONTH_TICK_STEPS = [1, 2, 3, 6];
const MIN_DATE_TICKS = 3;

/**
 * About `count` UTC date ticks with equal gaps: whole days on a grid fixed to Mondays
 * (1970-01-05 is day 4), so panning keeps the same dates, else months or years. Takes the
 * coarsest step within `count`, unless it leaves fewer than three ticks and a finer one exists.
 */
function evenDateTicks(start: Date, end: Date, count: number): Date[] {
  const stop = new Date(end.getTime() + 1);
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  const candidates = [
    ...DAY_TICK_STEPS.map(
      (step) => () =>
        d3.utcDay
          .range(start, stop)
          .filter((day) => (Math.round(day.getTime() / DAY_MS) - 4) % step === 0),
    ),
    ...MONTH_TICK_STEPS.map((step) => () => d3.utcMonth.every(step)?.range(start, stop) ?? []),
    () => d3.utcYear.every(Math.ceil(days / 365.25 / count))?.range(start, stop) ?? [],
  ];
  let finer: Date[] | undefined;
  for (const candidate of candidates) {
    const ticks = candidate();
    if (ticks.length <= count) return ticks.length < MIN_DATE_TICKS && finer ? finer : ticks;
    finer = ticks;
  }
  return finer ?? [];
}

const STRINGS = {
  en: {
    noData: 'No historical data found for the tracked configurations',
    instructions: 'Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset',
    aria: 'Historical performance trend chart',
    date: 'Date',
    interpolatedAt: (target: number) => `Interpolated at ${target} tok/s/user`,
    target: 'Target interactivity',
    precision: 'Precision',
    sourceDates: 'Source run dates',
    run: (id: number) => `Run ${id}`,
  },
  zh: {
    noData: '当前追踪的配置暂无历史数据',
    instructions: 'Shift+滚轮横向缩放 · 拖动平移 · 双击重置',
    aria: '历史性能趋势图表',
    date: '日期',
    interpolatedAt: (target: number) => `插值于 ${target} tok/s/user`,
    target: '目标交互性',
    precision: '精度',
    sourceDates: '来源运行日期',
    run: (id: number) => `运行 ${id}`,
  },
} as const;

interface PreparedPoint {
  date: Date;
  value: number;
  interactivity: number;
  raw: TrendDataPoint;
  ts: number;
  precision: string;
  x: number;
  y: number;
}

const TrendChart = React.memo(
  ({
    trendLines,
    lineConfigs,
    yLabel,
    logScale,
    chartId = 'trend',
    legendElement,
    caption,
    footer,
    selectedPrecisions,
  }: TrendChartProps) => {
    const locale = useLocale();
    const t = STRINGS[locale];
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
    const axisDateFormatter = useMemo(
      () =>
        new Intl.DateTimeFormat('zh-CN', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
      [],
    );
    const visibleConfigIds = useMemo(() => new Set(lineConfigs.map((c) => c.id)), [lineConfigs]);

    const allPoints = useMemo(() => {
      const points: { date: Date; value: number; configId: string }[] = [];
      for (const [configId, trendData] of trendLines) {
        if (!visibleConfigIds.has(configId)) continue;
        for (const point of trendData) {
          points.push({
            date: new Date(point.date),
            value: point.value,
            configId,
          });
        }
      }
      return points;
    }, [trendLines, visibleConfigIds]);

    const { lineDataRecord, flatPointData } = useMemo(() => {
      const record: Record<string, { x: number; y: number }[]> = {};
      const flat: PreparedPoint[] = [];
      for (const config of lineConfigs) {
        const data = trendLines.get(config.id);
        if (!data || data.length === 0) continue;
        const safeId = config.id.replaceAll(/[|]/gu, '_');
        const precision = config.precision ?? 'fp4';
        const prepared = data
          .map((d) => {
            const date = new Date(d.date);
            const ts = date.getTime();
            return {
              date,
              value: d.value,
              interactivity: d.x,
              raw: d,
              ts,
              precision,
              x: ts,
              y: d.value,
            } as PreparedPoint;
          })
          .toSorted((a, b) => a.ts - b.ts);
        record[safeId] = prepared.map((p) => ({ x: p.ts, y: p.value }));
        for (const p of prepared) {
          if (p.value !== null && p.value !== undefined && !isNaN(p.value) && !p.raw.synthetic)
            flat.push(p);
        }
      }
      return { lineDataRecord: record, flatPointData: flat };
    }, [lineConfigs, trendLines]);

    const safeIdToConfig = useMemo(() => {
      const map = new Map<string, TrendLineConfig>();
      for (const c of lineConfigs) map.set(c.id.replaceAll(/[|]/gu, '_'), c);
      return map;
    }, [lineConfigs]);

    const getPointConfig = useCallback(
      (d: PreparedPoint): TrendLineConfig | undefined => {
        for (const config of lineConfigs) {
          const data = trendLines.get(config.id);
          if (data && data.includes(d.raw)) return config;
        }
        return undefined;
      },
      [lineConfigs, trendLines],
    );

    const xScaleConfig = useMemo<ScaleConfig>(() => {
      if (allPoints.length === 0) {
        return { type: 'time', domain: [new Date(), new Date()] };
      }
      const dateExtent = d3.extent(allPoints, (d) => d.date) as [Date, Date];
      return { type: 'time', domain: dateExtent, nice: true };
    }, [allPoints]);

    const yScaleConfig = useMemo<ScaleConfig>(() => {
      if (allPoints.length === 0) {
        return logScale ? { type: 'log', domain: [0.1, 1] } : { type: 'linear', domain: [0, 1] };
      }
      const valueExtent = d3.extent(allPoints, (d) => d.value) as [number, number];
      const dataMin = valueExtent[0];
      const dataMax = valueExtent[1];
      const yRange =
        dataMax - dataMin > 0 ? dataMax - dataMin : Math.max(Math.abs(dataMax) * 0.1, 1);
      let yMin: number;
      if (logScale) {
        if (dataMin <= 0) {
          yMin = 0.1;
        } else if (dataMin < 1) {
          yMin = 10 ** Math.floor(Math.log10(dataMin));
        } else {
          yMin = dataMin * 0.95;
        }
      } else {
        yMin = Math.max(0, dataMin - yRange * 0.05);
      }
      const yMax = dataMax + yRange * 0.05;
      return logScale
        ? { type: 'log', domain: [yMin, yMax], nice: true }
        : { type: 'linear', domain: [yMin, yMax], nice: true };
    }, [allPoints, logScale]);

    const applyLogTickFormat = useCallback(
      (ctx: Pick<RenderContext, 'layout' | 'yScale' | 'renderedYScale'>) => {
        if (!logScale) return;
        const scale = (ctx.renderedYScale ?? ctx.yScale) as d3.ScaleLogarithmic<number, number>;
        const fmt = logTickFormat(scale);
        ctx.layout.yAxisGroup.call(d3.axisLeft(scale).ticks(8).tickFormat(fmt));
      },
      [logScale],
    );

    const onRender = useCallback(
      (ctx: RenderContext) => applyLogTickFormat(ctx),
      [applyLogTickFormat],
    );

    const onZoom = useCallback(
      (_event: d3.D3ZoomEvent<SVGSVGElement, unknown>, ctx: ZoomContext) => {
        if (!logScale) return;
        const scale = ctx.newYScale as d3.ScaleLogarithmic<number, number>;
        const fmt = logTickFormat(scale);
        ctx.layout.yAxisGroup.call(d3.axisLeft(scale).ticks(8).tickFormat(fmt));
      },
      [logScale],
    );

    const layers = useMemo(
      () => [
        {
          type: 'line' as const,
          key: 'trend-lines',
          lines: lineDataRecord,
          config: {
            getColor: (key: string) => safeIdToConfig.get(key)?.color ?? '#888',
            getStrokeDasharray: SERIES_LINE_PATTERNS
              ? (key: string) => frameworkDasharray(safeIdToConfig.get(key)?.hwKey ?? '') ?? 'none'
              : undefined,
            strokeWidth: 2,
            curve: d3.curveMonotoneX,
            isDefined: (d: { x: number; y: number }) =>
              d.y !== null && d.y !== undefined && !isNaN(d.y) && (logScale ? d.y > 0 : true),
          },
        },
        {
          type: 'scatter' as const,
          key: 'trend-points',
          data: flatPointData,
          config: {
            getColor: (d: PreparedPoint) => getPointConfig(d)?.color ?? '#888',
            selectedPrecisions,
          },
        },
      ],
      [lineDataRecord, flatPointData, safeIdToConfig, getPointConfig, logScale, selectedPrecisions],
    );

    const tooltipConfig = useMemo(
      () => ({
        rulerType: 'crosshair' as const,
        proximityHover: true,
        getDataX: (d: PreparedPoint) => d.x,
        getDataY: (d: PreparedPoint) => d.y,
        content: (d: PreparedPoint) => {
          const config = getPointConfig(d);
          return chartHoverCard(
            {
              title: config?.label ?? '',
              subtitle: dateFormatter.format(new Date(d.raw.date)),
              color: config?.color ?? '#888',
              metrics: [{ value: formatLargeNumber(d.value), label: axisLabelUnit(yLabel) }],
              summary: t.interpolatedAt(d.raw.x),
            },
            { pinned: false },
          );
        },
        details: (d: PreparedPoint, _isOverlay: boolean, close: () => void) => {
          const config = getPointConfig(d);
          const sources = d.raw.sources ?? [];
          const sourceDates = [...new Set(sources.map((source) => source.date))].toSorted();
          const runs = [...new Map(sources.map((source) => [source.runId, source])).values()];
          return (
            <ChartPointDetails
              title={config?.label ?? ''}
              color={config?.color ?? '#888'}
              date={dateFormatter.format(new Date(d.raw.date))}
              metrics={[
                { value: formatLargeNumber(d.value), label: yLabel, exact: formatExact(d.value) },
              ]}
              rows={[
                { label: t.precision, value: getPrecisionLabel(d.precision as Precision) },
                { label: t.target, value: `${d.raw.x} tok/s/user` },
                ...(sourceDates.some((date) => date !== d.raw.date)
                  ? [{ label: t.sourceDates, value: sourceDates.join(', '), wide: true }]
                  : []),
              ]}
              links={runs.map((source) => ({
                action: `run-${source.runId}`,
                label: t.run(source.runId),
                href: updateRepoUrl(source.runUrl),
                external: true,
              }))}
              onClose={close}
            />
          );
        },
        getRulerX: (d: PreparedPoint, xScale: any) => xScale(d.x),
        getRulerY: (d: PreparedPoint, yScale: any) => yScale(d.y),
        onPointClick: (d: PreparedPoint) => {
          const config = getPointConfig(d);
          if (config)
            track('inference_trend_point_clicked', { config: config.hwKey, date: d.raw.date });
        },
      }),
      [dateFormatter, getPointConfig, t, yLabel],
    );

    const xAxisConfig = useMemo(
      () => ({
        label: t.date,
        tickFormat: ((value: d3.AxisDomain) =>
          locale === 'zh'
            ? axisDateFormatter.format(new Date(Number(value)))
            : d3.utcFormat('%b %-d')(new Date(Number(value)))) as any,
        tickCount: 10,
        // Short "Oct 1" labels fit every ~64px; the default 80px step leaves one tick on phones.
        tickValues: (scale: AnyScale) => {
          const time = scale as d3.ScaleTime<number, number>;
          const [left, right] = time.range();
          const [start, end] = time.domain();
          return evenDateTicks(
            start,
            end,
            Math.min(10, Math.max(3, Math.floor(Math.abs(right - left) / 64))),
          );
        },
        customize: (g: d3.Selection<SVGGElement, unknown, null, undefined>) => {
          const ticks = g.selectAll<SVGGElement, unknown>('.tick');
          const xs = ticks
            .nodes()
            .map((node) =>
              Number(
                /translate\((?<x>[^,]+)/u.exec(node.getAttribute('transform') ?? '')?.groups?.x,
              ),
            );
          const font = chartFont(CHART_TYPE.axisLabel);
          const widest = Math.max(
            0,
            ...ticks.nodes().map((node) => measureTextWidth(node.textContent ?? '', font)),
          );
          const rotate = xs.some((x, i) => i > 0 && Math.abs(x - xs[i - 1]) < widest + 8);
          ticks
            .select('text')
            .attr('transform', rotate ? 'rotate(-30)' : null)
            .attr('text-anchor', rotate ? 'end' : null);
        },
      }),
      [axisDateFormatter, locale, t.date],
    );

    const yAxisConfig = useMemo(
      () => ({
        label: yLabel,
        tickFormat: (d: d3.AxisDomain) => formatLargeNumber(d as number),
        tickCount: 8,
      }),
      [yLabel],
    );

    const zoomConfig = useMemo(
      () => ({
        enabled: true,
        axes: 'x' as const,
        scaleExtent: [1, 10] as [number, number],
        onZoom,
      }),
      [onZoom],
    );

    if (allPoints.length === 0) {
      return (
        <div className="relative w-full min-h-[200px] flex items-center justify-center">
          <p className="text-muted-foreground text-sm">{t.noData}</p>
        </div>
      );
    }

    return (
      <div role="group" aria-label={t.aria}>
        <D3Chart<PreparedPoint>
          chartId={chartId}
          data={flatPointData}
          margin={CHART_MARGIN}
          watermark={getChartWatermark()}
          testId="trend-chart-svg"
          grabCursor
          instructions={t.instructions}
          xScale={xScaleConfig}
          yScale={yScaleConfig}
          xAxis={xAxisConfig}
          yAxis={yAxisConfig}
          layers={layers}
          zoom={zoomConfig}
          tooltip={tooltipConfig}
          onRender={onRender}
          onExportRender={onRender}
          legendElement={legendElement}
          caption={caption}
          footer={footer}
        />
      </div>
    );
  },
);

TrendChart.displayName = 'TrendChart';

export default TrendChart;
