'use client';

import { useLocale } from '@/lib/use-locale';

import {
  LEGEND_BASELINE_OFFSET,
  LEGEND_FONT_SIZE,
  LEGEND_ROW_HEIGHT,
  LEGEND_SWATCH_INSET,
  LEGEND_SWATCH_WIDTH,
  LEGEND_TEXT_OFFSET,
  type LegendLayout,
} from './chart-legend';

/**
 * Shared presentational constants and helpers for the agentic point-detail
 * charts (time-series, stacked-area, distribution, aggregate). These charts
 * are hand-rolled SVG (not the d3-chart library) and share axis padding,
 * tick formatting, and empty/loading states.
 */

/** Axis padding shared by the time-series, stacked-area, and distribution charts. */
export const CHART_PAD = { top: 12, right: 16, bottom: 56, left: 60 } as const;

/** Sizes passed to charts for the inline (small) vs expanded (dialog) render. */
export const CHART_SIZES = {
  inline: { width: 720, height: 260 },
  expanded: { width: 1300, height: 520 },
} as const;

/**
 * Guide-line colors per percentile, shared by the aggregate chart's lines and
 * the distribution chart's vertical guides so the same percentile reads as the
 * same color across the detail page.
 */
export const PERCENTILE_COLORS = {
  mean: '#ef4444',
  p50: '#3b82f6',
  p75: '#22c55e',
  p90: '#f59e0b',
  p95: '#ef4444',
  p99: '#a855f7',
} as const;

/** Integer tick label: thousands separators only once the value reaches 10000. */
export const fmtCount = (n: number): string =>
  n >= 10000 ? new Intl.NumberFormat('en-US').format(Math.round(n)) : String(Math.round(n));

/** Seconds → "42s" / "3m 20s" time-axis tick label. */
export const fmtSeconds = (s: number): string => {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
};

/** "No data" placeholder sized to match the chart it replaces. */
export function ChartEmpty({ height = 260, message }: { height?: number; message?: string }) {
  const locale = useLocale();
  return (
    <div className="grid place-items-center text-xs text-muted-foreground" style={{ height }}>
      {message ?? (locale === 'zh' ? '暂无数据' : 'No data')}
    </div>
  );
}

/** Loading placeholder for a chart card. */
export function ChartSkeleton() {
  return <div className="h-[260px] rounded-md bg-muted/30 animate-pulse" />;
}

/** How a legend entry's color is shown: a stroked line or a filled block. */
export type LegendSwatch = 'line' | 'dashed-line' | 'area';

export interface ChartLegendEntry {
  label: string;
  color: string;
  /** Defaults to `'line'`. */
  swatch?: LegendSwatch;
  /** Stroke width for the line swatches. Defaults to 2. */
  strokeWidth?: number;
  /** Swatch opacity, to match a translucent area fill. Defaults to 1. */
  opacity?: number;
}

/**
 * Wrapped legend for the hand-rolled point-detail charts.
 *
 * `layout` comes from `layoutChartLegend()` and must have been computed from
 * the same entry order. `baselineY` is the baseline of the *last* row (charts
 * pass `height - LEGEND_BASELINE_OFFSET`), so a single-row legend lands exactly
 * where it did before wrapping existed and extra rows grow downward into the
 * space the chart added to its bottom padding.
 */
export function ChartLegend({
  entries,
  layout,
  left,
  baselineY,
}: {
  entries: readonly ChartLegendEntry[];
  layout: LegendLayout;
  /** x of the plot area's left edge; item x offsets are relative to it. */
  left: number;
  baselineY: number;
}) {
  const topRowBaseline = baselineY - (layout.rows - 1) * LEGEND_ROW_HEIGHT;
  return (
    <>
      {entries.map((entry, i) => {
        const placed = layout.items[i];
        if (!placed) return null;
        const x = left + placed.x;
        const y = topRowBaseline + placed.row * LEGEND_ROW_HEIGHT;
        const swatch = entry.swatch ?? 'line';
        return (
          <g key={`legend-${i}`}>
            {swatch === 'area' ? (
              <rect
                x={x + LEGEND_SWATCH_INSET}
                y={y - 9}
                width={LEGEND_SWATCH_WIDTH}
                height={8}
                fill={entry.color}
                opacity={entry.opacity ?? 1}
              />
            ) : (
              <line
                x1={x + LEGEND_SWATCH_INSET}
                x2={x + LEGEND_SWATCH_INSET + LEGEND_SWATCH_WIDTH}
                y1={y - 4}
                y2={y - 4}
                stroke={entry.color}
                strokeWidth={entry.strokeWidth ?? 2}
                strokeDasharray={swatch === 'dashed-line' ? '5 3' : undefined}
                opacity={entry.opacity ?? 1}
              />
            )}
            <text
              x={x + LEGEND_TEXT_OFFSET}
              y={y}
              fontSize={LEGEND_FONT_SIZE}
              fill="currentColor"
              opacity={0.9}
            >
              {entry.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

export { LEGEND_BASELINE_OFFSET };
