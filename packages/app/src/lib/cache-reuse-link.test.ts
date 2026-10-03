import { describe, expect, it } from 'vitest';

import type { PointMeta } from '@/hooks/api/use-trace-server-metrics';

import { cacheReuseHref, pointHardwareKey } from './cache-reuse-link';

const point: PointMeta = {
  id: 206885,
  hardware: 'b200',
  framework: 'sglang',
  model: 'glm5.2',
  precision: 'fp4',
  spec_method: 'none',
  disagg: false,
  is_multinode: false,
  prefill_tp: 8,
  prefill_ep: 1,
  prefill_dp_attention: false,
  prefill_num_workers: 1,
  decode_tp: 8,
  decode_ep: 8,
  decode_dp_attention: true,
  decode_num_workers: 4,
  num_prefill_gpu: 8,
  num_decode_gpu: 32,
  recipe_fingerprint: 'measured-recipe',
  conc: 8,
  offload_mode: 'on',
  kv_offloading: 'dram',
  kv_offload_backend: 'hicache',
  kv_offload_backend_version: null,
  kv_p2p_transfer: null,
  router_name: null,
  router_version: null,
  isl: null,
  osl: null,
  benchmark_type: 'agentic_traces',
  date: '2026-09-17',
  run_url: null,
  server_gpu_cache_hit_rate: 0.903,
  server_cpu_cache_hit_rate: 0.06,
};

describe('cacheReuseHref', () => {
  it('opens the tab under the reader locale and carries the chart state', () => {
    expect(cacheReuseHref('en')).toBe('/cache-reuse');
    expect(cacheReuseHref('zh')).toBe('/zh/cache-reuse');
  });

  it('pins a point to its own model, scenario, and configuration', () => {
    const url = new URL(cacheReuseHref('zh', point), 'https://inferencex.test');
    expect(url.pathname).toBe('/zh/cache-reuse');
    expect(url.searchParams.get('g_model')).toBe('GLM-5.2');
    expect(url.searchParams.get('i_seq')).toBe('agentic-traces');
    expect(url.searchParams.get('i_prec')).toBe('fp4');
    expect(url.searchParams.get('c_cfg')).toBe('b200_sglang');
    expect(url.searchParams.get('c_recipe')).toBe(
      'agg|sn|p1x8/1/-|d4x8/8/dpa|g8+32|spec-none|offload-on|fp-measured-recipe',
    );
    expect(url.searchParams.get('g_rundate')).toBe('2026-09-17');
  });

  it('leaves unknown model buckets and precisions to the store', () => {
    const url = new URL(
      cacheReuseHref('en', { ...point, model: 'mystery', precision: 'fp6' }),
      'https://x.test',
    );
    expect(url.searchParams.has('g_model')).toBe(false);
    expect(url.searchParams.has('i_prec')).toBe(false);
    expect(url.searchParams.get('c_cfg')).toBe('b200_sglang');
  });

  it('pins historical links to the source run even when its URL includes an attempt', () => {
    const url = new URL(
      cacheReuseHref('en', {
        ...point,
        run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/111/attempts/2',
      }),
      'https://inferencex.test',
    );
    expect(url.searchParams.get('g_runid')).toBe('111');
    expect(url.searchParams.get('g_rundate')).toBe('2026-09-17');
  });
});

describe('pointHardwareKey', () => {
  it('resolves a disaggregated point to the same series key the chart uses', () => {
    expect(
      pointHardwareKey({ ...point, hardware: 'gb200', framework: 'dynamo-vllm', disagg: true }),
    ).toBe('gb200_dynamo-vllm');
  });

  it('never folds the speculative method into an agentic key', () => {
    expect(pointHardwareKey({ ...point, spec_method: 'mtp' })).toBe('b200_sglang');
  });
});

describe('point recipe metrics', () => {
  it('matches the full legacy parallelism key', () => {
    const url = new URL(
      cacheReuseHref('en', {
        ...point,
        recipe_fingerprint: null,
        metrics: { prefill_pp: 2, decode_dcp_size: 8, prefill_pcp_size: 4 },
      }),
      'https://inferencex.test',
    );
    expect(url.searchParams.get('c_recipe')).toBe(
      'agg|sn|p1x8/1/-|d4x8/8/dpa|g8+32|spec-none|offload-on||parallel-2/1/1/8/4/1',
    );
  });
});
