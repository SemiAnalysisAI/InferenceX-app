import { describe, expect, it } from 'vitest';

import {
  CACHE_HIT_RATE_FALLBACK_HARDWARE,
  measuredCacheHitRate,
  pricingCacheHitRate,
} from './cache-pricing';

describe('measuredCacheHitRate', () => {
  it('combines GPU and external tiers without double-counting CPU offload', () => {
    expect(
      measuredCacheHitRate({
        server_gpu_cache_hit_rate: 0.8,
        server_external_cache_hit_rate: 0.06,
        server_cpu_cache_hit_rate: 0.07,
      }),
    ).toBeCloseTo(0.86, 10);
  });

  it('uses the CPU tier when no external measurement exists', () => {
    expect(
      measuredCacheHitRate({
        server_gpu_cache_hit_rate: 0.77,
        server_cpu_cache_hit_rate: 0.055,
      }),
    ).toBeCloseTo(0.825, 10);
  });

  it('treats a reported external zero as a measurement that suppresses CPU', () => {
    expect(
      measuredCacheHitRate({
        server_gpu_cache_hit_rate: 0.4,
        server_external_cache_hit_rate: 0,
        server_cpu_cache_hit_rate: 0.5,
      }),
    ).toBe(0.4);
  });

  it('returns null without telemetry and clamps malformed server values', () => {
    expect(measuredCacheHitRate({})).toBeNull();
    expect(measuredCacheHitRate({ server_gpu_cache_hit_rate: 1.2 })).toBe(1);
    expect(measuredCacheHitRate({ server_gpu_cache_hit_rate: -0.2 })).toBe(0);
  });
});

describe('pricingCacheHitRate', () => {
  it('prefers the measured server rate on every hardware', () => {
    expect(
      pricingCacheHitRate({
        hw: 'gb300',
        server_gpu_cache_hit_rate: 0.8,
        server_external_cache_hit_rate: 0.06,
        theoretical_cache_hit_rate: 0.97,
      }),
    ).toBeCloseTo(0.86, 10);
  });

  it('falls back to the theoretical ceiling only for GB300 points without a measurement', () => {
    expect(pricingCacheHitRate({ hw: 'gb300', theoretical_cache_hit_rate: 0.969 })).toBeCloseTo(
      0.969,
      10,
    );
    expect(pricingCacheHitRate({ hw: 'gb300', theoretical_cache_hit_rate: 1.2 })).toBe(1);
    expect(pricingCacheHitRate({ hw: 'gb300' })).toBeNull();
    expect(pricingCacheHitRate({ hw: 'gb300', theoretical_cache_hit_rate: Number.NaN })).toBeNull();
  });

  it('never invents a hit rate for other hardware or unknown hardware', () => {
    for (const hw of ['gb200', 'b300', 'b200', 'mi355x', 'h200', undefined]) {
      expect(pricingCacheHitRate({ hw, theoretical_cache_hit_rate: 0.97 })).toBeNull();
    }
  });

  it('keeps the fallback allowlist to GB300', () => {
    expect([...CACHE_HIT_RATE_FALLBACK_HARDWARE]).toEqual(['gb300']);
  });
});
