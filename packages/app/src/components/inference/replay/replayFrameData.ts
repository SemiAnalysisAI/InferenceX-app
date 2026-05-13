import type { InferenceData } from '@/components/inference/types';

import type { ReplayTimeline } from './buildReplayTimeline';
import { interpolateAtStep } from './interpolateAtTime';

/**
 * Convert a logical fraction [0, 1] across a replay timeline into a snapshot of
 * `InferenceData[]` at the interpolated positions. The snapshot keeps each
 * config's full template (hwKey, precision, tp, …) and only swaps x/y, so the
 * scatter chart renders it identically to a real benchmark snapshot.
 */
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

/**
 * Cubic ease-in-out per segment so the playhead settles on observed dates and
 * accelerates between them, instead of cruising at constant speed.
 */
export function stepFloatAtFraction(fraction: number, n: number): number {
  if (n <= 1) return 0;
  const raw = Math.max(0, Math.min(1, fraction)) * (n - 1);
  const idxLow = Math.floor(raw);
  const segFrac = raw - idxLow;
  const eased = segFrac < 0.5 ? 4 * segFrac ** 3 : 1 - (-2 * segFrac + 2) ** 3 / 2;
  return idxLow + eased;
}

/**
 * Total wall-clock duration of a full 1× playback. ~800 ms per observed step
 * gives each transition room to read; capped at 30 s so very long histories
 * still finish in a reasonable time.
 */
export function spanMs(numDates: number): number {
  if (numDates <= 1) return 1500;
  return Math.min(30_000, Math.max(4500, numDates * 800));
}

/**
 * Map a fraction to the nearest observed date label for the date overlay.
 */
export function dateAtFraction(timeline: ReplayTimeline, fraction: number): string {
  const dates = timeline.dates;
  if (dates.length === 0) return '';
  const step = Math.round(stepFloatAtFraction(fraction, dates.length));
  return dates[Math.max(0, Math.min(dates.length - 1, step))] ?? '';
}
