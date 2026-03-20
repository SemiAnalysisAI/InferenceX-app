import { describe, it, expect } from 'vitest';

import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';

describe('benchmarkQueryOptions', () => {
  it('builds query key from model and date', () => {
    const opts = benchmarkQueryOptions('DeepSeek-R1-0528', '2026-03-01');
    expect(opts.queryKey).toEqual(['benchmarks', 'DeepSeek-R1-0528', '2026-03-01', 'latest']);
  });

  it('builds exact query key when exact=true', () => {
    const opts = benchmarkQueryOptions('DeepSeek-R1-0528', '2026-03-01', true, true);
    expect(opts.queryKey).toEqual(['benchmarks', 'DeepSeek-R1-0528', '2026-03-01', 'exact']);
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
