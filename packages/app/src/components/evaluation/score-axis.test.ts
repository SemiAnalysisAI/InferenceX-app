import { describe, expect, it } from 'bun:test';

import { type EvalScoreAxis, evaluationScoreAxis, formatScoreTick } from './score-axis';

const span = (score: number, se = 0.004) => ({
  score,
  low: Math.max(0, score - se),
  high: Math.min(1, score + se),
});

/** 60 healthy GSM8K rows between 0.95 and 0.98, like a production model. */
const cluster = Array.from({ length: 60 }, (_, i) => span(0.95 + (i % 31) * 0.001));

const tickScores = (axis: EvalScoreAxis, window = axis.domain) =>
  axis.ticks(window, 5).map((plot) => axis.fromPlot(plot));

describe('evaluationScoreAxis', () => {
  it('breaks the axis so failed runs at 0 no longer squash the 0.95 to 0.98 cluster', () => {
    const failed = [0, 0, 0.0015, 0.414, 0.446].map((score) => span(score));
    const axis = evaluationScoreAxis([...failed, span(0.894), span(0.923), ...cluster]);
    expect(axis.breakAt).toBe(0.88);
    // A failed run at 0 sits just inside the plot edge instead of being clipped by it.
    expect(axis.domain[0]).toBeLessThan(axis.toPlot(0));
    expect(axis.domain[1]).toBe(1);
    const [gapStart, gapEnd] = axis.gap!;
    for (const { score } of failed) expect(axis.toPlot(score)).toBeLessThan(gapStart);
    // The lowest real result stays on the true scale past the break.
    expect(axis.toPlot(0.894)).toBeGreaterThan(gapEnd);
    // The cluster spans most of the width instead of the last 3% of a 0 to 1 axis.
    expect(axis.toPlot(0.98) - axis.toPlot(0.95)).toBeGreaterThan(0.15);
    expect(axis.toPlot(0)).toBe(0);
    expect(axis.fromPlot(1)).toBeCloseTo(1);
  });

  it('keeps the next-lowest real results on the true scale when only the gap below them is wide', () => {
    const axis = evaluationScoreAxis([span(0), span(0.92), span(0.925), ...cluster]);
    expect(axis.breakAt).not.toBeNull();
    expect(axis.breakAt!).toBeLessThanOrEqual(0.92 - 0.004);
    expect(axis.toPlot(0.92)).toBeGreaterThan(axis.gap![1]);
    expect(axis.toPlot(0)).toBeLessThan(axis.gap![0]);
  });

  it('still marks the break at 0 when no row is an outlier, as the non-zero baseline cue', () => {
    const axis = evaluationScoreAxis(cluster);
    expect(axis.breakAt).toBe(0.94);
    expect(axis.fromPlot(1)).toBeCloseTo(0.99);
    expect(tickScores(axis)[0]).toBe(0);
  });

  it('keeps a true 0 to 1 scale when the low scores are not a small minority', () => {
    const split = [...Array.from({ length: 15 }, () => span(0, 0)), ...cluster.slice(0, 15)];
    const axis = evaluationScoreAxis(split);
    expect(axis.breakAt).toBeNull();
    expect(axis.gap).toBeNull();
    expect(axis.domain[0]).toBeLessThan(axis.toPlot(0));
    expect(axis.toPlot(0.5)).toBe(0.5);
  });

  it('keeps a true scale from 0 when scores spread across most of the range', () => {
    const axis = evaluationScoreAxis([0.3, 0.5, 0.7, 0.9, 0.98].map((score) => span(score)));
    expect(axis.breakAt).toBeNull();
    expect(axis.domain[0]).toBeLessThan(0);
    expect(axis.domain[1]).toBe(1);
  });

  it('gives perfect scores a usable range with distinct ticks', () => {
    const axis = evaluationScoreAxis(Array.from({ length: 20 }, () => span(1, 0)));
    expect(axis.breakAt).not.toBeNull();
    expect(axis.fromPlot(1)).toBe(1);
    expect(axis.breakAt!).toBeLessThan(1);
    const labels = tickScores(axis).map((score) => formatScoreTick(score!));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.at(-1)).toBe('1.00');
  });

  it('maps plot positions back to scores and reports none inside the break gap', () => {
    const axis = evaluationScoreAxis([span(0), ...cluster]);
    for (const score of [0, 0.3, 0.86, 0.95, 0.975]) {
      expect(axis.fromPlot(axis.toPlot(score))).toBeCloseTo(score, 10);
    }
    const [gapStart, gapEnd] = axis.gap!;
    expect(axis.fromPlot((gapStart + gapEnd) / 2)).toBeNull();
  });

  it('never puts a tick inside the break gap and only ticks the visible window when zoomed', () => {
    const axis = evaluationScoreAxis([span(0), ...cluster]);
    const [gapStart, gapEnd] = axis.gap!;
    const full = axis.ticks(axis.domain, 5);
    expect(full.every((plot) => plot <= gapStart || plot >= gapEnd)).toBe(true);
    expect(full.filter((plot) => plot < gapStart)).toEqual([0]);

    const zoomed = axis.ticks([0.5, 0.8], 5);
    expect(zoomed.length).toBeGreaterThan(1);
    expect(zoomed.every((plot) => plot >= 0.5 && plot <= 0.8)).toBe(true);
    expect(zoomed).not.toContain(0);
  });

  it('falls back to a 0 to 1 scale with no rows', () => {
    const axis = evaluationScoreAxis([]);
    expect(axis.domain[1]).toBe(1);
    expect(axis.breakAt).toBeNull();
  });
});

describe('formatScoreTick', () => {
  it('shows two decimals, and a third only when the tick needs it', () => {
    expect(formatScoreTick(0)).toBe('0.00');
    expect(formatScoreTick(0.97)).toBe('0.97');
    expect(formatScoreTick(0.965)).toBe('0.965');
    expect(formatScoreTick(1)).toBe('1.00');
  });
});
