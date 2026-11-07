'use client';

import * as d3 from 'd3';
import React, { useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { track } from '@/lib/analytics/analytics';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/i18n/use-locale';

import { PANEL_HEADER_CLASS, PANEL_MARGIN, panelLabelCount } from './frontier-panel-layout';
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
    help: (days: number) =>
      `How fast each chip's software gain is growing: its compounded change per month over the trailing ${days} days. A line falling toward 0% means that chip's software gains are saturating.`,
    window: 'Window',
    days: (days: number) => `${days}d`,
    axis: 'X axis',
    byDate: 'Date',
    byAge: 'Days since first run',
    ageLabel: 'Days since first run',
    common: 'All-chip median',
    commonHelp:
      'Dashed: the median rate across every chip on the chart. Gains every chip gets at once (a framework release, a shared kernel) move it; a chip far above or below it is improving for its own reasons.',
    ageHelp:
      'Each chip from its own first run, so chips launched at different times line up by age. The all-chip median is a calendar measure and is hidden here.',
    pick: 'Pick at least one chip.',
    noRate: 'Not enough history yet: a rate needs at least half the window.',
    tableTitle: 'Gain rate by chip',
    tableHelp:
      'Rates are compounded per month. Chip-specific is the chip minus the all-chip median on the same date: a first split between optimisations every chip gets and ones only this chip gets.',
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
    help: (days: number) =>
      `各芯片软件提升的增长速度：过去 ${days} 天内按月复合计算的变化。曲线向 0% 回落，说明该芯片的软件提升正趋于饱和。`,
    window: '窗口',
    days: (days: number) => `${days} 天`,
    axis: 'X 轴',
    byDate: '日期',
    byAge: '距首次测试天数',
    ageLabel: '距首次测试天数',
    common: '全部芯片中位数',
    commonHelp:
      '虚线：图中全部芯片提升速度的中位数。所有芯片同时获得的提升（框架版本更新、通用 kernel）会推动它；明显高于或低于它的芯片，提升来自自身原因。',
    ageHelp:
      '每款芯片都从自身首次测试算起，不同时间发布的芯片按“年龄”对齐。全部芯片中位数按日历计算，此视图中隐藏。',
    pick: '请至少选择一款芯片。',
    noRate: '历史数据不足：计算速度至少需要半个窗口的数据。',
    tableTitle: '各芯片的提升速度',
    tableHelp:
      '速度均按月复合计算。芯片特有 = 该芯片速度减去同日全部芯片中位数，用于初步区分所有芯片共享的优化与该芯片独有的优化。',
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
const formatRatio = (ratio: number | null) =>
  ratio === null
    ? '—'
    : ratio >= 10
      ? `${ratio.toFixed(0)}x`
      : `${ratio.toFixed(ratio >= 2 ? 1 : 2)}x`;

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
          <p className="text-xs text-muted-foreground">{t.help(windowDays)}</p>
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
          title={t.title}
          ageLabel={t.ageLabel}
          locale={locale}
          onSeek={onSeek}
        />
        <p className="text-xs text-muted-foreground">
          {axis === 'date' ? t.commonHelp : t.ageHelp}
        </p>
        {rows.every((row) => row.current === null) && (
          <p className="text-xs text-muted-foreground">{t.noRate}</p>
        )}
      </section>
      <GainRateTable rows={rows} styles={styles} formatDate={formatDate} />
    </div>
  );
}

function RateChart({
  history,
  dateIndex,
  keys,
  styles,
  rates,
  common,
  ages,
  title,
  ageLabel,
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
  title: string;
  ageLabel: string;
  locale: 'en' | 'zh';
  onSeek: (index: number) => void;
}) {
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: CHART_HEIGHT });
  const margin = { ...PANEL_MARGIN, left: 64, bottom: ages ? 44 : PANEL_MARGIN.bottom };
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
  const all = [...lines.flatMap((line) => line.points), ...commonPoints].map((p) => toLog(p.rate));
  const lo = Math.min(0, d3.min(all) ?? 0);
  const hi = Math.max(0.5, d3.max(all) ?? 0.5);
  const y = d3.scaleLinear().domain([lo, hi]).range([height, 0]).nice();
  // Ticks at round rates, then mapped onto the log scale.
  const rateTicks = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64].filter((rate) => {
    const value = toLog(rate);
    return value >= y.domain()[0] && value <= y.domain()[1];
  });
  const maxAge = d3.max(lines.flatMap((line) => line.points.map((p) => p.at ?? 0))) ?? 1;
  const xDate = d3
    .scaleTime()
    .domain([times[0], times.at(-1)!])
    .range([0, width]);
  const xAge = d3
    .scaleLinear()
    .domain([0, Math.max(1, maxAge)])
    .range([0, width])
    .nice();
  const xOf = (at: number | null) => (ages ? xAge(at ?? 0) : xDate(new Date(at ?? 0)));
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
  const seekTo = (event: React.PointerEvent<SVGSVGElement>) => {
    if (ages) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = xDate.invert(event.clientX - bounds.left - margin.left).getTime();
    const after = Math.min(times.length - 1, d3.bisectLeft(times, new Date(time)));
    const before = Math.max(0, after - 1);
    const nearest =
      Math.abs(times[after].getTime() - time) < Math.abs(times[before].getTime() - time)
        ? after
        : before;
    if (nearest !== dateIndex) onSeek(nearest);
  };
  const markers = lines.flatMap((entry) => {
    const point = entry.points.find((p) => p.index === dateIndex);
    return point ? [{ key: entry.key, point }] : [];
  });

  return (
    <div ref={setContainerRef} className="w-full" data-testid="frontier-gain-rate">
      {width > 0 && (
        <svg
          width={dimensions.width}
          height={dimensions.height}
          role="img"
          className={ages ? undefined : 'cursor-pointer touch-none'}
          onPointerDown={(event) => {
            if (ages) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            seekTo(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons > 0) seekTo(event);
          }}
        >
          <title>{title}</title>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {rateTicks.map((rate) => (
              <g key={rate} transform={`translate(0,${y(toLog(rate))})`}>
                <line x2={width} stroke="var(--border)" strokeWidth={rate === 0 ? 1.5 : 1} />
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
                {ageLabel}
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
                stroke={styles.get(entry.key)?.color ?? 'var(--muted-foreground)'}
                strokeWidth={2}
              />
            ))}
            {!ages && (
              <line
                x1={xDate(times[dateIndex])}
                x2={xDate(times[dateIndex])}
                y2={height}
                stroke="var(--foreground)"
                strokeDasharray="3 3"
                opacity={0.6}
              />
            )}
            {markers.map(({ key, point }) => (
              <circle
                key={key}
                cx={xOf(point.at)}
                cy={y(toLog(point.rate))}
                r={4}
                fill={styles.get(key)?.color ?? 'var(--muted-foreground)'}
                stroke="var(--background)"
                strokeWidth={1.5}
              />
            ))}
          </g>
        </svg>
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
        cell: (row) => formatRatio(row.gain),
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
        <p className="text-xs text-muted-foreground">{t.tableHelp}</p>
      </div>
      <DataTable
        data={[...rows]}
        columns={columns}
        testId="frontier-gain-rate-table"
        analyticsPrefix="historical_frontier_gain_rate_table"
      />
    </section>
  );
}
