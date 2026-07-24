import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from './api';
import { Model, Precision } from './data-mappings';
import type { OverviewPageData } from './overview-data';

function row(hardware: string, framework: string, throughput: number): BenchmarkRow {
  return {
    id: throughput,
    hardware,
    framework,
    model: 'qwen3.5',
    precision: Precision.FP4,
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
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 1,
    offload_mode: 'off',
    image: null,
    metrics: { median_intvty: 50, output_tput_per_gpu: throughput },
    date: '2026-07-20',
    run_url: null,
  };
}

const rows = [
  row('mi355x', 'dynamo-vllm', 1000),
  row('b200', 'llmd-vllm', 800),
  row('mi355x', 'atom', 1400),
  row('b200', 'trtllm', 1200),
];

function selectedFrameworks(page: OverviewPageData) {
  const summary = page.models.find((model) => model.model === Model.Qwen3_5);
  return {
    candidate: summary?.platforms.find(({ hardware }) => hardware === 'mi355x')?.read.config
      ?.framework,
    baseline: summary?.platforms.find(({ hardware }) => hardware === 'b200')?.read.config
      ?.framework,
  };
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('@semianalysisai/inferencex-db/connection');
  vi.doUnmock('@/lib/benchmark-data.server');
  vi.doUnmock('@/lib/test-fixtures');
});

describe('getOverviewPageData engine scope forwarding', () => {
  it('forwards community scope through fixture mode', async () => {
    const getCachedBenchmarks = vi.fn();
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: true }));
    vi.doMock('@/lib/benchmark-data.server', () => ({ getCachedBenchmarks }));
    vi.doMock('@/lib/test-fixtures', () => ({
      loadFixture: vi.fn(() => ({ [Model.Qwen3_5]: rows })),
    }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const page = await getOverviewPageData(50, 'community');

    expect(page.engineScope).toBe('community');
    expect(selectedFrameworks(page)).toEqual({
      candidate: 'dynamo-vllm',
      baseline: 'llmd-vllm',
    });
    expect(getCachedBenchmarks).not.toHaveBeenCalled();
  });

  it('forwards community scope through live benchmark queries', async () => {
    const getCachedBenchmarks = vi.fn(() => Promise.resolve(rows));
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
    vi.doMock('@/lib/benchmark-data.server', () => ({ getCachedBenchmarks }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture: vi.fn() }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const page = await getOverviewPageData(50, 'community');

    expect(page.engineScope).toBe('community');
    expect(selectedFrameworks(page)).toEqual({
      candidate: 'dynamo-vllm',
      baseline: 'llmd-vllm',
    });
    expect(getCachedBenchmarks).toHaveBeenCalled();
  });
});
