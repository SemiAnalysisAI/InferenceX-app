import { describe, expect, it } from 'vitest';

import { buildScale, isBandScale, isContinuousScale } from './scale-builders';

describe('buildScale', () => {
  it('builds a band scale with domain and padding', () => {
    const scale = buildScale({ type: 'band', domain: ['a', 'b', 'c'], padding: 0.2 }, [0, 300]);
    expect(isBandScale(scale)).toBe(true);
    if (isBandScale(scale)) {
      expect(scale.domain()).toEqual(['a', 'b', 'c']);
      expect(scale.range()).toEqual([0, 300]);
      expect(scale.padding()).toBeCloseTo(0.2);
    }
  });

  it('defaults band padding to 0.1', () => {
    const scale = buildScale({ type: 'band', domain: ['x'] }, [0, 100]);
    if (isBandScale(scale)) {
      expect(scale.padding()).toBeCloseTo(0.1);
    }
  });

  it('builds a linear scale with nice by default', () => {
    const scale = buildScale({ type: 'linear', domain: [0, 97] }, [500, 0]);
    expect(isContinuousScale(scale)).toBe(true);
    if (isContinuousScale(scale)) {
      // nice() rounds domain to [0, 100]
      expect(scale.domain()[1]).toBeGreaterThanOrEqual(97);
      expect(scale.range()).toEqual([500, 0]);
    }
  });

  it('builds a linear scale without nice when nice=false', () => {
    const scale = buildScale({ type: 'linear', domain: [0, 97], nice: false }, [500, 0]);
    if (isContinuousScale(scale)) {
      expect(scale.domain()).toEqual([0, 97]);
    }
  });

  it('builds a log scale', () => {
    const scale = buildScale({ type: 'log', domain: [1, 1000] }, [400, 0]);
    expect(isContinuousScale(scale)).toBe(true);
    if (isContinuousScale(scale)) {
      expect(scale.domain()[0]).toBeLessThanOrEqual(1);
      expect(scale.domain()[1]).toBeGreaterThanOrEqual(1000);
    }
  });

  it('builds a time scale', () => {
    const d1 = new Date('2025-01-01');
    const d2 = new Date('2025-12-31');
    const scale = buildScale({ type: 'time', domain: [d1, d2] }, [0, 800]);
    // Time scale has invert but no bandwidth
    expect('invert' in scale).toBe(true);
    expect('bandwidth' in scale).toBe(false);
  });
});

describe('type guards', () => {
  it('isBandScale returns true for band, false for linear', () => {
    expect(isBandScale(buildScale({ type: 'band', domain: ['a'] }, [0, 100]))).toBe(true);
    expect(isBandScale(buildScale({ type: 'linear', domain: [0, 1] }, [0, 100]))).toBe(false);
  });

  it('isContinuousScale returns true for linear/log, false for band/time', () => {
    expect(isContinuousScale(buildScale({ type: 'linear', domain: [0, 1] }, [0, 100]))).toBe(true);
    expect(isContinuousScale(buildScale({ type: 'log', domain: [1, 100] }, [0, 100]))).toBe(true);
    expect(isContinuousScale(buildScale({ type: 'band', domain: ['a'] }, [0, 100]))).toBe(false);
  });
});
