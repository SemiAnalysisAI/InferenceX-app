import type { InferenceData } from '@/components/inference/types';

import type { ReplayTimeline } from './buildReplayTimeline';
import { interpolateAtStep } from './interpolateAtTime';

export function buildFrameData(timeline: ReplayTimeline, fraction: number): InferenceData[] {
  const idxFloat = calendarStepAtFraction(timeline.dates, fraction);
  // A replay frame is a single point in time, so every point gets the
  // playhead's date. Each template keeps its config's first-observation date,
  // and ScatterGraph scopes Pareto frontiers and line paths per date — leaving
  // mixed template dates in one frame splits a hardware series into several
  // same-colored lines (with duplicated line labels) mid-replay.
  const frameDate = dateAtFraction(timeline, fraction);
  const out: InferenceData[] = [];
  for (const c of timeline.configs) {
    const r = interpolateAtStep(c.stepValues, idxFloat);
    if (!r.visible) continue;
    out.push({ ...c.template, x: r.x, y: r.y, date: frameDate });
  }
  return out;
}

/** Position an observed snapshot on an elapsed-calendar-time rail. */
export function fractionAtDateIndex(dates: readonly string[], index: number): number {
  if (dates.length < 2) return 0;
  const first = Date.parse(dates[0]);
  const last = Date.parse(dates.at(-1)!);
  const date = Date.parse(dates[Math.max(0, Math.min(dates.length - 1, index))]);
  return last > first ? (date - first) / (last - first) : 0;
}

/** Calendar spacing, with the existing easing applied inside each observed interval. */
export function calendarStepAtFraction(dates: readonly string[], fraction: number): number {
  if (dates.length < 2) return 0;
  const clamped = Math.max(0, Math.min(1, fraction));
  if (clamped === 1) return dates.length - 1;
  let low = 0;
  while (low + 1 < dates.length && fractionAtDateIndex(dates, low + 1) <= clamped + 1e-12) {
    low++;
  }
  if (low === dates.length - 1) return low;
  const start = fractionAtDateIndex(dates, low);
  const end = fractionAtDateIndex(dates, low + 1);
  return low + stepFloatAtFraction((clamped - start) / (end - start), 2);
}

// Cubic ease-in-out per segment: playhead settles on observed dates, accelerates between them.
export function stepFloatAtFraction(fraction: number, n: number): number {
  if (n <= 1) return 0;
  const raw = Math.max(0, Math.min(1, fraction)) * (n - 1);
  const idxLow = Math.floor(raw);
  const segFrac = raw - idxLow;
  const eased = segFrac < 0.5 ? 4 * segFrac ** 3 : 1 - (-2 * segFrac + 2) ** 3 / 2;
  return idxLow + eased;
}

// ~800ms per observed step, capped at 30s so long histories still finish in reasonable time.
export function spanMs(numDates: number): number {
  if (numDates <= 1) return 1500;
  return Math.min(30_000, Math.max(4500, numDates * 800));
}

// Scrubber-resolution quantum (1/1000) used to throttle React commits while
// the rAF loop advances continuously through the underlying ref.
export const FRACTION_COMMIT_QUANTUM = 1000;

// True when `next` differs from `prev` by at least one quantum tick. The
// caller decides whether to bypass this entirely (force) — keeping the
// predicate pure makes it match its name.
export function shouldCommitFraction(prev: number, next: number): boolean {
  return Math.round(prev * FRACTION_COMMIT_QUANTUM) !== Math.round(next * FRACTION_COMMIT_QUANTUM);
}

// Floor the eased step (same math as the renderer's interpolation) so the
// label changes only when the visible interpolation crosses into the next
// segment, not when the playhead is halfway through it.
export function dateAtFraction(timeline: ReplayTimeline, fraction: number): string {
  const dates = timeline.dates;
  if (dates.length === 0) return '';
  const step = Math.floor(calendarStepAtFraction(dates, fraction));
  return dates[Math.max(0, Math.min(dates.length - 1, step))] ?? '';
}
