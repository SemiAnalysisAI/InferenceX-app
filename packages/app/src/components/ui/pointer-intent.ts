const SAMPLE_WINDOW_MS = 40;
const LOOKAHEAD_MS = 120;
const MAX_PROJECTION_PX = 260;
const MIN_SPEED_PX_PER_MS = 0.15;
const HIT_SLOP_PX = 0;

export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

const targets = new Map<Element, () => void>();
let samples: PointerSample[] = [];
let frame = 0;

/**
 * Where the pointer is heading, from samples spanning the last few frames: velocity extrapolated
 * `LOOKAHEAD_MS` ahead, shortened to the stopping distance v²/2a while the pointer decelerates
 * (aimed movements brake into their target), capped at `MAX_PROJECTION_PX`. Null when too slow.
 */
export function projectPointer(window: readonly PointerSample[]): { x: number; y: number } | null {
  const first = window[0];
  const last = window.at(-1);
  if (!first || !last || last.t === first.t) return null;
  const dt = last.t - first.t;
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed < MIN_SPEED_PX_PER_MS) return null;
  let distance = Math.min(speed * LOOKAHEAD_MS, MAX_PROJECTION_PX);
  const mid = window[window.length >> 1]!;
  if (window.length >= 3 && mid.t > first.t && last.t > mid.t) {
    const before = Math.hypot(mid.x - first.x, mid.y - first.y) / (mid.t - first.t);
    const after = Math.hypot(last.x - mid.x, last.y - mid.y) / (last.t - mid.t);
    const accel = (after - before) / (dt / 2);
    if (accel < 0) distance = Math.min(distance, (speed * speed) / (2 * -accel));
  }
  return { x: last.x + (vx / speed) * distance, y: last.y + (vy / speed) * distance };
}

/** True when the segment from (x0, y0) to (x1, y1) crosses `rect` grown by `slop` on every side. */
export function segmentHitsRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: { left: number; top: number; right: number; bottom: number },
  slop = 0,
): boolean {
  const left = rect.left - slop;
  const right = rect.right + slop;
  const top = rect.top - slop;
  const bottom = rect.bottom + slop;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let enter = 0;
  let exit = 1;
  for (const [p, q] of [
    [-dx, x0 - left],
    [dx, right - x0],
    [-dy, y0 - top],
    [dy, bottom - y0],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) {
      enter = Math.max(enter, q / p);
    } else {
      exit = Math.min(exit, q / p);
    }
    if (enter > exit) return false;
  }
  return true;
}

function predict() {
  frame = 0;
  const last = samples.at(-1);
  const end = projectPointer(samples);
  if (!last || !end) return;
  const { x: px, y: py } = end;
  for (const [element, onPredicted] of targets) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (segmentHitsRect(last.x, last.y, px, py, rect, HIT_SLOP_PX)) {
      targets.delete(element);
      debugHit?.(element);
      onPredicted();
    }
  }
  if (targets.size === 0) stop();
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  const t = event.timeStamp;
  samples.push({ x: event.clientX, y: event.clientY, t });
  while (samples.length > 2 && t - samples[0]!.t > SAMPLE_WINDOW_MS) samples.shift();
  frame ||= requestAnimationFrame(predict);
}

function stop() {
  window.removeEventListener('pointermove', onPointerMove);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  samples = [];
}

/**
 * Calls `onPredicted` once when the mouse is heading toward `element`: the pointer's recent
 * velocity, extrapolated a short time ahead, crosses the element's box. Touch and pen never fire.
 * Returns an unsubscribe function.
 */
export function watchPointerIntent(element: Element, onPredicted: () => void): () => void {
  if (targets.size === 0) window.addEventListener('pointermove', onPointerMove, { passive: true });
  targets.set(element, onPredicted);
  return () => {
    if (targets.delete(element) && targets.size === 0) stop();
  };
}

export const POINTER_INTENT_TUNING = {
  SAMPLE_WINDOW_MS,
  LOOKAHEAD_MS,
  MAX_PROJECTION_PX,
  MIN_SPEED_PX_PER_MS,
  HIT_SLOP_PX,
};
let debugHit: ((element: Element) => void) | undefined;
export function setPointerIntentDebug(onHit: (element: Element) => void) {
  debugHit = onHit;
}
export const watchedElements = () => [...targets.keys()];
