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
  'p99_ttft',
  'std_ttft',
  // TPOT — time per output token
  'median_tpot',
  'mean_tpot',
  'p99_tpot',
  'std_tpot',
  // ITL — inter-token latency
  'median_itl',
  'mean_itl',
  'p99_itl',
  'std_itl',
  // E2EL — end-to-end latency
  'median_e2el',
  'mean_e2el',
  'p99_e2el',
  'std_e2el',
  // interactivity
  'median_intvty',
  'mean_intvty',
  'p99_intvty',
  'std_intvty',
]);
