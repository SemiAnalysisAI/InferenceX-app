import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

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
});
