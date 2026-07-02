import { describe, expect, it } from 'vitest';

import {
  costPerMillionTokens,
  joulesPerToken,
  tokensPerHourInMillions,
  tokensPerMwFromPerGpu,
} from './derived-metrics';

// ===========================================================================
// tokensPerHourInMillions
// ===========================================================================
describe('tokensPerHourInMillions', () => {
  it('converts tok/s to millions of tokens per hour', () => {
    // (1000 * 3600) / 1e6 = 3.6
    expect(tokensPerHourInMillions(1000)).toBeCloseTo(3.6, 10);
  });

  it('returns 0 for zero throughput', () => {
    expect(tokensPerHourInMillions(0)).toBe(0);
  });

  it('is the denominator used by costPerMillionTokens', () => {
    // costPerMillionTokens(cost, tps) === cost / tokensPerHourInMillions(tps)
    expect(costPerMillionTokens(2.8, 1000)).toBe(2.8 / tokensPerHourInMillions(1000));
  });
});

// ===========================================================================
// costPerMillionTokens
// ===========================================================================
describe('costPerMillionTokens', () => {
  it('divides hourly cost by tokens-per-hour-in-millions', () => {
    // tokensPerHour = 3.6; 2.8 / 3.6 ≈ 0.7778
    expect(costPerMillionTokens(2.8, 1000)).toBeCloseTo(2.8 / 3.6, 10);
  });

  it('scales linearly with cost', () => {
    expect(costPerMillionTokens(1.4, 1000)).toBeCloseTo(1.4 / 3.6, 10);
    expect(costPerMillionTokens(0.7, 1000)).toBeCloseTo(0.7 / 3.6, 10);
  });

  it('returns 0 when cost is 0 and throughput is positive', () => {
    expect(costPerMillionTokens(0, 1000)).toBe(0);
  });

  it('returns Infinity when throughput is 0 (no divisor guard — callers guard)', () => {
    // Preserves the historical unguarded behaviour of calculateCostsForGpus.
    expect(costPerMillionTokens(2.8, 0)).toBe(Infinity);
  });

  it('returns NaN when both cost and throughput are 0', () => {
    expect(costPerMillionTokens(0, 0)).toBeNaN();
  });
});

// ===========================================================================
// tokensPerMwFromPerGpu
// ===========================================================================
describe('tokensPerMwFromPerGpu', () => {
  it('scales per-GPU throughput to tok/s/MW using per-GPU power (kW)', () => {
    // (1000 * 1000) / 700 ≈ 1428.571
    expect(tokensPerMwFromPerGpu(1000, 700)).toBeCloseTo((1000 * 1000) / 700, 5);
  });

  it('returns 0 when throughput is 0 and power is positive', () => {
    expect(tokensPerMwFromPerGpu(0, 700)).toBe(0);
  });

  it('returns Infinity when power is 0 (no divisor guard — callers guard)', () => {
    expect(tokensPerMwFromPerGpu(1000, 0)).toBe(Infinity);
  });

  it('returns NaN when both throughput and power are 0', () => {
    expect(tokensPerMwFromPerGpu(0, 0)).toBeNaN();
  });

  it('halves the result when power doubles', () => {
    expect(tokensPerMwFromPerGpu(1000, 1400)).toBeCloseTo(tokensPerMwFromPerGpu(1000, 700) / 2, 10);
  });
});

// ===========================================================================
// joulesPerToken
// ===========================================================================
describe('joulesPerToken', () => {
  it('converts per-GPU power (kW) to watts and divides by throughput', () => {
    // (0.7 kW * 1000) / 2000 = 0.35
    expect(joulesPerToken(0.7, 2000)).toBeCloseTo(0.35, 10);
  });

  it('matches the chart fixture math (power=700 kW → W, tput=2000)', () => {
    // Mirrors chart-utils.test.ts jTotal fixture: (700 * 1000) / 2000 = 350
    expect(joulesPerToken(700, 2000)).toBeCloseTo((700 * 1000) / 2000, 5);
  });

  it('is inversely proportional to throughput', () => {
    expect(joulesPerToken(1.73, 2000)).toBeCloseTo(joulesPerToken(1.73, 10000) * 5, 10);
  });

  it('returns 0 when power is 0 and throughput is positive', () => {
    expect(joulesPerToken(0, 5000)).toBe(0);
  });

  it('returns Infinity when throughput is 0 (no divisor guard — callers guard)', () => {
    expect(joulesPerToken(1.73, 0)).toBe(Infinity);
  });

  it('returns NaN when both power and throughput are 0', () => {
    expect(joulesPerToken(0, 0)).toBeNaN();
  });
});
