'use client';

import { useMemo, useState, type ReactNode } from 'react';
import * as d3 from 'd3';
import { D3ChartCard } from '@/components/ui/d3-chart-card';
import type { D3ChartProps, LayerConfig, RenderContext } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { escapeHtml } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';
import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { chartFont, measureTextWidth } from '@/lib/d3-chart/dynamic-margins';
import { CHART_TYPE } from '@/lib/d3-chart/typography';

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

function tooltipHtml(label: string, rows: { label: string; value: string; color?: string }[]) {
  return chartHoverCard({
    title: label,
    metrics: rows.map((row) => ({
      value: escapeHtml(row.value),
      label: row.label,
      color: row.color,
    })),
  });
}

const CHART_MARGIN = { top: 24, right: 18, bottom: 42, left: 66 };
const Y_TICK_COUNT = 4;
/** Room left of the y tick labels for the rotated y-axis title. */
const Y_LABEL_CLEARANCE_PX = 34;
const TICK_GAP_PX = 8;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MAX_FILLED_BUCKETS = 5000;
const WEEKDAYS = [
  d3.utcSunday,
  d3.utcMonday,
  d3.utcTuesday,
  d3.utcWednesday,
  d3.utcThursday,
  d3.utcFriday,
  d3.utcSaturday,
];

function every(interval: d3.CountableTimeInterval, step: number): d3.TimeInterval {
  return interval.every(step) ?? interval;
}

/** Round tick steps, finest first, each with the UTC boundaries its ticks sit on. */
function timeStepLadder(week: d3.CountableTimeInterval): [number, d3.TimeInterval][] {
  return [
    [10 * MINUTE, every(d3.utcMinute, 10)],
    [30 * MINUTE, every(d3.utcMinute, 30)],
    [HOUR, d3.utcHour],
    [3 * HOUR, every(d3.utcHour, 3)],
    [6 * HOUR, every(d3.utcHour, 6)],
    [12 * HOUR, every(d3.utcHour, 12)],
    [DAY, d3.utcDay],
    [2 * DAY, d3.utcDay.filter((d) => Math.floor(d.getTime() / DAY) % 2 === 0)],
    [WEEK, week],
    [2 * WEEK, every(week, 2)],
    [30 * DAY, d3.utcMonth],
  ];
}

/**
 * Inserts the keys missing from an evenly spaced time series so every bucket keeps its slot
 * on the axis (an empty bar or a line gap) instead of collapsing time. Irregular or non-date
 * keys come back unchanged.
 */
function fillTimeGaps(keys: string[]): string[] {
  const times = keys.map((key) => Date.parse(key));
  if (keys.length < 2 || !times.every(Number.isFinite)) return keys;
  const step = d3.min(d3.pairs(times), ([a, b]) => (b > a ? b - a : undefined));
  if (step === undefined || step >= 28 * DAY) return keys;
  const count = Math.round((times.at(-1)! - times[0]) / step) + 1;
  if (count > MAX_FILLED_BUCKETS || times.some((t) => (t - times[0]) % step !== 0)) return keys;
  const byTime = new Map(times.map((t, i) => [t, keys[i]]));
  const dateOnly = keys[0].length === 10;
  return Array.from({ length: count }, (_, i) => {
    const t = times[0] + i * step;
    const iso = new Date(t).toISOString();
    return byTime.get(t) ?? (dateOnly ? iso.slice(0, 10) : iso);
  });
}

/** Returns the x indices to tick, given the pixel distance between neighbouring x keys. */
type TickPicker = (pxPerIndex: number) => number[];

/**
 * Ticks date keys only where they sit on a round boundary (every 6h, midnight, Monday...),
 * using the finest step whose labels fit. Other keys get evenly stepped indices.
 */
function xTickPicker(keys: string[], labels: string[]): TickPicker {
  let minSpacing: number | undefined;
  const labelSpacing = () =>
    (minSpacing ??=
      (d3.max(labels, (label) => measureTextWidth(label, chartFont(CHART_TYPE.axisLabel))) ?? 0) +
      TICK_GAP_PX);
  const evenlyStepped: TickPicker = (px) => {
    const step = Math.max(1, Math.ceil(labelSpacing() / Math.max(px, Number.EPSILON)));
    return keys.flatMap((_, i) => (i % step === 0 ? [i] : []));
  };
  const times = keys.map((key) => Date.parse(key));
  if (keys.length === 0 || !times.every(Number.isFinite)) return evenlyStepped;
  const spacing = d3.min(d3.pairs(d3.sort(times)), ([a, b]) => (b > a ? b - a : undefined)) ?? DAY;
  const week = spacing >= WEEK * 0.9 ? WEEKDAYS[new Date(times[0]).getUTCDay()] : d3.utcMonday;
  const steps = timeStepLadder(week)
    .filter(([ms]) => ms >= spacing * 0.9)
    .map(([ms, interval]) => ({
      ms,
      indices: times.flatMap((t, i) => (interval.floor(new Date(t)).getTime() === t ? [i] : [])),
    }))
    .filter((step) => step.indices.length > 0);
  if (steps.length === 0) return evenlyStepped;
  return (px) =>
    (steps.find((step) => (step.ms / spacing) * px >= labelSpacing()) ?? steps.at(-1)!).indices;
}

function tickX(tick: SVGGElement): number {
  return Number(
    /translate\((?<x>[-\d.]+)/.exec(tick.getAttribute('transform') ?? '')?.groups?.x ?? 0,
  );
}

function plotRight(axis: d3.Selection<SVGGElement, unknown, null, undefined>): number {
  return (
    d3.max((axis.select('.domain').attr('d') ?? '').match(/-?[\d.]+/g) ?? [], Number) ?? Infinity
  );
}

/** Hides shown x tick labels that would touch the previous one or run past the side margins. */
function guardTickLabels(axis: d3.Selection<SVGGElement, unknown, null, undefined>) {
  const right = plotRight(axis);
  const font = chartFont(CHART_TYPE.axisLabel);
  let lastRight = -CHART_MARGIN.left;
  axis.selectAll<SVGGElement, unknown>('.tick').each(function () {
    const text = this.querySelector('text');
    if (this.getAttribute('display') === 'none' || !text?.textContent) return;
    text.removeAttribute('display');
    const x = tickX(this);
    const half = measureTextWidth(text.textContent, font) / 2;
    if (x - half < lastRight + TICK_GAP_PX || x + half > right + CHART_MARGIN.right) {
      text.setAttribute('display', 'none');
    } else lastRight = x + half;
  });
}

function niceTop(low: number, high: number): number {
  return d3.scaleLinear().domain([low, high]).nice(Y_TICK_COUNT).domain()[1];
}

function chartMargin(
  yLabel: string | undefined,
  [low, high]: [number, number],
  yTick: (y: number) => string,
) {
  if (!yLabel) return CHART_MARGIN;
  const font = chartFont(CHART_TYPE.axisLabel);
  const widest =
    d3.max(d3.ticks(low, high, Y_TICK_COUNT), (y) => measureTextWidth(yTick(y), font)) ?? 0;
  return {
    ...CHART_MARGIN,
    left: Math.max(CHART_MARGIN.left, Math.ceil(widest) + Y_LABEL_CLEARANCE_PX),
  };
}

function Legend({
  series,
  onHighlight,
}: {
  series: { key: string; label: string; color: string }[];
  onHighlight?: (key: string | null) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
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
  yCeiling = Infinity,
  filename,
  emptyLabel,
  xTicks,
  yLabel,
  controls,
  showPoints = true,
}: {
  title: string;
  series: NumericLineSeries[];
  xTick?: (x: number) => string;
  yTick?: (y: number) => string;
  subtext?: string;
  yMin?: number;
  yCeiling?: number;
  filename?: string;
  emptyLabel?: string;
  xTicks: TickPicker;
  yLabel?: string;
  controls?: ReactNode;
  showPoints?: boolean;
}) {
  const chart = useMemo<D3ChartProps<LinePoint>>(() => {
    const colored = series.map((s, i) => ({
      ...s,
      color: s.color ?? CHART_COLORS[i % CHART_COLORS.length],
    }));
    const data = colored
      .flatMap((s) => s.points)
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    const pointColors = new Map(colored.flatMap((s) => s.points.map((p) => [p, s.color] as const)));
    const xMin = d3.min(data, (p) => p.x) ?? 0;
    const xMax = d3.max(data, (p) => p.x) ?? 1;
    const yMax = d3.max(data, (p) => p.y) ?? 0;
    const lines = Object.fromEntries(
      colored.map((s, i) => [
        String(i),
        s.points.filter((p) => Number.isFinite(p.x)).toSorted((a, b) => a.x - b.x),
      ]),
    );
    const layers: LayerConfig<LinePoint>[] = [
      {
        type: 'line',
        lines,
        config: {
          getColor: (key) => colored[Number(key)].color,
          curve: d3.curveLinear,
          isDefined: (p) => Number.isFinite(p.y),
        },
      },
    ];
    if (showPoints) {
      layers.push({
        type: 'point',
        data,
        config: {
          getX: (p) => p.x,
          getY: (p) => p.y,
          getCx: () => 0,
          getCy: () => 0,
          getColor: (p) => pointColors.get(p) ?? CHART_COLORS[0],
          getRadius: () => 2,
          maxPoints: Infinity,
        },
      });
    }
    const yDomain: [number, number] = [
      yMin,
      Math.min(yCeiling, niceTop(yMin, yMax > yMin ? yMax * 1.05 : yMin + 1)),
    ];
    return {
      chartId: '',
      data,
      height: 260,
      margin: chartMargin(yLabel, yDomain, yTick),
      watermark: 'none',
      xScale: {
        type: 'linear',
        domain: xMin === xMax ? [xMin - 0.5, xMax + 0.5] : [xMin, xMax],
        nice: false,
      },
      yScale: { type: 'linear', domain: yDomain, nice: false },
      xAxis: {
        tickValues: (scale) => {
          const x = scale as d3.ScaleLinear<number, number>;
          return xTicks(Math.abs(x(1) - x(0)));
        },
        tickFormat: (x) => xTick?.(Number(x)) ?? String(x),
        customize: guardTickLabels,
      },
      yAxis: { label: yLabel, tickCount: Y_TICK_COUNT, tickFormat: (y) => yTick(Number(y)) },
      layers,
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
              return point ? [{ label: s.label, value: yTick(point.y), color: s.color }] : [];
            }),
          ),
      },
      footer: colored.length > 1 ? <Legend series={colored} /> : undefined,
      noDataOverlay:
        data.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">{emptyLabel}</p>
        ) : undefined,
    };
  }, [series, xTick, yTick, xTicks, yLabel, yMin, yCeiling, emptyLabel, showPoints]);

  return (
    <D3ChartCard
      title={title}
      subtitle={subtext}
      analyticsPrefix="agentic_workload"
      chart={chart}
      controls={controls}
      filename={filename}
    />
  );
}

const COLUMN_KEY = '';

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
  tooltipValue,
  subtext,
  fixedMax,
  filename,
  emptyLabel,
  controls,
  xTicks,
  yLabel,
}: {
  title: string;
  buckets: StackedBarBucket[];
  keys: { key: string; label: string }[];
  colors?: Record<string, string>;
  yTick?: (y: number) => string;
  /** Hover-card value format; defaults to the axis format. */
  tooltipValue?: (y: number) => string;
  subtext?: string;
  fixedMax?: number;
  filename?: string;
  emptyLabel?: string;
  controls?: ReactNode;
  xTicks: TickPicker;
  yLabel?: string;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const chart = useMemo<D3ChartProps<Segment>>(() => {
    const colored = keys.map((s, i) => ({
      ...s,
      color: colors?.[s.key] ?? CHART_COLORS[i % CHART_COLORS.length],
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
    const maxHigh = d3.max(segments, (s) => s.high) ?? 0;
    const top = fixedMax ?? niceTop(0, maxHigh > 0 ? maxHigh * 1.05 : 1);
    // Transparent full-height columns drawn first, under the bars, so hovering anywhere in a
    // bucket's column shows its card and cursor, not only the painted segments.
    const drawn = [
      ...buckets.map((bucket, index): Segment => ({
        bucket,
        index,
        key: COLUMN_KEY,
        color: 'transparent',
        low: 0,
        high: top,
      })),
      ...segments,
    ];
    const renderSegments = (
      ctx: RenderContext,
      yScale = ctx.yScale as d3.ScaleLinear<number, number>,
    ) => {
      const xScale = ctx.xScale as d3.ScaleBand<string>;
      const gap = xScale.step() - xScale.bandwidth();
      return ctx.layout.zoomGroup
        .selectAll<SVGRectElement, Segment>('.stacked-bar')
        .data(drawn, (s) => `${s.index}:${s.key}`)
        .join('rect')
        .attr('class', (s) =>
          s.key === COLUMN_KEY ? 'stacked-bar stacked-column' : 'stacked-bar stacked-segment',
        )
        .attr('x', (s) => (xScale(String(s.index)) ?? 0) - (s.key === COLUMN_KEY ? gap / 2 : 0))
        .attr('width', (s) => xScale.bandwidth() + (s.key === COLUMN_KEY ? gap : 0))
        .attr('y', (s) => yScale(s.high))
        .attr('height', (s) => Math.max(0, yScale(s.low) - yScale(s.high)))
        .attr('fill', (s) => s.color);
    };
    const layers: LayerConfig<Segment>[] = [
      {
        type: 'custom',
        key: 'stacked-segments',
        render: (_, ctx) => renderSegments(ctx),
        onZoom: (_, ctx) => renderSegments(ctx, ctx.newYScale as d3.ScaleLinear<number, number>),
      },
    ];
    return {
      chartId: '',
      data: segments,
      height: 260,
      margin: chartMargin(yLabel, [0, top], yTick),
      watermark: 'none',
      xScale: { type: 'band', domain: buckets.map((_, i) => String(i)), padding: 0.18 },
      yScale: {
        type: 'linear',
        domain: [0, top],
        nice: false,
      },
      xAxis: {
        grid: false,
        tickFormat: (value) => buckets[Number(value)]?.label ?? '',
        customize: (axis) => {
          const ticks = axis.selectAll<SVGGElement, string>('.tick');
          const xs = ticks.nodes().map(tickX);
          const pxPerIndex =
            xs.length > 1 ? (xs.at(-1)! - xs[0]) / (xs.length - 1) : plotRight(axis);
          const shown = new Set(xTicks(pxPerIndex));
          ticks.attr('display', (value) => (shown.has(Number(value)) ? null : 'none'));
          guardTickLabels(axis);
        },
      },
      yAxis: { label: yLabel, tickCount: Y_TICK_COUNT, tickFormat: (y) => yTick(Number(y)) },
      layers,
      zoom: { enabled: true, axes: 'y' },
      tooltip: {
        rulerType: 'vertical',
        getRulerX: (segment, scale) => {
          const band = scale as d3.ScaleBand<string>;
          return (band(String(segment.index)) ?? 0) + band.bandwidth() / 2;
        },
        attachToLayer: 0,
        content: ({ bucket }) =>
          tooltipHtml(
            bucket.label,
            colored
              .filter((s) => colored.length === 1 || (bucket.values[s.key] ?? 0) > 0)
              .map((s) => ({
                label: s.label,
                value: (tooltipValue ?? yTick)(bucket.values[s.key] ?? 0),
                color: s.color,
              })),
          ),
      },
      footer:
        colored.length > 1 ? <Legend series={colored} onHighlight={setHighlighted} /> : undefined,
      noDataOverlay:
        buckets.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">{emptyLabel}</p>
        ) : undefined,
    };
  }, [buckets, keys, colors, yTick, tooltipValue, fixedMax, emptyLabel, xTicks, yLabel]);

  return (
    <D3ChartCard
      title={title}
      subtitle={subtext}
      analyticsPrefix="agentic_workload"
      controls={controls}
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

const SI_STEPS = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
] as const;

export function formatAxisNumber(v: number): string {
  const abs = Math.abs(v);
  const [scale, suffix] = SI_STEPS.find(([step]) => abs >= step * 0.9995) ?? [1, ''];
  const scaled = abs / scale;
  const digits = scaled >= 99.95 ? 0 : 1;
  return `${v < 0 ? '-' : ''}${scaled.toFixed(digits).replace(/\.0$/u, '')}${suffix}`;
}

/** Round axis ticks stay whole ("$50", "$2K"); other amounts under $100 keep cents ("$37.63"). */
export function formatAxisDollars(v: number): string {
  const abs = Math.abs(v);
  const amount =
    abs > 0 && abs < 99.995 && !Number.isInteger(abs) ? abs.toFixed(2) : formatAxisNumber(abs);
  return `${v < 0 ? '-' : ''}$${amount}`;
}

export function formatAxisPercent(v: number): string {
  return `${Math.round(v)}%`;
}

function formatSharePercent(v: number): string {
  return v >= 9.95 ? `${Math.round(v)}%` : `${v.toFixed(1)}%`;
}

function monthDayTime(value: string | number | Date, locale: 'en' | 'zh', timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: locale === 'zh' ? 'numeric' : 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: locale === 'zh' ? `${part('month')}月${part('day')}日` : `${part('month')} ${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

export function formatHourLabel(
  value: string | number | Date,
  locale: 'en' | 'zh',
  timeZone = 'UTC',
): string {
  const label = monthDayTime(value, locale, timeZone);
  return label ? `${label.day} ${label.time}` : String(value);
}

export function formatDayLabel(value: string | number | Date, locale: 'en' | 'zh'): string {
  return monthDayTime(value, locale, 'UTC')?.day ?? String(value);
}

export function TrendsLineChart({
  series,
  yFormatter,
  xFormatter: xFormatterProp,
  emptyLabel,
  ...props
}: {
  title: string;
  subtext?: string;
  series: LineSeries[];
  yFormatter?: (value: number) => string;
  /** Y-axis title. */
  yLabel?: string;
  /** Tick and hover-title label for each `day` key. Defaults to `formatDayLabel`. */
  xFormatter?: (day: string) => string;
  filename: string;
  emptyLabel?: string;
  yMin?: number;
  /** Upper bound for the padded y-axis top, e.g. 100 for a percentage. */
  yCeiling?: number;
  controls?: ReactNode;
  /** Draws a marker at every data point. */
  showPoints?: boolean;
}) {
  const locale = useLocale();
  const xFormatter = useMemo(
    () => xFormatterProp ?? ((day: string) => formatDayLabel(day, locale)),
    [xFormatterProp, locale],
  );
  const { days, numeric, xTicks } = useMemo(() => {
    const sortedDays = fillTimeGaps(
      [...new Set(series.flatMap((s) => s.points.map((p) => p.day)))].toSorted(
        (a, b) => Date.parse(a) - Date.parse(b),
      ),
    );
    const labels = sortedDays.map(xFormatter);
    const numericSeries = series.map((s) => {
      const values = new Map(s.points.map((p) => [p.day, p.value]));
      return {
        ...s,
        points: sortedDays.map((day, x) => ({
          x,
          y: values.get(day) ?? NaN,
          label: labels[x],
        })),
      };
    });
    return {
      days: sortedDays,
      numeric: numericSeries,
      xTicks: xTickPicker(sortedDays, labels),
    };
  }, [series, xFormatter]);
  return (
    <TrendLineChart
      {...props}
      series={numeric}
      yTick={yFormatter}
      xTick={(x) => (days[x] ? xFormatter(days[x]) : '')}
      xTicks={xTicks}
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
  yFormatter,
  xFormatter: xFormatterProp,
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
  /** Count-mode axis and tooltip format; share mode always uses percent. */
  yFormatter?: (value: number) => string;
  /** Y-axis title. */
  yLabel?: string;
  /** Tick and hover-title label for each `day` key. Defaults to `formatDayLabel`. */
  xFormatter?: (day: string) => string;
  controls?: ReactNode;
}) {
  const locale = useLocale();
  const xFormatter = useMemo(
    () => xFormatterProp ?? ((day: string) => formatDayLabel(day, locale)),
    [xFormatterProp, locale],
  );
  const filledDays = useMemo(() => {
    const byDay = new Map(days.map((day) => [day.day, day]));
    const keys = fillTimeGaps(days.map((day) => day.day));
    return keys.map((key): StackedDayPoint => byDay.get(key) ?? { day: key, values: {} });
  }, [days]);
  const buckets = useMemo(
    () =>
      filledDays.map((day) => {
        const total = seriesKeys.reduce((sum, key) => sum + (day.values[key] ?? 0), 0);
        return {
          label: xFormatter(day.day),
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
    [filledDays, seriesKeys, mode, xFormatter],
  );
  const xTicks = useMemo(
    () =>
      xTickPicker(
        filledDays.map((day) => day.day),
        buckets.map((bucket) => bucket.label),
      ),
    [filledDays, buckets],
  );
  return (
    <StackedBarChart
      {...props}
      buckets={buckets}
      xTicks={xTicks}
      keys={seriesKeys.map((key) => ({ key, label: labelFor(key) }))}
      colors={Object.fromEntries(seriesKeys.map((key) => [key, colorFor(key)]))}
      yTick={mode === 'share' ? formatAxisPercent : (yFormatter ?? formatAxisNumber)}
      tooltipValue={mode === 'share' ? formatSharePercent : undefined}
      fixedMax={mode === 'share' ? 100 : undefined}
      emptyLabel={emptyLabel ?? (locale === 'zh' ? '该时间窗口内无数据' : 'No data in this window')}
    />
  );
}

export function buildColorMap(keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key, i) => [key, CHART_COLORS[i % CHART_COLORS.length]]));
}
