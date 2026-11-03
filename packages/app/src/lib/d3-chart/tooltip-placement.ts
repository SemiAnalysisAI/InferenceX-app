/**
 * Chart tooltips paint above page content, sticky toolbars and open dialogs (z-50/z-60).
 * They are portaled to `document.body`, so no card, overflow or transform can trap them,
 * and they clamp below the sticky site header so it stays visible.
 */
export const CHART_TOOLTIP_Z_INDEX = 9999;

const EDGE_PAD = 8;

/**
 * The bottom edge of the sticky site header while it covers the top of the
 * viewport, so a tall tooltip clamps below it instead of underneath it.
 */
export function stickyHeaderBottom(): number {
  if (typeof document === 'undefined') return 0;
  const header = document.querySelector<HTMLElement>('header.vt-site-header');
  if (!header) return 0;
  const rect = header.getBoundingClientRect();
  return rect.top <= 0 && rect.bottom > 0 ? rect.bottom : 0;
}

export interface FloatingTooltipPlacement {
  /** Pointer or anchor position in viewport coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  offset: number;
  /** Preferred side of the anchor; flips when that side has no room. */
  placement: 'below' | 'above';
  viewportWidth: number;
  viewportHeight: number;
  headerBottom: number;
}

/**
 * Place a fixed tooltip next to the pointer: to the right (or left when the right
 * edge has no room), on the preferred vertical side, and clamped inside the viewport.
 */
export function placeFloatingTooltip({
  x,
  y,
  width,
  height,
  offset,
  placement,
  viewportWidth,
  viewportHeight,
  headerBottom,
}: FloatingTooltipPlacement): { left: number; top: number } {
  const minTop = headerBottom > 0 ? headerBottom + EDGE_PAD : EDGE_PAD;
  const maxTop = viewportHeight - height - EDGE_PAD;

  let left = x + offset + width + EDGE_PAD <= viewportWidth ? x + offset : x - offset - width;
  left = Math.max(EDGE_PAD, Math.min(viewportWidth - width - EDGE_PAD, left));

  const below = y + offset;
  const above = y - offset - height;
  let top =
    placement === 'above'
      ? above >= minTop
        ? above
        : below
      : below + height + EDGE_PAD <= viewportHeight
        ? below
        : above;
  top = Math.max(minTop, Math.min(maxTop, top));
  if (maxTop < minTop) top = Math.max(EDGE_PAD, maxTop);

  return { left, top };
}
