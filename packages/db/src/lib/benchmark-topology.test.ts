import { describe, expect, it } from 'vitest';
import { mapBenchmarkRow } from '../etl/benchmark-mapper';
import type { ConfigParams } from '../etl/config-cache';
import { createSkipTracker } from '../etl/skip-tracker';
import { correctedBenchmarkConfig } from './benchmark-topology';

const config: ConfigParams = {
  hardware: 'h200',
  framework: 'vllm',
  model: 'qwen3.5',
  precision: 'fp8',
  specMethod: 'none',
  disagg: false,
  isMultinode: false,
  prefillTp: 8,
  prefillEp: 8,
  prefillDpAttn: false,
  prefillNumWorkers: 0,
  decodeTp: 8,
  decodeEp: 8,
  decodeDpAttn: false,
  decodeNumWorkers: 0,
  numPrefillGpu: 64,
  numDecodeGpu: 64,
};

describe('persisted benchmark topology repair', () => {
  it('repairs the independently verified AgentX 8-GPU shape without changing throughput', () => {
    const metrics = { total_tput_tps: 76145.02392, tput_per_gpu: 9518.12799, pp: 1, pcp_size: 1 };
    const before = structuredClone(metrics);
    const fixed = correctedBenchmarkConfig(config, 'agentic_traces', metrics);
    expect(fixed).toEqual({ ...config, numPrefillGpu: 8, numDecodeGpu: 8 });
    expect(metrics).toEqual(before);
    expect(correctedBenchmarkConfig(fixed, 'agentic_traces', metrics)).toBe(fixed);
  });

  it.each(['pp', 'pcp_size'])(
    'counts %s devices when the aggregate ratio confirms them',
    (dimension) => {
      const old = { ...config, prefillEp: 1, decodeEp: 1, numPrefillGpu: 8, numDecodeGpu: 8 };
      expect(
        correctedBenchmarkConfig(old, 'agentic_traces', {
          [dimension]: 2,
          total_tput_tps: 1600,
          tput_per_gpu: 100,
        }),
      ).toEqual({
        ...old,
        numPrefillGpu: 16,
        numDecodeGpu: 16,
      });
    },
  );

  it.each([
    [{}, 'agentic_traces', {}],
    [{}, 'single_turn', {}],
    [{}, 'agentic_traces', { total_tput_tps: 100, tput_per_gpu: 10 }],
    [{}, 'single_turn', { pp: 0 }],
    [{}, 'single_turn', { pcp_size: 1.5 }],
    [{ hardware: 'tpuv7' }, 'single_turn', {}],
    [{ framework: 'trtllm' }, 'single_turn', {}],
    [{ isMultinode: true }, 'single_turn', {}],
    [{ numPrefillGpu: 16, numDecodeGpu: 16 }, 'single_turn', {}],
    [{ disagg: true }, 'single_turn', {}],
  ])('retains ambiguous or nonlegacy topology %j', (overrides, type, metrics) => {
    const candidate = { ...config, ...overrides } as ConfigParams;
    expect(
      correctedBenchmarkConfig(candidate, type as string, metrics as Record<string, number>),
    ).toBe(candidate);
  });

  it('recognizes the complete zero-decode fixed-sequence artifact in ingest and backfill', () => {
    // Original 25948327237 / attempt 5: one 8-GPU pool completed both phases.
    const raw = {
      infmax_model_prefix: 'dsv4',
      hw: 'gb200-nvl',
      framework: 'dynamo-sglang',
      precision: 'fp4',
      disagg: true,
      is_multinode: true,
      prefill_tp: 4,
      prefill_ep: 1,
      prefill_num_workers: 2,
      num_prefill_gpu: 8,
      decode_tp: 0,
      decode_ep: 0,
      decode_num_workers: 0,
      num_decode_gpu: 0,
      isl: 8192,
      osl: 1024,
      conc: 1,
      tput_per_gpu: 149.7145445014,
      input_tput_per_gpu: 132.9915129295,
      output_tput_per_gpu: 16.7230315719,
    };
    const mapped = mapBenchmarkRow(raw, createSkipTracker())!;
    expect(mapped.config).toMatchObject({
      disagg: false,
      isMultinode: true,
      numPrefillGpu: 8,
      numDecodeGpu: 8,
      prefillTp: 4,
      decodeTp: 4,
      decodeNumWorkers: 2,
    });
    const old = {
      ...mapped.config,
      disagg: true,
      decodeTp: 0,
      decodeEp: 0,
      decodeNumWorkers: 0,
      numDecodeGpu: 0,
    };
    expect(correctedBenchmarkConfig(old, 'single_turn', mapped.metrics)).toEqual(mapped.config);
    // An incomplete or role-normalized result is not proof of colocation.
    expect(
      correctedBenchmarkConfig(old, 'single_turn', { ...mapped.metrics, output_tput_per_gpu: 0 }),
    ).toBe(old);
    expect(
      correctedBenchmarkConfig(old, 'single_turn', { ...mapped.metrics, tput_per_gpu: 500 }),
    ).toBe(old);
  });
});
