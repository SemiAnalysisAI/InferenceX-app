import { describe, it, expect } from 'vitest';

import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';

describe('benchmarkQueryOptions', () => {
  it('builds query key from model and date', () => {
    const opts = benchmarkQueryOptions('DeepSeek-R1-0528', '2026-03-01');
    expect(opts.queryKey).toEqual([
      'benchmarks',
      'DeepSeek-R1-0528',
      '2026-03-01',
      'latest',
      'all',
      'asof',
    ]);
  });

  it('builds exact query key when exact=true', () => {
    const opts = benchmarkQueryOptions('DeepSeek-R1-0528', '2026-03-01', true, true);
    expect(opts.queryKey).toEqual([
      'benchmarks',
      'DeepSeek-R1-0528',
      '2026-03-01',
      'exact',
      'all',
      'asof',
    ]);
  });

  it('includes the runId in the query key for the as-of-run view', () => {
    const opts = benchmarkQueryOptions(
      'DeepSeek-R1-0528',
      '2026-03-01',
      true,
      false,
      '27489075807',
    );
    expect(opts.queryKey).toEqual([
      'benchmarks',
      'DeepSeek-R1-0528',
      '2026-03-01',
      'latest',
      '27489075807',
      'asof',
    ]);
  });

  it('marks the key as an exact-run query when exactRun=true', () => {
    const opts = benchmarkQueryOptions('m', '', true, false, '27489075807', true);
    expect(opts.queryKey).toEqual(['benchmarks', 'm', '', 'latest', '27489075807', 'run']);
  });

  it('produces distinct keys for as-of vs exact-run with the same runId', () => {
    const asof = benchmarkQueryOptions('m', '2026-03-01', true, false, '100', false);
    const exact = benchmarkQueryOptions('m', '2026-03-01', true, false, '100', true);
    expect(asof.queryKey).not.toEqual(exact.queryKey);
  });

  it('produces distinct keys for different runIds (no cache collision)', () => {
    const a = benchmarkQueryOptions('m', '2026-03-01', true, false, '100');
    const b = benchmarkQueryOptions('m', '2026-03-01', true, false, '101');
    expect(a.queryKey).not.toEqual(b.queryKey);
  });

  it('produces distinct keys for different models', () => {
    const a = benchmarkQueryOptions('modelA', '2026-03-01');
    const b = benchmarkQueryOptions('modelB', '2026-03-01');
    expect(a.queryKey).not.toEqual(b.queryKey);
  });

  it('is enabled when model is non-empty', () => {
    const opts = benchmarkQueryOptions('DeepSeek-R1-0528', '2026-03-01');
    expect(opts.enabled).toBe(true);
  });

  it('is disabled when model is empty string', () => {
    const opts = benchmarkQueryOptions('', '2026-03-01');
    expect(opts.enabled).toBe(false);
  });

  it('explicit enabled=false overrides non-empty model', () => {
    const opts = benchmarkQueryOptions('DeepSeek-R1-0528', '2026-03-01', false);
    expect(opts.enabled).toBe(false);
  });

  it('empty model stays disabled even with enabled=true', () => {
    const opts = benchmarkQueryOptions('', '2026-03-01', true);
    expect(opts.enabled).toBe(false);
  });
});
