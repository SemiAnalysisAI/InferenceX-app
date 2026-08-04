import { describe, expect, it } from 'vitest';

import type { BenchmarkSibling } from '@/hooks/api/use-benchmark-siblings';

import { chipLabel } from './sibling-nav';

function sibling(overrides: Partial<BenchmarkSibling> = {}): BenchmarkSibling {
  return {
    id: 437312,
    conc: 2,
    offload_mode: 'off',
    decode_tp: 0,
    decode_ep: 0,
    decode_pp: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_pp: 2,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    num_prefill_gpu: 16,
    num_decode_gpu: 0,
    disagg: false,
    is_multinode: true,
    tput_per_gpu: 348.31,
    total_requests: 169,
    is_current: true,
    has_trace: true,
    ...overrides,
  };
}

describe('chipLabel', () => {
  it('labels a non-disaggregated multinode point with its one aggregate topology', () => {
    expect(chipLabel(sibling())).toBe('TP8PP2 • c=2');
  });

  it('uses the meaningful aggregate PP when legacy schema halves disagree', () => {
    expect(chipLabel(sibling({ decode_tp: 8, decode_ep: 1 }))).toBe('TP8PP2 • c=2');
  });

  it('keeps prefill and decode roles separate only for disaggregated serving', () => {
    expect(
      chipLabel(
        sibling({
          disagg: true,
          decode_tp: 8,
          decode_ep: 1,
          decode_pp: 1,
          decode_num_workers: 1,
        }),
      ),
    ).toBe('1xTP8PP2+1xTP8 • c=2');
  });
});
