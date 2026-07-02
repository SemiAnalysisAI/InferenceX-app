'use client';

import { useMemo } from 'react';

import { ChartHover, type HoverItem } from './chart-hover';
import { CHART_PAD, ChartEmpty, PERCENTILE_COLORS, fmtCount } from './chart-shared';
import { quantile } from './time-series-math';

const PAD = CHART_PAD;

const GUIDES = [
  { label: 'p50', q: 0.5, color: PERCENTILE_COLORS.p50 },
  { label: 'p75', q: 0.75, color: PERCENTILE_COLORS.p75 },
  { label: 'p90', q: 0.9, color: PERCENTILE_COLORS.p90 },
  { label: 'p95', q: 0.95, color: PERCENTILE_COLORS.p95 },
] as const;

/**
 * Bar histogram with vertical p50/p75/p90/p95 guide lines. Designed for the
 * detail-page card — fills its container width via `viewBox` + 100% width.
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
  const W = width;
  const H = height;

  const computed = useMemo(() => {
    if (values.length === 0) return null;
    const sorted = [...values].toSorted((a, b) => a - b);
    const min = sorted[0]!;
    const max = sorted.at(-1)!;
    const range = Math.max(1e-9, max - min);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const nBins = Math.min(50, Math.max(15, Math.ceil(Math.sqrt(values.length))));
    const counts: number[] = Array.from({ length: nBins }, () => 0);
    for (const v of values) {
      const i = Math.min(nBins - 1, Math.floor(((v - min) / range) * nBins));
      counts[i]!++;
    }
    return { sorted, min, max, range, innerW, innerH, nBins, counts };
  }, [values, W, H]);

  if (!computed) {
    return <ChartEmpty />;
  }
  const { sorted, min, max, range, innerW, innerH, nBins, counts } = computed;
  const maxCount = Math.max(...counts, 1);
  const xScale = (v: number) => PAD.left + ((v - min) / range) * innerW;
  const yScale = (c: number) => PAD.top + (1 - c / maxCount) * innerH;
  const barW = innerW / nBins;

  const fmt = fmtCount;

  // Hover: report the bin range under cursor, its count, and what percentile
  // the bin's midpoint represents in the empirical distribution.
  const resolve = (fraction: number) => {
    const v = min + fraction * range;
    const binIdx = Math.min(nBins - 1, Math.floor(((v - min) / range) * nBins));
    const binLo = min + (binIdx * range) / nBins;
    const binHi = min + ((binIdx + 1) * range) / nBins;
    const count = counts[binIdx] ?? 0;
    // Cumulative % at the bin's right edge.
    let cumCount = 0;
    for (let i = 0; i <= binIdx; i++) cumCount += counts[i] ?? 0;
    const cumPct = (cumCount / values.length) * 100;
    const items: HoverItem[] = [
      { color: 'currentColor', label: 'Bin', value: `${fmt(binLo)}–${fmt(binHi)} ${unit}` },
      { color: 'currentColor', label: 'Count', value: count.toLocaleString() },
      { color: 'currentColor', label: 'Cumulative', value: `${cumPct.toFixed(1)}%` },
    ];
    return { items };
  };

  const xTickVals = [min, min + range / 3, min + (2 * range) / 3, max];
  const yTickVals = Array.from({ length: 5 }, (_, i) => (maxCount * i) / 4);

  return (
    <div className="w-full">
      <div className="mb-2 text-xs text-muted-foreground">
        {values.length.toLocaleString()} requests · range {fmt(min)}–{fmt(max)} {unit}
      </div>
      <ChartHover pad={PAD} width={W} height={H} resolve={resolve}>
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
          const h = (c / maxCount) * innerH;
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
          y={H - 22}
          fontSize={11}
          fill="currentColor"
          opacity={0.55}
          textAnchor="middle"
        >
          value ({unit})
        </text>
        <text
          x={10}
          y={H / 2}
          fontSize={11}
          fill="currentColor"
          opacity={0.55}
          textAnchor="middle"
          transform={`rotate(-90 10 ${H / 2})`}
        >
          count
        </text>

        {/* Percentile legend chips */}
        {(() => {
          const chipY = H - 8;
          const chipW = innerW / GUIDES.length;
          return GUIDES.map(({ label: ql, q, color }, i) => {
            const v = quantile(sorted, q);
            const x = PAD.left + i * chipW;
            return (
              <g key={ql}>
                <line
                  x1={x + 2}
                  x2={x + 14}
                  y1={chipY - 4}
                  y2={chipY - 4}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                />
                <text x={x + 18} y={chipY} fontSize={11} fill="currentColor" opacity={0.9}>
                  {ql} {fmt(v)}
                </text>
              </g>
            );
          });
        })()}
      </ChartHover>
    </div>
  );
}
