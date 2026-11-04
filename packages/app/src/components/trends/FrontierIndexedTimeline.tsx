'use client';

import * as d3 from 'd3';
import React from 'react';

import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/i18n/use-locale';

import type { FrontierSeriesStyle } from './FrontierChart';
import { PANEL_HEIGHT, PANEL_MARGIN, panelLabelCount } from './frontier-panel-layout';

const STRINGS = {
  en: { seek: 'Jump to a date' },
  zh: { seek: '跳转到日期' },
} as const;

/**
 * Lines of indexed values (1x = a stated baseline) over the snapshot dates, with the current
 * date marked. Click or drag to jump to the nearest date.
 */
export function IndexedTimeline({
  dates,
  dateIndex,
  values,
  styles,
  title,
  testId,
  onSeek,
}: {
  dates: readonly string[];
  dateIndex: number;
  values: ReadonlyMap<string, readonly (number | null)[]>;
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  title: string;
  testId: string;
  onSeek: (index: number) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: PANEL_HEIGHT });
  const width = Math.max(0, dimensions.width - PANEL_MARGIN.left - PANEL_MARGIN.right);
  const height = dimensions.height - PANEL_MARGIN.top - PANEL_MARGIN.bottom;
  const times = dates.map((date) => new Date(`${date}T00:00:00Z`));
  const x = d3
    .scaleTime()
    .domain([times[0], times.at(-1)!])
    .range([0, width]);
  // Spans under a few months tick by day, so no two labels read the same month.
  const dateTicks = x.ticks(panelLabelCount(width));
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
  const all = [...values.values()].flatMap((list) => list.filter((v): v is number => v !== null));
  const y = d3
    .scaleLinear()
    .domain([0, Math.max(1, d3.max(all) ?? 1)])
    .range([height, 0])
    .nice();
  const seekTo = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = x.invert(event.clientX - bounds.left - PANEL_MARGIN.left).getTime();
    const after = Math.min(times.length - 1, d3.bisectLeft(times, new Date(time)));
    const before = Math.max(0, after - 1);
    const nearest =
      Math.abs(times[after].getTime() - time) < Math.abs(times[before].getTime() - time)
        ? after
        : before;
    if (nearest !== dateIndex) onSeek(nearest);
  };
  const line = d3
    .line<number | null>()
    .defined((v) => v !== null)
    .x((_, index) => x(times[index]))
    .y((v) => y(v ?? 0));
  const current = [...values].flatMap(([key, list]) => {
    const value = list[dateIndex];
    return value === null || value === undefined ? [] : [{ key, value }];
  });

  return (
    <div ref={setContainerRef} className="w-full" data-testid={testId}>
      {width > 0 && values.size > 0 && (
        <svg
          width={dimensions.width}
          height={dimensions.height}
          role="img"
          aria-label={t.seek}
          className="cursor-pointer touch-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seekTo(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons > 0) seekTo(event);
          }}
        >
          <title>{title}</title>
          <g transform={`translate(${PANEL_MARGIN.left},${PANEL_MARGIN.top})`}>
            {y.ticks(4).map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line x2={width} stroke="var(--border)" />
                <text
                  x={-8}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={px(CHART_TYPE.axisLabelSub)}
                  fill="var(--muted-foreground)"
                >
                  {`${d3.format('~g')(tick)}x`}
                </text>
              </g>
            ))}
            {dateTicks.map((tick) => (
              <text
                key={tick.toISOString()}
                x={x(tick)}
                y={height + 18}
                textAnchor="middle"
                fontSize={px(CHART_TYPE.axisLabelSub)}
                fill="var(--muted-foreground)"
              >
                {formatTick(tick)}
              </text>
            ))}
            {[...values].map(([key, list]) => (
              <path
                key={key}
                d={line([...list]) ?? ''}
                fill="none"
                stroke={styles.get(key)?.color ?? 'var(--muted-foreground)'}
                strokeWidth={2}
              />
            ))}
            <line
              x1={x(times[dateIndex])}
              x2={x(times[dateIndex])}
              y2={height}
              stroke="var(--foreground)"
              strokeDasharray="3 3"
              opacity={0.6}
            />
            {current.map((entry) => (
              <circle
                key={entry.key}
                cx={x(times[dateIndex])}
                cy={y(entry.value)}
                r={4}
                fill={styles.get(entry.key)?.color ?? 'var(--muted-foreground)'}
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
