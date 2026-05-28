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
  // measured power / energy (emitted by runner's aggregate_power.py)
  // avg_power_w:             mean per-GPU draw (W) during the load window
  // joules_per_output_token: avg_power_w * num_gpus * duration / total_output_tokens
  // joules_per_total_token:  avg_power_w * num_gpus * duration / (total_input + total_output)
  //                          — workload-shape-fair view that doesn't treat prompt as free
  'avg_power_w',
  'joules_per_output_token',
  'joules_per_total_token',
  // multinode / disagg role splits (emitted only when the deployment has
  // distinct prefill / decode workers)
  // prefill_avg_power_w / decode_avg_power_w:  mean per-GPU draw within each role
  // joules_per_input_token:           prefill_energy / total_input_tokens
  // joules_per_output_token_decode:   decode_energy  / total_output_tokens
  //                                   — _decode suffix is load-bearing: the
  //                                   single-node joules_per_output_token above
  //                                   sums across both phases, this one isolates
  //                                   decode-only energy.
  'prefill_avg_power_w',
  'decode_avg_power_w',
  'joules_per_input_token',
  'joules_per_output_token_decode',
]);
