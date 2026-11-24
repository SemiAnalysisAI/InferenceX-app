import * as d3 from 'd3';

/** Plot share of the compressed stub from 0 to the break, and of the gap that marks the break. */
const STUB = 0.1;
const GAP = 0.03;
const MAIN_START = STUB + GAP;
/** Plot share left of 0, so a failed run's point at 0 is not cut in half by the plot edge. */
const EDGE = 0.015;
/** A score must sit at least this far below the next one before the break may leave it behind. */
const OUTLIER_MIN_GAP = 0.05;
/** At most this share of rows may sit behind the break, so a split result keeps a true scale. */
const MAX_OUTLIER_SHARE = 0.1;
const MIN_SPAN = 0.02;
const PAD = 0.1;

/** One row's score and its error-bar extent. */
export interface EvalScoreSpan {
  score: number;
  low: number;
  high: number;
}

/**
 * x-axis for accuracy scores. Scores cluster near the top of 0 to 1, so a true axis from 0
 * squashes every row against its right edge. The axis zooms to the main cluster and keeps 0 in
 * a short compressed stub behind a marked break, where failed runs stay visible. Plot space
 * equals score when the axis has no break.
 */
export interface EvalScoreAxis {
  domain: [number, number];
  /** Score where the true-scale range starts after the break, or null without a break. */
  breakAt: number | null;
  /** Plot-space span of the break gap, or null without a break. */
  gap: [number, number] | null;
  toPlot: (score: number) => number;
  /** Score at a plot position, or null inside the break gap. */
  fromPlot: (plot: number) => number | null;
  /** Plot positions of the ticks inside a visible plot-space window. */
  ticks: (window: [number, number], count: number) => number[];
}

function linearAxis(hi: number): EvalScoreAxis {
  return {
    domain: [-hi * EDGE, hi],
    breakAt: null,
    gap: null,
    toPlot: (score) => score,
    fromPlot: (plot) => plot,
    ticks: ([a, b], count) => d3.ticks(Math.max(0, a), Math.min(hi, b), count),
  };
}

function brokenAxis(breakAt: number, hi: number): EvalScoreAxis {
  const mainScale = (1 - MAIN_START) / (hi - breakAt);
  const toPlot = (score: number) =>
    score < breakAt ? (score / breakAt) * STUB : MAIN_START + (score - breakAt) * mainScale;
  const fromPlot = (plot: number) => {
    if (plot <= STUB) return (plot / STUB) * breakAt;
    if (plot < MAIN_START) return null;
    return breakAt + (plot - MAIN_START) / mainScale;
  };
  return {
    domain: [-EDGE, 1],
    breakAt,
    gap: [STUB, MAIN_START],
    toPlot,
    fromPlot,
    ticks: ([a, b], count) => {
      const lo = Math.max(0, a);
      const hiPlot = Math.min(1, b);
      const width = b - a;
      const ticks: number[] = [];
      if (lo <= STUB) {
        const share = (Math.min(STUB, hiPlot) - lo) / width;
        const stubCount = Math.max(1, Math.floor(count * share));
        ticks.push(
          ...d3
            .ticks(fromPlot(lo)!, fromPlot(Math.min(STUB, hiPlot))!, stubCount)
            .filter((score) => score < breakAt)
            .map(toPlot),
        );
      }
      if (hiPlot >= MAIN_START) {
        ticks.push(
          ...d3.ticks(fromPlot(Math.max(MAIN_START, lo))!, fromPlot(hiPlot)!, count).map(toPlot),
        );
      }
      return ticks;
    },
  };
}

export function evaluationScoreAxis(spans: readonly EvalScoreSpan[]): EvalScoreAxis {
  if (spans.length === 0) return linearAxis(1);
  const sorted = spans.toSorted((a, b) => a.score - b.score);
  const top = sorted.at(-1)!.score;
  // Leave behind the break only a few scores below a gap wider than everything above it.
  let first = 0;
  for (let i = Math.floor(sorted.length * MAX_OUTLIER_SHARE); i > 0; i--) {
    const gap = sorted[i].score - sorted[i - 1].score;
    if (gap >= OUTLIER_MIN_GAP && gap > top - sorted[i].score) {
      first = i;
      break;
    }
  }
  const main = sorted.slice(first);
  const low = d3.min(main, (span) => span.low)!;
  const high = d3.max(main, (span) => span.high)!;
  const pad = (high - low) * PAD;
  let lo = Math.max(0, low - pad);
  let hi = Math.min(1, high + pad);
  if (hi - lo < MIN_SPAN) {
    lo = Math.max(0, Math.min((lo + hi - MIN_SPAN) / 2, 1 - MIN_SPAN));
    hi = lo + MIN_SPAN;
  }
  [lo, hi] = d3.nice(lo, hi, 5);
  lo = Math.max(0, lo);
  hi = Math.min(1, hi);
  // A break must at least double the resolution, or 0 stays on the true scale.
  return lo > hi - lo ? brokenAxis(lo, hi) : linearAxis(hi);
}

/** Two decimals, or three when a zoomed tick needs them. */
export const formatScoreTick = (score: number) => score.toFixed(3).replace(/(?<=\.\d\d)0$/u, '');
