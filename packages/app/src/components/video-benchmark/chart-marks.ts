/**
 * Placement for the results chart's end-of-line pills and point labels, in plot pixels.
 * Pure, so the rules the chart draws by can be tested without a browser.
 */

export const PILL_HEIGHT = 18;
/** Vertical pitch between stacked pills: one pill and a 3 px gap. */
const PILL_PITCH = PILL_HEIGHT + 3;
/** Gap between a series' last point and its pill. */
const PILL_OFFSET = 12;
/** Horizontal clearance two pills need before they count as side by side. */
const PILL_CLEARANCE = 4;
/** Inset that keeps a label or pill off the plot edge. */
const EDGE = 2;

export interface PillBox {
  key: string;
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  width: number;
}

/**
 * A pill beside a series' last frontier point: to its right when it fits inside the
 * plot, otherwise to its left, vertically centred on the point.
 */
export function pillBox(
  key: string,
  end: { x: number; y: number },
  width: number,
  plotWidth: number,
): PillBox {
  const right = end.x + PILL_OFFSET + width <= plotWidth;
  return {
    key,
    x: right ? end.x + PILL_OFFSET : Math.max(EDGE, end.x - PILL_OFFSET - width),
    y: end.y - PILL_HEIGHT / 2,
    width,
  };
}

/**
 * Pushes colliding pills apart and keeps them inside the plot: a top-down pass from the
 * top edge, then a bottom-up pass from the bottom edge, so clamping a stack at either edge
 * moves the whole stack rather than piling pills into one band. Only a stack taller than
 * the plot can still overlap. Returns new boxes in the input order.
 */
export function spreadPills(pills: readonly PillBox[], plotHeight: number): PillBox[] {
  const placed = pills.map((pill) => ({ ...pill }));
  const sorted = placed.toSorted((a, b) => a.y - b.y);
  const sideBySide = (a: PillBox, b: PillBox) =>
    a.x < b.x + b.width + PILL_CLEARANCE && b.x < a.x + a.width + PILL_CLEARANCE;
  const bottom = plotHeight - PILL_HEIGHT - EDGE;
  for (const [i, b] of sorted.entries()) {
    b.y = Math.max(b.y, EDGE);
    for (const a of sorted.slice(0, i))
      if (sideBySide(a, b) && b.y < a.y + PILL_PITCH) b.y = a.y + PILL_PITCH;
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const a = sorted[i];
    a.y = Math.min(a.y, bottom);
    for (const b of sorted.slice(i + 1))
      if (sideBySide(a, b) && a.y > b.y - PILL_PITCH) a.y = b.y - PILL_PITCH;
  }
  for (const pill of placed) pill.y = Math.max(EDGE, Math.min(pill.y, bottom));
  return placed;
}

/**
 * Horizontal shift that keeps a label of `width`, centred on `x`, inside the plot, so a
 * label on a point near the left or right edge is not clipped.
 */
export function labelShift(x: number, width: number, plotWidth: number): number {
  const left = x - width / 2;
  if (left < EDGE) return EDGE - left;
  const right = x + width / 2;
  if (right > plotWidth - EDGE) return Math.max(plotWidth - EDGE - right, EDGE - left);
  return 0;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Moves a pill off the shown point labels it would cover, in place: a pill right of its
 * point steps past the label when the plot has room, otherwise it drops below the label.
 */
export function clearOfLabels(
  pill: PillBox,
  end: { x: number },
  labels: readonly Box[],
  plotWidth: number,
): PillBox {
  const edges = () => ({
    x0: pill.x,
    x1: pill.x + pill.width,
    y0: pill.y,
    y1: pill.y + PILL_HEIGHT,
  });
  for (const label of labels.toSorted((a, b) => a.y0 - b.y0)) {
    if (!boxesOverlap(label, edges())) continue;
    if (pill.x > end.x && label.x1 + PILL_CLEARANCE + pill.width <= plotWidth - EDGE)
      pill.x = label.x1 + PILL_CLEARANCE;
    else pill.y = label.y1 + EDGE;
  }
  return pill;
}

export const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
