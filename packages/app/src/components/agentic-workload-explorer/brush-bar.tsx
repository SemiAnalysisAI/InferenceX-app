'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Visual constants tuned to match the Epoch AI reference chart's brush bar.
const BAR_HEIGHT = 28; // px — total component height including handles & labels
const TRACK_Y = 14; // center line of the track
const HANDLE_R = 6; // handle circle radius
const HANDLE_HIT_R = 10; // pointer hit-test radius (slightly larger than visual)
const ACCENT = 'currentColor'; // selection color picks up the chart's text color

/**
 * Reorder + clamp a brush range to lie inside `[fullStart, fullEnd]`, with a
 * minimum span of 1 unit. Exported so the hook's invariants can be unit-tested
 * without rendering React.
 */
export function clampBrushRange(
  s: number,
  e: number,
  fullStart: number,
  fullEnd: number,
): [number, number] {
  const lo = Math.max(fullStart, Math.min(s, e));
  const hi = Math.min(fullEnd, Math.max(s, e));
  if (hi - lo < 1) {
    const center = (lo + hi) / 2;
    return [Math.max(fullStart, center - 0.5), Math.min(fullEnd, center + 0.5)];
  }
  return [lo, hi];
}

interface UseBrushOptions {
  /** Full data range in absolute units (e.g., milliseconds since session start). */
  fullStart: number;
  fullEnd: number;
}

interface UseBrushResult {
  /** Current brush start (in data units, clamped to [fullStart, end - 1]). */
  start: number;
  /** Current brush end (in data units, clamped to [start + 1, fullEnd]). */
  end: number;
  /** Replace both endpoints atomically. Values are clamped + ordered for you. */
  setBrush: (start: number, end: number) => void;
  /** Restore to the full data range — same effect as dragging both handles outward. */
  reset: () => void;
  /** True when the brush is narrower than the full data range. */
  isActive: boolean;
}

/**
 * Controlled brush range, in data units. The hook owns the clamp/order
 * invariants so the chart and the brush bar always agree on the window.
 *
 * When `fullStart`/`fullEnd` change (e.g., the session loads more requests),
 * the brush re-anchors to the new full range — useful when the chart starts
 * with placeholder data and then real data arrives. Once the user has dragged
 * the brush, their selection is preserved on subsequent renders as long as the
 * extent stays the same.
 */
export function useBrush({ fullStart, fullEnd }: UseBrushOptions): UseBrushResult {
  // Track the extent the brush was last initialized against so we can detect
  // when the underlying data range changed (vs. a benign re-render).
  const lastExtentRef = useRef<[number, number]>([fullStart, fullEnd]);
  const [start, setStart] = useState(fullStart);
  const [end, setEnd] = useState(fullEnd);

  useEffect(() => {
    const [prevStart, prevEnd] = lastExtentRef.current;
    if (prevStart !== fullStart || prevEnd !== fullEnd) {
      lastExtentRef.current = [fullStart, fullEnd];
      setStart(fullStart);
      setEnd(fullEnd);
    }
  }, [fullStart, fullEnd]);

  const setBrush = useCallback(
    (s: number, e: number) => {
      const [lo, hi] = clampBrushRange(s, e, fullStart, fullEnd);
      setStart(lo);
      setEnd(hi);
    },
    [fullStart, fullEnd],
  );

  const reset = useCallback(() => {
    setStart(fullStart);
    setEnd(fullEnd);
  }, [fullStart, fullEnd]);

  const isActive = start > fullStart || end < fullEnd;
  return { start, end, setBrush, reset, isActive };
}

interface BrushBarProps {
  /** Total component width in px (matches the chart above). */
  width: number;
  /** Full data range in data units (typically [0, maxElapsed]). */
  fullStart: number;
  fullEnd: number;
  /** Current brush selection. */
  start: number;
  end: number;
  /** Notify parent of a new range. The hook handles clamping/ordering. */
  onChange: (start: number, end: number) => void;
  /** Format a data value for the edge labels (e.g., formatElapsedMMSS). */
  formatValue: (v: number) => string;
  /** Inner padding on each side to leave room for edge labels. */
  labelPadding?: number;
}

type DragMode = 'start' | 'end' | 'body' | null;

/**
 * Horizontal range-selector bar drawn below a chart. Pattern mirrors the
 * Epoch AI data explorer: a thin track spanning the full data range, with two
 * round handles connected by a thicker bar marking the selection. Users can
 * drag either handle to resize the window or drag the bar itself to pan the
 * window left/right.
 *
 * Pure-presentational: the brush state lives in the parent via `useBrush` so
 * the chart can derive its visible range from the same source of truth.
 */
export function BrushBar({
  width,
  fullStart,
  fullEnd,
  start,
  end,
  onChange,
  formatValue,
  labelPadding = 56,
}: BrushBarProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  // Snapshot the brush at pointerdown so body-drag math is anchored — without
  // this, every pointermove computes an offset against the moving range and
  // drift accumulates.
  const dragOriginRef = useRef<{
    pointerData: number;
    start: number;
    end: number;
  } | null>(null);

  const trackLeft = labelPadding;
  const trackRight = width - labelPadding;
  const trackWidth = Math.max(1, trackRight - trackLeft);
  const fullSpan = Math.max(1, fullEnd - fullStart);

  const dataToPx = useCallback(
    (v: number) => trackLeft + ((v - fullStart) / fullSpan) * trackWidth,
    [trackLeft, fullStart, fullSpan, trackWidth],
  );

  const pxToData = useCallback(
    (px: number) => fullStart + ((px - trackLeft) / trackWidth) * fullSpan,
    [fullStart, trackLeft, trackWidth, fullSpan],
  );

  const handleStartX = dataToPx(start);
  const handleEndX = dataToPx(end);

  const beginDrag = useCallback(
    (mode: Exclude<DragMode, null>, clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const localX = clientX - rect.left;
      dragOriginRef.current = {
        pointerData: pxToData(localX),
        start,
        end,
      };
      setDragMode(mode);
    },
    [pxToData, start, end],
  );

  // Pointer-move/up listeners live on `window` so the drag continues even when
  // the cursor leaves the SVG (matches native slider behavior).
  useEffect(() => {
    if (!dragMode) return;

    function handleMove(ev: PointerEvent) {
      const svg = svgRef.current;
      const origin = dragOriginRef.current;
      if (!svg || !origin) return;
      const rect = svg.getBoundingClientRect();
      const localX = ev.clientX - rect.left;
      const data = pxToData(localX);
      if (dragMode === 'start') {
        onChange(data, origin.end);
      } else if (dragMode === 'end') {
        onChange(origin.start, data);
      } else {
        const delta = data - origin.pointerData;
        const span = origin.end - origin.start;
        // Pan: keep span constant, slide the window. Clamp so the window stays
        // inside [fullStart, fullEnd].
        let newStart = origin.start + delta;
        if (newStart < fullStart) newStart = fullStart;
        if (newStart + span > fullEnd) newStart = fullEnd - span;
        onChange(newStart, newStart + span);
      }
    }

    function handleUp() {
      setDragMode(null);
      dragOriginRef.current = null;
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragMode, pxToData, onChange, fullStart, fullEnd]);

  // Display values for the edge labels — always the FULL data range (matches
  // the Epoch AI reference where the labels show the unselected bounds).
  const startLabel = useMemo(() => formatValue(fullStart), [formatValue, fullStart]);
  const endLabel = useMemo(() => formatValue(fullEnd), [formatValue, fullEnd]);

  const bodyCursor = dragMode === 'body' ? 'grabbing' : 'grab';

  return (
    <svg
      ref={svgRef}
      width={width}
      height={BAR_HEIGHT}
      className="block select-none"
      style={{ touchAction: 'none' }}
    >
      {/* Left edge label */}
      <text
        x={trackLeft - 6}
        y={TRACK_Y}
        textAnchor="end"
        dominantBaseline="middle"
        className="fill-muted-foreground font-mono text-3xs tabular-nums"
      >
        {startLabel}
      </text>

      {/* Right edge label */}
      <text
        x={trackRight + 6}
        y={TRACK_Y}
        textAnchor="start"
        dominantBaseline="middle"
        className="fill-muted-foreground font-mono text-3xs tabular-nums"
      >
        {endLabel}
      </text>

      {/* Unselected track (faint) */}
      <line
        x1={trackLeft}
        x2={trackRight}
        y1={TRACK_Y}
        y2={TRACK_Y}
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Selected segment — bold accent between the handles */}
      <line
        x1={handleStartX}
        x2={handleEndX}
        y1={TRACK_Y}
        y2={TRACK_Y}
        stroke={ACCENT}
        strokeOpacity={0.75}
        strokeWidth={3}
        strokeLinecap="round"
      />

      {/* Body drag affordance — an invisible wider hit area along the
          selected segment so the user can grab anywhere inside it. */}
      <rect
        x={handleStartX}
        y={TRACK_Y - HANDLE_HIT_R}
        width={Math.max(0, handleEndX - handleStartX)}
        height={HANDLE_HIT_R * 2}
        fill="transparent"
        style={{ cursor: bodyCursor }}
        onPointerDown={(e) => {
          e.preventDefault();
          beginDrag('body', e.clientX);
        }}
      />

      {/* Start handle */}
      <circle
        cx={handleStartX}
        cy={TRACK_Y}
        r={HANDLE_R}
        fill={ACCENT}
        stroke="var(--background, white)"
        strokeWidth={1.5}
        style={{ cursor: 'ew-resize' }}
      />
      <circle
        cx={handleStartX}
        cy={TRACK_Y}
        r={HANDLE_HIT_R}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          beginDrag('start', e.clientX);
        }}
      />

      {/* End handle */}
      <circle
        cx={handleEndX}
        cy={TRACK_Y}
        r={HANDLE_R}
        fill={ACCENT}
        stroke="var(--background, white)"
        strokeWidth={1.5}
        style={{ cursor: 'ew-resize' }}
      />
      <circle
        cx={handleEndX}
        cy={TRACK_Y}
        r={HANDLE_HIT_R}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          beginDrag('end', e.clientX);
        }}
      />
    </svg>
  );
}
