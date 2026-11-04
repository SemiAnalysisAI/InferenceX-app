'use client';

import * as d3 from 'd3';
import React, { useMemo } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/i18n/use-locale';

import { IndexedTimeline } from './FrontierIndexedTimeline';
import {
  labeledBuckets,
  PANEL_HEADER_CLASS,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_SECTION_CLASS,
} from './frontier-panel-layout';
import type { FrontierSeriesStyle } from './FrontierChart';
import {
  comparisonBuckets,
  FRONTIER_COMPARISON_BUCKETS,
  softwareGainBarMaxLog,
  softwareGainByInteractivity,
  softwareGains,
  type FrontierHistory,
} from './frontier-history-core';

const STRINGS = {
  en: {
    gainTitle: 'Software gain on the same chip',
    gainHelp:
      "Each chip's frontier area against its own first run (1x). The hardware never changes, so every step up is software, serving configuration or precision.",
    gain: (name: string, ratio: string, date: string) =>
      `${name}: ${ratio} the ground of its first run (${date})`,
    barsTitle: 'Gain at each interactivity vs first run',
    barsHelp: 'How much more each chip delivers now than on its first run, at the same speed.',
    na: 'NA',
    noData: (name: string) => `${name} does not reach this interactivity on both dates`,
    pick: 'Pick at least one chip.',
  },
  zh: {
    gainTitle: '同一芯片上的软件提升',
    gainHelp:
      '各芯片的前沿覆盖面积相对其首次测试（1x）的倍数。硬件始终不变，每一次提升都来自软件、部署配置或精度。',
    gain: (name: string, ratio: string, date: string) =>
      `${name}：覆盖面积为首次测试（${date}）的 ${ratio}`,
    barsTitle: '各交互性水平上相对首次测试的提升',
    barsHelp: '在相同交互性下，各芯片当前比首次测试多交付多少。',
    na: '无数据',
    noData: (name: string) => `${name} 在两个日期中未同时覆盖该交互性`,
    pick: '请至少选择一款芯片。',
  },
} as const;

const formatRatio = (ratio: number) =>
  ratio >= 10 ? `${ratio.toFixed(0)}x` : `${ratio.toFixed(ratio >= 2 ? 1 : 2)}x`;

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
        <p className="text-xs text-muted-foreground">{t.gainHelp}</p>
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
  const maxLog = useMemo(
    () => softwareGainBarMaxLog(history, keys, buckets),
    [history, keys, buckets],
  );

  if (keys.length === 0) return null;
  const rows = keys.map((key) => ({
    key,
    gains: softwareGainByInteractivity(history, key, dateIndex, buckets),
  }));
  const width = Math.max(0, dimensions.width - PANEL_MARGIN.left - PANEL_MARGIN.right);
  const height = dimensions.height - PANEL_MARGIN.top - PANEL_MARGIN.bottom;
  const x = d3.scaleBand<number>().domain(buckets).range([0, width]).paddingInner(0.25);
  const inner = d3.scaleBand<string>().domain(keys).range([0, x.bandwidth()]).paddingInner(0.1);
  const y = d3.scaleLinear().domain([-maxLog, maxLog]).range([height, 0]);
  const ticks = d3.range(Math.ceil(y.domain()[0]), Math.floor(maxLog) + 1);
  const label = (key: string) => styles.get(key)?.label ?? key;

  return (
    <section className={PANEL_SECTION_CLASS}>
      <div className={PANEL_HEADER_CLASS}>
        <h3 className="text-sm font-semibold">{t.barsTitle}</h3>
        <p className="text-xs text-muted-foreground">{t.barsHelp}</p>
      </div>
      <div ref={setContainerRef} className="w-full" data-testid="frontier-software-bars">
        {width > 0 && (
          <svg width={dimensions.width} height={dimensions.height} role="img">
            <title>{t.barsTitle}</title>
            <g transform={`translate(${PANEL_MARGIN.left},${PANEL_MARGIN.top})`}>
              {ticks.map((tick) => (
                <g key={tick} transform={`translate(0,${y(tick)})`}>
                  <line x2={width} stroke="var(--border)" strokeWidth={tick === 0 ? 1.5 : 1} />
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
                  const color = styles.get(row.key)?.color ?? 'var(--muted-foreground)';
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
                        <title>{t.noData(label(row.key))}</title>
                        {keys.length === 1 ? t.na : '·'}
                      </text>
                    );
                  const value = Math.max(-maxLog, Math.min(maxLog, Math.log2(gain.ratio)));
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
                    >
                      <title>
                        {`${label(row.key)} · ${Math.round(gain.x)} ${xLabel} · ${formatRatio(gain.ratio)}`}
                      </title>
                    </rect>
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
      </div>
    </section>
  );
}
