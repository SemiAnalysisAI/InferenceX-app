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
  left: number;
  top: number;
  arrowX1: number;
  arrowY1: number;
  arrowX2: number;
  arrowY2: number;
  side: CoachMarkSide;
}

export const COACH_MARK_GAP = 52;
export const COACH_MARK_MARGIN = 12;
const ARROW_INSET = 20;
const ON_SCREEN_INSET = 24;

export function viewportSize(): Size {
  const root = document.documentElement;
  return {
    width: root.clientWidth || window.innerWidth,
    height: root.clientHeight || window.innerHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
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

export function isAnchorOnScreen(rect: AnchorRect, viewport: Size): boolean {
  return isAnchorWithin(
    rect,
    { left: 0, top: 0, right: viewport.width, bottom: viewport.height },
    ON_SCREEN_INSET,
  );
}

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
