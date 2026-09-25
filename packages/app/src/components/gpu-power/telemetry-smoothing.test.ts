import { describe, expect, it } from 'vitest';

import { meanAcrossSeries, rollingTimeAverage, type TimedSample } from './telemetry-smoothing';

const T0 = Date.parse('2026-09-15T21:36:14.107Z');

/** One sample per second starting at T0, values from `values`. */
function everySecond(values: number[], offsetMs = 0): TimedSample[] {
  return values.map((value, i) => ({ ms: T0 + offsetMs + i * 1000, value }));
}

describe('rollingTimeAverage', () => {
  it('averages a centered window and shrinks it at the series edges', () => {
    // 1 s cadence, 2 s window => each sample sees itself and its immediate neighbours.
    const out = rollingTimeAverage(everySecond([100, 200, 600, 200, 100]), 2000);
    expect(out.map((p) => p.value)).toEqual([150, 300, 1000 / 3, 300, 150]);
    expect(out.map((p) => p.ms)).toEqual(everySecond([0, 0, 0, 0, 0]).map((p) => p.ms));
  });
});

describe('meanAcrossSeries', () => {
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
});
