import { CACHE_VALIDITY_METRIC_KEYS, rowToSequence } from '@semianalysisai/inferencex-constants';

const CALCULATOR_METRIC_KEYS = new Set([
  'tput_per_gpu',
  'input_tput_per_gpu',
  'output_tput_per_gpu',
  'total_prompt_tokens',
  'total_generation_tokens',
  'prefill_pp',
  'decode_pp',
  'server_gpu_cache_hit_rate',
  'server_external_cache_hit_rate',
  'server_cpu_cache_hit_rate',
  'theoretical_cache_hit_rate',
  ...CACHE_VALIDITY_METRIC_KEYS,
  ...['median', 'p75', 'p90'].flatMap((percentile) =>
    ['intvty', 'itl', 'full_response_itl', 'e2el', 'ttlt', 'ttft'].map(
      (metric) => `${percentile}_${metric}`,
    ),
  ),
]);

interface BenchmarkViewRow {
  benchmark_type: string;
  isl: number | null;
  osl: number | null;
  metrics: Record<string, unknown>;
  workers?: unknown;
  power_invalid_reasons?: unknown;
  power_audit?: unknown;
}

export function toCalculatorBenchmarkRows<T extends BenchmarkViewRow>(
  rows: readonly T[],
  sequence: string,
): T[] {
  return rows
    .filter((row) => rowToSequence(row) === sequence)
    .map((row) => {
      const {
        workers: _workers,
        power_invalid_reasons: _powerInvalidReasons,
        power_audit: _powerAudit,
        ...rest
      } = row;
      return {
        ...rest,
        metrics: Object.fromEntries(
          Object.entries(row.metrics).filter(([key]) => CALCULATOR_METRIC_KEYS.has(key)),
        ),
      } as T;
    });
}
