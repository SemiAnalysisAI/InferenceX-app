/**
 * Canonical set of metric keys stored in the benchmark_results.metrics JSONB column.
 *
 * All values are in seconds unless noted otherwise. Throughput values are tokens/sec/GPU.
 */
export const METRIC_KEYS = new Set([
  // throughput (tokens/sec/GPU)
  'tput_per_gpu',
  'output_tput_per_gpu',
  'input_tput_per_gpu',
  // TTFT — time to first token
  'median_ttft',
  'mean_ttft',
  'p90_ttft',
  'p99_ttft',
  'p99.9_ttft',
  'std_ttft',
  // TPOT — time per output token
  'median_tpot',
  'mean_tpot',
  'p90_tpot',
  'p99_tpot',
  'p99.9_tpot',
  'std_tpot',
  // ITL — inter-token latency
  'median_itl',
  'mean_itl',
  'p90_itl',
  'p99_itl',
  'p99.9_itl',
  'std_itl',
  // E2EL — end-to-end latency
  'median_e2el',
  'mean_e2el',
  'p90_e2el',
  'p99_e2el',
  'p99.9_e2el',
  'std_e2el',
  // interactivity
  'median_intvty',
  'mean_intvty',
  'p90_intvty',
  'p99_intvty',
  'p99.9_intvty',
  'std_intvty',
]);
