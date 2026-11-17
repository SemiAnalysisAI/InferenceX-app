/**
 * Motion for /vgx. A change of state eases from the old state to the new one; nothing moves
 * for its own sake. The durations and curves are the site's own (`src/app/motion.css` and the
 * inference chart's 300 ms glide), named once here for the code that animates from script.
 * `prefers-reduced-motion: reduce` makes every one of them an immediate change.
 */
export const MOTION = {
  /** Feedback on a hover or press, and anything that leaves: `--motion-dur-fast`. */
  fast: 150,
  /** Content that appears or moves to a new place: `--motion-dur-base`. */
  base: 220,
  /** Chart points, lines and axes gliding to new data, as on the inference scatter chart. */
  glide: 300,
} as const;

type Bezier = readonly [number, number, number, number];

/** One coordinate of a cubic bezier from 0 to 1 with control values `a` and `b`, at parameter `u`. */
const cubic = (a: number, b: number, u: number) =>
  3 * a * u * (1 - u) ** 2 + 3 * b * u ** 2 * (1 - u) + u ** 3;

/** The site's curves, as their cubic-bezier control points. */
export const EASE = {
  /** `--motion-ease-enter`: fast out of the old state, soft into the new one. */
  enter: [0.22, 1, 0.36, 1],
  /** `--motion-ease-standard`: content that moves between two places. */
  standard: [0.2, 0, 0, 1],
  /** `--motion-ease-exit`: content that leaves. */
  exit: [0.3, 0, 1, 1],
} as const satisfies Record<string, Bezier>;

/** A curve as CSS, for the Web Animations API. */
export const cssEase = (curve: Bezier): string => `cubic-bezier(${curve.join(', ')})`;

/** Progress along a cubic-bezier timing curve at time `t`, both from 0 to 1. */
export function bezier([x1, y1, x2, y2]: Bezier, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // The curve's x is monotonic in its parameter, so bisection finds the parameter for `t`.
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (cubic(x1, x2, mid) < t) low = mid;
    else high = mid;
  }
  return cubic(y1, y2, (low + high) / 2);
}

/** Whether the reader asked for reduced motion; false where the question cannot be asked. */
export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

interface Place {
  x: number;
  y: number;
}

interface Moving {
  /** What the mark is attached to: a point's key. */
  anchor: string;
  /** Its offset from that point, which changes only when it is placed on another side. */
  offset: Place;
  /** Where it was last drawn. */
  shown: Place;
  /** Where its move began, while it moves. */
  from: Place | null;
  start: number;
  /** When it first appeared; a mark there from the first draw never fades in. */
  born: number;
}

/**
 * Where each chart mark (a badge, a series pill, the sheet's ring) was last drawn. A mark follows
 * its point exactly while the point glides, zooms or pans. It eases to a new place only when it
 * is attached to another point or placed on another side of its own, and it fades in when new.
 */
export interface MarkMotion {
  marks: Map<string, Moving>;
  /** Marks drawn in the current pass; the rest are forgotten when the pass ends. */
  seen: Set<string>;
  /** False until the first pass that drew a mark: what is there at the start does not fade in. */
  seeded: boolean;
}

export const markMotion = (): MarkMotion => ({ marks: new Map(), seen: new Set(), seeded: false });

/** A mark's offset has to change by more than this, in px, to count as a new placement. */
const PLACED_ELSEWHERE = 1;

/**
 * Where to draw a mark now, and how opaque. `target` is where it belongs and `anchorAt` the
 * point it is attached to, both in plot pixels. `moving` says whether it is still on its way.
 */
export function markStep(
  motion: MarkMotion,
  id: string,
  anchor: string,
  anchorAt: Place,
  target: Place,
  now: number,
): Place & { opacity: number; moving: boolean } {
  motion.seen.add(id);
  const offset = { x: target.x - anchorAt.x, y: target.y - anchorAt.y };
  const mark = motion.marks.get(id);
  if (!mark) {
    const born = motion.seeded ? now : -Infinity;
    motion.marks.set(id, { anchor, offset, shown: target, from: null, start: 0, born });
    return { ...target, opacity: born === now ? 0 : 1, moving: born === now };
  }
  const elsewhere =
    mark.anchor !== anchor ||
    Math.hypot(mark.offset.x - offset.x, mark.offset.y - offset.y) > PLACED_ELSEWHERE;
  if (elsewhere) {
    mark.from = mark.shown;
    mark.start = now;
  }
  mark.anchor = anchor;
  mark.offset = offset;
  let shown = target;
  if (mark.from) {
    const t = (now - mark.start) / MOTION.base;
    if (t >= 1) mark.from = null;
    else {
      const eased = bezier(EASE.standard, t);
      shown = {
        x: mark.from.x + (target.x - mark.from.x) * eased,
        y: mark.from.y + (target.y - mark.from.y) * eased,
      };
    }
  }
  mark.shown = shown;
  const age = (now - mark.born) / MOTION.fast;
  const opacity = age >= 1 ? 1 : bezier(EASE.enter, age);
  return { ...shown, opacity, moving: mark.from !== null || age < 1 };
}

/** Ends a drawing pass: marks that were not drawn in it are forgotten. */
export function markPassEnd(motion: MarkMotion): void {
  for (const id of motion.marks.keys()) if (!motion.seen.has(id)) motion.marks.delete(id);
  if (motion.seen.size > 0) motion.seeded = true;
  motion.seen.clear();
}
