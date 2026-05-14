import type { InferenceData } from '@/components/inference/types';

import type { ReplayTimeline } from './buildReplayTimeline';
import { interpolateAtStep } from './interpolateAtTime';

export function buildFrameData(timeline: ReplayTimeline, fraction: number): InferenceData[] {
  const idxFloat = stepFloatAtFraction(fraction, timeline.dates.length);
  const out: InferenceData[] = [];
  for (const c of timeline.configs) {
    const r = interpolateAtStep(c.stepValues, idxFloat);
    if (!r.visible) continue;
    out.push({ ...c.template, x: r.x, y: r.y });
  }
  return out;
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
  const step = Math.floor(stepFloatAtFraction(fraction, dates.length));
  return dates[Math.max(0, Math.min(dates.length - 1, step))] ?? '';
}
