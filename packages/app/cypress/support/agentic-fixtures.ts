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
