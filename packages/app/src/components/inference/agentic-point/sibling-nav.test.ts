import { describe, expect, it } from 'vitest';

import type { BenchmarkSibling } from '@/hooks/api/use-benchmark-siblings';

import { chipLabel, dualParetoSiblingIds } from './sibling-nav';

function sibling(overrides: Partial<BenchmarkSibling> = {}): BenchmarkSibling {
  return {
    id: 437312,
    conc: 2,
    offload_mode: 'off',
    kv_offloading: 'none',
    decode_tp: 0,
    decode_ep: 0,
    decode_pp: 1,
    decode_dcp_size: null,
    decode_pcp_size: null,
    decode_dp_attention: false,
    decode_num_workers: 0,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_pp: 2,
    prefill_dcp_size: null,
    prefill_pcp_size: null,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    num_prefill_gpu: 16,
    num_decode_gpu: 0,
    disagg: false,
    is_multinode: true,
    tput_per_gpu: 348.31,
    p90_intvty: 40,
    p90_ttft: 2,
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

  it('uses the shared point-label format for aggregate DCP and PCP', () => {
    expect(
      chipLabel(
        sibling({
          prefill_dcp_size: 8,
          decode_dcp_size: 8,
          prefill_pcp_size: 1,
          decode_pcp_size: 1,
        }),
      ),
    ).toBe('TP8PP2/DCP8 • c=2');
  });

  it('keeps prefill and decode roles separate only for disaggregated serving', () => {
    expect(
      chipLabel(
        sibling({
          disagg: true,
          decode_tp: 8,
          decode_ep: 1,
          decode_pp: 1,
          prefill_dcp_size: 2,
          prefill_pcp_size: 4,
          decode_dcp_size: 8,
          decode_pcp_size: 1,
          decode_num_workers: 1,
        }),
      ),
    ).toBe('1xTP8PP2/DCP2/PCP4+1xTP8/DCP8 • c=2');
  });

  it('names each physical offload tier without the legacy off=ON suffix', () => {
    expect(chipLabel(sibling({ kv_offloading: 'dram', offload_mode: 'on' }))).toBe(
      'TP8PP2 • c=2 • DRAM',
    );
    expect(chipLabel(sibling({ kv_offloading: 'nvme', offload_mode: 'on' }))).toBe(
      'TP8PP2 • c=2 • NVMe',
    );
    expect(chipLabel(sibling({ kv_offloading: 'dram+nvme', offload_mode: 'on' }))).toBe(
      'TP8PP2 • c=2 • DRAM+NVMe',
    );
  });

  it('falls back to a readable legacy label when an enabled point has no tier metadata', () => {
    expect(chipLabel(sibling({ kv_offloading: null, offload_mode: 'on' }))).toBe(
      'TP8PP2 • c=2 • Offload',
    );
  });
});

describe('dualParetoSiblingIds', () => {
  it('intersects the P90 interactivity and TTFT frontiers using throughput per GPU', () => {
    const rows = [
      sibling({ id: 1, p90_intvty: 100, p90_ttft: 1, tput_per_gpu: 100 }),
      sibling({ id: 2, p90_intvty: 80, p90_ttft: 2, tput_per_gpu: 200 }),
      sibling({ id: 3, p90_intvty: 50, p90_ttft: 3, tput_per_gpu: 50 }),
      sibling({ id: 4, p90_intvty: 120, p90_ttft: 4, tput_per_gpu: 150 }),
    ];

    expect([...dualParetoSiblingIds(rows)]).toEqual([2]);
  });

  it('excludes points missing any frontier coordinate', () => {
    const rows = [
      sibling({ id: 1, p90_intvty: 100, p90_ttft: 1, tput_per_gpu: 200 }),
      sibling({ id: 2, p90_intvty: null, p90_ttft: 0.5, tput_per_gpu: 100 }),
      sibling({ id: 3, p90_intvty: 200, p90_ttft: null, tput_per_gpu: 100 }),
    ];

    expect([...dualParetoSiblingIds(rows)]).toEqual([1]);
  });
});
