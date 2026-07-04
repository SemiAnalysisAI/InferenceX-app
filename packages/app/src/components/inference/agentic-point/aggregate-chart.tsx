'use client';

import { useMemo } from 'react';

import { ChartHover, type HoverItem } from './chart-hover';
import { ChartEmpty, PERCENTILE_COLORS } from './chart-shared';

export type PercentileKey = 'mean' | 'p50' | 'p75' | 'p90' | 'p99';

interface PercentileLine {
  key: PercentileKey;
  /** Display label in legend / tooltip. */
  label: string;
  color: string;
}

const PERCENTILE_LINES: PercentileLine[] = [
  { key: 'mean', label: 'Mean', color: PERCENTILE_COLORS.mean },
  { key: 'p50', label: 'P50', color: PERCENTILE_COLORS.p50 },
  { key: 'p75', label: 'P75', color: PERCENTILE_COLORS.p75 },
  { key: 'p90', label: 'P90', color: PERCENTILE_COLORS.p90 },
  { key: 'p99', label: 'P99', color: PERCENTILE_COLORS.p99 },
];

// Wider bottom/left padding than CHART_PAD — the x-axis carries rotated
// per-config labels instead of time ticks.
const PAD = { top: 16, right: 16, bottom: 90, left: 64 };

export interface AggregatePoint {
  /** Sibling label rendered on x-axis (e.g. "TP8 • c=8"). */
  label: string;
  /** Per-percentile value; missing percentiles are dropped from the plot. */
  values: Partial<Record<PercentileKey, number>>;
  /** Sibling id — purely informational, used in the tooltip title. */
  id?: number;
}

/**
 * Multi-line chart: one x-position per sibling config, one line per
 * percentile (mean/p50/p75/p90/p99). Designed for the "Aggregates across
 * configs" view on the agentic detail page.
 */
export function AggregateChart({
  points,
  unit,
  yMax,
  yFmt,
  width = 720,
  height = 320,
}: {
  points: readonly AggregatePoint[];
  unit: string;
  /** Optional fixed y-axis upper bound (e.g. 1 for percentages). */
  yMax?: number;
  /** Optional value formatter (e.g. percentage → "30%"). */
  yFmt?: (v: number) => string;
  width?: number;
  height?: number;
}) {
  const W = width;
  const H = height;
  const fmt = (v: number) =>
    yFmt
      ? yFmt(v)
      : v >= 10000
        ? new Intl.NumberFormat('en-US').format(Math.round(v))
        : v.toFixed(v < 10 ? 2 : 0);

  const computed = useMemo(() => {
    if (points.length === 0) return null;
    let yMaxComputed = 0;
    for (const p of points) {
      for (const line of PERCENTILE_LINES) {
        const v = p.values[line.key];
        if (typeof v === 'number' && Number.isFinite(v) && v > yMaxComputed) yMaxComputed = v;
      }
    }
    const yTop = yMax ?? (yMaxComputed === 0 ? 1 : yMaxComputed * 1.05);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    return { yTop, innerW, innerH };
  }, [points, W, H, yMax]);

  if (!computed) {
    return <ChartEmpty height={H} />;
  }
  const { yTop, innerW, innerH } = computed;

  // X positions: evenly spaced across the inner width.
  const xOf = (i: number) =>
    points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i / (points.length - 1)) * innerW;
  const yOf = (v: number) => PAD.top + (1 - v / yTop) * innerH;

  // 5 y-axis ticks evenly between 0 and yTop.
  const yTicks = Array.from({ length: 5 }, (_, i) => (yTop * i) / 4);

  // Resolve hover: snap to nearest sibling index and emit all percentiles
  // that have data at that x.
  const resolve = (fraction: number) => {
    const idx = Math.round(fraction * (points.length - 1));
    const p = points[Math.max(0, Math.min(points.length - 1, idx))];
    if (!p) return null;
    const items: HoverItem[] = [];
    for (const line of PERCENTILE_LINES) {
      const v = p.values[line.key];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      items.push({ color: line.color, label: line.label, value: fmt(v) });
    }
    return { items, title: p.label };
  };

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {PERCENTILE_LINES.map((line) => (
          <div key={line.key} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5" style={{ backgroundColor: line.color }} />
            <span className="text-muted-foreground">{line.label}</span>
          </div>
        ))}
        <span className="ml-auto text-muted-foreground">
          {points.length} configs · units: {unit}
        </span>
      </div>
      <ChartHover pad={PAD} width={W} height={H} resolve={resolve}>
        {/* y-axis ticks + gridlines */}
        {yTicks.map((v, i) => {
          const y = yOf(v);
          return (
            <g key={`y${i}`}>
              <line
                x1={PAD.left}
                x2={PAD.left + innerW}
                y1={y}
                y2={y}
                stroke="currentColor"
                opacity={0.08}
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

        {/* X-axis tick labels — one per sibling, rotated 30° to fit. */}
        {points.map((p, i) => {
          const x = xOf(i);
          return (
            <g key={`x${i}`}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top + innerH}
                y2={PAD.top + innerH + 4}
                stroke="currentColor"
                opacity={0.4}
              />
              <text
                x={x}
                y={PAD.top + innerH + 8}
                fontSize={10}
                fill="currentColor"
                opacity={0.7}
                textAnchor="end"
                transform={`rotate(-30 ${x} ${PAD.top + innerH + 8})`}
              >
                {p.label}
              </text>
            </g>
          );
        })}

        {/* X axis baseline */}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="currentColor"
          opacity={0.25}
        />

        {/* Horizontal connecting lines per percentile — faint backdrop so the
            eye can follow how each percentile changes across configs. */}
        {PERCENTILE_LINES.map((line) => {
          const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
          let prev: { x: number; y: number } | null = null;
          for (let i = 0; i < points.length; i++) {
            const v = points[i]!.values[line.key];
            if (typeof v !== 'number' || !Number.isFinite(v)) {
              prev = null;
              continue;
            }
            const x = xOf(i);
            const y = yOf(v);
            if (prev) segments.push({ x1: prev.x, y1: prev.y, x2: x, y2: y });
            prev = { x, y };
          }
          return (
            <g key={`hline-${line.key}`} opacity={0.35}>
              {segments.map((s, j) => (
                <line
                  key={`s${j}`}
                  x1={s.x1}
                  y1={s.y1}
                  x2={s.x2}
                  y2={s.y2}
                  stroke={line.color}
                  strokeWidth={1}
                />
              ))}
            </g>
          );
        })}

        {/* Per-sibling vertical bar spanning the percentile range, with a
            colored tick at each percentile level. Mean rendered as a small
            diamond to distinguish from the percentile ticks. */}
        {points.map((p, i) => {
          const x = xOf(i);
          // Collect percentile values present for this sibling.
          const present = PERCENTILE_LINES.filter(
            (line) =>
              typeof p.values[line.key] === 'number' && Number.isFinite(p.values[line.key]!),
          ).map((line) => ({ ...line, value: p.values[line.key]! }));
          if (present.length === 0) return null;
          // Only the *percentile* values define the bar extent; mean might be
          // outside the percentile span on weird distributions.
          const pctlOnly = present.filter((p2) => p2.key !== 'mean');
          const bandValues = pctlOnly.length > 0 ? pctlOnly : present;
          const bandYs = bandValues.map((b) => yOf(b.value));
          const yLo = Math.min(...bandYs);
          const yHi = Math.max(...bandYs);
          return (
            <g key={`bar-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={yLo}
                y2={yHi}
                stroke="currentColor"
                strokeWidth={1}
                opacity={0.35}
              />
              {present.map((b) => {
                const ty = yOf(b.value);
                if (b.key === 'mean') {
                  // Diamond marker for mean.
                  const s = 4;
                  return (
                    <polygon
                      key={`m-${b.key}`}
                      points={`${x},${ty - s} ${x + s},${ty} ${x},${ty + s} ${x - s},${ty}`}
                      fill={b.color}
                      stroke={b.color}
                    />
                  );
                }
                // Horizontal tick at each percentile.
                return (
                  <line
                    key={`tk-${b.key}`}
                    x1={x - 6}
                    x2={x + 6}
                    y1={ty}
                    y2={ty}
                    stroke={b.color}
                    strokeWidth={2.5}
                  />
                );
              })}
            </g>
          );
        })}
      </ChartHover>
    </div>
  );
}
