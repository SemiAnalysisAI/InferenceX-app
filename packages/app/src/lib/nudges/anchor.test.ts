import { describe, expect, it } from 'vitest';

import {
  COACH_MARK_MARGIN,
  anchorCentre,
  computeCoachMarkPlacement,
  isAnchorOnScreen,
  isAnchorWithin,
  type AnchorRect,
  type Size,
} from './anchor';

const VIEWPORT: Size = { width: 1280, height: 800 };
const CARD: Size = { width: 288, height: 96 };

const point = (left: number, top: number, size = 12): AnchorRect => ({
  left,
  top,
  width: size,
  height: size,
});

function cardRect(placement: { left: number; top: number }, card: Size = CARD) {
  return {
    left: placement.left,
    top: placement.top,
    right: placement.left + card.width,
    bottom: placement.top + card.height,
  };
}

describe('anchorCentre', () => {
  it('returns the geometric centre of the rect', () => {
    expect(anchorCentre({ left: 100, top: 40, width: 20, height: 10 })).toEqual({ x: 110, y: 45 });
  });
});

describe('isAnchorOnScreen', () => {
  it('accepts a point well inside the viewport', () => {
    expect(isAnchorOnScreen(point(600, 400), VIEWPORT)).toBe(true);
  });

  it('rejects a zero-size rect (element not rendered yet)', () => {
    expect(isAnchorOnScreen({ left: 600, top: 400, width: 0, height: 0 }, VIEWPORT)).toBe(false);
  });

  it('rejects a point scrolled above the viewport', () => {
    expect(isAnchorOnScreen(point(600, -400), VIEWPORT)).toBe(false);
  });

  it('rejects a point scrolled below the viewport', () => {
    expect(isAnchorOnScreen(point(600, 1400), VIEWPORT)).toBe(false);
  });

  it('rejects a point hugging the viewport edge, where the pointer would run off-canvas', () => {
    expect(isAnchorOnScreen(point(-2, 400), VIEWPORT)).toBe(false);
    expect(isAnchorOnScreen(point(VIEWPORT.width - 4, 400), VIEWPORT)).toBe(false);
  });
});

describe('isAnchorWithin', () => {
  const plot = { left: 100, top: 100, right: 900, bottom: 500 };

  it('accepts a point inside the bounds', () => {
    expect(isAnchorWithin(point(500, 300), plot)).toBe(true);
  });

  it('rejects a point outside the bounds', () => {
    // Zooming pushes points beyond the plot, where a clip path hides them —
    // they keep an ordinary bounding box, so bounds are what rule them out.
    expect(isAnchorWithin(point(1400, 300), plot)).toBe(false);
    expect(isAnchorWithin(point(500, 40), plot)).toBe(false);
  });

  it('applies the inset to every edge', () => {
    expect(isAnchorWithin(point(104, 300), plot)).toBe(true);
    expect(isAnchorWithin(point(104, 300), plot, 40)).toBe(false);
  });

  it('rejects a zero-size rect', () => {
    expect(isAnchorWithin({ left: 500, top: 300, width: 0, height: 0 }, plot)).toBe(false);
  });
});

describe('computeCoachMarkPlacement', () => {
  it('places the card below the anchor and centres it horizontally', () => {
    const anchor = point(600, 300);
    const placement = computeCoachMarkPlacement(anchor, CARD, VIEWPORT);
    const { x: cx, y: cy } = anchorCentre(anchor);

    expect(placement.side).toBe('below');
    expect(placement.top).toBeGreaterThan(cy);
    expect(placement.left + CARD.width / 2).toBeCloseTo(cx, 5);
  });

  it('flips above the anchor when the card would overflow the bottom', () => {
    const anchor = point(600, 760);
    const placement = computeCoachMarkPlacement(anchor, CARD, VIEWPORT);

    expect(placement.side).toBe('above');
    expect(cardRect(placement).bottom).toBeLessThan(anchorCentre(anchor).y);
  });

  it('always points at the anchor centre', () => {
    const anchor = point(240, 180);
    const placement = computeCoachMarkPlacement(anchor, CARD, VIEWPORT);
    const centre = anchorCentre(anchor);

    expect(placement.arrowX2).toBe(centre.x);
    expect(placement.arrowY2).toBe(centre.y);
  });

  it('starts the pointer on the card edge that faces the anchor', () => {
    const below = computeCoachMarkPlacement(point(600, 300), CARD, VIEWPORT);
    expect(below.arrowY1).toBe(below.top);

    const above = computeCoachMarkPlacement(point(600, 760), CARD, VIEWPORT);
    expect(above.arrowY1).toBe(above.top + CARD.height);
  });

  it('keeps the pointer origin within the card, not at its corner', () => {
    // An anchor hard against the left edge pushes the card right; the pointer
    // must still start inside the card rather than beyond its corner.
    const placement = computeCoachMarkPlacement(point(30, 300), CARD, VIEWPORT);
    expect(placement.arrowX1).toBeGreaterThan(placement.left);
    expect(placement.arrowX1).toBeLessThan(placement.left + CARD.width);
  });

  it.each([
    ['top-left', point(30, 30)],
    ['top-right', point(1240, 30)],
    ['bottom-left', point(30, 770)],
    ['bottom-right', point(1240, 770)],
    ['centre', point(640, 400)],
  ])('never renders off-canvas for a %s anchor', (_label, anchor) => {
    const rect = cardRect(computeCoachMarkPlacement(anchor, CARD, VIEWPORT));

    expect(rect.left).toBeGreaterThanOrEqual(COACH_MARK_MARGIN);
    expect(rect.top).toBeGreaterThanOrEqual(COACH_MARK_MARGIN);
    expect(rect.right).toBeLessThanOrEqual(VIEWPORT.width - COACH_MARK_MARGIN);
    expect(rect.bottom).toBeLessThanOrEqual(VIEWPORT.height - COACH_MARK_MARGIN);
  });

  it('pins to the top-left margin when the card is larger than the viewport', () => {
    const tiny: Size = { width: 320, height: 240 };
    const placement = computeCoachMarkPlacement(point(160, 120), { width: 400, height: 400 }, tiny);

    expect(placement.left).toBe(COACH_MARK_MARGIN);
    expect(placement.top).toBe(COACH_MARK_MARGIN);
  });

  it('moves the card as the anchor moves (zoom / pan)', () => {
    const before = computeCoachMarkPlacement(point(400, 300), CARD, VIEWPORT);
    const after = computeCoachMarkPlacement(point(700, 300), CARD, VIEWPORT);

    expect(after.left - before.left).toBeCloseTo(300, 5);
    expect(after.arrowX2 - before.arrowX2).toBeCloseTo(300, 5);
  });
});
