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
  // joules_per_output_token: energy / total_output_tokens. CLUSTER-WIDE on
  //                          single-node / non-disagg (total_system_energy);
  //                          PER-STAGE decode_energy on disagg (decode GPUs only),
  //                          symmetric with joules_per_input_token below.
  // joules_per_total_token:  total_system_energy / (total_input + total_output)
  //                          — cluster-wide; workload-shape-fair view that
  //                          doesn't treat prompt as free.
  'avg_power_w',
  'joules_per_output_token',
  'joules_per_total_token',
  // multinode / disagg role splits (emitted only when the deployment has
  // distinct prefill / decode workers)
  // prefill_avg_power_w / decode_avg_power_w:  mean per-GPU draw within each role
  // joules_per_input_token:  prefill_energy / total_input_tokens (prefill GPUs only).
  //   The disagg output counterpart is joules_per_output_token above (decode GPUs
  //   only) — there is no separate _decode key.
  'prefill_avg_power_w',
  'decode_avg_power_w',
  'joules_per_input_token',
  // cluster-wide GPU telemetry beyond power (emitted by aggregate_power.py when
  // the perfmon CSVs include temperature, utilization, or memory samples).
  // avg_temp_c:        mean per-GPU temperature (Celsius) during load window
  // peak_temp_c:       max instantaneous per-GPU temperature in window
  // avg_util_pct:      mean per-GPU GPU-utilization percent (0-100)
  // avg_mem_used_mb:   mean per-GPU memory used (MiB / MB)
  // Single-node and multinode runs both surface these as flat scalars; the
  // per-worker breakdown carries the same fields on each entry in workers[].
  'avg_temp_c',
  'peak_temp_c',
  'avg_util_pct',
  'avg_mem_used_mb',
]);
