import { describe, expect, it } from 'vitest';

import { measuredCacheHitRate } from './cache-pricing';

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
