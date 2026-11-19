/**
 * Chart tooltips paint above page content, sticky toolbars and open dialogs (z-50/z-60).
 * They are portaled to `document.body`, so no card, overflow or transform can trap them,
 * and they clamp below the sticky site header so it stays visible.
 */
export const CHART_TOOLTIP_Z_INDEX = 9999;

const EDGE_PAD = 8;
/** Minimum space between the anchor point and the card, so the card never covers it. */
const MIN_GAP = 12;

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

export interface PlacementBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Viewport bounds of the outermost chart SVG under a viewport point, if any. */
export function plotBoundsAt(x: number, y: number): PlacementBounds | undefined {
  if (typeof document === 'undefined') return undefined;
  // jsdom has no elementFromPoint.
  let svg = document.elementFromPoint?.(x, y)?.closest('svg') ?? null;
  while (svg?.ownerSVGElement) svg = svg.ownerSVGElement;
  return svg?.getBoundingClientRect();
}

export interface FloatingTooltipPlacement {
  /** Pointer or anchor position in viewport coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Space between the anchor and the card, never less than 12px. */
  offset: number;
  /** Preferred side of the anchor when no plot bounds are known. */
  placement: 'below' | 'above';
  /**
   * Plot the anchor sits in, in viewport coordinates. Defaults to the chart SVG under
   * the anchor. The card takes the quadrant away from the anchor's half of the plot.
   */
  bounds?: PlacementBounds;
  viewportWidth: number;
  viewportHeight: number;
  headerBottom: number;
}

/**
 * Place a fixed tooltip diagonally off the anchor, in the quadrant away from where the
 * anchor sits in the plot: left of it in the plot's right half, below it in the plot's
 * top half. A side without room flips, and the card is clamped inside the viewport.
 */
export function placeFloatingTooltip({
  x,
  y,
  width,
  height,
  offset,
  placement,
  bounds = plotBoundsAt(x, y),
  viewportWidth,
  viewportHeight,
  headerBottom,
}: FloatingTooltipPlacement): { left: number; top: number } {
  const gap = Math.max(MIN_GAP, offset);
  const minTop = headerBottom > 0 ? headerBottom + EDGE_PAD : EDGE_PAD;
  const maxTop = viewportHeight - height - EDGE_PAD;

  const right = x + gap;
  const leftOf = x - gap - width;
  const fitsRight = right + width + EDGE_PAD <= viewportWidth;
  const fitsLeft = leftOf >= EDGE_PAD;
  const preferLeft = bounds ? x > (bounds.left + bounds.right) / 2 : !fitsRight;
  let left = preferLeft
    ? fitsLeft || !fitsRight
      ? leftOf
      : right
    : fitsRight || !fitsLeft
      ? right
      : leftOf;
  left = Math.max(EDGE_PAD, Math.min(viewportWidth - width - EDGE_PAD, left));

  const below = y + gap;
  const above = y - gap - height;
  const fitsBelow = below + height + EDGE_PAD <= viewportHeight;
  const fitsAbove = above >= minTop;
  const preferAbove = bounds ? y > (bounds.top + bounds.bottom) / 2 : placement === 'above';
  let top = preferAbove
    ? fitsAbove || !fitsBelow
      ? above
      : below
    : fitsBelow || !fitsAbove
      ? below
      : above;
  top = Math.max(minTop, Math.min(maxTop, top));
  if (maxTop < minTop) top = Math.max(EDGE_PAD, maxTop);

  return { left, top };
}
