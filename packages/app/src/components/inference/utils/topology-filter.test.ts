import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { pointTopologyKey, topologyLabel } from './topology-filter';

describe('topologyLabel', () => {
  it('spells out offload modes beside compact parallelism tokens', () => {
    const base = { physicalChips: 8, decode_tp: 8, decode_ep: 1, offload_mode: 'off' };
    const keys = [base, { ...base, offload_mode: 'on' }].map((point) =>
      pointTopologyKey(point as InferenceData),
    );
    expect(keys.map((key) => topologyLabel(key, 'en', keys))).toEqual([
      'Single-node · GPU8 · TP8 · EP1 · offload off',
      'Single-node · GPU8 · TP8 · EP1 · offload on',
    ]);
  });
});

describe('pointTopologyKey', () => {
  it('lists every decode and prefill dimension of a disaggregated point', () => {
    const point = {
      disagg: true,
      physicalChips: 12,
      dp: 2,
      decode_tp: 8,
      decode_ep: 8,
      decode_pp: 1,
      decode_dcp_size: 4,
      decode_pcp_size: 2,
      decode_dp_attention: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 8,
      prefill_num_workers: 1,
      decode_num_workers: 1,
      prefill_tp: 4,
      prefill_ep: 1,
      prefill_pp: 1,
      prefill_dcp_size: 1,
      prefill_pcp_size: 3,
      prefill_dp_attention: false,
      offload_mode: 'off',
    } as InferenceData;
    expect(pointTopologyKey(point)).toBe(
      'PD|GPU=12|DP=2|TP=8|EP=8|PP=1|DCP=4|PCP=2|DPA=1|P-GPU=4|D-GPU=8|P-workers=1|D-workers=1' +
        '|P-TP=4|P-EP=1|P-PP=1|P-DCP=1|P-PCP=3|P-DPA=0|offload=off',
    );
  });
});
