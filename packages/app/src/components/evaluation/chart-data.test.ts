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
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
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
      configLabel: 'H200 (SGLang)\nC128, TP8',
      score: 0.8,
      framework: 'sglang',
      precision: 'fp8',
    });
  });

  it('keeps the latest date for each config group when no date cutoff is provided', () => {
    const rows = [
      evalRow({ date: '2026-03-01', conc: 64, metrics: { em_strict: 0.81 } }),
      evalRow({ date: '2026-03-04', conc: 256, metrics: { em_strict: 0.92 } }),
    ];

    const result = buildEvaluationChartRows(rows, 'gsm8k', Model.DeepSeek_R1, [Precision.FP8]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2026-03-04',
      conc: 256,
      score: 0.92,
    });
  });

  it('includes precision in the config label when multiple precisions are selected', () => {
    const result = buildEvaluationChartRows(
      [evalRow({ precision: 'fp4', framework: 'dynamo-trt', spec_method: 'mtp' })],
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP4, Precision.FP8],
      '2026-03-01',
    );

    expect(result[0].configLabel).toBe('H200 (Dynamo TRT, MTP)\nFP4, C128, TP8');
  });

  it('drops zero-score rows and unknown hardware rows', () => {
    const result = buildEvaluationChartRows(
      [evalRow({ metrics: { em_strict: 0 } }), evalRow({ hardware: 'unknown-gpu', framework: '' })],
      'gsm8k',
      Model.DeepSeek_R1,
      [Precision.FP8],
      '2026-03-01',
    );

    expect(result).toEqual([]);
  });
});

describe('aggregateEvaluationChartRows', () => {
  it('averages repeated config rows and keeps min/max/error bounds', () => {
    const rows = buildEvaluationChartRows(
      [
        evalRow({ config_id: 1, conc: 128, metrics: { em_strict: 0.8, em_strict_se: 0.1 } }),
        evalRow({ config_id: 2, conc: 128, metrics: { em_strict: 0.9, em_strict_se: 0.05 } }),
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
