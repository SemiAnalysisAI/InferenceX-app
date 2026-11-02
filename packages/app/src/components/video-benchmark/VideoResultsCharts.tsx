'use client';

import { useId } from 'react';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { paretoFrontier } from './frontier';

export const resultsNumber = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: digits });

export interface ResultBar {
  key: string;
  label: string;
  color: string;
  value: number | null;
  secondary?: number | null;
}

export function ResultsBars({
  rows,
  label,
  unit,
  secondaryLabel,
}: {
  rows: ResultBar[];
  label: string;
  unit: string;
  secondaryLabel?: string;
}) {
  const pattern = useId();
  const values = rows
    .flatMap((r) => [r.value, r.secondary])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (v: number) => 98 + ((v - min) / span) * 310;
  const height = rows.length * (secondaryLabel ? 58 : 40) + 32;
  return (
    <svg
      viewBox={`0 0 470 ${height}`}
      role="img"
      aria-label={`${label} (${unit})`}
      className="w-full"
      data-testid="results-bars"
    >
      <defs>
        <pattern
          id={pattern}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0V6" stroke="currentColor" strokeWidth="2" opacity=".3" />
        </pattern>
      </defs>
      <line x1={x(0)} x2={x(0)} y1="8" y2={height - 24} stroke="currentColor" opacity=".25" />
      {rows.map((row, i) => {
        const y = 13 + i * (secondaryLabel ? 58 : 40);
        const bar = (value: number | null | undefined, offset: number, hatched = false) =>
          value === null || value === undefined ? (
            <text
              x="98"
              y={y + offset + 13}
              fill="currentColor"
              opacity=".55"
              fontSize={CHART_TYPE.axisLabel}
            >
              —
            </text>
          ) : (
            <g>
              <rect
                x={Math.min(x(0), x(value))}
                y={y + offset}
                width={Math.max(1, Math.abs(x(value) - x(0)))}
                height="16"
                fill={row.color}
                opacity={hatched ? 0.25 : 0.85}
              />
              {hatched && (
                <rect
                  x={Math.min(x(0), x(value))}
                  y={y + offset}
                  width={Math.max(1, Math.abs(x(value) - x(0)))}
                  height="16"
                  fill={`url(#${pattern})`}
                />
              )}
              <text
                x="462"
                y={y + offset + 13}
                textAnchor="end"
                fill="currentColor"
                fontSize={CHART_TYPE.axisLabel}
              >
                {resultsNumber(value)}
              </text>
            </g>
          );
        return (
          <g key={row.key} data-hardware={row.key}>
            <text x="0" y={y + 13} fill="currentColor" fontSize={CHART_TYPE.axisLabel}>
              {row.label}
            </text>
            {bar(row.value, 0)}
            {secondaryLabel && bar(row.secondary, 20, true)}
          </g>
        );
      })}
      <text x="98" y={height - 4} fill="currentColor" opacity=".65" fontSize={CHART_TYPE.axisLabel}>
        {unit}
        {secondaryLabel ? ` · ${secondaryLabel}` : ''}
      </text>
    </svg>
  );
}

export interface ResultSeries {
  key: string;
  label: string;
  color: string;
  connect?: boolean;
  opacity?: number;
  points: { x: number; y: number; upper?: number | null; middle?: number | null }[];
}
export function ResultsLines({
  series,
  label,
  xLabel,
  yLabel,
}: {
  series: ResultSeries[];
  label: string;
  xLabel: string;
  yLabel: string;
}) {
  const all = series.flatMap((s) => s.points);
  const maxX = Math.max(1, ...all.map((p) => p.x)),
    maxY = Math.max(1, ...all.flatMap((p) => [p.y, p.upper ?? 0, p.middle ?? 0]));
  const x = (v: number) => 48 + (v / maxX) * 540,
    y = (v: number) => 218 - (v / maxY) * 180;
  const path = (ps: { x: number; y: number }[]) =>
    ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join(' ');
  return (
    <svg viewBox="0 0 630 262" className="w-full" role="img" aria-label={label}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1="48"
            x2="588"
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
        const bands = ps.filter((p) => typeof p.upper === 'number');
        return (
          <g key={s.key} data-hardware={s.key} opacity={s.opacity ?? 1}>
            {bands.length > 1 && (
              <path
                d={`${path(bands)} ${bands
                  .toReversed()
                  .map((p) => `L${x(p.x)},${y(p.upper!)}`)
                  .join(' ')} Z`}
                fill={s.color}
                opacity=".12"
              />
            )}
            {s.connect !== false && ps.length > 1 && (
              <path d={path(ps)} fill="none" stroke={s.color} strokeWidth="2" />
            )}
            {ps.filter((p) => typeof p.middle === 'number').length > 1 && (
              <path
                d={path(
                  ps
                    .filter((p) => typeof p.middle === 'number')
                    .map((p) => ({ x: p.x, y: p.middle! })),
                )}
                fill="none"
                stroke={s.color}
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            )}
            {ps.map((p, i) => (
              <g key={`interval-${i}`}>
                {typeof p.upper === 'number' && (
                  <g data-percentile="p95">
                    <line
                      x1={x(p.x)}
                      x2={x(p.x)}
                      y1={y(p.y)}
                      y2={y(p.upper)}
                      stroke={s.color}
                      opacity=".4"
                    />
                    <line
                      x1={x(p.x) - 5}
                      x2={x(p.x) + 5}
                      y1={y(p.upper)}
                      y2={y(p.upper)}
                      stroke={s.color}
                    />
                  </g>
                )}
                {typeof p.middle === 'number' && (
                  <circle
                    data-percentile="p90"
                    cx={x(p.x)}
                    cy={y(p.middle)}
                    r="3"
                    fill="var(--background)"
                    stroke={s.color}
                  >
                    <title>{`P90: ${resultsNumber(p.middle)} ${yLabel}`}</title>
                  </circle>
                )}
              </g>
            ))}
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
      <text x="588" y="258" textAnchor="end" fill="currentColor" fontSize={CHART_TYPE.axisLabel}>
        {xLabel}
      </text>
    </svg>
  );
}

export function ResultsPareto({
  series,
  label,
  xLabel,
  yLabel,
}: {
  series: ResultSeries[];
  label: string;
  xLabel: string;
  yLabel: string;
}) {
  const frontiers = series.flatMap((s) => {
    const frontier = paretoFrontier(s.points, 'lower', 'higher');
    const selected = new Set(frontier);
    return [
      { ...s, points: frontier },
      {
        ...s,
        key: `${s.key}-dominated`,
        connect: false,
        opacity: 0.3,
        points: s.points.filter((p) => !selected.has(p)),
      },
    ];
  });
  return <ResultsLines series={frontiers} label={label} xLabel={xLabel} yLabel={yLabel} />;
}

export function ResultsRatingSchema({
  labels,
  label,
}: {
  labels: readonly string[];
  label: string;
}) {
  const center = { x: 320, y: 145 },
    radius = 95;
  return (
    <svg viewBox="0 0 640 300" className="mx-auto w-full max-w-2xl" role="img" aria-label={label}>
      {[0.33, 0.66, 1].map((r) => (
        <circle
          key={r}
          cx={center.x}
          cy={center.y}
          r={radius * r}
          fill="none"
          stroke="currentColor"
          opacity=".12"
          strokeDasharray="4 4"
        />
      ))}
      {labels.map((text, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
        const dx = Math.cos(angle),
          dy = Math.sin(angle);
        return (
          <g key={text}>
            <line
              x1={center.x}
              y1={center.y}
              x2={center.x + radius * dx}
              y2={center.y + radius * dy}
              stroke="currentColor"
              opacity=".2"
            />
            <text
              x={center.x + (radius + 16) * dx}
              y={center.y + (radius + 16) * dy + 4}
              textAnchor={dx > 0.1 ? 'start' : dx < -0.1 ? 'end' : 'middle'}
              fill="currentColor"
              opacity=".7"
              fontSize={CHART_TYPE.axisLabel}
            >
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
