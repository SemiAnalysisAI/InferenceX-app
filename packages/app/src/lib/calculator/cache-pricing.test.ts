import { describe, expect, it } from 'vitest';

import {
  actualCacheRateUnavailable,
  CACHE_HIT_RATE_FALLBACK_HARDWARE,
  measuredCacheHitRate,
  pricingCacheHitRate,
  SERIALIZED_RATE_SUM_TOLERANCE,
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

describe('actualCacheRateUnavailable (ATOM actual pricing guard)', () => {
  const RUN = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1/attempts/1';
  const atom = (fields: Record<string, number | undefined>) => ({
    framework: 'atom-disagg',
    run_url: RUN,
    ...fields,
  });
  const complete = { server_gpu_cache_hit_rate: 0.6, server_cpu_cache_hit_rate: 0.1 };
  const eligible = { server_cache_pricing_eligible: 1, server_cache_validity_code: 1 };

  it('prices a complete eligible observation and a complete legacy one', () => {
    expect(actualCacheRateUnavailable(atom({ ...complete, ...eligible }))).toBeNull();
    expect(actualCacheRateUnavailable(atom(complete))).toBeNull();
  });

  it.each([
    ['eligible but no rates', { ...eligible }, 'MISSING_OBSERVATION'],
    ['eligible but GPU only', { ...eligible, server_gpu_cache_hit_rate: 0.6 }, 'PARTIAL_COMPONENT'],
    [
      'eligible flag with a window code',
      { ...complete, ...eligible, server_cache_validity_code: 13 },
      'VALIDITY_CONFLICT',
    ],
    [
      'eligible with GPU above 1',
      { ...eligible, server_gpu_cache_hit_rate: 1.2, server_cpu_cache_hit_rate: 0 },
      'INVALID_RATE',
    ],
    [
      'legacy non-finite GPU',
      { server_gpu_cache_hit_rate: Number.NaN, server_cpu_cache_hit_rate: 0 },
      'INVALID_RATE',
    ],
    ['legacy CPU only', { server_cpu_cache_hit_rate: 0.1 }, 'PARTIAL_COMPONENT'],
    ['legacy without rates', {}, 'MISSING_OBSERVATION'],
    [
      'an unknown flag value',
      { ...complete, server_cache_pricing_eligible: 2 },
      'UNKNOWN_VALIDITY',
    ],
    [
      'CPU and external disagreeing',
      { ...complete, ...eligible, server_external_cache_hit_rate: 0.2 },
      'CPU_EXTERNAL_CONFLICT',
    ],
    [
      'GPU plus CPU above 1',
      { ...eligible, server_gpu_cache_hit_rate: 0.95, server_cpu_cache_hit_rate: 0.1 },
      'INVALID_RATE',
    ],
  ])('refuses %s', (_, fields, reason) => {
    expect(actualCacheRateUnavailable(atom(fields))).toBe(reason);
  });

  it('accepts a validated zero and a sum within the 5-decimal serialization tolerance', () => {
    const zero = { server_gpu_cache_hit_rate: 0, server_cpu_cache_hit_rate: 0 };
    expect(
      actualCacheRateUnavailable(atom({ ...zero, ...eligible, server_cache_validity_code: 2 })),
    ).toBeNull();
    const rounded = {
      server_gpu_cache_hit_rate: 0.99999,
      server_cpu_cache_hit_rate: SERIALIZED_RATE_SUM_TOLERANCE,
    };
    expect(actualCacheRateUnavailable(atom({ ...rounded, ...eligible }))).toBeNull();
  });

  it('reports the producer reason for an ineligible row and quarantines the known-bad run', () => {
    const scope = { ...complete, server_cache_pricing_eligible: 0, server_cache_validity_code: 14 };
    expect(actualCacheRateUnavailable(atom(scope))).toBe('REQUEST_SCOPE_UNRESOLVED');
    const legacy = {
      ...atom(complete),
      run_url: 'https://github.com/x/y/actions/runs/36734492117/attempts/1',
    };
    expect(actualCacheRateUnavailable(legacy)).toBe('KNOWN_BAD_HISTORICAL_RESULT');
    expect(actualCacheRateUnavailable({ ...legacy, ...eligible })).toBeNull();
  });

  it('leaves other frameworks unchanged', () => {
    expect(
      actualCacheRateUnavailable({ framework: 'vllm', server_gpu_cache_hit_rate: 1.2 }),
    ).toBeNull();
  });
});
