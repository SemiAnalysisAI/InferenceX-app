/**
 * Placement for the results chart's end-of-line pills and point labels, in plot pixels.
 * Pure, so the rules the chart draws by can be tested without a browser.
 */

/**
 * Whether the chart labels each focus point with its GPU count. The reader's switch decides once
 * it is set; until then a phone's plot, too narrow for them, starts with the labels off. The
 * point sheet states the GPU count either way.
 */
export const deploymentLabels = (picked: boolean | null, phone: boolean): boolean =>
  picked ?? !phone;

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
 * moves the whole stack rather than piling pills into one band. A pill the bottom-up pass
 * would lift onto a shown label in `labels` hops above that label instead. Only a stack
 * taller than the plot can still overlap. Returns new boxes in the input order.
 */
export function spreadPills(
  pills: readonly PillBox[],
  plotHeight: number,
  labels: readonly Box[] = [],
): PillBox[] {
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
    for (const label of labels.toSorted((p, q) => q.y0 - p.y0))
      if (boxesOverlap(label, { x0: a.x, x1: a.x + a.width, y0: a.y, y1: a.y + PILL_HEIGHT }))
        a.y = label.y0 - EDGE - PILL_HEIGHT;
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

export interface Spot {
  x: number;
  y: number;
}

/** Whether the straight line from `a` to `b` passes through `box` (Liang–Barsky clipping). */
export function segmentCrosses(a: Spot, b: Spot, box: Box): boolean {
  let enter = 0;
  let leave = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [step, room] of [
    [-dx, a.x - box.x0],
    [dx, box.x1 - a.x],
    [-dy, a.y - box.y0],
    [dy, box.y1 - a.y],
  ]) {
    if (step === 0) {
      if (room <= 0) return false;
      continue;
    }
    const at = room / step;
    if (step < 0) enter = Math.max(enter, at);
    else leave = Math.min(leave, at);
    if (enter >= leave) return false;
  }
  return true;
}

/** Height of the Playing and Baseline badges. */
export const BADGE_HEIGHT = 16;
/** Gap between a point's centre and its badge. */
const BADGE_OFFSET = 12;

/** What a badge or pill should not cover: earlier badges, labels and pills, the points, and the lines. */
export interface MarkObstacles {
  boxes: readonly Box[];
  points: readonly Spot[];
  lines: readonly (readonly Spot[])[];
}

/** Half the side of the square a point's mark and its ring take on the plot. */
const POINT_REACH = 10;

/** How much of `obstacles` a mark in `box` covers: a box counts most, then a point, then a line. */
function covered(box: Box, obstacles: MarkObstacles): number {
  const boxes = obstacles.boxes.filter((other) => boxesOverlap(other, box)).length;
  const points = obstacles.points.filter((point) =>
    boxesOverlap(box, {
      x0: point.x - POINT_REACH,
      x1: point.x + POINT_REACH,
      y0: point.y - POINT_REACH,
      y1: point.y + POINT_REACH,
    }),
  ).length;
  const lines = obstacles.lines.reduce(
    (sum, line) =>
      sum + line.slice(1).filter((spot, index) => segmentCrosses(line[index], spot, box)).length,
    0,
  );
  return boxes * 100 + points * 10 + lines;
}

/**
 * A badge for the point at `at`: centred above it and shifted sideways to stay inside the plot.
 * It goes below the point instead when the plot's top edge is in the way, or when it would cover
 * less of `obstacles` there: an earlier badge, another point or a line.
 */
export function badgeBox(
  at: Spot,
  width: number,
  plot: { width: number; height: number },
  obstacles: MarkObstacles,
): Box {
  const x0 = at.x - width / 2 + labelShift(at.x, width, plot.width);
  const above = {
    x0,
    x1: x0 + width,
    y0: at.y - BADGE_OFFSET - BADGE_HEIGHT,
    y1: at.y - BADGE_OFFSET,
  };
  const below = { ...above, y0: at.y + BADGE_OFFSET, y1: at.y + BADGE_OFFSET + BADGE_HEIGHT };
  if (above.y0 < EDGE) return below;
  if (below.y1 > plot.height - EDGE) return above;
  return covered(below, obstacles) < covered(above, obstacles) ? below : above;
}

/**
 * Where a series pill goes: right of its last point, else above it, below it, or left of it, the
 * first of those that stays inside the plot and covers none of `obstacles`. A place over one of
 * the shown `labels` is also judged where `clearOfLabels` moves the pill to, so stepping off a
 * label never lands the pill on a point, a line or another mark. When every place covers
 * something, the one that covers least wins. `spreadPills` still runs afterwards for pills left on
 * each other.
 */
export function placePill(
  key: string,
  end: Spot,
  width: number,
  plot: { width: number; height: number },
  obstacles: MarkObstacles,
  labels: readonly Box[] = [],
): PillBox {
  const inside = (x: number) =>
    Math.max(EDGE, Math.min(x, Math.max(EDGE, plot.width - EDGE - width)));
  const middle = end.y - PILL_HEIGHT / 2;
  const beside = inside(end.x + PILL_OFFSET);
  const candidates: PillBox[] = [
    ...(end.x + PILL_OFFSET + width <= plot.width
      ? [{ key, x: end.x + PILL_OFFSET, y: middle, width }]
      : []),
    { key, x: beside, y: end.y - PILL_OFFSET - PILL_HEIGHT, width },
    { key, x: beside, y: end.y + PILL_OFFSET, width },
    { key, x: inside(end.x - PILL_OFFSET - width), y: middle, width },
  ].filter((pill) => pill.y >= EDGE && pill.y + PILL_HEIGHT <= plot.height - EDGE);
  // Off the plot at every place: the right or left of the point, which `spreadPills` clamps.
  if (candidates.length === 0)
    return clearOfLabels(pillBox(key, end, width, plot.width), end, labels, plot.width);
  const edges = (pill: PillBox) => ({
    x0: pill.x,
    x1: pill.x + pill.width,
    y0: pill.y,
    y1: pill.y + PILL_HEIGHT,
  });
  const all = { ...obstacles, boxes: [...obstacles.boxes, ...labels] };
  let best = candidates[0];
  let least = Infinity;
  for (const candidate of candidates) {
    const moved = clearOfLabels({ ...candidate }, end, labels, plot.width);
    const stayed = moved.x === candidate.x && moved.y === candidate.y;
    const cost = covered(edges(candidate), obstacles) + (stayed ? 0 : covered(edges(moved), all));
    if (cost < least) {
      best = moved;
      least = cost;
    }
    if (least === 0) break;
  }
  return best;
}

/** How far from a point's centre a finger still picks it, in px: half a 44 px touch target. */
export const TAP_RADIUS = 22;
/** Points whose distances from a tap differ by no more than this, in px, a finger cannot tell apart. */
const TAP_TIE = 8;

export interface TapPoint {
  key: string;
  x: number;
  y: number;
}

/**
 * The point a tap picks: the nearest within `TAP_RADIUS`, or null when none is that close. Points a
 * finger cannot tell apart take turns, nearest first: a tap that would pick the point picked
 * `last` picks the next of them instead, so two overlapping points are both reachable.
 */
export function tapTarget(
  tap: { x: number; y: number },
  points: readonly TapPoint[],
  last: string | null,
): string | null {
  const near = points
    .map((point) => ({ key: point.key, distance: Math.hypot(point.x - tap.x, point.y - tap.y) }))
    .filter((point) => point.distance <= TAP_RADIUS)
    .toSorted((a, b) => a.distance - b.distance);
  if (near.length === 0) return null;
  const tied = near.filter((point) => point.distance - near[0].distance <= TAP_TIE);
  const picked = tied.findIndex((point) => point.key === last);
  return tied[(picked + 1) % tied.length].key;
}
