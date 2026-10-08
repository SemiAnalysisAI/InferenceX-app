'use client';

import { useMemo, useRef } from 'react';
import { exportSvgToPng, ExportPngButton } from '@/lib/agentic-workload-explorer/export-png';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    noData: 'No data in this window',
  },
  zh: {
    noData: '该时间窗口内无数据',
  },
} as const;

export function SectionHeader({ label, subtext }: { label: string; subtext?: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <span className="text-3xs font-mono font-bold uppercase tracking-eyebrow-wide text-muted-foreground">
          {label}
        </span>
        <span className="flex-1 h-px bg-border" />
      </div>
      {subtext && <div className="mt-1 text-3xs font-mono text-subtle">{subtext}</div>}
    </div>
  );
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
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-mono font-bold mt-1">{value}</div>
      {detail && <div className="text-3xs font-mono text-muted-foreground mt-0.5">{detail}</div>}
    </div>
  );
}

function niceNum(range: number, round: boolean): number {
  if (range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

function generateTicks(min: number, max: number, targetCount: number): number[] {
  if (max <= min) return [min];
  const range = niceNum(max - min, false);
  const spacing = niceNum(range / (targetCount - 1), true);
  const niceMin = Math.floor(min / spacing) * spacing;
  const ticks: number[] = [];
  for (let t = niceMin; t <= max + spacing * 0.5; t += spacing) {
    ticks.push(Math.round(t * 1e10) / 1e10);
  }
  return ticks;
}

export function formatAxisNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

export function formatAxisPercent(v: number): string {
  return `${Math.round(v)}%`;
}

function dayLabel(day: string): string {
  const d = new Date(day);
  if (Number.isNaN(d.getTime())) return day;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const CHART_W = 640;
const CHART_H = 220;
const MARGIN = { top: 8, right: 12, bottom: 36, left: 52 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

function EmptyChart({ title, label }: { title: string; label: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <SectionHeader label={title} />
      <div className="flex items-center justify-center h-40 text-2xs font-mono text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  /** One value per day; missing days are gaps (line breaks, not zeros). */
  points: { day: string; value: number }[];
}

export function TrendsLineChart({
  title,
  subtext,
  series,
  yFormatter = formatAxisNumber,
  filename,
  emptyLabel,
  yMin = 0,
}: {
  title: string;
  subtext?: string;
  series: LineSeries[];
  yFormatter?: (v: number) => string;
  filename: string;
  emptyLabel?: string;
  /** Force the y-axis floor (e.g. leave undefined/0 for counts, or a fixed min for ratios). */
  yMin?: number;
}) {
  const locale = useLocale();
  const resolvedEmptyLabel = emptyLabel ?? STRINGS[locale].noData;
  const svgRef = useRef<SVGSVGElement>(null);

  const { days, valuesByKey, yMax, yTicks } = useMemo(() => {
    const daySet = new Set<string>();
    for (const s of series) for (const p of s.points) daySet.add(p.day);
    const sortedDays = [...daySet].toSorted();
    const dayIndex = new Map(sortedDays.map((d, i) => [d, i]));

    const perSeriesValues = new Map<string, (number | null)[]>();
    let max = 0;
    for (const s of series) {
      const arr: (number | null)[] = Array.from({ length: sortedDays.length }, () => null);
      for (const p of s.points) {
        const i = dayIndex.get(p.day);
        if (i === undefined) continue;
        arr[i] = p.value;
        if (p.value > max) max = p.value;
      }
      perSeriesValues.set(s.key, arr);
    }

    const ticks = max > 0 ? generateTicks(yMin, max, 5) : [yMin, 1];
    return {
      days: sortedDays,
      valuesByKey: perSeriesValues,
      yMax: ticks.at(-1) || max || 1,
      yTicks: ticks,
    };
  }, [series, yMin]);

  if (days.length === 0) return <EmptyChart title={title} label={resolvedEmptyLabel} />;

  const xOf = (i: number) =>
    MARGIN.left + (days.length <= 1 ? PLOT_W / 2 : (i / (days.length - 1)) * PLOT_W);
  const yOf = (v: number) => MARGIN.top + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H;

  const paths = series.map((s) => {
    const values = valuesByKey.get(s.key) ?? [];
    const segments: string[] = [];
    let open = false;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === null) {
        open = false;
        continue;
      }
      segments.push(`${open ? 'L' : 'M'} ${xOf(i)} ${yOf(v)}`);
      open = true;
    }
    return { key: s.key, label: s.label, color: s.color, d: segments.join(' ') };
  });

  const labelInterval = Math.max(1, Math.floor(days.length / 6));

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <SectionHeader label={title} subtext={subtext} />
        <ExportPngButton
          locale={locale}
          onClick={() => {
            track('agentic_workload_trends_line_chart_export', { title, filename });
            if (svgRef.current)
              exportSvgToPng(svgRef.current, {
                title,
                filename,
                svgWidth: CHART_W,
                svgHeight: CHART_H,
              });
          }}
        />
      </div>

      {series.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 text-3xs font-mono text-muted-foreground mb-2">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <svg ref={svgRef} viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full">
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={MARGIN.left}
              y1={yOf(t)}
              x2={MARGIN.left + PLOT_W}
              y2={yOf(t)}
              stroke="currentColor"
              className="text-border"
              strokeWidth={0.5}
              strokeDasharray="3 3"
            />
            <text
              x={MARGIN.left - 6}
              y={yOf(t) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            >
              {yFormatter(t)}
            </text>
          </g>
        ))}

        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_H}
          x2={MARGIN.left + PLOT_W}
          y2={MARGIN.top + PLOT_H}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />

        {paths.map((p) => (
          <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={1.75} />
        ))}

        {days.map((day, i) => {
          if (i % labelInterval !== 0 && i !== days.length - 1) return null;
          return (
            <text
              key={`x-${day}`}
              x={xOf(i)}
              y={MARGIN.top + PLOT_H + 16}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            >
              {dayLabel(day)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export interface StackedDayPoint {
  day: string;
  values: Record<string, number>;
}

export function TrendsStackedChart({
  title,
  subtext,
  days,
  seriesKeys,
  labelFor,
  colorFor,
  mode,
  filename,
  emptyLabel,
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
  const resolvedEmptyLabel = emptyLabel ?? STRINGS[locale].noData;
  const svgRef = useRef<SVGSVGElement>(null);

  const { bars, maxY } = useMemo(() => {
    if (mode === 'share') {
      const b = days.map((d) => {
        const total = seriesKeys.reduce((acc, k) => acc + (d.values[k] || 0), 0);
        const pct: Record<string, number> =
          total > 0
            ? Object.fromEntries(seriesKeys.map((k) => [k, ((d.values[k] || 0) / total) * 100]))
            : {};
        return { day: d.day, values: pct, total: total > 0 ? 100 : 0 };
      });
      return { bars: b, maxY: 100 };
    }
    let max = 0;
    const b = days.map((d) => {
      const total = seriesKeys.reduce((acc, k) => acc + (d.values[k] || 0), 0);
      if (total > max) max = total;
      return { day: d.day, values: d.values, total };
    });
    const ticks = max > 0 ? generateTicks(0, max, 5) : [0];
    return { bars: b, maxY: ticks.at(-1) || max || 1 };
  }, [days, seriesKeys, mode]);

  if (bars.length === 0) return <EmptyChart title={title} label={resolvedEmptyLabel} />;

  const yTicks = mode === 'share' ? [0, 25, 50, 75, 100] : generateTicks(0, maxY, 5);
  const barWidth = Math.max(1, PLOT_W / bars.length - 2);
  const barGap = PLOT_W / bars.length - barWidth;
  const sx = (i: number) => MARGIN.left + i * (barWidth + barGap) + barGap / 2;
  const sy = (v: number) => MARGIN.top + PLOT_H - (v / maxY) * PLOT_H;
  const labelInterval = Math.max(1, Math.floor(bars.length / 6));

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <SectionHeader label={title} subtext={subtext} />
        <ExportPngButton
          locale={locale}
          onClick={() => {
            track('agentic_workload_trends_stacked_chart_export', { title, filename });
            if (svgRef.current)
              exportSvgToPng(svgRef.current, {
                title,
                filename,
                svgWidth: CHART_W,
                svgHeight: CHART_H,
              });
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-3xs font-mono text-muted-foreground mb-2">
        {seriesKeys.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: colorFor(k) }}
            />
            {labelFor(k)}
          </span>
        ))}
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full">
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            {t > 0 && (
              <line
                x1={MARGIN.left}
                y1={sy(t)}
                x2={MARGIN.left + PLOT_W}
                y2={sy(t)}
                stroke="currentColor"
                className="text-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={MARGIN.left - 6}
              y={sy(t) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            >
              {mode === 'share' ? formatAxisPercent(t) : formatAxisNumber(t)}
            </text>
          </g>
        ))}

        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_H}
          x2={MARGIN.left + PLOT_W}
          y2={MARGIN.top + PLOT_H}
          stroke="currentColor"
          className="text-border"
          strokeWidth={0.5}
        />

        {bars.map(({ day, values }, i) => {
          let yOffset = 0;
          const rects: React.ReactNode[] = [];
          for (const key of seriesKeys) {
            const v = values[key] || 0;
            if (v === 0) continue;
            const barH = (v / maxY) * PLOT_H;
            rects.push(
              <rect
                key={`${day}-${key}`}
                x={sx(i)}
                y={sy(yOffset + v)}
                width={barWidth}
                height={barH}
                fill={colorFor(key)}
                rx={1}
              >
                <title>
                  {labelFor(key)}: {mode === 'share' ? `${v.toFixed(1)}%` : formatAxisNumber(v)} (
                  {day})
                </title>
              </rect>,
            );
            yOffset += v;
          }
          return <g key={day}>{rects}</g>;
        })}

        {bars.map(({ day }, i) => {
          if (i % labelInterval !== 0 && i !== bars.length - 1) return null;
          return (
            <text
              key={`x-${day}`}
              x={sx(i) + barWidth / 2}
              y={MARGIN.top + PLOT_H + 16}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: '9px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            >
              {dayLabel(day)}
            </text>
          );
        })}
      </svg>
    </div>
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
  const map: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) map[keys[i]] = CHART_COLORS[i % CHART_COLORS.length];
  return map;
}
