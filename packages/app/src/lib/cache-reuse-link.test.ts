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
    expect(url.searchParams.get('c_cfg')).toBe('b200_sglang');
  });

  it('leaves the model to the store when the DB bucket is unknown', () => {
    const url = new URL(cacheReuseHref('en', { ...point, model: 'mystery' }), 'https://x.test');
    expect(url.searchParams.has('g_model')).toBe(false);
    expect(url.searchParams.get('c_cfg')).toBe('b200_sglang');
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
