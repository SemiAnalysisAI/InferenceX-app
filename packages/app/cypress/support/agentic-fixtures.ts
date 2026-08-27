export function percentileLadder(prefix: string, base: number): Record<string, number> {
  return {
    [`median_${prefix}`]: base,
    [`p75_${prefix}`]: base * 1.2,
    [`p90_${prefix}`]: base * 1.5,
    [`p95_${prefix}`]: base * 1.7,
    [`p99_${prefix}`]: base * 2.2,
    [`std_${prefix}`]: base * 0.3,
  };
}

/**
 * Deterministic measured-power telemetry (schema v2, validated) so axis
 * positions are stable across runs. `disagg` adds the role splits — role
 * watts plus the role-local energy scalars behind the
 * Measured Prefill/Decode J-per-token axes.
 */
export function measuredPowerMetrics(
  concurrency: number,
  opts: { disagg?: boolean } = {},
): Record<string, number> {
  const scale = concurrency / 16;
  return {
    power_valid: 1,
    power_metric_schema_version: 2,
    avg_power_w: 600 + 10 * scale,
    joules_per_input_token: 0.3 / scale,
    joules_per_output_token: 8 / scale,
    joules_per_total_token: 0.9 / scale,
    joules_per_successful_query: 1500 / scale,
    avg_temp_c: 65 + scale,
    avg_util_pct: 80 + scale,
    ...(opts.disagg
      ? {
          prefill_avg_power_w: 612.3,
          decode_avg_power_w: 701.5,
          prefill_joules_per_input_token: 0.4 / scale,
          decode_joules_per_output_token: 5.1 / scale,
        }
      : {}),
  };
}

/**
 * WorkerPower-shaped rows for the pinned-tooltip drilldown. Plain object
 * literals — cypress support files never import types from src.
 */
export function syntheticWorkers(disagg: boolean) {
  if (!disagg) {
    return [{ role: 'agg', worker_idx: 0, hosts: ['n0'], num_gpus: 8, avg_power_w: 640.2 }];
  }
  return [
    { role: 'frontend', worker_idx: 0, hosts: ['fe0'], num_gpus: 0, avg_power_w: 120 },
    {
      role: 'prefill',
      worker_idx: 0,
      hosts: ['pn0'],
      num_gpus: 8,
      avg_power_w: 612.3,
      avg_temp_c: 68.4,
      avg_util_pct: 88.5,
    },
    { role: 'decode', worker_idx: 0, hosts: ['dn0'], num_gpus: 8, avg_power_w: 701.5 },
  ];
}

export function agenticMetrics(concurrency: number): Record<string, number> {
  const scale = concurrency / 16;
  const itl = 0.011 * scale;
  return {
    ...percentileLadder('ttft', 0.4 * scale),
    ...percentileLadder('tpot', 0.012 * scale),
    ...percentileLadder('itl', itl),
    ...percentileLadder('e2el', 8 * scale),
    median_intvty: 1 / itl,
    p75_intvty: 1 / (itl * 1.2),
    p90_intvty: 1 / (itl * 1.5),
    p99_intvty: 1 / (itl * 2.2),
    std_intvty: (1 / itl) * 0.1,
    tput_per_gpu: 950 / Math.sqrt(scale),
    output_tput_per_gpu: 210,
    input_tput_per_gpu: 740,
    total_tput_tps: 7600 * concurrency * 0.05,
  };
}
