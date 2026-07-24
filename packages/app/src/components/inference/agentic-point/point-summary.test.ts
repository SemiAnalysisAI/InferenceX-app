import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const localeState = vi.hoisted(() => ({ pathname: '/inference/agentic/206885' }));
vi.mock('next/navigation', () => ({
  usePathname: () => localeState.pathname,
}));

import type { PointMeta } from '@/hooks/api/use-trace-server-metrics';

import { PointSummary } from './point-summary';

function meta(overrides: Partial<PointMeta> = {}): PointMeta {
  return {
    id: 206885,
    hardware: 'gb200',
    framework: 'dynamo-vllm',
    model: 'deepseek-r1-0528',
    precision: 'fp8',
    spec_method: 'none',
    disagg: true,
    conc: 128,
    offload_mode: 'off',
    kv_offloading: null,
    kv_offload_backend: null,
    kv_offload_backend_version: null,
    kv_p2p_transfer: null,
    router_name: null,
    router_version: null,
    isl: null,
    osl: null,
    benchmark_type: 'agentic_traces',
    date: '2026-06-23',
    run_url: null,
    server_gpu_cache_hit_rate: 0.5,
    server_cpu_cache_hit_rate: 0.42,
    ...overrides,
  };
}

describe('PointSummary', () => {
  it('hides a stale CPU cache hit rate when offload is disabled', () => {
    const html = renderToStaticMarkup(createElement(PointSummary, { meta: meta() }));

    expect(html).toContain('GPU cache hit');
    expect(html).not.toContain('CPU cache hit');
  });

  it('shows the CPU cache hit rate when offload is enabled', () => {
    const html = renderToStaticMarkup(
      createElement(PointSummary, { meta: meta({ offload_mode: 'on' }) }),
    );

    expect(html).toContain('CPU cache hit');
    expect(html).toContain('42.00%');
  });

  it('shows runtime component names and independently reported versions', () => {
    const html = renderToStaticMarkup(
      createElement(PointSummary, {
        meta: meta({
          offload_mode: 'on',
          kv_offloading: 'dram',
          kv_offload_backend: 'lmcache',
          kv_offload_backend_version: '0.5.1',
          kv_p2p_transfer: 'mooncake',
          router_name: 'vllm-router',
          router_version: '0.1.14',
        }),
      }),
    );

    expect(html).toContain('Offload Type');
    expect(html).toContain('DRAM');
    expect(html).toContain('KV Offload Engine');
    expect(html).toContain('LMCache 0.5.1');
    expect(html).toContain('KV Transfer Engine');
    expect(html).toContain('Mooncake');
    expect(html).toContain('Router');
    expect(html).toContain('vLLM Router 0.1.14');
  });

  it('renders runtime metadata labels in Simplified Chinese on /zh', () => {
    localeState.pathname = '/zh/inference/agentic/206885';
    const html = renderToStaticMarkup(
      createElement(PointSummary, {
        meta: meta({
          kv_offloading: 'dram',
          kv_offload_backend: 'hicache',
          router_name: 'sglang-router',
          router_version: '0.3.2',
        }),
      }),
    );
    localeState.pathname = '/inference/agentic/206885';

    expect(html).toContain('卸载类型');
    expect(html).toContain('KV 卸载引擎');
    expect(html).toContain('HiCache');
    expect(html).toContain('路由器');
    expect(html).toContain('SGLang Router 0.3.2');
  });
});
