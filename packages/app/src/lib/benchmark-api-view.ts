import { rowToSequence } from '@semianalysisai/inferencex-constants';

const CALCULATOR_METRIC_KEYS = new Set([
  'tput_per_gpu',
  'input_tput_per_gpu',
  'output_tput_per_gpu',
  'prefill_pp',
  'decode_pp',
  ...['median', 'p75', 'p90'].flatMap((percentile) =>
    ['intvty', 'itl', 'full_response_itl', 'e2el', 'ttlt'].map(
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
}

/**
 * Page-owned calculator response: one selected scenario and only the metrics
 * its interpolation pipeline consumes. The default benchmarks API remains the
 * raw-row contract used by inference and other consumers.
 */
export function toCalculatorBenchmarkRows<T extends BenchmarkViewRow>(
  rows: readonly T[],
  sequence: string,
): T[] {
  return rows
    .filter((row) => rowToSequence(row) === sequence)
    .map((row) => {
      const { workers: _workers, ...rest } = row;
      return {
        ...rest,
        metrics: Object.fromEntries(
          Object.entries(row.metrics).filter(([key]) => CALCULATOR_METRIC_KEYS.has(key)),
        ),
      } as T;
    });
}
