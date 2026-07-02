import { describe, expect, it } from 'vitest';

import { extractIslOsl, extractServerMetricSamples, percentilesOf } from './agentic-aggregates';

describe('percentilesOf', () => {
  it('returns null for empty input', () => {
    expect(percentilesOf([])).toBeNull();
    expect(percentilesOf([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it('computes percentiles for a simple integer range', () => {
    // 1..100, evenly spaced — linear quantile is straightforward.
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    const p = percentilesOf(xs);
    expect(p).not.toBeNull();
    expect(p!.n).toBe(100);
    expect(p!.mean).toBeCloseTo(50.5, 6);
    expect(p!.p50).toBeCloseTo(50.5, 6);
    // For 100 sorted values, p75 = sorted[0.75 * 99] = sorted[74.25] interp.
    expect(p!.p75).toBeCloseTo(75.25, 6);
    expect(p!.p90).toBeCloseTo(90.1, 6);
    expect(p!.p99).toBeCloseTo(99.01, 6);
  });

  it('filters out non-finite values before computing', () => {
    const p = percentilesOf([1, 2, Number.NaN, 3, Number.POSITIVE_INFINITY, 4]);
    expect(p?.n).toBe(4);
    expect(p?.mean).toBeCloseTo(2.5, 6);
  });
});

describe('extractIslOsl', () => {
  it('reads input/output sequence length from profiling records', () => {
    const lines = [
      JSON.stringify({
        metadata: { benchmark_phase: 'profiling' },
        metrics: {
          input_sequence_length: { value: 100, unit: 'tokens' },
          output_sequence_length: { value: 50, unit: 'tokens' },
        },
      }),
      JSON.stringify({
        metadata: { benchmark_phase: 'profiling' },
        metrics: {
          input_sequence_length: { value: 200, unit: 'tokens' },
          output_sequence_length: { value: 75, unit: 'tokens' },
        },
      }),
      // warmup record — should be ignored
      JSON.stringify({
        metadata: { benchmark_phase: 'warmup' },
        metrics: {
          input_sequence_length: { value: 9999, unit: 'tokens' },
          output_sequence_length: { value: 9999, unit: 'tokens' },
        },
      }),
    ];
    const { isl, osl } = extractIslOsl(lines.join('\n'));
    expect(isl).toEqual([100, 200]);
    expect(osl).toEqual([50, 75]);
  });
});

describe('extractServerMetricSamples', () => {
  it('extracts KV cache util gauge and computes per-interval prefix hit rate', () => {
    const json = JSON.stringify({
      metrics: {
        'vllm:kv_cache_usage_perc': {
          series: [
            {
              timeslices: [
                { start_ns: 0, end_ns: 1, avg: 0.1 },
                { start_ns: 1, end_ns: 2, avg: 0.5 },
                { start_ns: 2, end_ns: 3, avg: 0.9 },
              ],
            },
          ],
        },
        'vllm:prefix_cache_hits': {
          series: [
            {
              timeslices: [
                { start_ns: 0, rate: 80 },
                { start_ns: 1, rate: 50 },
                { start_ns: 2, rate: 0 }, // skipped because matching queries.rate is 0
              ],
            },
          ],
        },
        'vllm:prefix_cache_queries': {
          series: [
            {
              timeslices: [
                { start_ns: 0, rate: 100 }, // hit rate = 0.8
                { start_ns: 1, rate: 100 }, // hit rate = 0.5
                { start_ns: 2, rate: 0 },
              ],
            },
          ],
        },
      },
    });
    const { kvCacheUtil, prefixCacheHitRate } = extractServerMetricSamples(json);
    expect(kvCacheUtil).toEqual([0.1, 0.5, 0.9]);
    expect(prefixCacheHitRate).toEqual([0.8, 0.5]);
  });

  it('returns empty arrays when the JSON lacks the expected metric series', () => {
    const out = extractServerMetricSamples(JSON.stringify({ metrics: {} }));
    expect(out.kvCacheUtil).toEqual([]);
    expect(out.prefixCacheHitRate).toEqual([]);
  });
});
