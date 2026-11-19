'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  LEGEND_BASELINE_OFFSET,
  LEGEND_FONT_SIZE,
  LEGEND_ROW_HEIGHT,
  LEGEND_SWATCH_INSET,
  LEGEND_SWATCH_WIDTH,
  LEGEND_TEXT_OFFSET,
  type LegendLayout,
} from './chart-legend';

export const CHART_PAD = { top: 12, right: 16, bottom: 56, left: 60 } as const;

export const CHART_SIZES = {
  inline: { width: 720, height: 260 },
  expanded: { width: 1300, height: 520 },
} as const;

export const PERCENTILE_COLORS = {
  mean: '#ef4444',
  p50: '#3b82f6',
  p75: '#22c55e',
  p90: '#f59e0b',
  p95: '#ef4444',
  p99: '#a855f7',
} as const;

export const fmtCount = (n: number): string =>
  n >= 1000
    ? new Intl.NumberFormat('en-US').format(Math.round(n))
    : n < 10
      ? String(Number(n.toFixed(1)))
      : String(Math.round(n));

export const fmtSeconds = (s: number): string => {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
};

/** Empty state with the chart's aspect ratio, so it occupies the same box as the skeleton. */
export function ChartEmpty({
  width = CHART_SIZES.inline.width,
  height = CHART_SIZES.inline.height,
  message,
}: {
  width?: number;
  height?: number;
  message?: string;
}) {
  const locale = useLocale();
  return (
    <EmptyState
      bare
      data-testid="agentic-chart-empty"
      className="w-full text-xs"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {message ?? (locale === 'zh' ? '暂无数据' : 'No data')}
    </EmptyState>
  );
}

/**
 * Loading placeholder with the chart's own aspect ratio. Charts scale their viewBox to the
 * card width, so a fixed pixel height would shift the cards below once the chart draws.
 */
export function ChartSkeleton({ size = 'inline' }: { size?: keyof typeof CHART_SIZES }) {
  const { width, height } = CHART_SIZES[size];
  return (
    <Skeleton
      data-testid="agentic-chart-skeleton"
      className="w-full bg-muted/30"
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  );
}

export type LegendSwatch = 'line' | 'dashed-line' | 'area';

export interface ChartLegendEntry {
  label: string;
  color: string;
  swatch?: LegendSwatch;
  strokeWidth?: number;
  opacity?: number;
}

export function ChartLegend({
  entries,
  layout,
  left,
  baselineY,
}: {
  entries: readonly ChartLegendEntry[];
  layout: LegendLayout;
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
