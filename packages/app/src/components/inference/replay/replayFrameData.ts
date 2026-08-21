import type { InferenceData, OverlayData } from '@/components/inference/types';
import { bestSeriesPerSku } from '@/components/inference/utils/best-series-per-sku';
import type { ParetoDirection } from '@/lib/chart-utils';

import type { ReplayTimeline } from './buildReplayTimeline';
import { interpolateAtStep } from './interpolateAtTime';

export interface ReplayFrameOptions {
  pointFilter?: (point: InferenceData) => boolean;
  bestPerSku?: boolean;
  direction?: ParetoDirection;
}

export interface ReplayOverlayOptions extends ReplayFrameOptions {
  currentDate: string;
  selectedPrecisions: readonly string[];
  activeHwTypes: ReadonlySet<string>;
}

/**
 * Build the visible rows for one replay frame.
 *
 * Best per SKU is deliberately evaluated after interpolation. A serving
 * engine that wins today is not necessarily the engine that won on an older
 * benchmark date, so replay must not reuse the live chart's active hwKey set.
 */
export function buildFrameData(
  timeline: ReplayTimeline,
  fraction: number,
  options: ReplayFrameOptions = {},
): InferenceData[] {
  const idxFloat = stepFloatAtFraction(fraction, timeline.dates.length);
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
  const eligible = options.pointFilter ? out.filter(options.pointFilter) : out;
  if (!options.bestPerSku || !options.direction) return eligible;
  const winners = bestSeriesPerSku(eligible, options.direction);
  return winners.size > 0 ? eligible.filter((point) => winners.has(String(point.hwKey))) : eligible;
}

const safeDomain = (lo: number, hi: number): [number, number] => {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    return [lo - pad, hi + pad];
  }
  return lo < hi ? [lo, hi] : [hi, lo];
};

export function replayPointsDomain(points: readonly InferenceData[]): {
  x: [number, number];
  y: [number, number];
} {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const point of points) {
    if (point.x < xMin) xMin = point.x;
    if (point.x > xMax) xMax = point.x;
    if (point.y < yMin) yMin = point.y;
    if (point.y > yMax) yMax = point.y;
  }
  return { x: safeDomain(xMin, xMax), y: safeDomain(yMin, yMax) };
}

/** Fixed-axis extent across the rows that can actually appear in replay. */
export function computeReplayDomain(
  timeline: ReplayTimeline,
  options: ReplayFrameOptions = {},
): { x: [number, number]; y: [number, number] } {
  if (timeline.dates.length === 0) return replayPointsDomain([]);
  const points: InferenceData[] = [];
  const denominator = Math.max(1, timeline.dates.length - 1);
  for (let index = 0; index < timeline.dates.length; index++) {
    points.push(...buildFrameData(timeline, index / denominator, options));
  }
  return replayPointsDomain(points);
}

/**
 * Apply the replay playhead, visibility, and Best per SKU rules to an
 * unofficial-run overlay. Unofficial runs have one observed benchmark date,
 * so they appear when the playhead reaches that date and remain visible.
 */
export function buildReplayOverlayData(
  overlayData: OverlayData,
  options: ReplayOverlayOptions,
): OverlayData {
  const visibleAtPlayhead = (point: InferenceData) =>
    point.date <= options.currentDate &&
    options.selectedPrecisions.includes(point.precision) &&
    options.activeHwTypes.has(String(point.hwKey)) &&
    (options.pointFilter?.(point) ?? true);
  let data = overlayData.data.filter(visibleAtPlayhead);
  let clippedData = (overlayData.clippedData ?? []).filter(({ point }) => visibleAtPlayhead(point));
  if (options.bestPerSku && options.direction) {
    const winners = bestSeriesPerSku(data, options.direction);
    if (winners.size > 0) {
      data = data.filter((point) => winners.has(String(point.hwKey)));
      clippedData = clippedData.filter(({ point }) => winners.has(String(point.hwKey)));
    }
  }
  return { ...overlayData, data, clippedData };
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
