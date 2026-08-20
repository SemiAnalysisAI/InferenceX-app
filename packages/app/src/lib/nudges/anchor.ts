/**
 * Geometry for anchored (coach-mark) nudges.
 *
 * Kept free of DOM APIs so the placement rules are unit-testable: callers pass
 * plain rects measured with `getBoundingClientRect()` and get viewport
 * coordinates back. The DOM-facing half — which element to point at — lives
 * next to each nudge (see `agentic-point-coach-mark.ts`).
 */

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type CoachMarkSide = 'above' | 'below';

export interface CoachMarkPlacement {
  /** Card top-left, in viewport coordinates. */
  left: number;
  top: number;
  /** Pointer start — on the card edge facing the anchor. */
  arrowX1: number;
  arrowY1: number;
  /** Pointer end — the anchor's centre. */
  arrowX2: number;
  arrowY2: number;
  side: CoachMarkSide;
}

/** Gap between the anchor centre and the nearest card edge. */
export const COACH_MARK_GAP = 52;
/** Minimum distance the card keeps from every viewport edge. */
export const COACH_MARK_MARGIN = 12;
/** How far the pointer's card-edge end stays from the card's corners. */
const ARROW_INSET = 20;
/**
 * A candidate must sit this far inside the viewport to be anchor-worthy — a
 * point clipped by the plot edge would get a pointer running off-canvas.
 */
const ON_SCREEN_INSET = 24;

/**
 * Current viewport in CSS pixels. The one DOM touch in this module, kept here
 * so the resolver and the renderer measure against exactly the same box.
 * `clientWidth` excludes the scrollbar (what a fixed overlay is laid out
 * against); the `innerWidth` fallback covers environments — jsdom, an
 * unattached document — that report 0.
 */
export function viewportSize(): Size {
  const root = document.documentElement;
  return {
    width: root.clientWidth || window.innerWidth,
    height: root.clientHeight || window.innerHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
  // When the card is wider/taller than the space available, `min > max`; bias
  // to `min` so the card stays pinned to the top-left edge rather than
  // flipping to a negative offset.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function anchorCentre(rect: AnchorRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Does this anchor sit comfortably inside `bounds`? Rejects zero-size rects (a
 * hidden or not-yet-rendered element) and anything whose centre falls outside,
 * or within `inset` of, the edge.
 */
export function isAnchorWithin(rect: AnchorRect, bounds: Bounds, inset = 0): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  const { x, y } = anchorCentre(rect);
  return (
    x >= bounds.left + inset &&
    x <= bounds.right - inset &&
    y >= bounds.top + inset &&
    y <= bounds.bottom - inset
  );
}

/**
 * Is this anchor usable right now? Off-screen anchors, and anchors hugging a
 * viewport edge (where the pointer would run off-canvas), are not.
 */
export function isAnchorOnScreen(rect: AnchorRect, viewport: Size): boolean {
  return isAnchorWithin(
    rect,
    { left: 0, top: 0, right: viewport.width, bottom: viewport.height },
    ON_SCREEN_INSET,
  );
}

/**
 * Place the callout near the anchor without ever leaving the viewport.
 *
 * Prefers below the anchor (the chart's x-axis and its caption sit there, so
 * the card covers less data) and flips above when it would overflow the
 * bottom. Both axes are clamped, so a card can end up offset from the anchor —
 * the pointer still connects the two, which is why the arrow is computed from
 * the *placed* card rather than the desired position.
 */
export function computeCoachMarkPlacement(
  rect: AnchorRect,
  card: Size,
  viewport: Size,
): CoachMarkPlacement {
  const { x: cx, y: cy } = anchorCentre(rect);

  const belowTop = cy + COACH_MARK_GAP;
  const fitsBelow = belowTop + card.height <= viewport.height - COACH_MARK_MARGIN;
  const side: CoachMarkSide = fitsBelow ? 'below' : 'above';

  const desiredTop = fitsBelow ? belowTop : cy - COACH_MARK_GAP - card.height;
  const top = clamp(
    desiredTop,
    COACH_MARK_MARGIN,
    Math.max(COACH_MARK_MARGIN, viewport.height - card.height - COACH_MARK_MARGIN),
  );
  const left = clamp(
    cx - card.width / 2,
    COACH_MARK_MARGIN,
    Math.max(COACH_MARK_MARGIN, viewport.width - card.width - COACH_MARK_MARGIN),
  );

  const arrowX1 = clamp(
    cx,
    left + Math.min(ARROW_INSET, card.width / 2),
    left + card.width - Math.min(ARROW_INSET, card.width / 2),
  );
  const arrowY1 = side === 'below' ? top : top + card.height;

  return { left, top, arrowX1, arrowY1, arrowX2: cx, arrowY2: cy, side };
}
