'use client';

import { memo } from 'react';

import type { RequestRecord } from '@/hooks/api/use-request-timeline';

import {
  CHART_WIDTH,
  HEADER_HEIGHT,
  PADDING_RIGHT,
  ROW_GAP,
  ROW_HEIGHT,
  timelineSvgHeight,
} from './timeline-layout';
import { formatTickLabel } from './timeline-format';
import { conversationHref, type RequestTimelineRow } from './timeline-rows';

/** Phase color overlay drawn as a thin strip at the bottom of each bar. */
const PHASE_COLORS: Record<string, string> = {
  profiling: '#22c55e',
  warmup: '#94a3b8',
  unknown: '#64748b',
};

// Time-axis tick spacing candidates (~8 ticks across the visible window,
// snapped to the first nice multiple that fits).
const NICE_TICK_MS = [
  100, 250, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000,
];

export interface TimelineBarsProps {
  rows: RequestTimelineRow[];
  expandedSubagents: ReadonlySet<string>;
  /** Absolute ns timestamp of the visible data's origin (min credit). */
  dataStart: number;
  /** Visible window (ns offsets from dataStart). */
  vStart: number;
  vEnd: number;
  datasetSlug?: string | null;
  onBarHover: (e: React.MouseEvent, row: RequestTimelineRow, req: RequestRecord) => void;
  onBarLeave: () => void;
  /** Plain left-click SPA navigation; modified clicks fall through to the href. */
  onBarClick: (e: React.MouseEvent, req: RequestRecord) => void;
}

/**
 * The static SVG content of the timeline: time axis, row separators, and every
 * request bar. Memoized so tooltip/cursor mousemove state changes in the parent
 * (which fire on every pointer move) don't re-render thousands of bar rects —
 * only zoom/pan, filter, and expansion changes reach this subtree.
 */
export const TimelineBars = memo(
  ({
    rows,
    expandedSubagents,
    dataStart,
    vStart,
    vEnd,
    datasetSlug,
    onBarHover,
    onBarLeave,
    onBarClick,
  }: TimelineBarsProps) => {
    const svgHeight = timelineSvgHeight(rows.length);
    const visibleDur = Math.max(vEnd - vStart, 1);
    const scale = (CHART_WIDTH - PADDING_RIGHT) / visibleDur;
    // Local coords: convert ns offset from dataStart to x px.
    const xOf = (ns: number) => (ns - dataStart - vStart) * scale;

    // Time-axis ticks (~8 across visible window, snapped to nice second multiples).
    const targetMs = visibleDur / 1e6 / 8;
    const tickMs = NICE_TICK_MS.find((n) => n >= targetMs) ?? targetMs;
    const tickNs = tickMs * 1e6;
    const ticks: number[] = [];
    const tickStart = Math.floor(vStart / tickNs) * tickNs;
    for (let t = tickStart; t <= vEnd + tickNs; t += tickNs) {
      if (t >= vStart && t <= vEnd) ticks.push(t);
    }

    return (
      <>
        {/* Header / time-axis baseline */}
        <line
          x1={0}
          y1={HEADER_HEIGHT}
          x2={CHART_WIDTH}
          y2={HEADER_HEIGHT}
          stroke="currentColor"
          opacity={0.15}
        />

        {/* Time axis ticks */}
        {ticks.map((t) => {
          // Convert visible-window ns offset → x px (the tick array
          // is already in dataStart-relative coords).
          const x = (t - vStart) * scale;
          return (
            <g key={t}>
              <line
                x1={x}
                y1={HEADER_HEIGHT}
                x2={x}
                y2={svgHeight}
                stroke="currentColor"
                opacity={0.08}
                strokeDasharray="2 4"
              />
              <text
                x={x + 2}
                y={HEADER_HEIGHT - 6}
                fill="currentColor"
                opacity={0.55}
                fontSize={9}
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {formatTickLabel(t)}
              </text>
            </g>
          );
        })}

        {/* Row separators */}
        {rows.map((row, idx) => (
          <line
            key={`sep-${row.key}`}
            x1={0}
            y1={HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)}
            x2={CHART_WIDTH}
            y2={HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)}
            stroke="currentColor"
            opacity={0.04}
          />
        ))}

        {/* Request bars */}
        {rows.map((row, rowIdx) => {
          const yTop = HEADER_HEIGHT + rowIdx * (ROW_HEIGHT + ROW_GAP) + 2;
          const barH = ROW_HEIGHT - 4;
          // For multi-stream subagent containers, suppress the union
          // bars when expanded — the child stream rows draw them
          // individually instead, so we'd double-draw otherwise.
          if (
            row.kind === 'subagent' &&
            (row.streamCount ?? 1) > 1 &&
            expandedSubagents.has(row.key)
          ) {
            return null;
          }
          return row.requests.map((req) => {
            const xCredit = xOf(req.credit);
            const xStart = xOf(req.start);
            const xEnd = xOf(req.end);
            // Cull bars entirely outside the visible window so big
            // benchmarks don't render thousands of zero-width rects.
            if (xEnd < -2 || xCredit > CHART_WIDTH + 2) return null;
            const runW = Math.max(xEnd - xStart, 1);
            const queueW = Math.max(xStart - xCredit, 0);
            const phaseColor = PHASE_COLORS[req.phase] ?? PHASE_COLORS.unknown!;
            const barKey = `${req.cid}-${req.ti}-${req.start}`;
            const barChildren = (
              <>
                {/* Queue lead-in (faint) — only drawn when noticeable. */}
                {queueW >= 1 && (
                  <rect
                    x={xCredit}
                    y={yTop + barH / 2 - 1}
                    width={queueW}
                    height={2}
                    fill={row.color}
                    opacity={0.35}
                  />
                )}
                {/* Main bar — opacity stepped down with depth so
                parent > subagent > stream reads visually. */}
                <rect
                  x={xStart}
                  y={yTop}
                  width={runW}
                  height={barH}
                  rx={2}
                  fill={row.color}
                  opacity={
                    req.cancelled
                      ? 0.35
                      : row.kind === 'stream' || row.kind === 'aux'
                        ? 0.5
                        : row.kind === 'subagent'
                          ? 0.6
                          : 0.85
                  }
                />
                {/* Phase strip at bottom */}
                <rect
                  x={xStart}
                  y={yTop + barH - 2}
                  width={runW}
                  height={2}
                  rx={1}
                  fill={phaseColor}
                  opacity={0.85}
                />
                {/* Cancelled X overlay */}
                {req.cancelled && runW > 6 && (
                  <line
                    x1={xStart + 1}
                    y1={yTop + 1}
                    x2={xStart + runW - 1}
                    y2={yTop + barH - 1}
                    stroke="currentColor"
                    strokeWidth={0.7}
                    opacity={0.6}
                  />
                )}
              </>
            );
            // No source dataset → not linkable; plain group.
            if (!datasetSlug) {
              return (
                <g
                  key={barKey}
                  onMouseMove={(e) => onBarHover(e, row, req)}
                  onMouseLeave={onBarLeave}
                >
                  {barChildren}
                </g>
              );
            }
            // Linkable: render a real SVG anchor with the conversation
            // href so the browser's native "open in new tab" works
            // (right-click menu, ⌘/Ctrl-click, middle-click). Plain
            // left-click stays an in-app navigation; modified or
            // non-primary clicks fall through to the browser. Suppress
            // the native link drag so it doesn't fight the pan gesture.
            return (
              <a
                key={barKey}
                href={conversationHref(datasetSlug, req)}
                onMouseMove={(e) => onBarHover(e, row, req)}
                onMouseLeave={onBarLeave}
                onClick={(e) => onBarClick(e, req)}
                onDragStart={(e) => e.preventDefault()}
                style={{ cursor: 'pointer' }}
              >
                {barChildren}
              </a>
            );
          });
        })}
      </>
    );
  },
);
