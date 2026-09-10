import type { ConfigParams } from '../etl/config-cache.js';

/** These InferenceX producers count TP devices; EP partitions those devices. */
export const PHYSICAL_TP_FRAMEWORKS = new Set([
  'vllm',
  'sglang',
  'trt',
  'atom',
  'dynamo-vllm',
  'dynamo-sglang',
  'dynamo-trt',
]);

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const integer = (n: unknown): n is number => positive(n) && Number.isSafeInteger(n);
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-4, Math.abs(a) * 1e-6);

/** A complete colocated result can legitimately have no separate decode worker. */
export function isColocatedResult(config: ConfigParams, metrics: Record<string, number>): boolean {
  if (
    !config.disagg ||
    !config.isMultinode ||
    !PHYSICAL_TP_FRAMEWORKS.has(config.framework) ||
    config.numDecodeGpu !== 0 ||
    config.decodeNumWorkers !== 0 ||
    !integer(config.numPrefillGpu) ||
    config.prefillNumWorkers <= 0
  )
    return false;
  const total = metrics.tput_per_gpu;
  const input = metrics.input_tput_per_gpu;
  const output = metrics.output_tput_per_gpu;
  return positive(total) && positive(input) && positive(output) && close(total, input + output);
}

/**
 * Repair only established producer contracts. Metrics are never rescaled.
 * Explicit non-legacy counts, manual/proprietary deployments and TPUs are retained.
 * Stored aggregate rows require AgentX's independent total/per-GPU ratio.
 * Fixed-sequence rows lack that independent evidence: repair their count only
 * by re-ingesting the source artifact, not by guessing from TP/EP dimensions.
 */
export function correctedBenchmarkConfig(
  config: ConfigParams,
  benchmarkType: string,
  metrics: Record<string, number>,
): ConfigParams {
  if (isColocatedResult(config, metrics)) {
    return {
      ...config,
      disagg: false,
      decodeTp: config.prefillTp,
      decodeEp: config.prefillEp,
      decodeDpAttn: config.prefillDpAttn,
      decodeNumWorkers: config.prefillNumWorkers,
      numDecodeGpu: config.numPrefillGpu,
    };
  }
  if (
    config.disagg ||
    config.isMultinode ||
    config.hardware.startsWith('tpu') ||
    !PHYSICAL_TP_FRAMEWORKS.has(config.framework)
  )
    return config;
  const widths = [
    metrics.pp,
    metrics.prefill_pp,
    metrics.decode_pp,
    metrics.pcp_size,
    metrics.prefill_pcp_size,
    metrics.decode_pcp_size,
  ];
  if (widths.some((width) => width !== undefined && !integer(width))) return config;
  const pp = Math.max(metrics.pp ?? 1, metrics.prefill_pp ?? 1, metrics.decode_pp ?? 1);
  const pcp = Math.max(
    metrics.pcp_size ?? 1,
    metrics.prefill_pcp_size ?? 1,
    metrics.decode_pcp_size ?? 1,
  );
  const expected = config.decodeTp * pp * pcp;
  if (!integer(expected)) return config;
  if (benchmarkType === 'agentic_traces') {
    const total = metrics.total_tput_tps;
    const perGpu = metrics.tput_per_gpu;
    if (!positive(total) || !positive(perGpu) || !close(total / perGpu, expected)) return config;
  } else return config;
  // The old mapper's precise fallback is the only persisted count we replace.
  const legacy = config.decodeTp * config.decodeEp;
  if (config.numPrefillGpu !== legacy || config.numDecodeGpu !== legacy || expected === legacy) {
    return config;
  }
  return { ...config, numPrefillGpu: expected, numDecodeGpu: expected };
}
