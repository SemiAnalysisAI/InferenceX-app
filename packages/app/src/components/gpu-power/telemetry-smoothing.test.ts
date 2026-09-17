import { describe, expect, it } from 'vitest';

import {
  estimateSampleIntervalMs,
  meanAcrossSeries,
  rollingTimeAverage,
  type TimedSample,
} from './telemetry-smoothing';

const T0 = Date.parse('2026-09-15T21:36:14.107Z');

/** One sample per second starting at T0, values from `values`. */
function everySecond(values: number[], offsetMs = 0): TimedSample[] {
  return values.map((value, i) => ({ ms: T0 + offsetMs + i * 1000, value }));
}

describe('rollingTimeAverage', () => {
  it('returns an empty array for empty input', () => {
    expect(rollingTimeAverage([], 30_000)).toEqual([]);
  });

  it('returns the sample unchanged for a single sample', () => {
    expect(rollingTimeAverage([{ ms: T0, value: 812.4 }], 60_000)).toEqual([
      { ms: T0, value: 812.4 },
    ]);
  });

  it('copies the input when the window is zero or negative', () => {
    const input = everySecond([1, 2, 3]);
    expect(rollingTimeAverage(input, 0)).toEqual(input);
    expect(rollingTimeAverage(input, -5)).toEqual(input);
  });

  it('averages a centered window and shrinks it at the series edges', () => {
    // 1 s cadence, 2 s window => each sample sees itself and its immediate neighbours.
    const out = rollingTimeAverage(everySecond([100, 200, 600, 200, 100]), 2000);
    expect(out.map((p) => p.value)).toEqual([150, 300, 1000 / 3, 300, 150]);
    expect(out.map((p) => p.ms)).toEqual(everySecond([0, 0, 0, 0, 0]).map((p) => p.ms));
  });

  it('treats both window edges as inclusive', () => {
    // 4 s window => samples exactly 2 s away are included, 3 s away are not.
    const out = rollingTimeAverage(everySecond([0, 0, 90, 0, 0, 0]), 4000);
    // index 2 sees indices 0..4 (five samples) => 18; index 5 sees 3..5 => 0.
    expect(out[2]!.value).toBeCloseTo(18);
    expect(out[5]!.value).toBe(0);
    // index 0 sees 0..2 => 30.
    expect(out[0]!.value).toBeCloseTo(30);
  });

  it('uses elapsed time, not sample count, for irregular timestamps', () => {
    const input: TimedSample[] = [
      { ms: T0, value: 100 },
      { ms: T0 + 500, value: 300 }, // burst of close samples
      { ms: T0 + 700, value: 300 },
      { ms: T0 + 60_000, value: 900 }, // one minute gap: outside any 10 s window
    ];
    const out = rollingTimeAverage(input, 10_000);
    expect(out[0]!.value).toBeCloseTo((100 + 300 + 300) / 3);
    expect(out[3]!.value).toBe(900);
  });

  it('smooths a step change into a ramp whose plateaus keep the original level', () => {
    const values = [
      ...Array.from({ length: 30 }, () => 250),
      ...Array.from({ length: 30 }, () => 950),
    ];
    const out = rollingTimeAverage(everySecond(values), 10_000);
    expect(out[5]!.value).toBe(250);
    expect(out[54]!.value).toBe(950);
    const ramp = out.slice(25, 35).map((p) => p.value);
    for (let i = 1; i < ramp.length; i += 1) expect(ramp[i]!).toBeGreaterThanOrEqual(ramp[i - 1]!);
    expect(ramp.at(-1)!).toBeGreaterThan(ramp[0]!);
  });
});

describe('estimateSampleIntervalMs', () => {
  it('falls back when there are fewer than two distinct timestamps', () => {
    expect(estimateSampleIntervalMs([], 1000)).toBe(1000);
    expect(estimateSampleIntervalMs([{ ms: T0, value: 1 }], 750)).toBe(750);
    expect(
      estimateSampleIntervalMs(
        [
          { ms: T0, value: 1 },
          { ms: T0, value: 2 },
        ],
        250,
      ),
    ).toBe(250);
  });

  it('returns the median gap so a single dropped sample does not skew it', () => {
    const samples = [
      { ms: T0, value: 0 },
      { ms: T0 + 1000, value: 0 },
      { ms: T0 + 2000, value: 0 },
      { ms: T0 + 5000, value: 0 }, // dropped two rows
      { ms: T0 + 6000, value: 0 },
    ];
    expect(estimateSampleIntervalMs(samples)).toBe(1000);
  });
});

describe('meanAcrossSeries', () => {
  it('returns an empty array when there are no series or only empty series', () => {
    expect(meanAcrossSeries([], 1000)).toEqual([]);
    expect(meanAcrossSeries([[], []], 1000)).toEqual([]);
  });

  it('returns a single series as its own mean with count 1', () => {
    const only = everySecond([10, 20]);
    expect(meanAcrossSeries([only], 1000)).toEqual([
      { ms: only[0]!.ms, value: 10, count: 1 },
      { ms: only[1]!.ms, value: 20, count: 1 },
    ]);
  });

  it('aligns chips polled a few ms apart onto the reference timeline', () => {
    // nvidia-smi writes chip rows ~12 ms apart within one 1 s poll.
    const chip0 = everySecond([200, 400, 600]);
    const chip1 = everySecond([300, 500, 700], 12);
    const chip2 = everySecond([100, 300, 500], 25);
    const out = meanAcrossSeries([chip0, chip1, chip2], 1000);
    expect(out.map((p) => p.ms)).toEqual(chip0.map((p) => p.ms));
    expect(out.map((p) => p.value)).toEqual([200, 400, 600]);
    expect(out.every((p) => p.count === 3)).toBe(true);
  });

  it('uses the longest series as the reference and skips chips with no sample in tolerance', () => {
    const chip0 = everySecond([100, 100]); // shorter: stops early
    const chip1 = everySecond([300, 300, 300, 300]);
    const out = meanAcrossSeries([chip0, chip1], 500);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ ms: chip1[0]!.ms, value: 200, count: 2 });
    expect(out[1]).toEqual({ ms: chip1[1]!.ms, value: 200, count: 2 });
    // chip0 has nothing within 500 ms of t=2 s and t=3 s.
    expect(out[2]).toEqual({ ms: chip1[2]!.ms, value: 300, count: 1 });
    expect(out[3]).toEqual({ ms: chip1[3]!.ms, value: 300, count: 1 });
  });

  it('picks the nearest sample when a chip dropped a row', () => {
    const chip0 = everySecond([0, 0, 0, 0]);
    const chip1: TimedSample[] = [
      { ms: T0, value: 10 },
      // row at T0 + 1000 dropped
      { ms: T0 + 2000, value: 30 },
      { ms: T0 + 3000, value: 40 },
    ];
    const out = meanAcrossSeries([chip0, chip1], 400);
    expect(out.map((p) => p.count)).toEqual([2, 1, 2, 2]);
    expect(out.map((p) => p.value)).toEqual([5, 0, 15, 20]);
  });

  it('treats a negative tolerance as exact-match only', () => {
    const chip0 = everySecond([0, 0]);
    const chip1 = everySecond([10, 10], 1);
    expect(meanAcrossSeries([chip0, chip1], -1).every((p) => p.count === 1)).toBe(true);
    expect(meanAcrossSeries([chip0, everySecond([10, 10])], -1).every((p) => p.count === 2)).toBe(
      true,
    );
  });
});
