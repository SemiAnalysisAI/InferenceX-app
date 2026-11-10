'use client';

import * as d3 from 'd3';
import React, { useMemo } from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  IndexedTimeline,
  PanelHoverCard,
  usePanelHover,
  useSnapshotDateFormat,
} from './FrontierIndexedTimeline';
import {
  bandIndexAt,
  formatRatio,
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
  frontierAreas,
  leadMargins,
  type FrontierHistory,
  type LeadMargin,
} from './frontier-history-core';

const STRINGS = {
  en: {
    barsTitle: 'Lead at each interactivity',
    barsTwo: (a: string, b: string) => `Bars above the line: ${a} ahead. Below: ${b} ahead.`,
    barsMany: 'Bar height is how far the leader is ahead of the next best.',
    na: 'NA',
    noData: (name: string) => `no data for ${name}`,
    ahead: (name: string) => `${name} ahead`,
    over: (leader: string, runnerUp: string) => `${leader} ahead of ${runnerUp}`,
    onlyOne: (name: string) => `only ${name} reaches this interactivity`,
    noneReach: 'None of the compared series reach this interactivity',
    even: 'even',
    needTwo: 'Pick at least two to compare.',
    areaTitle: 'Ground covered over time',
    leads: (leader: string, ratio: string, runnerUp: string) =>
      `${leader} covers ${ratio} the ground of ${runnerUp}`,
    was: (ratio: string, date: string) => `, from ${ratio} on ${date}`,
  },
  zh: {
    barsTitle: '各交互性水平上的领先幅度',
    barsTwo: (a: string, b: string) => `横线以上为 ${a} 领先，以下为 ${b} 领先。`,
    barsMany: '柱高表示领先者超出第二名的幅度。',
    na: '无数据',
    noData: (name: string) => `${name} 无数据`,
    ahead: (name: string) => `${name} 领先`,
    over: (leader: string, runnerUp: string) => `${leader} 领先 ${runnerUp}`,
    onlyOne: (name: string) => `仅 ${name} 达到该交互性`,
    noneReach: '所比较的系列均未达到该交互性',
    even: '持平',
    needTwo: '请至少选择两项进行比较。',
    areaTitle: '前沿覆盖面积随时间的变化',
    leads: (leader: string, ratio: string, runnerUp: string) =>
      `${leader} 的覆盖面积是 ${runnerUp} 的 ${ratio}`,
    was: (ratio: string, date: string) => `（${date} 时为 ${ratio}）`,
  },
} as const;

interface PanelProps {
  history: FrontierHistory;
  dateIndex: number;
  /** Compared series in display order; with two, the first reads as "ahead" above the line. */
  keys: readonly string[];
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  xLabel: string;
}

/** Leader-over-runner-up margin at each interactivity bucket on the current date. */
export function FrontierLeadBars({ history, dateIndex, keys, styles, xLabel }: PanelProps) {
  const t = STRINGS[useLocale()];
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: PANEL_HEIGHT });
  const buckets = useMemo(() => comparisonBuckets(history, FRONTIER_COMPARISON_BUCKETS), [history]);
  const diverging = keys.length === 2;
  const label = (key: string) => styles.get(key)?.label ?? key;
  // Fixed scale across every date so bars move instead of the axis rescaling.
  const maxLog = useMemo(() => {
    let max = 1;
    for (let index = 0; index < history.dates.length; index++)
      for (const m of leadMargins(history, index, keys, buckets))
        if (m.ratio !== null) max = Math.max(max, Math.log2(m.ratio));
    return Math.min(max, 6);
  }, [history, keys, buckets]);

  const width = Math.max(0, dimensions.width - PANEL_MARGIN.left - PANEL_MARGIN.right);
  const height = dimensions.height - PANEL_MARGIN.top - PANEL_MARGIN.bottom;
  const x = d3.scaleBand<number>().domain(buckets).range([0, width]).paddingInner(0.25);
  const { hover, svgProps } = usePanelHover({
    marginLeft: PANEL_MARGIN.left,
    pick: (plotX) => bandIndexAt(x.step(), x.paddingInner(), buckets.length, plotX),
  });

  if (keys.length < 2)
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.needTwo}</p>;

  const margins = leadMargins(history, dateIndex, keys, buckets);
  const y = d3
    .scaleLinear()
    .domain(diverging ? [-maxLog, maxLog] : [0, maxLog])
    .range([height, 0]);
  const ticks = d3.range(diverging ? -Math.floor(maxLog) : 0, Math.floor(maxLog) + 1);
  const colorOf = (key: string) => styles.get(key)?.color ?? 'var(--muted-foreground)';
  const missingOf = (m: LeadMargin) =>
    diverging ? (keys.find((key) => key !== m.leader) ?? null) : null;
  const hovered = hover ? margins[hover.at] : undefined;
  const hoverMetric = (m: LeadMargin) => {
    if (!m.leader) return { value: t.na, label: t.noneReach };
    if (m.ratio === null) {
      const missing = missingOf(m);
      return {
        value: t.na,
        label: missing ? t.noData(label(missing)) : t.onlyOne(label(m.leader)),
        color: colorOf(missing ?? m.leader),
      };
    }
    return {
      value: formatRatio(m.ratio),
      label: t.over(label(m.leader), label(m.runnerUp!)),
      color: colorOf(m.leader),
    };
  };

  return (
    <section className={PANEL_SECTION_CLASS}>
      <div className={PANEL_HEADER_CLASS}>
        <h3 className="text-sm font-semibold">{t.barsTitle}</h3>
        <p className="text-xs text-muted-foreground">
          {diverging ? t.barsTwo(label(keys[0]), label(keys[1])) : t.barsMany}
        </p>
      </div>
      <div ref={setContainerRef} className="w-full" data-testid="frontier-lead-bars">
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
              {hovered && (
                <rect
                  x={(x(hovered.x) ?? 0) - (x.step() * x.paddingInner()) / 2}
                  width={x.step()}
                  height={height}
                  fill="var(--muted-foreground)"
                  opacity={0.1}
                  pointerEvents="none"
                  data-testid="frontier-lead-bars-band"
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
                    {tick === 0 ? t.even : `${2 ** Math.abs(tick)}x`}
                  </text>
                </g>
              ))}
              {diverging &&
                (
                  [
                    { key: keys[0], y: 12, arrow: '▲' },
                    { key: keys[1], y: height - 6, arrow: '▼' },
                  ] as const
                ).map((side) => (
                  <text
                    key={side.key}
                    x={4}
                    y={side.y}
                    fontSize={px(CHART_TYPE.annotation)}
                    fontWeight={600}
                    fill={colorOf(side.key)}
                  >
                    {`${side.arrow} ${t.ahead(label(side.key))}`}
                  </text>
                ))}
              {margins.map((m) => {
                if (!m.leader) return null;
                const bandX = x(m.x) ?? 0;
                const center = bandX + x.bandwidth() / 2;
                // Only one series reaches this interactivity: no bar, just NA for the other.
                if (m.ratio === null) {
                  const missing = missingOf(m);
                  const below = diverging && missing === keys[1];
                  return (
                    <text
                      key={m.x}
                      x={center}
                      y={below ? y(0) + 14 : y(0) - 6}
                      textAnchor="middle"
                      fontSize={px(CHART_TYPE.micro)}
                      fontWeight={600}
                      fill={missing ? colorOf(missing) : 'var(--muted-foreground)'}
                    >
                      {t.na}
                    </text>
                  );
                }
                const sign = diverging && m.leader === keys[1] ? -1 : 1;
                const value = Math.min(Math.log2(m.ratio), maxLog);
                const top = y(Math.max(0, sign * value));
                const bottom = y(Math.min(0, sign * value));
                return (
                  <rect
                    key={m.x}
                    x={bandX}
                    y={top}
                    width={x.bandwidth()}
                    height={Math.max(1, bottom - top)}
                    rx={3}
                    fill={colorOf(m.leader)}
                    opacity={0.9}
                  />
                );
              })}
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
        {hover && hovered && (
          <PanelHoverCard
            hover={hover}
            title={`${Math.round(hovered.x)} ${xLabel}`}
            metrics={[hoverMetric(hovered)]}
            testId="frontier-lead-bars-hover-card"
          />
        )}
      </div>
    </section>
  );
}

/** Each compared series' frontier area on every date, with the leader's margin called out. */
export function FrontierAreaTimeline({
  history,
  dateIndex,
  keys,
  styles,
  onSeek,
}: Omit<PanelProps, 'xLabel'> & { onSeek: (index: number) => void }) {
  const t = STRINGS[useLocale()];
  const areas = useMemo(() => frontierAreas(history), [history]);
  const formatDate = useSnapshotDateFormat();

  const label = (key: string) => styles.get(key)?.label ?? key;
  const ranked = (index: number) =>
    keys
      .map((key) => ({ key, area: areas.get(key)?.[index] ?? 0 }))
      .filter((entry) => entry.area > 0)
      .toSorted((a, b) => b.area - a.area);
  const now = ranked(dateIndex);
  const firstShared = history.dates.findIndex((_, index) => ranked(index).length >= 2);
  const then = firstShared === -1 ? [] : ranked(firstShared);
  const summary =
    now.length >= 2
      ? t.leads(label(now[0].key), formatRatio(now[0].area / now[1].area), label(now[1].key)) +
        (then.length >= 2 && firstShared < dateIndex
          ? t.was(
              `${formatRatio(then[0].area / then[1].area)}${
                then[0].key === now[0].key ? '' : ` (${label(then[0].key)})`
              }`,
              formatDate(history.dates[firstShared]),
            )
          : '')
      : null;

  // Raw area is metric x tok/s/user, which has no intuitive unit, so the axis is indexed:
  // 1x is the leader's area on the first date any compared series has data.
  const firstData = history.dates.findIndex((_, index) => ranked(index).length > 0);
  const base = firstData === -1 ? null : ranked(firstData)[0];
  const indexed = useMemo(() => {
    const scale = base?.area ?? 1;
    return new Map(
      keys.map((key) => [
        key,
        (areas.get(key) ?? []).map((area) => (area > 0 ? area / scale : null)),
      ]),
    );
  }, [areas, keys, base]);

  return (
    <section className={PANEL_SECTION_CLASS}>
      <div className={PANEL_HEADER_CLASS}>
        <h3 className="text-sm font-semibold">{t.areaTitle}</h3>
        {summary && <p className="text-sm font-medium">{summary}</p>}
      </div>
      <IndexedTimeline
        dates={history.dates}
        dateIndex={dateIndex}
        values={indexed}
        styles={styles}
        title={t.areaTitle}
        testId="frontier-area-timeline"
        onSeek={onSeek}
      />
    </section>
  );
}
