'use client';

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/shared/utils';

import {
  CHART_TOOLTIP_Z_INDEX,
  placeFloatingTooltip,
  stickyHeaderBottom,
} from './tooltip-placement';

interface FloatingTooltipProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
  /** Pointer or anchor position in viewport coordinates (`clientX` / `clientY`). */
  x: number;
  y: number;
  /** Space between the anchor and the card, never less than 12px. */
  offset?: number;
  /**
   * Side used when no chart SVG is under the anchor. Over a chart the card takes the
   * quadrant away from the anchor's position in the plot.
   */
  placement?: 'below' | 'above';
  style?: CSSProperties;
  /** Skips the shared tooltip card when the content draws its own surface. */
  bare?: boolean;
  children: ReactNode;
}

/**
 * Hover tooltip for custom (non-D3Chart) charts. It renders into `document.body`
 * on the shared chart tooltip layer, so the next chart, an `overflow` wrapper or a
 * transformed dialog can't cover, clip or offset it. It draws the same card as
 * `chartTooltipShellStyle`, so callers pass only content classes.
 */
export function FloatingTooltip({
  x,
  y,
  offset = 12,
  placement = 'below',
  className,
  style,
  bare = false,
  children,
  ...props
}: FloatingTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    const { left, top } = placeFloatingTooltip({
      x,
      y,
      width: node.offsetWidth,
      height: node.offsetHeight,
      offset,
      placement,
      viewportWidth: root.clientWidth || window.innerWidth,
      viewportHeight: root.clientHeight || window.innerHeight,
      headerBottom: stickyHeaderBottom(),
    });
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  });

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      {...props}
      className={cn(
        'pointer-events-none fixed',
        !bare && 'rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md',
        className,
      )}
      style={{ ...style, left: x + offset, top: y + offset, zIndex: CHART_TOOLTIP_Z_INDEX }}
    >
      {children}
    </div>,
    document.body,
  );
}
