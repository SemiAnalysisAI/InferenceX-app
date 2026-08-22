import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { Model, Sequence } from '@/lib/data-mappings';
import { normalizeArtifactRows } from '@/app/api/unofficial-run/route';

import {
  buildChartData,
  overlaySelectionReducer,
  parseAvailableModelsAndSequences,
  parseUnofficialRunIds,
  type OverlaySelectionState,
} from './unofficial-run-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal BenchmarkRow stub — only fields used by buildChartData key logic. */
function stubRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
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
    benchmark_type: 'single_turn',
    offload_mode: 'off',
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

function rawPowerArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    infmax_model_prefix: 'dsr1',
    hw: 'h200-nv',
    framework: 'sglang',
    precision: 'fp8',
    isl: 1024,
    osl: 1024,
    conc: 128,
    disagg: true,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    median_e2el: 1.4,
    median_intvty: 48,
    tput_per_gpu: 100.5,
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
    expect(result).toEqual([
      { model: Model.DeepSeek_R1, sequence: Sequence.OneK_OneK, precisions: [] },
    ]);
  });

  it('parses Kimi-K2.5 correctly', () => {
    const chartData = {
      'Kimi-K2.5_1k/1k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
      'Kimi-K2.5_1k/8k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
      'Kimi-K2.5_8k/1k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
    };
    const result = parseAvailableModelsAndSequences(chartData);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({
      model: Model.Kimi_K2_5,
      sequence: Sequence.OneK_OneK,
      precisions: [],
    });
    expect(result).toContainEqual({
      model: Model.Kimi_K2_5,
      sequence: Sequence.OneK_EightK,
      precisions: [],
    });
    expect(result).toContainEqual({
      model: Model.Kimi_K2_5,
      sequence: Sequence.EightK_OneK,
      precisions: [],
    });
  });

  it('parses Qwen3_5 correctly', () => {
    const chartData = {
      'Qwen-3.5-397B-A17B_1k/1k': {
        e2e: { data: [], gpus: {} },
        interactivity: { data: [], gpus: {} },
      },
    };
    const result = parseAvailableModelsAndSequences(chartData);
    expect(result).toEqual([
      { model: Model.Qwen3_5, sequence: Sequence.OneK_OneK, precisions: [] },
    ]);
  });

  it('parses MiniMax-M2.5 correctly', () => {
    const chartData = {
      'MiniMax-M2.5_1k/1k': { e2e: { data: [], gpus: {} }, interactivity: { data: [], gpus: {} } },
    };
    const result = parseAvailableModelsAndSequences(chartData);
    expect(result).toEqual([
      { model: Model.MiniMax_M2_5, sequence: Sequence.OneK_OneK, precisions: [] },
    ]);
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
    const keys = Object.keys(result).toSorted();
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
        metrics: { tput_per_gpu: 100, median_e2el: 5, median_intvty: 150, mean_ttft: 0.5 },
      }),
    ];
    const result = buildChartData(rows);
    const group = result['DeepSeek-R1-0528_1k/1k'];
    // e2e chart x-axis is median_e2el
    expect(group.e2e.data[0].x).toBe(5);
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
    expect(available).toContainEqual({
      model: Model.DeepSeek_R1,
      sequence: Sequence.OneK_OneK,
      precisions: ['fp8'],
    });
    expect(available).toContainEqual({
      model: Model.GptOss,
      sequence: Sequence.OneK_EightK,
      precisions: ['fp8'],
    });
    expect(available).toContainEqual({
      model: Model.Qwen3_5,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp8'],
    });
  });
});

describe('schema-v2 measured-power overlay data flow', () => {
  it('normalizes an overlay artifact and exposes J/query, Wh/query, and percent TDP', () => {
    const rows = normalizeArtifactRows(
      [
        rawPowerArtifact({
          power_valid: '1',
          power_metric_schema_version: '2',
          avg_power_w: 560,
          joules_per_successful_query: 1800,
        }),
      ],
      '2026-08-12',
    );
    const point = buildChartData(rows)['DeepSeek-R1-0528_1k/1k'].interactivity.data[0];

    expect(rows[0].metrics.power_valid).toBe(1);
    expect(rows[0].metrics.power_metric_schema_version).toBe(2);
    expect(point.measuredJPerSuccessfulQuery?.y).toBe(1800);
    expect(point.measuredWhPerSuccessfulQuery?.y).toBe(0.5);
    expect(point.measuredPowerPercentTdp?.y).toBe(80);
  });

  it.each([
    {
      name: 'malformed boolean verdict and junk schema',
      contract: { power_valid: true, power_metric_schema_version: '2garbage' },
    },
    {
      name: 'malformed string verdict',
      contract: { power_valid: 'garbage', power_metric_schema_version: 2 },
    },
    {
      name: 'explicit invalid verdict',
      contract: { power_valid: 0, power_metric_schema_version: 2 },
    },
  ])('withholds measured values for $name', ({ contract }) => {
    const rows = normalizeArtifactRows(
      [
        rawPowerArtifact({
          ...contract,
          avg_power_w: 560,
          joules_per_successful_query: 1800,
          avg_temp_c: 68.4,
          workers: [{ role: 'agg', worker_idx: 0, num_gpus: 8, avg_power_w: 560 }],
        }),
      ],
      '2026-08-12',
    );
    const point = buildChartData(rows)['DeepSeek-R1-0528_1k/1k'].interactivity.data[0];

    expect(rows[0].metrics.power_valid).toBe(0);
    expect(point.avg_power_w).toBeUndefined();
    expect(point.joules_per_successful_query).toBeUndefined();
    expect(point.avg_temp_c).toBeUndefined();
    expect(point.workers).toBeUndefined();
    expect(point.measuredJPerSuccessfulQuery).toBeUndefined();
    expect(point.measuredWhPerSuccessfulQuery).toBeUndefined();
    expect(point.measuredPowerPercentTdp).toBeUndefined();
  });
});

const initialSelection = (): OverlaySelectionState => ({
  availabilityKey: '1,2',
  activeOverlayHwTypes: new Set(['b200', 'h100']),
  availableOverlayHwTypes: new Set(['b200', 'h100']),
  localOfficialOverride: null,
  scopeKey: null,
  scopeOverlayHwTypes: new Set(),
  scopeReady: false,
  bestSelectionKey: '',
  bestPerSku: false,
});

describe('unofficial URL and overlay selection state', () => {
  it('canonicalizes whitespace, leading zeroes, and duplicate run IDs', () => {
    expect(parseUnofficialRunIds('?UnofficialRuns=0022,%2011,22')).toEqual(['22', '11']);
  });

  it('seeds a mixed official/overlay scope only when official readiness is known', () => {
    const pending = overlaySelectionReducer(initialSelection(), {
      type: 'scope',
      input: {
        scopeKey: 'model|sequence|1,2',
        officialHwTypes: new Set(['h200']),
        overlayHwTypes: new Set(['b200']),
        bestOfficialHwTypes: new Set(['h200']),
        bestOverlayHwTypes: new Set(['b200']),
        bestPerSku: false,
        ready: false,
      },
    });
    expect(pending.localOfficialOverride).toBeNull();
    expect(pending.activeOverlayHwTypes).toEqual(new Set(['b200', 'h100']));

    const ready = overlaySelectionReducer(pending, {
      type: 'scope',
      input: {
        scopeKey: 'model|sequence|1,2',
        officialHwTypes: new Set(['h200']),
        overlayHwTypes: new Set(['b200']),
        bestOfficialHwTypes: new Set(['h200']),
        bestOverlayHwTypes: new Set(['b200']),
        bestPerSku: false,
        ready: true,
      },
    });
    expect(ready.localOfficialOverride).toEqual(new Set(['h200']));
  });

  it('reconciles best-per-SKU in the reducer and restores the full scope when disabled', () => {
    const scope = {
      scopeKey: 'model|sequence|1,2',
      officialHwTypes: new Set(['h100', 'h200']),
      overlayHwTypes: new Set(['b100', 'b200']),
      bestOfficialHwTypes: new Set(['h200']),
      bestOverlayHwTypes: new Set(['b200']),
      bestPerSku: true,
      ready: true,
    };
    const best = overlaySelectionReducer(initialSelection(), { type: 'scope', input: scope });
    expect(best.localOfficialOverride).toEqual(new Set(['h200']));
    expect(best.activeOverlayHwTypes).toEqual(new Set(['h100', 'b200']));

    const restored = overlaySelectionReducer(best, {
      type: 'scope',
      input: { ...scope, bestPerSku: false },
    });
    expect(restored.localOfficialOverride).toEqual(new Set(['h100', 'h200']));
    expect(restored.activeOverlayHwTypes).toEqual(new Set(['h100', 'b100', 'b200']));
  });

  it('resets dismissed-run selection exactly once when the canonical query key changes', () => {
    const selected = overlaySelectionReducer(initialSelection(), {
      type: 'selection',
      official: new Set(['h200']),
      overlay: new Set(['b200']),
    });
    const dismissed = overlaySelectionReducer(selected, {
      type: 'availability',
      key: '1',
      allOverlayHwTypes: new Set(['b100']),
    });
    expect(dismissed.activeOverlayHwTypes).toEqual(new Set(['b100']));
    expect(dismissed.localOfficialOverride).toBeNull();
    expect(
      overlaySelectionReducer(dismissed, {
        type: 'availability',
        key: '1',
        allOverlayHwTypes: new Set(['b100']),
      }),
    ).toBe(dismissed);
  });
});
