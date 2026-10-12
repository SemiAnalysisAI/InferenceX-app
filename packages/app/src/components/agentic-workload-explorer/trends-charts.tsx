'use client';

import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { D3ChartCard } from '@/components/ui/d3-chart-card';
import type { D3ChartProps, LayerConfig, RenderContext } from '@/lib/d3-chart/D3Chart';
import { escapeHtml } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';

const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];

interface LinePoint {
  x: number;
  y: number;
  label?: string;
}

interface NumericLineSeries {
  key: string;
  label: string;
  color?: string;
  points: LinePoint[];
}

interface StackedBarBucket {
  label: string;
  values: Record<string, number>;
}

function tooltipHtml(label: string, rows: { label: string; value: string }[]) {
  return `<div class="space-y-1 text-xs"><div class="font-semibold">${escapeHtml(label)}</div>${rows
    .map((row) => `<div>${escapeHtml(row.label)}: ${escapeHtml(row.value)}</div>`)
    .join('')}</div>`;
}

function Legend({
  series,
  onHighlight,
}: {
  series: { key: string; label: string; color: string }[];
  onHighlight?: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
      {series.map((item) => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1.5"
          onMouseEnter={onHighlight ? () => onHighlight(item.key) : undefined}
          onMouseLeave={onHighlight ? () => onHighlight(null) : undefined}
        >
          <span className="size-2 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function TrendLineChart({
  title,
  series,
  xTick,
  yTick = formatAxisNumber,
  subtext,
  yMin = 0,
  filename,
  emptyLabel,
  xTicks,
}: {
  title: string;
  series: NumericLineSeries[];
  xTick?: (x: number) => string;
  yTick?: (y: number) => string;
  subtext?: string;
  yMin?: number;
  filename?: string;
  emptyLabel?: string;
  xTicks?: number[];
}) {
  const chart = useMemo<D3ChartProps<LinePoint>>(() => {
    const colored = series.map((s, i) => ({
      ...s,
      color: s.color ?? PALETTE[i % PALETTE.length],
    }));
    const data = colored
      .flatMap((s) => s.points)
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    const pointColors = new Map(colored.flatMap((s) => s.points.map((p) => [p, s.color] as const)));
    const xMin = d3.min(data, (p) => p.x) ?? 0;
    const xMax = d3.max(data, (p) => p.x) ?? 1;
    const yMax = d3.max(data, (p) => p.y) ?? 0;
    // Index keys keep arbitrary model IDs out of D3's CSS selectors.
    const lines = Object.fromEntries(
      colored.map((s, i) => [
        String(i),
        s.points.filter((p) => Number.isFinite(p.x)).toSorted((a, b) => a.x - b.x),
      ]),
    );
    return {
      chartId: '',
      data,
      height: 260,
      margin: { top: 16, right: 18, bottom: 42, left: 66 },
      watermark: 'none',
      xScale: {
        type: 'linear',
        domain: xMin === xMax ? [xMin - 0.5, xMax + 0.5] : [xMin, xMax],
        nice: false,
      },
      yScale: { type: 'linear', domain: [yMin, Math.max(yMin + 1, yMax * 1.12)], nice: false },
      xAxis: {
        tickCount: 5,
        tickValues: xTicks,
        tickFormat: (x) => xTick?.(Number(x)) ?? String(x),
      },
      yAxis: { tickCount: 4, tickFormat: (y) => yTick(Number(y)) },
      layers: [
        {
          type: 'line',
          lines,
          config: {
            getColor: (key) => colored[Number(key)].color,
            curve: d3.curveLinear,
            isDefined: (p) => Number.isFinite(p.y),
          },
        },
        {
          type: 'point',
          data,
          config: {
            getX: (p) => p.x,
            getY: (p) => p.y,
            getCx: () => 0,
            getCy: () => 0,
            getColor: (p) => pointColors.get(p) ?? PALETTE[0],
            getRadius: () => 2,
            maxPoints: Infinity,
          },
        },
      ],
      zoom: { enabled: true },
      tooltip: {
        rulerType: 'vertical',
        proximityHover: true,
        getDataX: (p) => p.x,
        getRulerX: (p, scale) => (scale as d3.ScaleLinear<number, number>)(p.x),
        content: (p) =>
          tooltipHtml(
            p.label ?? xTick?.(p.x) ?? String(p.x),
            colored.flatMap((s) => {
              const point = s.points.find((item) => item.x === p.x && Number.isFinite(item.y));
              return point ? [{ label: s.label, value: yTick(point.y) }] : [];
            }),
          ),
      },
      legendElement: <Legend series={colored} />,
      noDataOverlay:
        data.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">{emptyLabel}</p>
        ) : undefined,
    };
  }, [series, xTick, yTick, xTicks, yMin, emptyLabel]);

  return (
    <D3ChartCard
      title={title}
      subtitle={subtext}
      analyticsPrefix="agentic_workload"
      chart={chart}
      filename={filename}
    />
  );
}

interface Segment {
  bucket: StackedBarBucket;
  index: number;
  key: string;
  color: string;
  low: number;
  high: number;
}

function StackedBarChart({
  title,
  buckets,
  keys,
  colors,
  yTick = formatAxisNumber,
  subtext,
  fixedMax,
  filename,
  emptyLabel,
}: {
  title: string;
  buckets: StackedBarBucket[];
  keys: { key: string; label: string }[];
  colors?: Record<string, string>;
  yTick?: (y: number) => string;
  subtext?: string;
  fixedMax?: number;
  filename?: string;
  emptyLabel?: string;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const chart = useMemo<D3ChartProps<Segment>>(() => {
    const colored = keys.map((s, i) => ({
      ...s,
      color: colors?.[s.key] ?? PALETTE[i % PALETTE.length],
    }));
    const segments = buckets.flatMap((bucket, index) => {
      let low = 0;
      return colored.map((s): Segment => {
        const high = low + Math.max(0, bucket.values[s.key] ?? 0);
        const segment = { bucket, index, key: s.key, color: s.color, low, high };
        low = high;
        return segment;
      });
    });
    const renderSegments = (
      ctx: RenderContext,
      yScale = ctx.yScale as d3.ScaleLinear<number, number>,
    ) => {
      const xScale = ctx.xScale as d3.ScaleBand<string>;
      return ctx.layout.zoomGroup
        .selectAll<SVGRectElement, Segment>('.stacked-segment')
        .data(segments, (s) => `${s.index}:${s.key}`)
        .join('rect')
        .attr('class', 'stacked-segment')
        .attr('x', (s) => xScale(String(s.index)) ?? 0)
        .attr('width', xScale.bandwidth())
        .attr('y', (s) => yScale(s.high))
        .attr('height', (s) => Math.max(0, yScale(s.low) - yScale(s.high)))
        .attr('fill', (s) => s.color);
    };
    // The shared renderer owns axes, resize, zoom and tooltips. Only stacking is custom.
    const layers: LayerConfig<Segment>[] = [
      {
        type: 'custom',
        key: 'stacked-segments',
        render: (_, ctx) => renderSegments(ctx),
        onZoom: (_, ctx) => renderSegments(ctx, ctx.newYScale as d3.ScaleLinear<number, number>),
      },
    ];
    const tickStep = Math.max(1, Math.ceil(buckets.length / 6));
    return {
      chartId: '',
      data: segments,
      height: 260,
      margin: { top: 16, right: 18, bottom: 42, left: 66 },
      watermark: 'none',
      xScale: { type: 'band', domain: buckets.map((_, i) => String(i)), padding: 0.18 },
      yScale: {
        type: 'linear',
        domain: [0, fixedMax ?? Math.max(1, (d3.max(segments, (s) => s.high) ?? 0) * 1.12)],
        nice: false,
      },
      xAxis: {
        tickFormat: (value) => {
          const i = Number(value);
          return i % tickStep === 0 || i === buckets.length - 1 ? (buckets[i]?.label ?? '') : '';
        },
      },
      yAxis: { tickCount: 4, tickFormat: (y) => yTick(Number(y)) },
      layers,
      zoom: { enabled: true, axes: 'y' },
      tooltip: {
        rulerType: 'none',
        attachToLayer: 0,
        onHoverStart: (_, segment) => setHighlighted(segment.key),
        onHoverEnd: () => setHighlighted(null),
        content: ({ bucket }) =>
          tooltipHtml(
            bucket.label,
            colored.map((s) => ({
              label: s.label,
              value: yTick(bucket.values[s.key] ?? 0),
            })),
          ),
      },
      legendElement: <Legend series={colored} onHighlight={setHighlighted} />,
      noDataOverlay:
        buckets.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">{emptyLabel}</p>
        ) : undefined,
    };
  }, [buckets, keys, colors, yTick, fixedMax, emptyLabel]);

  return (
    <D3ChartCard
      title={title}
      subtitle={subtext}
      analyticsPrefix="agentic_workload"
      chart={{
        ...chart,
        displayIdentity: highlighted ?? '',
        onDisplayUpdate: (ctx) => {
          ctx.layout.zoomGroup
            .selectAll<SVGRectElement, Segment>('.stacked-segment')
            .attr('opacity', (s) => (highlighted === null || s.key === highlighted ? 1 : 0.2));
        },
      }}
      filename={filename}
    />
  );
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: { day: string; value: number }[];
}

export interface StackedDayPoint {
  day: string;
  values: Record<string, number>;
}

export function formatAxisNumber(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function formatAxisPercent(v: number): string {
  return `${Math.round(v)}%`;
}

function dayLabel(day: string): string {
  const date = new Date(day);
  return Number.isNaN(date.getTime()) ? day : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export function TrendsLineChart({
  series,
  yFormatter,
  emptyLabel,
  ...props
}: {
  title: string;
  subtext?: string;
  series: LineSeries[];
  yFormatter?: (value: number) => string;
  filename: string;
  emptyLabel?: string;
  yMin?: number;
}) {
  const locale = useLocale();
  const { days, numeric } = useMemo(() => {
    const sortedDays = [...new Set(series.flatMap((s) => s.points.map((p) => p.day)))].toSorted(
      (a, b) => Date.parse(a) - Date.parse(b),
    );
    const numericSeries = series.map((s) => {
      const values = new Map(s.points.map((p) => [p.day, p.value]));
      return {
        ...s,
        // Explicit NaNs preserve gaps instead of connecting across missing days.
        points: sortedDays.map((day, x) => ({
          x,
          y: values.get(day) ?? NaN,
          label: dayLabel(day),
        })),
      };
    });
    return { days: sortedDays, numeric: numericSeries };
  }, [series]);
  const step = Math.max(1, Math.ceil(days.length / 6));
  return (
    <TrendLineChart
      {...props}
      series={numeric}
      yTick={yFormatter}
      xTick={(x) => (days[x] ? dayLabel(days[x]) : '')}
      xTicks={days.flatMap((_, i) => (i % step === 0 || i === days.length - 1 ? [i] : []))}
      emptyLabel={emptyLabel ?? (locale === 'zh' ? '该时间窗口内无数据' : 'No data in this window')}
    />
  );
}

export function TrendsStackedChart({
  days,
  seriesKeys,
  labelFor,
  colorFor,
  mode,
  emptyLabel,
  ...props
}: {
  title: string;
  subtext?: string;
  days: StackedDayPoint[];
  seriesKeys: string[];
  labelFor: (key: string) => string;
  colorFor: (key: string) => string;
  mode: 'share' | 'count';
  filename: string;
  emptyLabel?: string;
}) {
  const locale = useLocale();
  const buckets = useMemo(
    () =>
      days.map((day) => {
        const total = seriesKeys.reduce((sum, key) => sum + (day.values[key] ?? 0), 0);
        return {
          label: dayLabel(day.day),
          values:
            mode === 'count'
              ? day.values
              : Object.fromEntries(
                  seriesKeys.map((key) => [
                    key,
                    total > 0 ? ((day.values[key] ?? 0) / total) * 100 : 0,
                  ]),
                ),
        };
      }),
    [days, seriesKeys, mode],
  );
  return (
    <StackedBarChart
      {...props}
      buckets={buckets}
      keys={seriesKeys.map((key) => ({ key, label: labelFor(key) }))}
      colors={Object.fromEntries(seriesKeys.map((key) => [key, colorFor(key)]))}
      yTick={mode === 'share' ? formatAxisPercent : formatAxisNumber}
      fixedMax={mode === 'share' ? 100 : undefined}
      emptyLabel={emptyLabel ?? (locale === 'zh' ? '该时间窗口内无数据' : 'No data in this window')}
    />
  );
}

export function SectionHeader({ label, subtext }: { label: string; subtext?: string }) {
  return <DashboardSectionHeader title={label} description={subtext} className="mb-2" />;
}

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="gap-0 py-3">
      <CardContent className="px-3">
        <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
          {label}
        </div>
        <div className="text-lg font-mono font-bold mt-1">{value}</div>
        {detail && <div className="text-3xs font-mono text-muted-foreground mt-0.5">{detail}</div>}
      </CardContent>
    </Card>
  );
}

/** Categorical series palette, led by the SemiAnalysis brand blue and amber. */
export const CHART_COLORS = [
  '#0b86d1',
  '#f7b041',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

export function buildColorMap(keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key, i) => [key, CHART_COLORS[i % CHART_COLORS.length]]));
}
