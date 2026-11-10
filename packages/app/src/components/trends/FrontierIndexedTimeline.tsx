'use client';

import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  ChartHoverCardBody,
  type ChartHoverCardMetricItem,
} from '@/components/ui/chart-hover-card';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';
import { useLocale } from '@/lib/i18n/use-locale';

import type { FrontierSeriesStyle } from './FrontierChart';
import { formatRatio, PANEL_HEIGHT, PANEL_MARGIN, panelLabelCount } from './frontier-panel-layout';

const STRINGS = {
  en: { seek: 'Hover to read values, click or drag to jump to a date' },
  zh: { seek: '悬停查看数值，点击或拖动跳转到日期' },
} as const;

/** Where the pointer rests on a panel: a date index, bucket index or day count. */
export interface PanelHover {
  at: number;
  clientX: number;
  clientY: number;
  touch: boolean;
}

type PanelPointerHandler = (event: React.PointerEvent<SVGSVGElement>) => void;

/**
 * Hover state for a panel svg. A mouse shows the readout on plain hover and seeks while a
 * button is held; a tap seeks and keeps the readout open until the next tap elsewhere.
 * `pick` maps a plot x (pixels right of the left margin) to the hovered position.
 */
export function usePanelHover({
  marginLeft,
  pick,
  onSeek,
}: {
  marginLeft: number;
  pick: (plotX: number) => number | null;
  onSeek?: (at: number) => void;
}): {
  hover: PanelHover | null;
  svgProps: {
    ref: React.RefObject<SVGSVGElement | null>;
    onPointerDown: PanelPointerHandler;
    onPointerMove: PanelPointerHandler;
    onPointerLeave: PanelPointerHandler;
  };
} {
  const [hover, setHover] = useState<PanelHover | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const touch = hover?.touch ?? false;
  useEffect(() => {
    if (!touch) return;
    const dismiss = (event: PointerEvent) => {
      if (!svgRef.current?.contains(event.target as Node)) setHover(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [touch]);
  const update = (event: React.PointerEvent<SVGSVGElement>, seek: boolean) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const at = pick(event.clientX - bounds.left - marginLeft);
    if (at === null) {
      setHover(null);
      return;
    }
    setHover({
      at,
      clientX: event.clientX,
      clientY: event.clientY,
      touch: event.pointerType === 'touch',
    });
    if (seek) onSeek?.(at);
  };
  return {
    hover,
    svgProps: {
      ref: svgRef,
      onPointerDown: (event) => {
        if (onSeek) event.currentTarget.setPointerCapture(event.pointerId);
        update(event, true);
      },
      onPointerMove: (event) => update(event, event.buttons > 0),
      onPointerLeave: (event) => {
        if (event.pointerType !== 'touch') setHover(null);
      },
    },
  };
}

/** Index of the snapshot date closest to `time`. */
export function nearestDateIndex(times: readonly Date[], time: number): number {
  const after = Math.min(times.length - 1, d3.bisectLeft(times, new Date(time)));
  const before = Math.max(0, after - 1);
  return Math.abs(times[after].getTime() - time) < Math.abs(times[before].getTime() - time)
    ? after
    : before;
}

/** Long snapshot date for hover cards, e.g. "Oct 5, 2026". */
export function useSnapshotDateFormat(): (date: string) => string {
  const locale = useLocale();
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return (date: string) => formatter.format(new Date(`${date}T00:00:00Z`));
  }, [locale]);
}

/** The panels' hover readout: a heading and one metric per series. */
export function PanelHoverCard({
  hover,
  title,
  subtitle,
  metrics,
  testId,
}: {
  hover: PanelHover;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  metrics: ChartHoverCardMetricItem[];
  testId: string;
}) {
  return (
    <FloatingTooltip x={hover.clientX} y={hover.clientY} data-testid={testId}>
      <ChartHoverCardBody title={title} subtitle={subtitle} metrics={metrics} />
    </FloatingTooltip>
  );
}

/**
 * Lines of indexed values (1x = a stated baseline) over the snapshot dates, with the current
 * date marked. Hover reads every series at the nearest date; click or drag jumps to it.
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
  const formatDate = useSnapshotDateFormat();
  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height: PANEL_HEIGHT });
  const width = Math.max(0, dimensions.width - PANEL_MARGIN.left - PANEL_MARGIN.right);
  const height = dimensions.height - PANEL_MARGIN.top - PANEL_MARGIN.bottom;
  const times = dates.map((date) => new Date(`${date}T00:00:00Z`));
  const x = d3
    .scaleTime()
    .domain([times[0], times.at(-1)!])
    .range([0, width]);
  const { hover, svgProps } = usePanelHover({
    marginLeft: PANEL_MARGIN.left,
    pick: (plotX) => nearestDateIndex(times, x.invert(plotX).getTime()),
    onSeek: (index) => {
      if (index !== dateIndex) onSeek(index);
    },
  });
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
  const line = d3
    .line<number | null>()
    .defined((v) => v !== null)
    .x((_, index) => x(times[index]))
    .y((v) => y(v ?? 0));
  const colorOf = (key: string) => styles.get(key)?.color ?? 'var(--muted-foreground)';
  const pointsAt = (index: number) =>
    [...values].flatMap(([key, list]) => {
      const value = list[index];
      return value === null || value === undefined ? [] : [{ key, value }];
    });
  const current = pointsAt(dateIndex);
  const hovered = hover && hover.at !== dateIndex ? pointsAt(hover.at) : [];

  return (
    <div ref={setContainerRef} className="w-full" data-testid={testId}>
      {width > 0 && values.size > 0 && (
        <svg
          {...svgProps}
          width={dimensions.width}
          height={dimensions.height}
          role="img"
          aria-label={`${title}. ${t.seek}`}
          className="cursor-pointer touch-none"
        >
          <g transform={`translate(${PANEL_MARGIN.left},${PANEL_MARGIN.top})`}>
            {y.ticks(4).map((tick) => (
              <g key={tick} transform={`translate(0,${y(tick)})`}>
                <line x2={width} stroke="var(--chart-grid)" />
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
                stroke={colorOf(key)}
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
            {hover && (
              <line
                x1={x(times[hover.at])}
                x2={x(times[hover.at])}
                y2={height}
                stroke="var(--muted-foreground)"
                opacity={0.5}
                pointerEvents="none"
                data-testid={`${testId}-cursor`}
              />
            )}
            {[...current, ...hovered].map((entry, order) => (
              <circle
                key={`${entry.key}:${order < current.length ? 'now' : 'hover'}`}
                cx={x(times[order < current.length ? dateIndex : hover!.at])}
                cy={y(entry.value)}
                r={4}
                fill={colorOf(entry.key)}
                stroke="var(--background)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            ))}
          </g>
        </svg>
      )}
      {hover && (
        <PanelHoverCard
          hover={hover}
          title={formatDate(dates[hover.at])}
          metrics={pointsAt(hover.at)
            .toSorted((a, b) => b.value - a.value)
            .map((entry) => ({
              value: formatRatio(entry.value),
              label: styles.get(entry.key)?.label ?? entry.key,
              color: colorOf(entry.key),
            }))}
          testId={`${testId}-hover-card`}
        />
      )}
    </div>
  );
}
