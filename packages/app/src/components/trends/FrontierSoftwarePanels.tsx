'use client';

import * as d3 from 'd3';
import React, { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/i18n/use-locale';

import { IndexedTimeline, PanelHoverCard, usePanelHover } from './FrontierIndexedTimeline';
import {
  bandIndexAt,
  formatRatio,
  labeledBuckets,
  PANEL_HEADER_CLASS,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_SECTION_CLASS,
  SHORT_TABLE_ROWS,
} from './frontier-panel-layout';
import type { FrontierSeriesStyle } from './FrontierChart';
import {
  averageSoftwareGain,
  comparisonBuckets,
  FRONTIER_COMPARISON_BUCKETS,
  softwareGainBarExtent,
  softwareGainByInteractivity,
  softwareGains,
  type FrontierHistory,
} from './frontier-history-core';

const STRINGS = {
  en: {
    gainTitle: 'Software gain on the same chip',
    gain: (name: string, ratio: string, date: string) =>
      `${name}: ${ratio} the ground of its first run (${date})`,
    barsTitle: 'Gain at each interactivity vs first run',
    vsFirst: 'vs first run',
    na: 'NA',
    noData: (name: string) => `${name} does not reach this interactivity on both dates`,
    pick: 'Pick at least one chip.',
    tableTitle: 'Gain by interactivity',
    chip: 'Chip',
    since: 'First run',
    average: 'Average',
  },
  zh: {
    gainTitle: '同一芯片上的软件提升',
    gain: (name: string, ratio: string, date: string) =>
      `${name}：覆盖面积为首次测试（${date}）的 ${ratio}`,
    barsTitle: '各交互性水平上相对首次测试的提升',
    vsFirst: '相对首次测试',
    na: '无数据',
    noData: (name: string) => `${name} 在两个日期中未同时覆盖该交互性`,
    pick: '请至少选择一款芯片。',
    tableTitle: '各交互性水平上的提升',
    chip: '芯片',
    since: '首次测试',
    average: '平均',
  },
} as const;

interface SoftwareProps {
  history: FrontierHistory;
  dateIndex: number;
  /** Chips on screen; the history must be grouped by chip. */
  keys: readonly string[];
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  xLabel: string;
  formatDate: (date: string) => string;
  onSeek: (index: number) => void;
}

/** Same-hardware software gain per chip over time, indexed to each chip's first run. */
export function FrontierSoftwareGain({
  history,
  dateIndex,
  keys,
  styles,
  formatDate,
  onSeek,
}: Omit<SoftwareProps, 'xLabel'>) {
  const t = STRINGS[useLocale()];
  const gains = useMemo(() => softwareGains(history), [history]);
  const values = useMemo(
    () => new Map(keys.map((key) => [key, gains.get(key) ?? []])),
    [gains, keys],
  );
  const firstDate = (key: string) =>
    history.series.find((series) => series.key === key)?.firstDate ?? history.dates[0];
  const now = keys
    .map((key) => ({ key, gain: gains.get(key)?.[dateIndex] ?? null }))
    .filter((entry): entry is { key: string; gain: number } => entry.gain !== null)
    .toSorted((a, b) => b.gain - a.gain);

  if (keys.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.pick}</p>;
  return (
    <section className={PANEL_SECTION_CLASS}>
      <div className={PANEL_HEADER_CLASS}>
        <h3 className="text-sm font-semibold">{t.gainTitle}</h3>
      </div>
      {/* The list sits under the chart, so this chart starts level with its neighbour. */}
      <div className="flex flex-col gap-2">
        <IndexedTimeline
          dates={history.dates}
          dateIndex={dateIndex}
          values={values}
          styles={styles}
          title={t.gainTitle}
          testId="frontier-software-gain"
          onSeek={onSeek}
        />
        <ul className="flex flex-col gap-0.5 px-1 text-sm">
          {now.map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: styles.get(entry.key)?.color }}
              />
              <span className="font-medium">
                {t.gain(
                  styles.get(entry.key)?.label ?? entry.key,
                  formatRatio(entry.gain),
                  formatDate(firstDate(entry.key)),
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Each chip's current frontier over its first-run frontier at each interactivity bucket. */
export function FrontierSoftwareGainBars({
  history,
  dateIndex,
  keys,
  styles,
  xLabel,
}: Omit<SoftwareProps, 'formatDate' | 'onSeek'>) {
  const t = STRINGS[useLocale()];
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: PANEL_HEIGHT });
  const buckets = useMemo(() => comparisonBuckets(history, FRONTIER_COMPARISON_BUCKETS), [history]);
  // Fixed scale across every date so playback never clips an earlier peak.
  const { min: minLog, max: maxLog } = useMemo(
    () => softwareGainBarExtent(history, keys, buckets),
    [history, keys, buckets],
  );
  const width = Math.max(0, dimensions.width - PANEL_MARGIN.left - PANEL_MARGIN.right);
  const height = dimensions.height - PANEL_MARGIN.top - PANEL_MARGIN.bottom;
  const x = d3.scaleBand<number>().domain(buckets).range([0, width]).paddingInner(0.25);
  const { hover, svgProps } = usePanelHover({
    marginLeft: PANEL_MARGIN.left,
    pick: (plotX) => bandIndexAt(x.step(), x.paddingInner(), buckets.length, plotX),
  });

  if (keys.length === 0) return null;
  const rows = keys.map((key) => ({
    key,
    gains: softwareGainByInteractivity(history, key, dateIndex, buckets),
  }));
  const inner = d3.scaleBand<string>().domain(keys).range([0, x.bandwidth()]).paddingInner(0.1);
  const y = d3.scaleLinear().domain([minLog, maxLog]).range([height, 0]);
  const ticks = d3.range(minLog, Math.floor(maxLog) + 1);
  const label = (key: string) => styles.get(key)?.label ?? key;
  const colorOf = (key: string) => styles.get(key)?.color ?? 'var(--muted-foreground)';
  const hoveredBucket = hover ? buckets[hover.at] : undefined;

  return (
    <section className={PANEL_SECTION_CLASS}>
      <div className={PANEL_HEADER_CLASS}>
        <h3 className="text-sm font-semibold">{t.barsTitle}</h3>
      </div>
      <div ref={setContainerRef} className="w-full" data-testid="frontier-software-bars">
        {width > 0 && (
          <svg
            {...svgProps}
            width={dimensions.width}
            height={dimensions.height}
            role="img"
            aria-label={t.barsTitle}
            className="touch-none"
          >
            <g transform={`translate(${PANEL_MARGIN.left},${PANEL_MARGIN.top})`}>
              {hoveredBucket !== undefined && (
                <rect
                  x={(x(hoveredBucket) ?? 0) - (x.step() * x.paddingInner()) / 2}
                  width={x.step()}
                  height={height}
                  fill="var(--muted-foreground)"
                  opacity={0.1}
                  pointerEvents="none"
                  data-testid="frontier-software-bars-band"
                />
              )}
              {ticks.map((tick) => (
                <g key={tick} transform={`translate(0,${y(tick)})`}>
                  <line
                    x2={width}
                    stroke={tick === 0 ? 'var(--border)' : 'var(--chart-grid)'}
                    strokeWidth={tick === 0 ? 1.5 : 1}
                  />
                  <text
                    x={-8}
                    dy="0.32em"
                    textAnchor="end"
                    fontSize={px(CHART_TYPE.axisLabelSub)}
                    fill="var(--muted-foreground)"
                  >
                    {`${d3.format('~g')(2 ** tick)}x`}
                  </text>
                </g>
              ))}
              {rows.flatMap((row) =>
                row.gains.map((gain) => {
                  const left = (x(gain.x) ?? 0) + (inner(row.key) ?? 0);
                  const color = colorOf(row.key);
                  if (gain.ratio === null)
                    return (
                      <text
                        key={`${row.key}:${gain.x}`}
                        x={left + inner.bandwidth() / 2}
                        y={y(0) - 4}
                        textAnchor="middle"
                        fontSize={px(CHART_TYPE.micro)}
                        fill={color}
                        opacity={0.7}
                      >
                        {keys.length === 1 ? t.na : '·'}
                      </text>
                    );
                  const value = Math.max(minLog, Math.min(maxLog, Math.log2(gain.ratio)));
                  const top = y(Math.max(0, value));
                  return (
                    <rect
                      key={`${row.key}:${gain.x}`}
                      x={left}
                      y={top}
                      width={inner.bandwidth()}
                      height={Math.max(1, y(Math.min(0, value)) - top)}
                      rx={2}
                      fill={color}
                      opacity={0.9}
                    />
                  );
                }),
              )}
              {labeledBuckets(buckets, width).map((bucket) => (
                <text
                  key={bucket}
                  x={(x(bucket) ?? 0) + x.bandwidth() / 2}
                  y={height + 16}
                  textAnchor="middle"
                  fontSize={px(CHART_TYPE.axisLabelSub)}
                  fill="var(--muted-foreground)"
                >
                  {Math.round(bucket)}
                </text>
              ))}
              <text
                x={width / 2}
                y={height + 32}
                textAnchor="middle"
                fontSize={px(CHART_TYPE.axisLabel)}
                fill="var(--muted-foreground)"
              >
                {xLabel}
              </text>
            </g>
          </svg>
        )}
        {hover && hoveredBucket !== undefined && (
          <PanelHoverCard
            hover={hover}
            title={`${Math.round(hoveredBucket)} ${xLabel}`}
            subtitle={t.vsFirst}
            metrics={rows.map((row) => {
              const ratio = row.gains[hover.at]?.ratio ?? null;
              return {
                value: ratio === null ? t.na : formatRatio(ratio),
                label: ratio === null ? t.noData(label(row.key)) : label(row.key),
                color: colorOf(row.key),
              };
            })}
            testId="frontier-software-bars-hover-card"
          />
        )}
      </div>
    </section>
  );
}

interface GainTableRow {
  key: string;
  gains: { x: number; ratio: number | null }[];
  average: number | null;
}

/** The bars as a table: one row per selected chip, one column per interactivity bucket. */
export function FrontierSoftwareGainTable({
  history,
  dateIndex,
  keys,
  styles,
  formatDate,
}: Omit<SoftwareProps, 'onSeek' | 'xLabel'>) {
  const t = STRINGS[useLocale()];
  const buckets = useMemo(() => comparisonBuckets(history, FRONTIER_COMPARISON_BUCKETS), [history]);
  const rows = useMemo(
    (): GainTableRow[] =>
      keys.map((key) => {
        const gains = softwareGainByInteractivity(history, key, dateIndex, buckets);
        return { key, gains, average: averageSoftwareGain(gains) };
      }),
    [history, dateIndex, keys, buckets],
  );
  const columns = useMemo((): DataTableColumn<GainTableRow>[] => {
    const label = (key: string) => styles.get(key)?.label ?? key;
    const firstDate = (key: string) =>
      history.series.find((series) => series.key === key)?.firstDate ?? history.dates[0];
    const ratioCell = (ratio: number | null) => (ratio === null ? '—' : formatRatio(ratio));
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
        header: t.since,
        importance: 'secondary',
        sortValue: (row) => firstDate(row.key),
        cell: (row) => <span className="whitespace-nowrap">{formatDate(firstDate(row.key))}</span>,
      },
      ...buckets.map((bucket, index): DataTableColumn<GainTableRow> => ({
        header: `${Math.round(bucket)}`,
        align: 'right',
        importance: 'key',
        sortValue: (row) => row.gains[index]?.ratio ?? -1,
        cell: (row) => ratioCell(row.gains[index]?.ratio ?? null),
      })),
      {
        header: t.average,
        align: 'right',
        importance: 'key',
        sortValue: (row) => row.average ?? -1,
        cell: (row) => <span className="font-semibold">{ratioCell(row.average)}</span>,
      },
    ];
  }, [t, styles, history, buckets, formatDate]);

  if (keys.length === 0) return null;
  return (
    <section className={`${PANEL_SECTION_CLASS} min-w-0 pt-4 lg:col-span-2`}>
      <div className={PANEL_HEADER_CLASS}>
        <h3 className="text-sm font-semibold">{t.tableTitle}</h3>
      </div>
      <DataTable
        data={rows}
        columns={columns}
        testId="frontier-software-table"
        analyticsPrefix="historical_frontier_software_table"
        searchable={rows.length > SHORT_TABLE_ROWS}
        columnPresets={rows.length > SHORT_TABLE_ROWS}
      />
    </section>
  );
}
