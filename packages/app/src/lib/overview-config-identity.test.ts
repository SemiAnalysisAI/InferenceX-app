import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from './api';
import { overviewConfigIdentityKey } from './overview-config-identity';

let nextId = 1;

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextId++,
    hardware: 'b200',
    framework: 'sglang',
    model: 'qwen3.5',
    precision: 'fp8',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    // Not 8: the num_decode_gpu case below flips this to 8 and must change the key.
    num_decode_gpu: 4,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 16,
    offload_mode: 'off',
    image: null,
    metrics: { median_intvty: 50, output_tput_per_gpu: 1000 },
    date: '2026-07-20',
    run_url: null,
    ...overrides,
  };
}

/** The pre-v2.1 coarse key: hardware/framework/spec/disagg/offload, no GPU counts. */
const oldCoarseKey = (r: BenchmarkRow): string =>
  `${r.hardware}|${r.framework}|${r.spec_method}|${r.disagg}|${r.offload_mode}`;

describe('overviewConfigIdentityKey', () => {
  it.each([
    ['model', 'kimik2.7-code'],
    ['hardware', 'gb300'],
    ['framework', 'dynamo-trt'],
    ['precision', 'fp4'],
    ['spec_method', 'eagle'],
    ['disagg', true],
    ['is_multinode', true],
    ['prefill_tp', 4],
    ['prefill_ep', 4],
    ['prefill_dp_attention', true],
    ['prefill_num_workers', 7],
    ['decode_tp', 16],
    ['decode_ep', 16],
    ['decode_dp_attention', true],
    ['decode_num_workers', 2],
    ['num_prefill_gpu', 28],
    ['num_decode_gpu', 8],
    ['offload_mode', 'cpu'],
  ] satisfies [keyof BenchmarkRow, BenchmarkRow[keyof BenchmarkRow]][])(
    'changes when %s changes',
    (field, value) => {
      expect(overviewConfigIdentityKey(row({ [field]: value } as Partial<BenchmarkRow>))).not.toBe(
        overviewConfigIdentityKey(row()),
      );
    },
  );

  it('keeps concurrency and evidence outside configuration identity', () => {
    const base = row();
    expect(
      overviewConfigIdentityKey({
        ...base,
        conc: 64,
        date: '2026-07-21',
        image: 'new-image',
        run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/2',
      }),
    ).toBe(overviewConfigIdentityKey(base));
  });

  it('separates disagg topologies the old coarse key merged (28P+8D vs 40P+16D)', () => {
    // The old coarse key omitted GPU counts, so two different P/D splits on the
    // same hardware/framework/spec/disagg/offload collided into one result.
    const split28p8d = row({ disagg: true, num_prefill_gpu: 28, num_decode_gpu: 8 });
    const split40p16d = row({ disagg: true, num_prefill_gpu: 40, num_decode_gpu: 16 });

    expect(oldCoarseKey(split28p8d)).toBe(oldCoarseKey(split40p16d));
    expect(overviewConfigIdentityKey(split28p8d)).not.toBe(overviewConfigIdentityKey(split40p16d));
  });
});
