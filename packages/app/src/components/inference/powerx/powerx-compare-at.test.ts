import { describe, expect, it } from 'bun:test';

import {
  nearestByInteractivity,
  parsePowerXCompareAt,
  powerXCoveredRange,
  resolvePowerXCompareAt,
  serializePowerXCompareAt,
} from './powerx-compare-at';

describe('i_at', () => {
  it('reads missing, malformed and non-positive values as the default 80', () => {
    for (const raw of [null, undefined, '', 'abc', '0', '-5', 'Infinity']) {
      expect(parsePowerXCompareAt(raw)).toBe(80);
    }
  });

  it('rounds and caps explicit values', () => {
    expect(parsePowerXCompareAt('130')).toBe(130);
    expect(parsePowerXCompareAt('42.6')).toBe(43);
    expect(parsePowerXCompareAt('9000')).toBe(400);
  });

  it('leaves the default out of the URL', () => {
    expect(serializePowerXCompareAt(80)).toBe('');
    expect(serializePowerXCompareAt(200)).toBe('200');
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

  it('clamps only the default into the covered range', () => {
    expect(resolvePowerXCompareAt(80, false, [2, 9])).toBe(9);
    expect(resolvePowerXCompareAt(80, false, [120, 300])).toBe(120);
    expect(resolvePowerXCompareAt(80, false, [20, 300])).toBe(80);
    expect(resolvePowerXCompareAt(80, false, null)).toBe(80);
  });

  it('never changes an explicit pick', () => {
    expect(resolvePowerXCompareAt(200, true, [2, 9])).toBe(200);
    expect(resolvePowerXCompareAt(80, true, [2, 9])).toBe(80);
  });
});

describe('nearestByInteractivity', () => {
  it('measures distance on a log scale', () => {
    // 40 is 2x below 80 and 150 is under 2x above it: 150 is nearer in ratio terms.
    expect(nearestByInteractivity([40, 150], 80, (x) => x)).toBe(150);
    expect(nearestByInteractivity([0, -3], 80, (x) => x)).toBeNull();
  });
});
