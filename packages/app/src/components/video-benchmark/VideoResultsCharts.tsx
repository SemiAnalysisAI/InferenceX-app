'use client';

import { CHART_TYPE } from '@/lib/d3-chart/typography';

export const resultsNumber = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: digits });

export interface ResultSeries {
  key: string;
  label: string;
  color: string;
  points: { x: number; y: number }[];
}
export function ResultsLines({
  series,
  label,
  xLabel,
  yLabel,
  width = 630,
}: {
  series: ResultSeries[];
  label: string;
  xLabel: string;
  yLabel: string;
  /** viewBox width; a narrower canvas keeps axis labels legible on a phone. */
  width?: number;
}) {
  const right = width - 42;
  const all = series.flatMap((s) => s.points);
  const maxX = Math.max(1, ...all.map((p) => p.x)),
    maxY = Math.max(1, ...all.map((p) => p.y));
  const x = (v: number) => 48 + (v / maxX) * (right - 48),
    y = (v: number) => 218 - (v / maxY) * 180;
  const path = (ps: { x: number; y: number }[]) =>
    ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} 262`} className="w-full" role="img" aria-label={label}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1="48"
            x2={right}
            y1={y(t * maxY)}
            y2={y(t * maxY)}
            stroke="currentColor"
            opacity=".12"
          />
          <text
            x="40"
            y={y(t * maxY) + 4}
            textAnchor="end"
            fill="currentColor"
            fontSize={CHART_TYPE.axisLabel}
          >
            {resultsNumber(t * maxY, 1)}
          </text>
          <text
            x={x(t * maxX)}
            y="238"
            textAnchor="middle"
            fill="currentColor"
            fontSize={CHART_TYPE.axisLabel}
          >
            {resultsNumber(t * maxX, 1)}
          </text>
        </g>
      ))}
      {series.map((s) => {
        const ps = [...s.points].sort((a, b) => a.x - b.x);
        return (
          <g key={s.key} data-hardware={s.key}>
            {ps.length > 1 && <path d={path(ps)} fill="none" stroke={s.color} strokeWidth="2" />}
            {ps.map((p, i) => (
              <circle key={i} cx={x(p.x)} cy={y(p.y)} r="4" fill={s.color}>
                <title>{`${s.label}: ${resultsNumber(p.x)} ${xLabel}, ${resultsNumber(p.y)} ${yLabel}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
      <text x="48" y="18" fill="currentColor" fontSize={CHART_TYPE.axisLabel}>
        {yLabel}
      </text>
      <text x={right} y="258" textAnchor="end" fill="currentColor" fontSize={CHART_TYPE.axisLabel}>
        {xLabel}
      </text>
    </svg>
  );
}
