import { describe, expect, it } from 'vitest';

import type { EvalRow } from '@/lib/api';
import { Model, Precision } from '@/lib/data-mappings';

import {
  aggregateEvaluationChartRows,
  buildEvalChangelogEntries,
  buildEvaluationChartRows,
} from './chart-data';

function evalRow(overrides: Partial<EvalRow> = {}): EvalRow {
  return {
    config_id: 1,
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
    task: 'gsm8k',
    date: '2026-03-01',
    conc: 128,
    metrics: {
      em_strict: 0.9,
      em_strict_se: 0.01,
    },
    timestamp: '2026-03-01T00:00:00Z',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
    ...overrides,
  };
}

describe('buildEvaluationChartRows', () => {
  it('maps official rows for the selected benchmark/model/precision and date cutoff', () => {
    const rows = [
      evalRow({ config_id: 1, date: '2026-03-01', metrics: { em_strict: 0.8 } }),
      evalRow({ config_id: 1, date: '2026-03-03', metrics: { em_strict: 0.9 } }),
      evalRow({ config_id: 2, task: 'mmlu', metrics: { em_strict: 0.7 } }),
      evalRow({ config_id: 3, model: 'gptoss120b', metrics: { em_strict: 0.6 } }),
      evalRow({ config_id: 4, precision: 'fp4', metrics: { em_strict: 0.95 } }),
    ];

    const result = buildEvaluationChartRows(
      rows,
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP8],
      '2026-03-02',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      configId: 1,
      hwKey: 'h200_sglang',
      configLabel: 'H200 (SGLang)\nC128 T8 E1',
      score: 0.8,
      framework: 'sglang',
      precision: 'fp8',
      prefillTp: 8,
      prefillEp: 1,
      prefillNumWorkers: 0,
      decodeNumWorkers: 0,
      numPrefillGpu: 8,
      numDecodeGpu: 8,
      isMultinode: false,
    });
  });

  it('keeps the latest date per (config, conc) when no date cutoff is provided', () => {
    const rows = [
      // Same config_id (1), same conc (64): older date should drop.
      evalRow({ date: '2026-03-01', conc: 64, metrics: { em_strict: 0.81 } }),
      evalRow({ date: '2026-03-04', conc: 64, metrics: { em_strict: 0.85 } }),
      // Same config_id, different conc: must stay as a separate data point.
      evalRow({ date: '2026-03-04', conc: 256, metrics: { em_strict: 0.92 } }),
    ];

    const result = buildEvaluationChartRows(rows, 'gsm8k', Model.DeepSeek_R1, [Precision.FP8]);

    expect(result).toHaveLength(2);
    expect(result.map((r) => ({ conc: r.conc, score: r.score }))).toEqual(
      expect.arrayContaining([
        { conc: 64, score: 0.85 },
        { conc: 256, score: 0.92 },
      ]),
    );
  });

  it('includes precision in the config label when multiple precisions are selected', () => {
    const result = buildEvaluationChartRows(
      [evalRow({ precision: 'fp4', framework: 'dynamo-trt', spec_method: 'mtp' })],
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP4, Precision.FP8],
      '2026-03-01',
    );

    expect(result[0].configLabel).toBe('H200 (Dynamo TRT, MTP)\nFP4 C128 T8 E1');
  });

  it('renders DPA flags distinguishing prefill/decode sides', () => {
    const rows = buildEvaluationChartRows(
      [
        evalRow({ config_id: 10, decode_dp_attention: true }),
        evalRow({
          config_id: 11,
          framework: 'dynamo-trt',
          disagg: true,
          prefill_dp_attention: true,
          decode_dp_attention: false,
        }),
        evalRow({
          config_id: 12,
          framework: 'dynamo-trt',
          disagg: true,
          prefill_dp_attention: false,
          decode_dp_attention: true,
          conc: 256,
        }),
        evalRow({
          config_id: 13,
          framework: 'dynamo-trt',
          disagg: true,
          prefill_dp_attention: true,
          decode_dp_attention: true,
          conc: 512,
        }),
      ],
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP8],
      '2026-03-01',
    );

    const labels = rows.map((r) => r.configLabel).toSorted();
    expect(labels).toEqual([
      'H200 (Dynamo TRT)\nC128 P(8/1/T/0) D(8/1/F/0)',
      'H200 (Dynamo TRT)\nC256 P(8/1/F/0) D(8/1/T/0)',
      'H200 (Dynamo TRT)\nC512 P(8/1/T/0) D(8/1/T/0)',
      'H200 (SGLang)\nC128 T8 E1 DPA',
    ]);
  });

  it('drops rows with missing metrics and unknown hardware rows, but keeps legitimate zero scores', () => {
    const result = buildEvaluationChartRows(
      [
        evalRow({ config_id: 1, metrics: {} as never }),
        evalRow({ config_id: 2, hardware: 'unknown-gpu', framework: '' }),
        evalRow({ config_id: 3, metrics: { em_strict: 0, em_strict_se: 0 } }),
      ],
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP8],
      '2026-03-01',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ configId: 3, score: 0 });
  });
});

describe('aggregateEvaluationChartRows', () => {
  it('averages repeated rows of the same config and keeps min/max/error bounds', () => {
    // Same config_id (same configs.id row) run on the same date with different
    // scores — e.g. a rerun on the same workflow. Dedup groups by configId so
    // they collapse into one bar with mean/min/max/error-range metadata.
    const rows = buildEvaluationChartRows(
      [
        evalRow({
          config_id: 1,
          conc: 128,
          metrics: { em_strict: 0.8, em_strict_se: 0.1 },
          date: '2026-03-01',
          timestamp: '2026-03-01T00:00:00Z',
        }),
        evalRow({
          config_id: 1,
          conc: 128,
          metrics: { em_strict: 0.9, em_strict_se: 0.05 },
          date: '2026-03-01',
          timestamp: '2026-03-01T01:00:00Z',
        }),
      ],
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP8],
      '2026-03-01',
    );

    const result = aggregateEvaluationChartRows(rows, new Set(['h200_sglang']));

    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(0.85, 5);
    expect(result[0].minScore).toBe(0.8);
    expect(result[0].maxScore).toBe(0.9);
    expect(result[0].errorMin).toBeCloseTo(0.7, 5);
    expect(result[0].errorMax).toBeCloseTo(0.95, 5);
  });

  it('keeps distinct configs as separate bars even when labels overlap', () => {
    // Two rows with different configIds should render as two bars, not merge.
    const rows = buildEvaluationChartRows(
      [
        evalRow({ config_id: 1, metrics: { em_strict: 0.8 } }),
        evalRow({ config_id: 2, metrics: { em_strict: 0.9 } }),
      ],
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP8],
      '2026-03-01',
    );

    const result = aggregateEvaluationChartRows(rows, new Set(['h200_sglang']));

    expect(result).toHaveLength(2);
    const scores = result.map((r) => r.score).toSorted();
    expect(scores).toEqual([0.8, 0.9]);
  });

  it('filters out disabled hardware keys', () => {
    const rows = buildEvaluationChartRows(
      [
        evalRow({ hardware: 'h200', framework: 'sglang' }),
        evalRow({ hardware: 'gb200', framework: 'dynamo-trt' }),
      ],
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP8],
      '2026-03-01',
    );

    const result = aggregateEvaluationChartRows(rows, new Set(['h200_sglang']));

    expect(result).toHaveLength(1);
    expect(result[0].hwKey).toBe('h200_sglang');
  });
});

describe('buildEvalChangelogEntries', () => {
  it('groups configs by benchmark on the selected date', () => {
    const result = buildEvalChangelogEntries(
      [
        evalRow({ task: 'gsm8k', framework: 'sglang', conc: 64 }),
        evalRow({ task: 'gsm8k', framework: 'dynamo-trt', conc: 128 }),
        evalRow({ task: 'mmlu', framework: 'sglang', conc: 256 }),
        evalRow({ task: 'gsm8k', date: '2026-03-02', conc: 512 }),
      ],
      '2026-03-01',
      Model.DeepSeek_R1,
      [Precision.FP8],
    );

    expect(result).toEqual([
      {
        benchmark: 'gsm8k',
        configs: ['H200 (Dynamo TRT)\nC128', 'H200 (SGLang)\nC64'],
      },
      {
        benchmark: 'mmlu',
        configs: ['H200 (SGLang)\nC256'],
      },
    ]);
  });
});
