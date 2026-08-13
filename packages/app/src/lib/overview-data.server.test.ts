import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from './api';
import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import { Model, Precision } from './data-mappings';
import type { OverviewPageData } from './overview-data';

/** `throughput` is TOTAL tok/s per GPU — the overview's cost basis. The
 *  output metric is a decoy so a regression to output pricing surfaces here. */
function row(
  hardware: string,
  framework: string,
  throughput: number,
  date = '2026-07-20',
): BenchmarkRow {
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
    metrics: { median_intvty: 50, tput_per_gpu: throughput, output_tput_per_gpu: 123 },
    date,
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
  it('forwards the selected hardware reference through fixture mode', async () => {
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: true }));
    vi.doMock('@/lib/benchmark-data.server', () => ({ getCachedBenchmarks: vi.fn() }));
    vi.doMock('@/lib/test-fixtures', () => ({
      loadFixture: vi.fn(() => ({ [Model.Qwen3_5]: rows })),
    }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const page = await getOverviewPageData(50, 'community', 'hardware', 'b300');

    expect(page.referenceHardware).toBe('b300');
  });

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
    const getCachedBenchmarksAsOf = vi.fn();
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
    vi.doMock('@/lib/benchmark-data.server', () => ({
      getCachedBenchmarks,
      getCachedBenchmarksAsOf,
    }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture: vi.fn() }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const page = await getOverviewPageData(50, 'community');

    expect(page.engineScope).toBe('community');
    expect(selectedFrameworks(page)).toEqual({
      candidate: 'dynamo-vllm',
      baseline: 'llmd-vllm',
    });
    expect(getCachedBenchmarks).toHaveBeenCalled();
    expect(getCachedBenchmarksAsOf).not.toHaveBeenCalled();
  });

  it('loads an as-of snapshot for history mode and rejects baselines older than 60 days', async () => {
    const currentRows = [...rows, row('b300', 'vllm', 1100)];
    const historicalRows = [
      row('mi355x', 'dynamo-vllm', 800, '2026-06-15'),
      row('b200', 'llmd-vllm', 700, '2026-06-15'),
      row('b300', 'vllm', 900, '2026-05-20'),
    ];
    const getCachedBenchmarks = vi.fn(() => Promise.resolve(currentRows));
    const getCachedBenchmarksAsOf = vi.fn((_keys: string[], _date: string) =>
      Promise.resolve(historicalRows),
    );
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
    vi.doMock('@/lib/benchmark-data.server', () => ({
      getCachedBenchmarks,
      getCachedBenchmarksAsOf,
    }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture: vi.fn() }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const page = await getOverviewPageData(50, 'community', '30d');
    const qwen = page.models.find((model) => model.model === Model.Qwen3_5);
    const mi355x = qwen?.platforms.find(({ hardware }) => hardware === 'mi355x');
    const b300 = qwen?.platforms.find(({ hardware }) => hardware === 'b300');

    expect(page.comparisonMode).toBe('30d');
    expect(page.historicalWindow).toEqual({
      key: '30d',
      snapshotDate: '2026-07-20',
      targetDate: '2026-06-20',
      earliestDate: '2026-05-21',
    });
    expect(getCachedBenchmarksAsOf).toHaveBeenCalled();
    expect(getCachedBenchmarksAsOf.mock.calls.every(([, date]) => date === '2026-06-20')).toBe(
      true,
    );
    expect(mi355x?.historicalComparison?.status).toBe('comparable');
    expect(mi355x?.historicalComparison?.baselineDate).toBe('2026-06-15');
    expect(b300?.historicalComparison?.status).toBe('no_baseline');
  });

  it('loads separate current and historical fixtures in history mode', async () => {
    const loadFixture = vi.fn((name: string) =>
      name === 'overview-history-rows'
        ? { [Model.Qwen3_5]: [row('mi355x', 'dynamo-vllm', 800, '2026-06-15')] }
        : { [Model.Qwen3_5]: rows },
    );
    const getCachedBenchmarks = vi.fn();
    const getCachedBenchmarksAsOf = vi.fn();
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: true }));
    vi.doMock('@/lib/benchmark-data.server', () => ({
      getCachedBenchmarks,
      getCachedBenchmarksAsOf,
    }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const page = await getOverviewPageData(50, 'community', '30d');

    expect(page.comparisonMode).toBe('30d');
    expect(loadFixture).toHaveBeenCalledWith('overview-rows');
    expect(loadFixture).toHaveBeenCalledWith('overview-history-rows');
    expect(getCachedBenchmarks).not.toHaveBeenCalled();
    expect(getCachedBenchmarksAsOf).not.toHaveBeenCalled();
  });
});

describe('getOverviewPageData model scope forwarding', () => {
  it('queries deprecated and maintenance models only under the all scope', async () => {
    const getCachedBenchmarks = vi.fn(() => Promise.resolve(rows));
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
    vi.doMock('@/lib/benchmark-data.server', () => ({
      getCachedBenchmarks,
      getCachedBenchmarksAsOf: vi.fn(),
    }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture: vi.fn() }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const gptOssKeys = DISPLAY_MODEL_TO_DB[Model.GptOss] ?? [];
    expect(gptOssKeys.length).toBeGreaterThan(0);

    const defaultPage = await getOverviewPageData(50, 'community', 'hardware', 'b200', 'default');
    const queriedByDefault = getCachedBenchmarks.mock.calls.flat(2);
    expect(defaultPage.modelScope).toBe('default');
    expect(defaultPage.models.some((m) => m.model === Model.GptOss)).toBe(false);
    expect(queriedByDefault).not.toEqual(expect.arrayContaining(gptOssKeys));

    getCachedBenchmarks.mockClear();
    const allPage = await getOverviewPageData(50, 'community', 'hardware', 'b200', 'all');
    const queriedByAll = getCachedBenchmarks.mock.calls.flat(2);
    expect(allPage.modelScope).toBe('all');
    expect(allPage.models.some((m) => m.model === Model.GptOss)).toBe(true);
    expect(queriedByAll).toEqual(expect.arrayContaining(gptOssKeys));
  });

  it('anchors the history window to default models even under the all scope', async () => {
    const gptOssKeys = DISPLAY_MODEL_TO_DB[Model.GptOss] ?? [];
    const getCachedBenchmarks = vi.fn((keys: string[]) =>
      Promise.resolve(
        keys.some((key) => gptOssKeys.includes(key))
          ? [row('b200', 'sglang', 900, '2026-07-28')]
          : rows,
      ),
    );
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
    vi.doMock('@/lib/benchmark-data.server', () => ({
      getCachedBenchmarks,
      getCachedBenchmarksAsOf: vi.fn(() => Promise.resolve([])),
    }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture: vi.fn() }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const page = await getOverviewPageData(50, 'community', '30d', 'b200', 'all');

    expect(page.historicalWindow?.snapshotDate).toBe('2026-07-20');
  });

  it('forwards the all scope through history mode', async () => {
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
    vi.doMock('@/lib/benchmark-data.server', () => ({
      getCachedBenchmarks: vi.fn(() => Promise.resolve(rows)),
      getCachedBenchmarksAsOf: vi.fn(() => Promise.resolve([])),
    }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture: vi.fn() }));

    const { getOverviewPageData } = await import('./overview-data.server');
    const page = await getOverviewPageData(50, 'community', '30d', 'b200', 'all');

    expect(page.comparisonMode).toBe('30d');
    expect(page.modelScope).toBe('all');
    expect(page.models.some((m) => m.model === Model.GptOss)).toBe(true);
  });
});
