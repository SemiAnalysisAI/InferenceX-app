'use client';

import * as d3 from 'd3';
import React, { useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { track } from '@/lib/analytics/analytics';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  nearestDateIndex,
  PanelHoverCard,
  usePanelHover,
  useSnapshotDateFormat,
} from './FrontierIndexedTimeline';
import {
  formatRatio,
  PANEL_HEADER_CLASS,
  PANEL_MARGIN,
  panelLabelCount,
  SHORT_TABLE_ROWS,
} from './frontier-panel-layout';
import type { FrontierSeriesStyle } from './FrontierChart';
import {
  commonSoftwareGainRate,
  daysSinceFirstRun,
  DEFAULT_GAIN_RATE_WINDOW,
  GAIN_RATE_WINDOWS,
  monthlyRate,
  softwareGainRates,
  softwareGains,
  type FrontierHistory,
  type GainRateWindow,
} from './frontier-history-core';

type RateAxis = 'date' | 'age';

const STRINGS = {
  en: {
    title: 'Rate of software gain',
    window: 'Window',
    days: (days: number) => `${days}d`,
    axis: 'X axis',
    byDate: 'Date',
    byAge: 'Days since first run',
    ageLabel: 'Days since first run',
    common: 'All-chip median',
    selectedDate: 'Selected date',
    yAxis: 'Gain rate per month',
    day: (day: number) => `Day ${day}`,
    seekHint: 'Hover to read rates, click or drag to jump to a date',
    hoverHint: 'Hover to read rates',
    pick: 'Pick at least one chip.',
    noRate: 'Not enough history yet: a rate needs at least half the window.',
    tableTitle: 'Gain rate by chip',
    chip: 'Chip',
    age: 'Days since first run',
    gain: 'Gain so far',
    lifetime: 'Lifetime rate',
    current: 'Current rate',
    median: 'All-chip median',
    own: 'Chip-specific',
    peak: 'Peak rate',
    peakDate: 'Peak date',
    perMonth: '/mo',
  },
  zh: {
    title: '软件提升速度',
    window: '窗口',
    days: (days: number) => `${days} 天`,
    axis: 'X 轴',
    byDate: '日期',
    byAge: '距首次测试天数',
    ageLabel: '距首次测试天数',
    common: '全部芯片中位数',
    selectedDate: '所选日期',
    yAxis: '每月提升速度',
    day: (day: number) => `第 ${day} 天`,
    seekHint: '悬停查看速度，点击或拖动跳转到日期',
    hoverHint: '悬停查看速度',
    pick: '请至少选择一款芯片。',
    noRate: '历史数据不足：计算速度至少需要半个窗口的数据。',
    tableTitle: '各芯片的提升速度',
    chip: '芯片',
    age: '距首次测试天数',
    gain: '累计提升',
    lifetime: '全周期速度',
    current: '当前速度',
    median: '全部芯片中位数',
    own: '芯片特有',
    peak: '峰值速度',
    peakDate: '峰值日期',
    perMonth: '/月',
  },
} as const;

const CHART_HEIGHT = 300;

const formatRate = (rate: number | null, perMonth: string) =>
  rate === null ? '—' : `${rate >= 0 ? '+' : ''}${d3.format('.0%')(rate)}${perMonth}`;
const formatPoints = (delta: number | null) =>
  delta === null ? '—' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)} pp`;

/** Rates plot on log(1 + rate), so a +400% spike and a +5% month both stay readable. */
const toLog = (rate: number) => Math.log2(1 + Math.max(rate, -0.95));

interface RateRow {
  key: string;
  age: number | null;
  gain: number | null;
  lifetime: number | null;
  current: number | null;
  median: number | null;
  own: number | null;
  peak: number | null;
  peakDate: string | null;
}

interface GainRateProps {
  history: FrontierHistory;
  dateIndex: number;
  /** Chips on screen; the history must be grouped by chip. */
  keys: readonly string[];
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  formatDate: (date: string) => string;
  onSeek: (index: number) => void;
}

/**
 * The derivative of the Software gains view: how fast each chip's same-hardware gain is
 * compounding, on a calendar or chip-age axis, with the all-chip median as the shared part.
 */
export function FrontierGainRate({
  history,
  dateIndex,
  keys,
  styles,
  formatDate,
  onSeek,
}: GainRateProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [windowDays, setWindowDays] = useState<GainRateWindow>(DEFAULT_GAIN_RATE_WINDOW);
  const [axis, setAxis] = useState<RateAxis>('date');
  const rates = useMemo(() => softwareGainRates(history, windowDays), [history, windowDays]);
  const common = useMemo(
    () => commonSoftwareGainRate(rates, history.dates.length),
    [rates, history.dates.length],
  );
  const gains = useMemo(() => softwareGains(history), [history]);
  const ages = useMemo(
    () =>
      new Map(history.series.map((series) => [series.key, daysSinceFirstRun(history, series.key)])),
    [history],
  );
  const rows = useMemo(
    (): RateRow[] =>
      keys.map((key) => {
        const list = rates.get(key) ?? [];
        const age = ages.get(key)?.[dateIndex] ?? null;
        const gain = gains.get(key)?.[dateIndex] ?? null;
        const current = list[dateIndex] ?? null;
        const median = common[dateIndex] ?? null;
        let peak: number | null = null;
        let peakDate: string | null = null;
        for (let index = 0; index <= dateIndex; index++) {
          const value = list[index];
          if (value !== null && value !== undefined && (peak === null || value > peak)) {
            peak = value;
            peakDate = history.dates[index];
          }
        }
        return {
          key,
          age,
          gain,
          lifetime: monthlyRate(gain, age),
          current,
          median,
          own: current !== null && median !== null ? current - median : null,
          peak,
          peakDate,
        };
      }),
    [keys, rates, ages, gains, common, dateIndex, history.dates],
  );

  if (keys.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.pick}</p>;

  const changeWindow = (value: string) => {
    const days = Number(value) as GainRateWindow;
    setWindowDays(days);
    track('historical_frontier_gain_rate_window', { days });
  };
  const changeAxis = (value: RateAxis) => {
    setAxis(value);
    track('historical_frontier_gain_rate_axis', { axis: value });
  };

  return (
    <div className="flex flex-col gap-6 lg:col-span-2" data-testid="frontier-gain-rate-section">
      <section className="flex flex-col gap-2">
        <div className={PANEL_HEADER_CLASS}>
          <h3 className="text-sm font-semibold">{t.title}</h3>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{t.window}</span>
              <SegmentedToggle<string>
                ariaLabel={t.window}
                testId="frontier-gain-rate-window"
                role="group"
                value={String(windowDays)}
                onValueChange={changeWindow}
                options={GAIN_RATE_WINDOWS.map((days) => ({
                  value: String(days),
                  label: t.days(days),
                  testId: `frontier-gain-rate-window-${days}`,
                }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{t.axis}</span>
              <SegmentedToggle<RateAxis>
                ariaLabel={t.axis}
                testId="frontier-gain-rate-axis"
                role="group"
                value={axis}
                onValueChange={changeAxis}
                options={[
                  { value: 'date', label: t.byDate, testId: 'frontier-gain-rate-axis-date' },
                  { value: 'age', label: t.byAge, testId: 'frontier-gain-rate-axis-age' },
                ]}
              />
            </div>
          </div>
        </div>
        <RateChart
          history={history}
          dateIndex={dateIndex}
          keys={keys}
          styles={styles}
          rates={rates}
          common={axis === 'date' ? common : null}
          ages={axis === 'age' ? ages : null}
          locale={locale}
          onSeek={onSeek}
        />
        {rows.every((row) => row.current === null) && (
          <p className="text-xs text-muted-foreground">{t.noRate}</p>
        )}
      </section>
      <GainRateTable rows={rows} styles={styles} formatDate={formatDate} />
    </div>
  );
}

/** Days on either side of a hovered chip age within which a chip's rate still counts. */
const AGE_HOVER_REACH_DAYS = 7;

function RateChart({
  history,
  dateIndex,
  keys,
  styles,
  rates,
  common,
  ages,
  locale,
  onSeek,
}: {
  history: FrontierHistory;
  dateIndex: number;
  keys: readonly string[];
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  rates: ReadonlyMap<string, readonly (number | null)[]>;
  /** The all-chip median on the calendar axis; null on the age axis. */
  common: readonly (number | null)[] | null;
  /** Days since first run per series on the age axis; null on the calendar axis. */
  ages: ReadonlyMap<string, readonly (number | null)[]> | null;
  locale: 'en' | 'zh';
  onSeek: (index: number) => void;
}) {
  const t = STRINGS[locale];
  const formatDate = useSnapshotDateFormat();
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: CHART_HEIGHT });
  const margin = { ...PANEL_MARGIN, left: 76, bottom: ages ? 44 : PANEL_MARGIN.bottom };
  const width = Math.max(0, dimensions.width - margin.left - margin.right);
  const height = dimensions.height - margin.top - margin.bottom;
  const times = history.dates.map((date) => new Date(`${date}T00:00:00Z`));

  const lines = keys.map((key) => {
    const list = rates.get(key) ?? [];
    const age = ages?.get(key) ?? [];
    return {
      key,
      points: list.flatMap((rate, index) =>
        rate === null
          ? []
          : [{ index, rate, at: ages ? (age[index] ?? null) : times[index].getTime() }],
      ),
    };
  });
  const commonPoints = common
    ? common.flatMap((rate, index) =>
        rate === null ? [] : [{ index, rate, at: times[index].getTime() }],
      )
    : [];
  const plotted = [...lines.flatMap((line) => line.points), ...commonPoints];
  const all = plotted.map((p) => toLog(p.rate));
  const lo = Math.min(0, d3.min(all) ?? 0);
  const hi = Math.max(0.5, d3.max(all) ?? 0.5);
  const y = d3.scaleLinear().domain([lo, hi]).range([height, 0]).nice();
  // Ticks at round rates, then mapped onto the log scale.
  const rateTicks = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64].filter((rate) => {
    const value = toLog(rate);
    return value >= y.domain()[0] && value <= y.domain()[1];
  });
  const maxAge = d3.max(lines.flatMap((line) => line.points.map((p) => p.at ?? 0))) ?? 1;
  // A rate needs half its window of history, so the calendar axis starts at the first rate
  // rather than leaving the opening weeks empty.
  const firstIndex = d3.min(plotted, (p) => p.index) ?? 0;
  const xDate = d3
    .scaleTime()
    .domain([times[firstIndex], times.at(-1)!])
    .range([0, width]);
  const xAge = d3
    .scaleLinear()
    .domain([0, Math.max(1, maxAge)])
    .range([0, width])
    .nice();
  const xOf = (at: number | null) => (ages ? xAge(at ?? 0) : xDate(new Date(at ?? 0)));
  const shownTimes = times.slice(firstIndex);
  const agePoints = lines.flatMap((line) => line.points.map((p) => p.at ?? 0));
  const { hover, svgProps } = usePanelHover({
    marginLeft: margin.left,
    pick: (plotX) => {
      if (!ages) return firstIndex + nearestDateIndex(shownTimes, xDate.invert(plotX).getTime());
      const age = xAge.invert(plotX);
      return d3.least(agePoints, (at) => Math.abs(at - age)) ?? null;
    },
    onSeek: ages
      ? undefined
      : (index) => {
          if (index !== dateIndex) onSeek(index);
        },
  });
  const dateTicks = xDate.ticks(panelLabelCount(width));
  const tickDays =
    dateTicks.length > 1 ? (dateTicks[1].getTime() - dateTicks[0].getTime()) / 86_400_000 : 365;
  const formatTick = d3.utcFormat(
    tickDays < 28
      ? locale === 'zh'
        ? '%-m月%-d日'
        : '%b %-d'
      : locale === 'zh'
        ? '%Y-%m'
        : '%b %y',
  );
  const line = d3
    .line<{ at: number | null; rate: number }>()
    .x((p) => xOf(p.at))
    .y((p) => y(toLog(p.rate)));
  const colorOf = (key: string) => styles.get(key)?.color ?? 'var(--muted-foreground)';
  const markers = lines.flatMap((entry) => {
    const point = entry.points.find((p) => p.index === dateIndex);
    return point ? [{ key: entry.key, point }] : [];
  });
  const hovered = hover
    ? lines.flatMap((entry) => {
        const point = ages
          ? d3.least(
              entry.points.filter((p) => Math.abs((p.at ?? 0) - hover.at) <= AGE_HOVER_REACH_DAYS),
              (p) => Math.abs((p.at ?? 0) - hover.at),
            )
          : entry.points.find((p) => p.index === hover.at);
        return point ? [{ key: entry.key, point }] : [];
      })
    : [];
  const hoveredCommon = hover && !ages ? commonPoints.find((p) => p.index === hover.at) : undefined;
  const cursorX = hover ? (ages ? xAge(hover.at) : xDate(times[hover.at])) : null;
  const showsDateCursor = !ages && dateIndex >= firstIndex;

  return (
    <div ref={setContainerRef} className="w-full" data-testid="frontier-gain-rate">
      <ul
        className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-xs font-medium text-muted-foreground"
        data-testid="frontier-gain-rate-legend"
      >
        {keys.map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: colorOf(key) }}
            />
            {styles.get(key)?.label ?? key}
          </li>
        ))}
        {commonPoints.length > 1 && (
          <li className="flex items-center gap-1.5">
            <svg aria-hidden width={18} height={4}>
              <line
                x2={18}
                y1={2}
                y2={2}
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            </svg>
            {t.common}
          </li>
        )}
        {showsDateCursor && (
          <li className="flex items-center gap-1.5">
            <svg aria-hidden width={4} height={12}>
              <line
                x1={2}
                x2={2}
                y2={12}
                stroke="var(--foreground)"
                strokeDasharray="3 3"
                opacity={0.6}
              />
            </svg>
            {t.selectedDate}
          </li>
        )}
      </ul>
      {width > 0 && (
        <svg
          {...svgProps}
          width={dimensions.width}
          height={dimensions.height}
          role="img"
          aria-label={`${t.title}. ${ages ? t.hoverHint : t.seekHint}`}
          className={ages ? 'touch-none' : 'cursor-pointer touch-none'}
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {rateTicks.map((rate) => (
              <g key={rate} transform={`translate(0,${y(toLog(rate))})`}>
                <line
                  x2={width}
                  stroke={rate === 0 ? 'var(--border)' : 'var(--chart-grid)'}
                  strokeWidth={rate === 0 ? 1.5 : 1}
                />
                <text
                  x={-8}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={px(CHART_TYPE.axisLabelSub)}
                  fill="var(--muted-foreground)"
                >
                  {`${rate > 0 ? '+' : ''}${d3.format('~%')(rate)}`}
                </text>
              </g>
            ))}
            <text
              transform={`translate(${-margin.left + 14},${height / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={px(CHART_TYPE.axisLabel)}
              fill="var(--muted-foreground)"
            >
              {t.yAxis}
            </text>
            {ages
              ? xAge.ticks(panelLabelCount(width)).map((tick) => (
                  <text
                    key={tick}
                    x={xAge(tick)}
                    y={height + 18}
                    textAnchor="middle"
                    fontSize={px(CHART_TYPE.axisLabelSub)}
                    fill="var(--muted-foreground)"
                  >
                    {tick}
                  </text>
                ))
              : dateTicks.map((tick) => (
                  <text
                    key={tick.toISOString()}
                    x={xDate(tick)}
                    y={height + 18}
                    textAnchor="middle"
                    fontSize={px(CHART_TYPE.axisLabelSub)}
                    fill="var(--muted-foreground)"
                  >
                    {formatTick(tick)}
                  </text>
                ))}
            {ages && (
              <text
                x={width / 2}
                y={height + 36}
                textAnchor="middle"
                fontSize={px(CHART_TYPE.axisLabelSub)}
                fill="var(--muted-foreground)"
              >
                {t.ageLabel}
              </text>
            )}
            {commonPoints.length > 1 && (
              <path
                d={line(commonPoints) ?? ''}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                strokeDasharray="5 4"
                data-testid="frontier-gain-rate-common"
              />
            )}
            {lines.map((entry) => (
              <path
                key={entry.key}
                d={line(entry.points) ?? ''}
                fill="none"
                stroke={colorOf(entry.key)}
                strokeWidth={2}
              />
            ))}
            {showsDateCursor && (
              <line
                x1={xDate(times[dateIndex])}
                x2={xDate(times[dateIndex])}
                y2={height}
                stroke="var(--foreground)"
                strokeDasharray="3 3"
                opacity={0.6}
              />
            )}
            {cursorX !== null && (
              <line
                x1={cursorX}
                x2={cursorX}
                y2={height}
                stroke="var(--muted-foreground)"
                opacity={0.5}
                pointerEvents="none"
                data-testid="frontier-gain-rate-cursor"
              />
            )}
            {[
              ...markers.map((marker) => ({ ...marker, id: `now:${marker.key}` })),
              ...hovered.map((marker) => ({ ...marker, id: `hover:${marker.key}` })),
            ].map(({ id, key, point }) => (
              <circle
                key={id}
                cx={xOf(point.at)}
                cy={y(toLog(point.rate))}
                r={4}
                fill={colorOf(key)}
                stroke="var(--background)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            ))}
            {hoveredCommon && (
              <circle
                cx={xOf(hoveredCommon.at)}
                cy={y(toLog(hoveredCommon.rate))}
                r={3.5}
                fill="var(--muted-foreground)"
                stroke="var(--background)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
      )}
      {hover && (
        <PanelHoverCard
          hover={hover}
          title={ages ? t.day(hover.at) : formatDate(history.dates[hover.at])}
          metrics={[
            ...hovered
              .toSorted((a, b) => b.point.rate - a.point.rate)
              .map(({ key, point }) => ({
                value: formatRate(point.rate, t.perMonth),
                label: styles.get(key)?.label ?? key,
                color: colorOf(key),
              })),
            ...(hoveredCommon
              ? [{ value: formatRate(hoveredCommon.rate, t.perMonth), label: t.common }]
              : []),
          ]}
          testId="frontier-gain-rate-hover-card"
        />
      )}
    </div>
  );
}

function GainRateTable({
  rows,
  styles,
  formatDate,
}: {
  rows: readonly RateRow[];
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  formatDate: (date: string) => string;
}) {
  const t = STRINGS[useLocale()];
  const columns = useMemo((): DataTableColumn<RateRow>[] => {
    const label = (key: string) => styles.get(key)?.label ?? key;
    const rate = (value: number | null) => formatRate(value, t.perMonth);
    const num = (value: number | null) => value ?? Number.NEGATIVE_INFINITY;
    return [
      {
        header: t.chip,
        importance: 'key',
        pinned: true,
        sortValue: (row) => label(row.key),
        cell: (row) => (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: styles.get(row.key)?.color ?? 'var(--muted-foreground)' }}
            />
            {label(row.key)}
          </span>
        ),
      },
      {
        header: t.age,
        align: 'right',
        importance: 'secondary',
        sortValue: (row) => num(row.age),
        cell: (row) => (row.age === null ? '—' : `${row.age}`),
      },
      {
        header: t.gain,
        align: 'right',
        importance: 'key',
        sortValue: (row) => num(row.gain),
        cell: (row) => (row.gain === null ? '—' : formatRatio(row.gain)),
      },
      {
        header: t.lifetime,
        align: 'right',
        importance: 'key',
        sortValue: (row) => num(row.lifetime),
        cell: (row) => rate(row.lifetime),
      },
      {
        header: t.current,
        align: 'right',
        importance: 'key',
        sortValue: (row) => num(row.current),
        cell: (row) => <span className="font-semibold">{rate(row.current)}</span>,
      },
      {
        header: t.median,
        align: 'right',
        importance: 'key',
        sortValue: (row) => num(row.median),
        cell: (row) => rate(row.median),
      },
      {
        header: t.own,
        align: 'right',
        importance: 'key',
        sortValue: (row) => num(row.own),
        cell: (row) => formatPoints(row.own),
      },
      {
        header: t.peak,
        align: 'right',
        importance: 'key',
        sortValue: (row) => num(row.peak),
        cell: (row) => rate(row.peak),
      },
      {
        header: t.peakDate,
        importance: 'secondary',
        sortValue: (row) => row.peakDate ?? '',
        cell: (row) => (
          <span className="whitespace-nowrap">{row.peakDate ? formatDate(row.peakDate) : '—'}</span>
        ),
      },
    ];
  }, [t, styles, formatDate]);

  return (
    <section className="flex flex-col gap-2">
      <div className={PANEL_HEADER_CLASS}>
        <h3 className="text-sm font-semibold">{t.tableTitle}</h3>
      </div>
      <DataTable
        data={[...rows]}
        columns={columns}
        testId="frontier-gain-rate-table"
        analyticsPrefix="historical_frontier_gain_rate_table"
        searchable={rows.length > SHORT_TABLE_ROWS}
        columnPresets={rows.length > SHORT_TABLE_ROWS}
      />
    </section>
  );
}
