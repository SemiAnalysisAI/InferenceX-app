'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BAR_HEIGHT = 28;
const TRACK_Y = 14;
const HANDLE_R = 6;
const HANDLE_HIT_R = 10;
const ACCENT = 'currentColor';

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
  fullStart: number;
  fullEnd: number;
}

interface UseBrushResult {
  start: number;
  end: number;
  setBrush: (start: number, end: number) => void;
  reset: () => void;
  isActive: boolean;
}

export function useBrush({ fullStart, fullEnd }: UseBrushOptions): UseBrushResult {
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
  width: number;
  fullStart: number;
  fullEnd: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  formatValue: (v: number) => string;
  labelPadding?: number;
}

type DragMode = 'start' | 'end' | 'body' | null;

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
      <text
        x={trackLeft - 6}
        y={TRACK_Y}
        textAnchor="end"
        dominantBaseline="middle"
        className="fill-muted-foreground font-mono text-3xs tabular-nums"
      >
        {startLabel}
      </text>

      <text
        x={trackRight + 6}
        y={TRACK_Y}
        textAnchor="start"
        dominantBaseline="middle"
        className="fill-muted-foreground font-mono text-3xs tabular-nums"
      >
        {endLabel}
      </text>

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
