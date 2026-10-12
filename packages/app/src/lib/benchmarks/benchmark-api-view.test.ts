import { describe, expect, it } from 'vitest';

import { toCalculatorBenchmarkRows } from './benchmark-api-view';

const rows = [
  {
    benchmark_type: 'single_turn',
    isl: 1024,
    osl: 1024,
    metrics: {
      tput_per_gpu: 120,
      median_intvty: 35,
      avg_power_w: 700,
      unused_debug_metric: 99,
    },
    workers: [{ rank: 0, avg_power_w: 700 }],
    power_invalid_reasons: ['sampling_gap_exceeded'],
    power_audit: { sample_count: 4800, producer_sha: null, exporter_image_sha256: null },
  },
  {
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    metrics: { tput_per_gpu: 80, median_intvty: 20 },
  },
  {
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    metrics: {
      output_tput_per_gpu: 42,
      p90_full_response_itl: 0.04,
      p90_ttlt: 12,
      p99_ttlt: 20,
    },
  },
];

describe('toCalculatorBenchmarkRows', () => {
  it('returns only the selected fixed sequence and calculator metrics', () => {
    expect(toCalculatorBenchmarkRows(rows, '1k/1k')).toEqual([
      {
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        metrics: { tput_per_gpu: 120, median_intvty: 35 },
      },
    ]);
  });

  it('keeps time to first token at the percentiles the calculator pages read', () => {
    // The First-Token Limits page caps rows on TTFT through this same view;
    // without these the page would have nothing to cap. p99 stays out like the
    // other p99 latency metrics.
    const [row] = toCalculatorBenchmarkRows(
      [
        {
          benchmark_type: 'agentic_traces',
          isl: null,
          osl: null,
          metrics: {
            tput_per_gpu: 100,
            median_ttft: 0.5,
            p75_ttft: 0.9,
            p90_ttft: 1.4,
            p99_ttft: 6,
            mean_ttft: 0.7,
          },
        },
      ],
      'agentic-traces',
    );
    expect(row.metrics).toEqual({
      tput_per_gpu: 100,
      median_ttft: 0.5,
      p75_ttft: 0.9,
      p90_ttft: 1.4,
    });
  });

  it('strips workers and the power audit provenance from the payload-trimmed view', () => {
    const [row] = toCalculatorBenchmarkRows(rows, '1k/1k');
    expect(row).not.toHaveProperty('workers');
    expect(row).not.toHaveProperty('power_invalid_reasons');
    expect(row).not.toHaveProperty('power_audit');
  });

  it('keeps all three cache tiers — the trim cannot know which one a row will use', () => {
    // `measuredCacheHitRate` picks between external and CPU per row, so the allowlist
    // has to pass all three through or the choice is made for it by the trim.
    // `pricingCacheHitRate` additionally falls back to the theoretical ceiling on
    // GB300 rows with no server measurement, so that survives too.
    // This runs on every calculator response, agentic included.
    const cached = toCalculatorBenchmarkRows(
      [
        {
          benchmark_type: 'agentic_traces',
          isl: null,
          osl: null,
          metrics: {
            tput_per_gpu: 100,
            server_gpu_cache_hit_rate: 0.77,
            server_external_cache_hit_rate: 0.06,
            server_cpu_cache_hit_rate: 0.055,
            theoretical_cache_hit_rate: 0.95,
          },
        },
      ],
      'agentic-traces',
    );
    expect(cached[0].metrics).toEqual({
      tput_per_gpu: 100,
      server_gpu_cache_hit_rate: 0.77,
      server_external_cache_hit_rate: 0.06,
      server_cpu_cache_hit_rate: 0.055,
      theoretical_cache_hit_rate: 0.95,
    });
  });

  it('keeps the agentic percentile inputs used for interpolation', () => {
    expect(toCalculatorBenchmarkRows(rows, 'agentic-traces')).toEqual([
      {
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        metrics: {
          output_tput_per_gpu: 42,
          p90_full_response_itl: 0.04,
          p90_ttlt: 12,
        },
      },
    ]);
  });
});
