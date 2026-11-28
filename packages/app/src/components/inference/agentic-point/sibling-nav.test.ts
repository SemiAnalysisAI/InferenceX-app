import { describe, expect, it } from 'bun:test';

import type { BenchmarkSibling, BenchmarkSku } from '@/hooks/api/use-benchmark-siblings';

import { chipLabel, skuHeading } from './sibling-nav';

function sibling(overrides: Partial<BenchmarkSibling> = {}): BenchmarkSibling {
  return {
    id: 437312,
    conc: 2,
    offload_mode: 'off',
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
    total_requests: 169,
    is_current: true,
    has_trace: true,
    ...overrides,
  };
}

describe('skuHeading', () => {
  const sku: BenchmarkSku = {
    hardware: 'gb200',
    framework: 'dynamo-sglang',
    model: 'kimik3.1',
    precision: 'fp4',
    spec_method: 'none',
    benchmark_type: 'agentic_traces',
    github_run_id: 1,
    date: '2026-11-04',
    dataset_slug: null,
  };

  it('names the hardware, model and engine as the registries do', () => {
    expect(skuHeading(sku)).toBe('GB200 NVL72 · Kimi-K3.1-Pro · FP4 · Dynamo SGLang');
  });

  it('names a point release by its own bucket, not the model it is grouped under', () => {
    expect(skuHeading({ ...sku, model: 'glm5.3' })).toContain('· GLM-5.3 ·');
  });

  it('keeps an unregistered model or chip readable', () => {
    expect(skuHeading({ ...sku, hardware: 'zx9', model: 'newmodel' })).toBe(
      'ZX9 · newmodel · FP4 · Dynamo SGLang',
    );
  });
});

describe('chipLabel', () => {
  it('shows DWDP group width and count on prefill-only runs', () => {
    expect(
      chipLabel(
        sibling({
          prefill_tp: 1,
          prefill_pp: 1,
          prefill_dwdp_size: 8,
          prefill_num_workers: 2,
        }),
      ),
    ).toBe('2xDWDP8 · c=2');
  });
  it('labels a non-disaggregated multinode point with its one aggregate topology', () => {
    expect(chipLabel(sibling())).toBe('TP8PP2 · c=2');
  });

  it('uses the meaningful aggregate PP when legacy schema halves disagree', () => {
    expect(chipLabel(sibling({ decode_tp: 8, decode_ep: 1 }))).toBe('TP8PP2 · c=2');
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
    ).toBe('TP8PP2/DCP8 · c=2');
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
    ).toBe('1xTP8PP2/DCP2/PCP4+1xTP8/DCP8 · c=2');
  });
});
