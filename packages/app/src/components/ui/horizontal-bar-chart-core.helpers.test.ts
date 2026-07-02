import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import {
  barCenterY,
  compareByModelSortIndex,
  resolveInsideLabelPlacement,
} from './horizontal-bar-chart-core.helpers';

/** Plain band accessor without a `.bandwidth()` method, for the fallback path. */
const plainAccessor = (key: string): number | undefined => (key === 'q' ? 120 : undefined);

describe('barCenterY', () => {
  it('returns band position + half bandwidth for a real d3 band scale', () => {
    // domain of 4 rows over a 400px range → each band is 100px tall, no padding.
    const band = d3.scaleBand<string>().domain(['a', 'b', 'c', 'd']).range([0, 400]).padding(0);
    expect(band.bandwidth()).toBe(100);
    // 'a' occupies [0,100] → center 50; 'c' occupies [200,300] → center 250.
    expect(barCenterY(band, 'a')).toBe(50);
    expect(barCenterY(band, 'c')).toBe(250);
  });

  it('matches the original inline math `(band(k) || 0) + bandwidth/2` including padding', () => {
    const band = d3.scaleBand<string>().domain(['x', 'y']).range([0, 300]).padding(0.2);
    for (const k of ['x', 'y']) {
      const expected = (band(k) ?? 0) + band.bandwidth() / 2;
      expect(barCenterY(band, k)).toBe(expected);
    }
  });

  it('treats an out-of-domain key as position 0 (adds only half bandwidth)', () => {
    const band = d3.scaleBand<string>().domain(['a', 'b']).range([0, 200]).padding(0);
    // d3 returns undefined for unknown keys; helper coalesces to 0.
    expect(band('missing')).toBeUndefined();
    expect(barCenterY(band, 'missing')).toBe(band.bandwidth() / 2);
  });

  it('handles a plain accessor without a bandwidth method (falls back to 0)', () => {
    expect(barCenterY(plainAccessor, 'q')).toBe(120);
    expect(barCenterY(plainAccessor, 'nope')).toBe(0);
  });
});

describe('compareByModelSortIndex', () => {
  it('returns 0 for identical keys', () => {
    expect(compareByModelSortIndex('h100', 'h100')).toBe(0);
  });

  it('is antisymmetric: sign flips when arguments swap', () => {
    const ab = compareByModelSortIndex('h100', 'b200');
    const ba = compareByModelSortIndex('b200', 'h100');
    expect(Math.sign(ab)).toBe(-Math.sign(ba));
  });

  it('falls back to alphabetical order for two keys with the same sort index', () => {
    // Two unrecognized GPU bases share the same fallback sort index, so ordering
    // is purely the localeCompare tie-break — deterministic and registry-independent.
    expect(compareByModelSortIndex('zzz_unknown_a', 'zzz_unknown_b')).toBeLessThan(0);
    expect(compareByModelSortIndex('zzz_unknown_b', 'zzz_unknown_a')).toBeGreaterThan(0);
  });

  it('sorts a list stably and consistently (usable as a toSorted comparator)', () => {
    const keys = ['zzz_c', 'zzz_a', 'zzz_b'];
    expect([...keys].toSorted(compareByModelSortIndex)).toEqual(['zzz_a', 'zzz_b', 'zzz_c']);
  });
});

describe('resolveInsideLabelPlacement', () => {
  it('places the label inside (right-anchored, 10px in) when the bar is wide enough', () => {
    // barEnd 200 > labelWidth 40 + 24 → fits inside.
    const p = resolveInsideLabelPlacement(200, 40);
    expect(p.fitsInside).toBe(true);
    expect(p.textAnchor).toBe('end');
    expect(p.x).toBe(190);
  });

  it('flips the label outside (left-anchored, 6px past) when the bar is too short', () => {
    // barEnd 50 is not > labelWidth 40 + 24 (=64) → flips outside.
    const p = resolveInsideLabelPlacement(50, 40);
    expect(p.fitsInside).toBe(false);
    expect(p.textAnchor).toBe('start');
    expect(p.x).toBe(56);
  });

  it('uses a strict > threshold at exactly labelWidth + 24 (boundary flips outside)', () => {
    const boundary = resolveInsideLabelPlacement(64, 40); // 64 === 40 + 24
    expect(boundary.fitsInside).toBe(false);
    expect(boundary.x).toBe(70); // outside: 64 + 6
    const justInside = resolveInsideLabelPlacement(64.1, 40);
    expect(justInside.fitsInside).toBe(true);
  });

  it('a zero-width bar always flips outside', () => {
    const p = resolveInsideLabelPlacement(0, 10);
    expect(p.fitsInside).toBe(false);
    expect(p.textAnchor).toBe('start');
    expect(p.x).toBe(6);
  });
});
