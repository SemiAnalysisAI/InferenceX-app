import { describe, expect, it } from 'vitest';

import { rollingTimeAverage, type TimedSample } from './telemetry-smoothing';

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
