'use client';

import { useEffect, useRef, useState } from 'react';

import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    request: 'request',
    requests: 'requests',
    above: (count: number, formatted: string) => `+${count} above ${formatted} →`,
  },
  zh: {
    request: '请求',
    requests: '请求',
    above: (count: number, formatted: string) => `+${count} 超出 ${formatted} →`,
  },
} as const;

export interface HistogramEntry {
  request: number;
  requestId?: string;
  value: number;
}

export interface HistogramBucket {
  min: number;
  max: number;
  entries: HistogramEntry[];
}

export interface Percentile {
  label: string;
  value: number;
}

/** Guide-line colors, matching the InferenceX per-point distribution charts. */
const GUIDE_COLORS: Record<string, string> = {
  p50: '#3b82f6',
  p75: '#22c55e',
  p90: '#f59e0b',
  p95: '#ef4444',
};

const PAD = { top: 14, right: 12, bottom: 38, left: 44 };

/**
 * Equal-width buckets between the minimum and p95 + 10%, so a few outliers
 * don't squash the rest of the distribution against the y axis.
 */
export function buildHistogram(entries: HistogramEntry[], bucketCount: number): HistogramBucket[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].toSorted((a, b) => a.value - b.value);
  if (sorted[0].value === sorted.at(-1)!.value) {
    return [{ min: sorted[0].value, max: sorted[0].value, entries: sorted }];
  }
  const min = sorted[0].value;
  const p95Val = sorted[Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1)].value;
  const max = p95Val + (p95Val - min) * 0.1 || sorted.at(-1)!.value;
  const step = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    min: min + i * step,
    max: min + (i + 1) * step,
    entries: [] as HistogramEntry[],
  }));
  for (const entry of entries) {
    if (entry.value > max) continue;
    buckets[Math.min(Math.floor((entry.value - min) / step), bucketCount - 1)].entries.push(entry);
  }
  return buckets;
}

function niceStep(range: number, targetCount: number, minStep = 0): number {
  const raw = Math.max(range / Math.max(targetCount - 1, 1), minStep);
  const exponent = Math.floor(Math.log10(raw));
  const fraction = raw / 10 ** exponent;
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return nice * 10 ** exponent;
}

function ticks(min: number, max: number, targetCount: number, minStep = 0): number[] {
  if (max <= min) return [min];
  const step = niceStep(max - min, targetCount, minStep);
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) {
    out.push(Math.round(t * 1e10) / 1e10);
  }
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Histogram with percentile guide lines and a row of percentile chips. Drawn
 * at the container's pixel width so text stays the same size in the card and
 * in the expanded dialog.
 */
export function DistributionHistogram({
  buckets,
  percentiles,
  format,
  axisLabel,
  total,
  expanded = false,
  selectedIdx = null,
  onBucketClick,
}: {
  buckets: HistogramBucket[];
  percentiles: Percentile[];
  format: (v: number) => string;
  axisLabel: string;
  /** Entry count before buildHistogram dropped the tail; flags values past the axis. */
  total?: number;
  expanded?: boolean;
  selectedIdx?: number | null;
  onBucketClick?: (idx: number) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = expanded ? 460 : 200;
  const fontSize = expanded ? 12 : 10;

  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = height - PAD.top - PAD.bottom;
  const xMin = buckets[0].min;
  const xMax = buckets.at(-1)!.max;
  const maxCount = Math.max(...buckets.map((b) => b.entries.length), 1);
  // Counts are whole requests, so the y step never drops below 1.
  const yTicks = ticks(0, maxCount, 5, 1);
  const yMax = Math.max(yTicks.at(-1) ?? maxCount, maxCount);
  const xTicks =
    xMax === xMin
      ? [xMin]
      : ticks(xMin, xMax, Math.max(2, Math.floor(innerW / (expanded ? 100 : 64))));
  // Every value identical: one narrow bar in the middle rather than a slab.
  const degenerate = xMax === xMin;
  const sx = (v: number) =>
    degenerate ? PAD.left + innerW / 2 : PAD.left + ((v - xMin) / (xMax - xMin)) * innerW;
  const sy = (c: number) => PAD.top + innerH - (c / yMax) * innerH;
  const barW = degenerate ? Math.min(innerW, 32) : innerW / buckets.length;
  const barX = (i: number) => (degenerate ? sx(xMin) - barW / 2 : PAD.left + i * barW);
  const guides = percentiles.filter((p) => GUIDE_COLORS[p.label]);
  const beyondAxis = (total ?? 0) - buckets.reduce((n, b) => n + b.entries.length, 0);

  return (
    <div className="w-full">
      <div ref={ref} className="w-full text-foreground" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
            {yTicks.map((tick) => (
              <g key={`y${tick}`}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + innerW}
                  y1={sy(tick)}
                  y2={sy(tick)}
                  stroke="currentColor"
                  opacity={tick === 0 ? 0.3 : 0.1}
                />
                <text
                  x={PAD.left - 8}
                  y={sy(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={fontSize}
                  fill="currentColor"
                  opacity={0.6}
                >
                  {tick}
                </text>
              </g>
            ))}

            {buckets.map((b, i) => {
              if (b.entries.length === 0) return null;
              const selected = selectedIdx === i;
              return (
                <rect
                  key={i}
                  x={barX(i)}
                  y={sy(b.entries.length)}
                  width={Math.max(barW - 1, 1)}
                  height={sy(0) - sy(b.entries.length)}
                  fill="currentColor"
                  opacity={selected ? 0.9 : selectedIdx === null ? 0.55 : 0.3}
                  className={onBucketClick ? 'cursor-pointer' : undefined}
                  onClick={onBucketClick ? () => onBucketClick(i) : undefined}
                >
                  <title>
                    {format(b.min)} – {format(b.max)}: {b.entries.length}{' '}
                    {b.entries.length === 1 ? t.request : t.requests}
                  </title>
                </rect>
              );
            })}

            {guides.map(({ label, value }) => {
              const x = sx(value);
              if (x < PAD.left || x > PAD.left + innerW) return null;
              return (
                <line
                  key={label}
                  x1={x}
                  x2={x}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke={GUIDE_COLORS[label]}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                />
              );
            })}

            {xTicks.map((tick) => (
              <text
                key={`x${tick}`}
                x={sx(tick)}
                y={PAD.top + innerH + fontSize + 4}
                textAnchor="middle"
                fontSize={fontSize}
                fill="currentColor"
                opacity={0.7}
              >
                {/* Round ticks read as "300K", not "300.0K". */}
                {format(tick).replace(/\.0(?=\D|$)/u, '')}
              </text>
            ))}
            <text
              x={PAD.left + innerW / 2}
              y={height - 4}
              textAnchor="middle"
              fontSize={fontSize}
              fill="currentColor"
              opacity={0.55}
            >
              {axisLabel}
            </text>
            {beyondAxis > 0 && (
              <text
                x={PAD.left + innerW}
                y={PAD.top - 3}
                textAnchor="end"
                fontSize={fontSize}
                fill="currentColor"
                opacity={0.55}
              >
                {t.above(beyondAxis, format(xMax).replace(/\.0(?=\D|$)/u, ''))}
              </text>
            )}
          </svg>
        )}
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1.5 border-t border-border pt-3">
        {percentiles.map((p) => (
          <div
            key={p.label}
            className="min-w-0 rounded-md border border-border bg-surface-hover px-1 py-1.5 text-center"
          >
            <div className="flex items-center justify-center gap-1 text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
              {GUIDE_COLORS[p.label] && (
                <span
                  className="inline-block h-0.5 w-2.5"
                  style={{ backgroundColor: GUIDE_COLORS[p.label] }}
                />
              )}
              {p.label}
            </div>
            <div
              className={`mt-0.5 truncate font-mono font-bold tracking-tight ${expanded ? 'text-sm' : 'text-xs'}`}
            >
              {format(p.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
