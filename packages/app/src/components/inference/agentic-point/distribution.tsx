'use client';

import { useMemo } from 'react';

import { useLocale } from '@/lib/use-locale';

import { ChartHover, type HoverItem } from './chart-hover';
import {
  CHART_PAD,
  ChartEmpty,
  ChartLegend,
  LEGEND_BASELINE_OFFSET,
  PERCENTILE_COLORS,
  fmtCount,
  type ChartLegendEntry,
} from './chart-shared';
import { layoutChartLegend } from './chart-legend';
import { logHistogram, logTicks, positiveValues } from './lognormal';
import { quantile } from './time-series-math';

const PAD = CHART_PAD;

const GUIDES = [
  { label: 'p50', q: 0.5, color: PERCENTILE_COLORS.p50 },
  { label: 'p75', q: 0.75, color: PERCENTILE_COLORS.p75 },
  { label: 'p90', q: 0.9, color: PERCENTILE_COLORS.p90 },
  { label: 'p95', q: 0.95, color: PERCENTILE_COLORS.p95 },
] as const;

const STRINGS = {
  en: {
    requests: 'requests',
    range: 'range',
    logScale: 'log scale',
    excluded: (n: string, unit: string) =>
      `${n} requests with 0 ${unit} excluded from the log axis`,
    bin: 'Bin',
    count: 'Count',
    cumulative: 'Cumulative',
    valueAxis: (unit: string) => `value (${unit}, log scale)`,
    countAxis: 'count',
  },
  zh: {
    requests: '个请求',
    range: '范围',
    logScale: '对数刻度',
    excluded: (n: string, unit: string) => `${n} 个请求为 0 ${unit}，已从对数轴中排除`,
    bin: '区间',
    count: '数量',
    cumulative: '累计',
    valueAxis: (unit: string) => `数值（${unit}，对数刻度）`,
    countAxis: '数量',
  },
} as const;

/**
 * Bar histogram of per-request sequence lengths with vertical p50/p75/p90/p95
 * guide lines. Designed for the detail-page card — fills its container width
 * via `viewBox` + 100% width.
 *
 * Bins are uniform in ln(value), not in value: ISL/OSL span orders of magnitude,
 * so linear bins pile nearly every request into the leftmost few and stretch a
 * near-empty tail across the rest of the axis. On a log axis the same roughly
 * lognormal data reads as an ordinary bell instead.
 *
 * Hover shows the bin range + count + cumulative percentile.
 */
export function Distribution({
  values,
  unit,
  width = 720,
  height = 260,
}: {
  values: readonly number[];
  unit: string;
  width?: number;
  height?: number;
}) {
  const t = STRINGS[useLocale()];
  const W = width;

  const computed = useMemo(() => {
    const positive = positiveValues(values);
    if (positive.length === 0) return null;
    const nBins = Math.min(50, Math.max(15, Math.ceil(Math.sqrt(positive.length))));
    const histogram = logHistogram(positive, nBins);
    if (!histogram) return null;
    return {
      sorted: positive.toSorted((a, b) => a - b),
      histogram,
      // Zero-token requests are real but unplottable on a log axis; they are
      // reported under the chart rather than silently folded into bin one.
      excluded: values.length - positive.length,
    };
  }, [values]);

  if (!computed) {
    return <ChartEmpty height={height} />;
  }
  const { sorted, histogram, excluded } = computed;
  const { counts, edges, lnMin, lnMax } = histogram;

  // Wrap the legend, then grow the viewBox and bottom padding by the same
  // amount so the plot area is untouched (see TimeSeriesChart).
  const legendEntries: ChartLegendEntry[] = GUIDES.map(({ label, q, color }) => ({
    label: `${label} ${fmtCount(quantile(sorted, q))}`,
    color,
    swatch: 'dashed-line',
  }));
  const innerW = W - PAD.left - PAD.right;
  const legend = layoutChartLegend(
    legendEntries.map((e) => e.label),
    innerW,
  );
  const H = height + legend.extraHeight;
  const padBottom = PAD.bottom + legend.extraHeight;
  const pad = { ...PAD, bottom: padBottom };
  const innerH = H - PAD.top - padBottom;
  const min = edges[0]!;
  const max = edges.at(-1)!;
  const nBins = counts.length;

  const yMax = Math.max(...counts, 1);

  const lnSpan = lnMax - lnMin;
  const xScale = (v: number) =>
    PAD.left + ((Math.log(Math.max(v, Number.MIN_VALUE)) - lnMin) / lnSpan) * innerW;
  const yScale = (c: number) => PAD.top + (1 - Math.min(c, yMax) / yMax) * innerH;
  const barW = innerW / nBins;

  const fmt = fmtCount;

  // Hover: report the bin range under cursor, its count, and what percentile
  // the bin's midpoint represents in the empirical distribution.
  const resolve = (fraction: number) => {
    const binIdx = Math.min(nBins - 1, Math.max(0, Math.floor(fraction * nBins)));
    const binLo = edges[binIdx]!;
    const binHi = edges[binIdx + 1]!;
    const count = counts[binIdx] ?? 0;
    // Cumulative % at the bin's right edge.
    let cumCount = 0;
    for (let i = 0; i <= binIdx; i++) cumCount += counts[i] ?? 0;
    const cumPct = (cumCount / sorted.length) * 100;
    const items: HoverItem[] = [
      { color: 'currentColor', label: t.bin, value: `${fmt(binLo)}–${fmt(binHi)} ${unit}` },
      { color: 'currentColor', label: t.count, value: count.toLocaleString() },
      { color: 'currentColor', label: t.cumulative, value: `${cumPct.toFixed(1)}%` },
    ];
    return { items };
  };

  const xTickVals = logTicks(min, max);
  const yTickVals = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4);

  return (
    <div className="w-full">
      <div className="mb-2 text-xs text-muted-foreground">
        {sorted.length.toLocaleString()} {t.requests} · {t.range} {fmt(min)}–{fmt(max)} {unit} ·{' '}
        {t.logScale}
      </div>
      <ChartHover pad={pad} width={W} height={H} resolve={resolve}>
        {/* y-axis gridlines + labels */}
        {yTickVals.map((v, i) => {
          const y = yScale(v);
          return (
            <g key={`y${i}`}>
              <line
                x1={PAD.left - 4}
                x2={PAD.left}
                y1={y}
                y2={y}
                stroke="currentColor"
                opacity={0.4}
              />
              <text
                x={PAD.left - 8}
                y={y + 3}
                fontSize={10}
                fill="currentColor"
                opacity={0.55}
                textAnchor="end"
              >
                {fmt(v)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {counts.map((c, i) => {
          const h = (Math.min(c, yMax) / yMax) * innerH;
          const x = PAD.left + i * barW;
          const y = PAD.top + (innerH - h);
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={Math.max(0, barW - 1)}
              height={h}
              fill="currentColor"
              opacity={0.55}
            />
          );
        })}

        {/* Percentile guide lines */}
        {GUIDES.map(({ q, color }) => {
          const v = quantile(sorted, q);
          const x = xScale(v);
          return (
            <line
              key={q}
              x1={x}
              x2={x}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke={color}
              strokeWidth={2}
              strokeDasharray="5 3"
              opacity={0.95}
            />
          );
        })}

        {/* X axis */}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="currentColor"
          opacity={0.2}
        />
        {xTickVals.map((v, i) => {
          const anchor = i === 0 ? 'start' : i === xTickVals.length - 1 ? 'end' : 'middle';
          return (
            <text
              key={`x${i}`}
              x={xScale(v)}
              y={PAD.top + innerH + 14}
              fontSize={11}
              fill="currentColor"
              opacity={0.7}
              textAnchor={anchor}
            >
              {fmt(v)}
            </text>
          );
        })}
        <text
          x={W / 2}
          y={H - legend.extraHeight - 22}
          fontSize={11}
          fill="currentColor"
          opacity={0.55}
          textAnchor="middle"
        >
          {t.valueAxis(unit)}
        </text>
        <text
          x={10}
          y={(H - legend.extraHeight) / 2}
          fontSize={11}
          fill="currentColor"
          opacity={0.55}
          textAnchor="middle"
          transform={`rotate(-90 10 ${(H - legend.extraHeight) / 2})`}
        >
          {t.countAxis}
        </text>

        {/* Percentile legend chips */}
        <ChartLegend
          entries={legendEntries}
          layout={legend}
          left={PAD.left}
          baselineY={H - LEGEND_BASELINE_OFFSET}
        />
      </ChartHover>
      {excluded > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          {t.excluded(excluded.toLocaleString(), unit)}
        </div>
      )}
    </div>
  );
}
