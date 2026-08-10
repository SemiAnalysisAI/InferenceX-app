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
