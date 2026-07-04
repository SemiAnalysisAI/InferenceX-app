'use client';

import { useState, type ReactNode } from 'react';

/** Vertical crosshair + floating value tooltip overlay shared by every chart. */
export interface HoverItem {
  /** Color swatch to render next to the label. */
  color: string;
  label: string;
  value: string;
  /** Optional faint secondary line (e.g. timestamp under main values). */
  hint?: string;
}

interface ChartHoverProps {
  /** Padding inside the SVG; matches the chart's CHART_PAD. */
  pad: { top: number; right: number; bottom: number; left: number };
  /** SVG viewBox dimensions used to render the chart. */
  width: number;
  height: number;
  /**
   * Called with the cursor's normalized x in [0..1] across the plot area.
   * Returns `null` to hide the tooltip (e.g. cursor outside data range).
   */
  resolve: (xFraction: number) => { items: HoverItem[]; title?: string } | null;
  children: ReactNode;
}

/**
 * Wrap a chart's <svg> render to add mouse-driven crosshair + tooltip.
 *
 * The chart owner renders its bars / lines / axes via `children`; this wrapper
 * adds an invisible <rect> across the plot area to capture pointer events, a
 * vertical line that follows the cursor, and a floating tooltip on the right
 * of the cursor (auto-flipping to the left when it would overflow).
 */
export function ChartHover({ pad, width, height, resolve, children }: ChartHoverProps) {
  const [hover, setHover] = useState<{
    xPx: number;
    yPx: number;
    fraction: number;
    items: HoverItem[];
    title?: string;
  } | null>(null);

  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Convert client coords → SVG viewBox coords.
    const sx = ((e.clientX - rect.left) * width) / rect.width;
    const sy = ((e.clientY - rect.top) * height) / rect.height;
    const fraction = Math.max(0, Math.min(1, (sx - pad.left) / innerW));
    const resolved = resolve(fraction);
    if (!resolved) {
      setHover(null);
      return;
    }
    setHover({ xPx: sx, yPx: sy, fraction, items: resolved.items, title: resolved.title });
  };

  const onLeave = () => setHover(null);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto text-foreground"
      >
        {children}
        {hover && (
          <line
            x1={hover.xPx}
            x2={hover.xPx}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.4}
            pointerEvents="none"
          />
        )}
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        />
      </svg>
      {hover && hover.items.length > 0 && (
        <HoverTooltip
          xFraction={hover.fraction}
          containerWidth={width}
          padLeft={pad.left}
          innerW={innerW}
          title={hover.title}
          items={hover.items}
        />
      )}
    </div>
  );
}

function HoverTooltip({
  xFraction,
  containerWidth,
  padLeft,
  innerW,
  title,
  items,
}: {
  xFraction: number;
  containerWidth: number;
  padLeft: number;
  innerW: number;
  title?: string;
  items: HoverItem[];
}) {
  // Position tooltip near the crosshair as a % of the container.
  // We flip to the cursor's left side when it would overflow the right edge.
  const xPx = padLeft + xFraction * innerW;
  const onRight = xPx < containerWidth * 0.55;
  const left = onRight ? `${(xPx / containerWidth) * 100}%` : 'auto';
  const right = onRight ? 'auto' : `${((containerWidth - xPx) / containerWidth) * 100}%`;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md"
      style={{ left, right, marginLeft: onRight ? 8 : 0, marginRight: onRight ? 0 : 8 }}
    >
      {title && <div className="font-medium text-foreground mb-1">{title}</div>}
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5 leading-tight">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: it.color }} />
          <span className="text-muted-foreground">{it.label}</span>
          <span className="ml-auto font-medium text-foreground tabular-nums">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
