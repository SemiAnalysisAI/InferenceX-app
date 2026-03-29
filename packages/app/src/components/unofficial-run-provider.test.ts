import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { Model, Sequence } from '@/lib/data-mappings';

import { buildChartData, parseAvailableModelsAndSequences } from './unofficial-run-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal BenchmarkRow stub — only fields used by buildChartData key logic. */
function stubRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    hardware: 'h200',
    framework: 'sglang',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: 1024,
    osl: 1024,
    conc: 128,
    image: null,
    metrics: { tput_per_gpu: 100, mean_ttft: 0.5, mean_tpot: 0.01, mean_e2el: 1, mean_intvty: 50 },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseAvailableModelsAndSequences
// ---------------------------------------------------------------------------

describe('parseAvailableModelsAndSequences', () => {
  it('returns empty array for null input', () => {
    expect(parseAvailableModelsAndSequences(null)).toEqual([]);
  });

  it('returns empty array for empty chart data', () => {
    expect(parseAvailableModelsAndSequences({})).toEqual([]);
  });

  it('parses DeepSeek-R1 correctly', () => {
    const chartData = {
      'DeepSeek-R1-0528_1k/1k': {
        e2e: { data: [], gpus: {} },
        interactivity: { data: [], gpus: {} },
      },
    };
    const result = parseAvailableModelsAndSequences(chartData);
    expect(result).toEqual([{ model: Model.DeepSeek_R1, sequence: Sequence.OneK_OneK }]);
  });

  it('parses Kimi-K2.5 correctly', () => {
    const chartData = {
      'Kimi-K2.5_1k/1k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
      'Kimi-K2.5_1k/8k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
      'Kimi-K2.5_8k/1k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
    };
    const result = parseAvailableModelsAndSequences(chartData);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ model: Model.Kimi_K2_5, sequence: Sequence.OneK_OneK });
    expect(result).toContainEqual({ model: Model.Kimi_K2_5, sequence: Sequence.OneK_EightK });
    expect(result).toContainEqual({ model: Model.Kimi_K2_5, sequence: Sequence.EightK_OneK });
  });

  it('parses Qwen3_5 correctly', () => {
    const chartData = {
      'Qwen-3.5-397B-A17B_1k/1k': {
        e2e: { data: [], gpus: {} },
        interactivity: { data: [], gpus: {} },
      },
    };
    const result = parseAvailableModelsAndSequences(chartData);
    expect(result).toEqual([{ model: Model.Qwen3_5, sequence: Sequence.OneK_OneK }]);
  });

  it('parses MiniMax-M2.5 correctly', () => {
    const chartData = {
      'MiniMax-M2.5_1k/1k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
    };
    const result = parseAvailableModelsAndSequences(chartData);
    expect(result).toEqual([{ model: Model.MiniMax_M2_5, sequence: Sequence.OneK_OneK }]);
  });

  it('skips keys with unknown model names', () => {
    const chartData = {
      'UnknownModel_1k/1k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
    };
    expect(parseAvailableModelsAndSequences(chartData)).toEqual([]);
  });

  it('skips keys without underscores', () => {
    const chartData = {
      'no-underscore': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
    };
    expect(parseAvailableModelsAndSequences(chartData)).toEqual([]);
  });

  it('deduplicates identical model/sequence combinations', () => {
    // Simulate data where the same key appears twice (e.g. via spread merge)
    const entry = { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } };
    const chartData = Object.fromEntries([
      ['Kimi-K2.5_1k/1k', entry],
      ['Kimi-K2.5_1k/1k', entry],
    ]);
    const result = parseAvailableModelsAndSequences(chartData);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// buildChartData — key construction
// ---------------------------------------------------------------------------

describe('buildChartData', () => {
  it('maps DB model key to display name in chart data keys', () => {
    const rows = [stubRow({ model: 'dsr1', isl: 1024, osl: 1024 })];
    const result = buildChartData(rows);
    expect(Object.keys(result)).toEqual(['DeepSeek-R1-0528_1k/1k']);
  });

  it('maps gptoss120b to gpt-oss-120b display name', () => {
    const rows = [stubRow({ model: 'gptoss120b', isl: 1024, osl: 8192 })];
    const result = buildChartData(rows);
    expect(Object.keys(result)).toEqual(['gpt-oss-120b_1k/8k']);
  });

  it('maps 8k/1k sequence correctly', () => {
    const rows = [stubRow({ model: 'dsr1', isl: 8192, osl: 1024 })];
    const result = buildChartData(rows);
    expect(Object.keys(result)).toEqual(['DeepSeek-R1-0528_8k/1k']);
  });

  it('skips rows with unmapped ISL/OSL', () => {
    const rows = [stubRow({ model: 'dsr1', isl: 4096, osl: 4096 })];
    const result = buildChartData(rows);
    expect(Object.keys(result)).toEqual([]);
  });

  it('passes through unknown model names as-is', () => {
    const rows = [stubRow({ model: 'unknown-model', isl: 1024, osl: 1024 })];
    const result = buildChartData(rows);
    expect(Object.keys(result)).toEqual(['unknown-model_1k/1k']);
  });

  it('groups rows by model + sequence', () => {
    const rows = [
      stubRow({ model: 'dsr1', isl: 1024, osl: 1024, conc: 64 }),
      stubRow({ model: 'dsr1', isl: 1024, osl: 1024, conc: 128 }),
      stubRow({ model: 'dsr1', isl: 1024, osl: 8192, conc: 64 }),
    ];
    const result = buildChartData(rows);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(['DeepSeek-R1-0528_1k/1k', 'DeepSeek-R1-0528_1k/8k']);
  });

  it('produces e2e and interactivity chart data per group', () => {
    const rows = [stubRow({ model: 'dsr1', isl: 1024, osl: 1024 })];
    const result = buildChartData(rows);
    const group = result['DeepSeek-R1-0528_1k/1k'];
    expect(group).toBeDefined();
    expect(group.e2e).toBeDefined();
    expect(group.interactivity).toBeDefined();
    expect(group.e2e.gpus).toBeDefined();
    expect(group.interactivity.gpus).toBeDefined();
  });

  it('assigns e2e chart data with median_e2el x-values and interactivity with median_intvty', () => {
    const rows = [
      stubRow({
        model: 'dsr1',
        isl: 1024,
        osl: 1024,
        metrics: { tput_per_gpu: 100, median_e2el: 5.0, median_intvty: 150, mean_ttft: 0.5 },
      }),
    ];
    const result = buildChartData(rows);
    const group = result['DeepSeek-R1-0528_1k/1k'];
    // e2e chart x-axis is median_e2el
    expect(group.e2e.data[0].x).toBe(5.0);
    // interactivity chart x-axis is median_intvty
    expect(group.interactivity.data[0].x).toBe(150);
  });

  it('preserves all data points for disagg configs with different parallelism but same tp', () => {
    // Two configs: same hwKey/precision/tp/conc but different decode_ep/dp_attention.
    // Both must survive buildChartData; D3 dedup is a rendering concern, not a data one.
    const rows = [
      stubRow({
        disagg: true,
        spec_method: 'mtp',
        num_prefill_gpu: 8,
        num_decode_gpu: 16,
        decode_ep: 1,
        decode_dp_attention: false,
        conc: 256,
        metrics: { tput_per_gpu: 800, median_e2el: 10, median_intvty: 48, mean_ttft: 0.5 },
      }),
      stubRow({
        disagg: true,
        spec_method: 'mtp',
        num_prefill_gpu: 8,
        num_decode_gpu: 16,
        decode_ep: 8,
        decode_dp_attention: true,
        conc: 256,
        metrics: { tput_per_gpu: 1000, median_e2el: 8, median_intvty: 55, mean_ttft: 0.4 },
      }),
    ];
    const result = buildChartData(rows);
    const group = result['DeepSeek-R1-0528_1k/1k'];
    expect(group.interactivity.data).toHaveLength(2);
    expect(group.e2e.data).toHaveLength(2);
    // Verify the two points have different x/y values (different perf numbers)
    const [a, b] = group.interactivity.data;
    expect(a.x).not.toBe(b.x);
  });

  it('buildChartData keys are compatible with parseAvailableModelsAndSequences', () => {
    const rows = [
      stubRow({ model: 'dsr1', isl: 1024, osl: 1024 }),
      stubRow({ model: 'gptoss120b', isl: 1024, osl: 8192 }),
      stubRow({ model: 'qwen3.5', isl: 8192, osl: 1024 }),
    ];
    const chartData = buildChartData(rows);
    const available = parseAvailableModelsAndSequences(chartData);
    expect(available).toContainEqual({ model: Model.DeepSeek_R1, sequence: Sequence.OneK_OneK });
    expect(available).toContainEqual({ model: Model.GptOss, sequence: Sequence.OneK_EightK });
    expect(available).toContainEqual({ model: Model.Qwen3_5, sequence: Sequence.EightK_OneK });
  });
});
