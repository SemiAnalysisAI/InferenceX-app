import type { InferenceData, OverlayData } from '@/components/inference/types';
import { baseSku, bestSeriesPerSku } from '@/components/inference/utils/best-series-per-sku';
import type { ParetoDirection } from '@/lib/chart-utils';

import type { ReplayTimeline } from './buildReplayTimeline';
import { interpolateAtStep } from './interpolateAtTime';

export interface ReplayFrameOptions {
  pointFilter?: (point: InferenceData) => boolean;
  bestPerSku?: boolean;
  direction?: ParetoDirection;
  /**
   * Morph a newly winning config from the outgoing config's geometry. This is
   * driven by replay fraction rather than wall-clock time so MP4 capture sees
   * the same animation as the live preview.
   */
  animateBestPerSku?: boolean;
}

export interface ReplayOverlayOptions extends ReplayFrameOptions {
  currentDate: string;
  selectedPrecisions: readonly string[];
  activeHwTypes: ReadonlySet<string>;
}

function buildEligibleFrame(
  timeline: ReplayTimeline,
  fraction: number,
  pointFilter?: ReplayFrameOptions['pointFilter'],
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
  return pointFilter ? out.filter(pointFilter) : out;
}

const winnerBySku = (
  points: InferenceData[],
  direction: ParetoDirection,
): { selected: Set<string>; bySku: Map<string, string> } => {
  const selected = bestSeriesPerSku(points, direction);
  const bySku = new Map<string, string>();
  for (const point of points) {
    const hwKey = String(point.hwKey);
    if (selected.has(hwKey)) bySku.set(baseSku(point), hwKey);
  }
  return { selected, bySku };
};

const pointsByHwKey = (points: readonly InferenceData[]): Map<string, InferenceData[]> => {
  const grouped = new Map<string, InferenceData[]>();
  for (const point of points) {
    const key = String(point.hwKey);
    const rows = grouped.get(key) ?? [];
    rows.push(point);
    grouped.set(key, rows);
  }
  return grouped;
};

const sampleSeries = (
  points: readonly InferenceData[],
  fraction: number,
): { x: number; y: number } => {
  const sorted = points.toSorted((a, b) => a.x - b.x);
  if (sorted.length === 1) return sorted[0];
  const position = Math.max(0, Math.min(1, fraction)) * (sorted.length - 1);
  const low = Math.floor(position);
  const high = Math.min(sorted.length - 1, low + 1);
  const mix = position - low;
  return {
    x: sorted[low].x + (sorted[high].x - sorted[low].x) * mix,
    y: sorted[low].y + (sorted[high].y - sorted[low].y) * mix,
  };
};

const morphSeries = (
  outgoing: readonly InferenceData[],
  incoming: readonly InferenceData[],
  progress: number,
): InferenceData[] => {
  const sortedIncoming = incoming.toSorted((a, b) => a.x - b.x);
  return sortedIncoming.map((point, index) => {
    const rank = sortedIncoming.length <= 1 ? 0.5 : index / (sortedIncoming.length - 1);
    const from = sampleSeries(outgoing, rank);
    return {
      ...point,
      x: from.x + (point.x - from.x) * progress,
      y: from.y + (point.y - from.y) * progress,
    };
  });
};

const BEST_PER_SKU_MORPH_MS = 480;

/** Fraction of the exported timeline used to morph one winner into the next. */
export function bestPerSkuMorphWindowFraction(numDates: number): number {
  if (numDates <= 1) return 0;
  // Keep the animation close to 480ms in the deterministic MP4 timeline, but
  // leave a gap before the next observed date even in long, capped replays.
  return Math.min(BEST_PER_SKU_MORPH_MS / spanMs(numDates), 0.8 / (numDates - 1));
}

function findWinnerSwitchFraction(
  timeline: ReplayTimeline,
  sku: string,
  incomingHwKey: string,
  startFraction: number,
  endFraction: number,
  direction: ParetoDirection,
  pointFilter?: ReplayFrameOptions['pointFilter'],
): number {
  let low = startFraction;
  let high = endFraction;
  // Eight bisections place a 480ms morph boundary within ~2ms in the longest
  // 30s export, without precomputing every SKU's complete winner history.
  for (let iteration = 0; iteration < 8; iteration++) {
    const mid = (low + high) / 2;
    const eligible = buildEligibleFrame(timeline, mid, pointFilter);
    const winner = winnerBySku(eligible, direction).bySku.get(sku);
    if (winner === incomingHwKey) high = mid;
    else low = mid;
  }
  return high;
}

/**
 * Build the visible rows for one replay frame.
 *
 * Best per SKU is deliberately evaluated after interpolation. A serving
 * engine that wins today is not necessarily the engine that won on an older
 * benchmark date, so replay must not reuse the live chart's active hwKey set.
 * Winner morphs are derived from `fraction`, not a live D3 timer, so every
 * intermediate position is present in the frames encoded into the MP4.
 */
export function buildFrameData(
  timeline: ReplayTimeline,
  fraction: number,
  options: ReplayFrameOptions = {},
): InferenceData[] {
  const eligible = buildEligibleFrame(timeline, fraction, options.pointFilter);
  if (!options.bestPerSku || !options.direction) return eligible;

  const current = winnerBySku(eligible, options.direction);
  if (current.selected.size === 0) return eligible;
  if (!options.animateBestPerSku) {
    return eligible.filter((point) => current.selected.has(String(point.hwKey)));
  }

  const windowFraction = bestPerSkuMorphWindowFraction(timeline.dates.length);
  const previousFraction = Math.max(0, fraction - windowFraction);
  if (windowFraction === 0 || previousFraction === fraction) {
    return eligible.filter((point) => current.selected.has(String(point.hwKey)));
  }

  const previousEligible = buildEligibleFrame(timeline, previousFraction, options.pointFilter);
  const previous = winnerBySku(previousEligible, options.direction);
  const currentPoints = pointsByHwKey(eligible);
  const previousPoints = pointsByHwKey(previousEligible);
  const output: InferenceData[] = [];

  for (const [sku, incomingHwKey] of current.bySku) {
    const incoming = currentPoints.get(incomingHwKey) ?? [];
    const outgoingHwKey = previous.bySku.get(sku);
    if (!outgoingHwKey || outgoingHwKey === incomingHwKey) {
      output.push(...incoming);
      continue;
    }

    const outgoing = currentPoints.get(outgoingHwKey) ?? previousPoints.get(outgoingHwKey) ?? [];
    if (outgoing.length === 0 || incoming.length === 0) {
      output.push(...incoming);
      continue;
    }

    const switchFraction = findWinnerSwitchFraction(
      timeline,
      sku,
      incomingHwKey,
      previousFraction,
      fraction,
      options.direction,
      options.pointFilter,
    );
    const progress = Math.max(0, Math.min(1, (fraction - switchFraction) / windowFraction));
    output.push(...morphSeries(outgoing, incoming, progress));
  }

  return output;
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
 * Alias every historical hwKey to the current parent-chart winner for the same
 * physical SKU. The replay can change configs without changing the SKU color.
 */
export function buildReplayColorKeyMap(
  timeline: ReplayTimeline,
  currentHwTypes: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const currentWinnerBySku = new Map<string, string>();
  for (const config of timeline.configs) {
    if (currentHwTypes.has(config.hwKey)) {
      currentWinnerBySku.set(baseSku(config.template), config.hwKey);
    }
  }

  const colorKeyByHwType = new Map<string, string>();
  for (const config of timeline.configs) {
    const currentWinner = currentWinnerBySku.get(baseSku(config.template));
    if (currentWinner) colorKeyByHwType.set(config.hwKey, currentWinner);
  }
  return colorKeyByHwType;
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

/**
 * MP4 duration for a replay speed. Faster Best-per-SKU playback emits fewer
 * 30 FPS frames, while the 60s ceiling prevents slow playback from creating
 * an unexpectedly large browser-side export.
 */
export function replayExportDurationSec(numDates: number, playbackSpeed = 1): number {
  const safeSpeed = Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1;
  const baseDurationSec = Math.max(2, spanMs(numDates) / 1000);
  return Math.min(60, baseDurationSec / safeSpeed);
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
