'use client';

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
export function ChartEmpty({ height = 260 }: { height?: number }) {
  return (
    <div className="grid place-items-center text-xs text-muted-foreground" style={{ height }}>
      No data
    </div>
  );
}

/** Loading placeholder for a chart card. */
export function ChartSkeleton() {
  return <div className="h-[260px] rounded-md bg-muted/30 animate-pulse" />;
}
