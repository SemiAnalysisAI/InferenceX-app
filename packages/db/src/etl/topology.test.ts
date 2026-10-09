import { describe, expect, it } from 'vitest';
import { mapBenchmarkRow } from './benchmark-mapper';
import { mapAggEvalRow, mapEvalRow } from './eval-mapper';
import { configCacheKey } from './config-cache';
import { createSkipTracker } from './skip-tracker';

// The producer's aggregate eval schema mirrors one engine into both role fields.
const aggregate = {
  is_multinode: false,
  tp: 4,
  ep: 4,
  dp_attention: 'true',
  prefill_tp: 4,
  prefill_ep: 4,
  prefill_dp_attention: 'true',
  prefill_num_workers: 1,
  decode_tp: 4,
  decode_ep: 4,
  decode_dp_attention: 'true',
  decode_num_workers: 1,
};

function mapAllFormats(topology: Record<string, unknown>) {
  const row = {
    infmax_model_prefix: 'dsv41flash',
    hw: 'cluster:b300-dsxe',
    framework: 'sglang',
    precision: 'fp4',
    spec_decoding: 'mtp',
    isl: 0,
    osl: 0,
    conc: 192,
    ...topology,
  };
  const benchmark = mapBenchmarkRow(
    {
      ...row,
      ...(row.isl === 0 && row.osl === 0 ? { scenario_type: 'agentic-coding' } : {}),
      tput_per_gpu: 100,
    },
    createSkipTracker(),
  )!;
  const collected = mapAggEvalRow(
    { ...row, task: 'gsm8k', em_strict: 0.968 },
    createSkipTracker(),
  )!;
  const [individual] = mapEvalRow(
    row,
    { results: { gsm8k: { 'exact_match,strict-match': 0.968 } } },
    createSkipTracker(),
  );
  return { benchmark, collected, individual };
}

describe('shared benchmark and eval topology', () => {
  it.each([
    {
      name: 'mirrored aggregate DP-attention worker',
      input: aggregate,
      expected: {
        disagg: false,
        prefillNumWorkers: 0,
        decodeNumWorkers: 0,
        prefillTp: 4,
        decodeTp: 4,
        prefillEp: 4,
        decodeEp: 4,
        prefillDpAttn: true,
        decodeDpAttn: true,
        numPrefillGpu: 4,
        numDecodeGpu: 4,
      },
    },
    {
      name: 'two prefill workers and one decode worker',
      input: {
        framework: 'dynamo-sglang',
        is_multinode: true,
        prefill_tp: 16,
        prefill_ep: 16,
        prefill_num_workers: 2,
        decode_tp: 32,
        decode_ep: 32,
        decode_num_workers: 1,
      },
      expected: {
        disagg: true,
        prefillNumWorkers: 2,
        decodeNumWorkers: 1,
        numPrefillGpu: 32,
        numDecodeGpu: 32,
      },
    },
    {
      name: 'PP and PCP add devices while DCP does not',
      input: { is_multinode: false, tp: 4, ep: 4, pp: 2, pcp_size: 3, dcp_size: 2 },
      expected: { disagg: false, numPrefillGpu: 24, numDecodeGpu: 24 },
    },
    {
      name: 'explicit aggregate physical count',
      input: { ...aggregate, num_gpus: 8 },
      expected: { disagg: false, numPrefillGpu: 8, numDecodeGpu: 8 },
    },
    {
      name: 'explicit role counts override deployment total and fallback',
      input: { ...aggregate, disagg: true, num_gpus: 12, num_prefill_gpu: 8, num_decode_gpu: 4 },
      expected: { disagg: true, numPrefillGpu: 8, numDecodeGpu: 4 },
    },
    {
      name: 'distributed aggregate with an explicitly absent decode role',
      input: {
        framework: 'sglang',
        is_multinode: true,
        prefill_tp: 8,
        prefill_ep: 1,
        prefill_num_workers: 1,
        num_prefill_gpu: 8,
        decode_tp: 0,
        decode_ep: 0,
        decode_num_workers: 0,
        num_decode_gpu: 0,
      },
      expected: {
        disagg: false,
        isMultinode: true,
        prefillTp: 8,
        decodeTp: 8,
        numPrefillGpu: 8,
        numDecodeGpu: 8,
      },
    },
    {
      name: 'explicit disaggregation on one physical node',
      input: { ...aggregate, disagg: true },
      expected: {
        disagg: true,
        prefillNumWorkers: 1,
        decodeNumWorkers: 1,
        numPrefillGpu: 4,
        numDecodeGpu: 4,
      },
    },
    {
      name: 'asymmetric single-node worker pools',
      input: { ...aggregate, decode_num_workers: 2 },
      expected: {
        disagg: true,
        prefillNumWorkers: 1,
        decodeNumWorkers: 2,
        numPrefillGpu: 4,
        numDecodeGpu: 8,
      },
    },
    {
      name: 'other-framework legacy EP devices',
      input: { framework: 'vllm', is_multinode: false, tp: 1, ep: 8 },
      expected: { disagg: false, numPrefillGpu: 8, numDecodeGpu: 8 },
    },
    {
      name: 'historical fixed-sequence count convention',
      input: { is_multinode: false, isl: 8192, osl: 1024, tp: 2, ep: 2 },
      expected: { disagg: false, numPrefillGpu: 4, numDecodeGpu: 4 },
    },
    {
      name: 'legacy role fallback includes worker replicas',
      input: {
        framework: 'vllm',
        prefill_tp: 2,
        prefill_ep: 2,
        prefill_num_workers: 2,
        decode_tp: 1,
        decode_ep: 8,
        decode_num_workers: 2,
      },
      expected: { disagg: true, numPrefillGpu: 8, numDecodeGpu: 16 },
    },
  ])('$name', ({ input, expected }) => {
    const { benchmark, collected, individual } = mapAllFormats(input);
    for (const result of [benchmark, collected, individual]) {
      expect(result.config).toMatchObject(expected);
      expect(configCacheKey(result.config)).toBe(configCacheKey(benchmark.config));
    }
    expect(benchmark.metrics.tput_per_gpu).toBe(100);
    expect(collected.metrics.em_strict).toBe(0.968);
    expect(individual.metrics.em_strict).toBe(0.968);
  });
});
