import { describe, expect, it } from 'bun:test';

import {
  parsePowerXCompareAt,
  powerXCoveredRange,
  resolvePowerXCompareAt,
} from './powerx-compare-at';

describe('i_at', () => {
  it('reads a rounded, capped positive value, and anything else as the default 80', () => {
    for (const raw of [null, undefined, '', 'abc', '0', '-5', 'Infinity']) {
      expect(parsePowerXCompareAt(raw)).toBe(80);
    }
    expect(parsePowerXCompareAt('130')).toBe(130);
    expect(parsePowerXCompareAt('42.6')).toBe(43);
    expect(parsePowerXCompareAt('9000')).toBe(400);
  });
});

describe('default Compare at clamp', () => {
  it('uses the overlap of the per-GPU ranges, or the full span when they do not overlap', () => {
    expect(
      powerXCoveredRange([
        [10, 50, 120],
        [20, 90],
      ]),
    ).toEqual([20, 90]);
    expect(
      powerXCoveredRange([
        [1, 4],
        [10, 30],
      ]),
    ).toEqual([1, 30]);
    expect(powerXCoveredRange([[], [0, -1]])).toBeNull();
  });

  it('clamps only the default into the covered range, never an explicit pick', () => {
    expect(resolvePowerXCompareAt(80, false, [2, 9])).toBe(9);
    expect(resolvePowerXCompareAt(80, false, [120, 300])).toBe(120);
    expect(resolvePowerXCompareAt(80, false, [20, 300])).toBe(80);
    expect(resolvePowerXCompareAt(80, false, null)).toBe(80);
    expect(resolvePowerXCompareAt(200, true, [2, 9])).toBe(200);
    expect(resolvePowerXCompareAt(80, true, [2, 9])).toBe(80);
  });
});
