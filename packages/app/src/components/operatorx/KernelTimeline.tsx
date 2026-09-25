'use client';

import { useState } from 'react';

import { formatUs, shortKernel } from './format';

export interface TimelineEvent {
  name: string;
  stream: number | string | null;
  start_us: number;
  dur_us: number;
}

const LANE_CLASSES = [
  'fill-sky-500/80',
  'fill-amber-500/80',
  'fill-violet-500/80',
  'fill-emerald-500/80',
];

/** Per-stream lanes of one profiled replay; hover or focus a kernel for its timing. */
export function KernelTimeline({
  events,
  streamLabel,
}: {
  events: TimelineEvent[];
  streamLabel: string;
}) {
  const [hover, setHover] = useState<string>('');
  if (events.length === 0) return null;
  const end = Math.max(...events.map((e) => e.start_us + e.dur_us));
  const streams = [...new Set(events.map((e) => String(e.stream)))];
  const width = 640;
  const left = 72;
  const lane = 26;
  const top = 4;
  const height = top + streams.length * (lane + 8) + 22;
  const x = (t: number) => left + (t / (end || 1)) * (width - left - 8);
  const step = end > 400 ? 100 : end > 100 ? 20 : end > 40 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step);
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[520px]" role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={top} y2={height - 18} className="stroke-border" />
              <text
                x={x(t)}
                y={height - 5}
                textAnchor="middle"
                className="fill-muted-foreground text-3xs"
              >
                {t} µs
              </text>
            </g>
          ))}
          {streams.map((s, i) => {
            const y = top + i * (lane + 8);
            return (
              <g key={s}>
                <text
                  x={left - 8}
                  y={y + lane / 2 + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-3xs"
                >
                  {streamLabel} {s}
                </text>
                {events
                  .filter((e) => String(e.stream) === s)
                  .map((e, j) => {
                    const label = `${shortKernel(e.name)} · ${formatUs(e.dur_us)} @ ${e.start_us.toFixed(1)} µs`;
                    return (
                      <rect
                        key={j}
                        x={x(e.start_us)}
                        y={y}
                        width={Math.max(1.5, x(e.start_us + e.dur_us) - x(e.start_us))}
                        height={lane}
                        rx={2}
                        tabIndex={0}
                        aria-label={label}
                        className={`${LANE_CLASSES[i % LANE_CLASSES.length]} outline-none focus:stroke-foreground`}
                        onMouseEnter={() => setHover(label)}
                        onFocus={() => setHover(label)}
                      />
                    );
                  })}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="min-h-5 font-mono text-xs text-muted-foreground">{hover}</p>
    </div>
  );
}
