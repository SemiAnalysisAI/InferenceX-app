'use client';

import type { RequestRecord } from '@/hooks/api/use-request-timeline';

import { formatDuration, formatTickLabel } from './timeline-format';
import { cursorStatsAt, type SortedRequestTimes } from './timeline-cursor-stats';
import { requestSourceLabel, shortenWid, type RequestTimelineRow } from './timeline-rows';

export interface TooltipData {
  x: number;
  y: number;
  row: RequestTimelineRow;
  req: RequestRecord;
}

/** Per-request hover tooltip (fixed-position, follows the mouse). */
export function TimelineTooltip({ data, linkable }: { data: TooltipData; linkable?: boolean }) {
  const { row, req } = data;
  const totalMs = (req.end - req.start) / 1e6;
  const queueMs = (req.start - req.credit) / 1e6;
  return (
    <div
      className="fixed z-50 pointer-events-none rounded-md border border-border bg-card p-2.5 shadow-lg text-[11px]"
      style={{ left: data.x + 12, top: data.y - 10, maxWidth: 280 }}
    >
      <div className="flex items-center gap-2 font-medium text-foreground">
        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: row.color }} />
        <span className="truncate">{row.label}</span>
        <span className="text-muted-foreground">· {requestSourceLabel(req)}</span>
        {req.cancelled && <span className="text-destructive">· cancelled</span>}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
        <span>Total</span>
        <span className="text-foreground text-right tabular-nums">{formatDuration(totalMs)}</span>
        <span>Queue wait</span>
        <span className="text-foreground text-right tabular-nums">
          {queueMs > 0.5 ? formatDuration(queueMs) : '—'}
        </span>
        {req.ttftMs !== null && (
          <>
            <span>TTFT</span>
            <span className="text-foreground text-right tabular-nums">
              {formatDuration(req.ttftMs)}
            </span>
          </>
        )}
        {req.isl !== null && (
          <>
            <span>ISL</span>
            <span className="text-foreground text-right tabular-nums">
              {req.isl.toLocaleString()}
            </span>
          </>
        )}
        {req.osl !== null && (
          <>
            <span>OSL</span>
            <span className="text-foreground text-right tabular-nums">
              {req.osl.toLocaleString()}
            </span>
          </>
        )}
        <span>Phase</span>
        <span className="text-foreground text-right">{req.phase}</span>
        {req.ad > 0 && (
          <>
            <span>Agent depth</span>
            <span className="text-foreground text-right tabular-nums">{req.ad}</span>
          </>
        )}
        <span>Worker</span>
        <span className="text-foreground text-right truncate">{shortenWid(req.wid)}</span>
      </div>
      <div className="mt-1.5 pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
        Started at {formatTickLabel(req.start)}
      </div>
      {linkable && (
        <div className="mt-1 text-[10px] font-medium text-primary">
          Click to view this conversation in the dataset →
        </div>
      )}
    </div>
  );
}

export interface CursorState {
  /** Cursor x in svg-local px (drives the crosshair line). */
  xPx: number;
  /** ns offset from dataStart the cursor points at. */
  tNs: number;
  clientX: number;
  clientY: number;
}

/** Cursor stats popover: requests in flight / waiting / completed at time t. */
export function CursorPopover({
  cursor,
  dataStart,
  times,
}: {
  cursor: CursorState;
  dataStart: number;
  times: SortedRequestTimes;
}) {
  const t = cursor.tNs;
  const { running, waiting, completed, inflight } = cursorStatsAt(times, t);
  // Absolute wall-clock seconds since the timeline origin (dataStart).
  const tSec = t / 1e9;
  // Position the popover near the cursor without overflowing the viewport.
  // 200 px wide; flip to the left of the cursor if it would clip the right.
  const wantLeft = cursor.clientX + 14;
  const left =
    typeof window === 'undefined' || wantLeft + 220 < window.innerWidth
      ? wantLeft
      : cursor.clientX - 220;
  return (
    <div
      className="fixed z-40 pointer-events-none rounded-md border border-border bg-card/95 backdrop-blur p-2 shadow-lg text-[11px] font-mono"
      style={{ left, top: cursor.clientY - 60, minWidth: 180 }}
    >
      <div className="flex justify-between gap-3 text-foreground">
        <span className="text-muted-foreground">t =</span>
        <span className="tabular-nums">
          {tSec < 60 ? `${tSec.toFixed(3)} s` : `${(tSec / 60).toFixed(3)} m`}
        </span>
      </div>
      <div className="mt-1 pt-1 border-t border-border/40 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
        <span>In flight</span>
        <span className="text-foreground text-right tabular-nums">{inflight}</span>
        <span className="pl-3 text-[10px]">running</span>
        <span className="text-foreground text-right tabular-nums">{running}</span>
        <span className="pl-3 text-[10px]">waiting</span>
        <span className="text-foreground text-right tabular-nums">{waiting}</span>
        <span>Completed</span>
        <span className="text-foreground text-right tabular-nums">{completed}</span>
      </div>
      {/* dataStart is informational — the displayed t is relative to it. */}
      <div className="mt-1 pt-1 border-t border-border/40 text-[9px] text-muted-foreground">
        relative to t₀ ({(dataStart / 1e9).toFixed(0)}s wall-clock)
      </div>
    </div>
  );
}
