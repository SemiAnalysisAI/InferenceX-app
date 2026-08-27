import { rowToSequence } from '@semianalysisai/inferencex-constants';

const CALCULATOR_METRIC_KEYS = new Set([
  'tput_per_gpu',
  'input_tput_per_gpu',
  'output_tput_per_gpu',
  'prefill_pp',
  'decode_pp',
  // Cached-input billing in the Fleet Lifecycle section reads these. Only
  // agentic rows carry them, but the trim runs on every calculator response, so
  // omitting them here would strip the metric before interpolation ever sees it.
  'server_gpu_cache_hit_rate',
  'server_external_cache_hit_rate',
  // Read only when no external rate is reported, but the trim cannot know that
  // per row — so it has to survive the allowlist either way. See
  // `measuredCacheHitRate` for why the two are not simply summed.
  'server_cpu_cache_hit_rate',
  // GB300 AgentX rows without a server measurement price cached input from the
  // trace's theoretical ceiling instead. See `pricingCacheHitRate`.
  'theoretical_cache_hit_rate',
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
  power_invalid_reasons?: unknown;
  power_audit?: unknown;
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
      // The calculator view excludes measured-power data by design, so the
      // audit provenance that explains it goes too.
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
