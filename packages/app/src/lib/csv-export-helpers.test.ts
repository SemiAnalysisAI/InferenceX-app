import { describe, it, expect } from 'vitest';

import {
  inferenceChartToCsv,
  reliabilityChartToCsv,
  evaluationChartToCsv,
  calculatorChartToCsv,
  historicalTrendToCsv,
} from './csv-export-helpers';
import type { InferenceData } from '@/components/inference/types';

describe('inferenceChartToCsv', () => {
  const makePoint = (overrides: Partial<InferenceData> = {}): InferenceData => ({
    x: 100,
    y: 50,
    hwKey: 'h100-sxm-sglang',
    hw: 'H100 SXM (SGLang)',
    framework: 'sglang',
    precision: 'fp8',
    tp: 4,
    conc: 8,
    date: '2025-01-15',
    disagg: false,
    tput_per_gpu: 4800,
    output_tput_per_gpu: 3200,
    input_tput_per_gpu: 1600,
    mean_ttft: 120,
    median_ttft: 110,
    p99_ttft: 250,
    std_ttft: 30,
    mean_tpot: 15,
    median_tpot: 14,
    p99_tpot: 28,
    std_tpot: 4,
    mean_intvty: 66,
    median_intvty: 71,
    p99_intvty: 35,
    std_intvty: 12,
    mean_itl: 16,
    median_itl: 15,
    p99_itl: 30,
    std_itl: 5,
    mean_e2el: 5000,
    median_e2el: 4800,
    p99_e2el: 8000,
    std_e2el: 1200,
    tpPerGpu: { y: 1200, roof: false },
    tpPerMw: { y: 694, roof: false },
    costh: { y: 0.5, roof: false },
    costn: { y: 0.4, roof: false },
    costr: { y: 0.3, roof: false },
    costhi: { y: 0.6, roof: false },
    costni: { y: 0.5, roof: false },
    costri: { y: 0.4, roof: false },
    ...overrides,
  });

  it('exports all raw benchmark fields', () => {
    const data = [makePoint()];
    const { headers, rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/1k');

    // Should have all metric columns
    expect(headers).toContain('Throughput/GPU (tok/s)');
    expect(headers).toContain('Mean TTFT (ms)');
    expect(headers).toContain('P99 TTFT (ms)');
    expect(headers).toContain('Mean Interactivity (tok/s/user)');
    expect(headers).toContain('Mean E2E Latency (ms)');
    expect(headers).toContain('Disaggregated');
    expect(headers).toContain('EP');
    expect(headers).toContain('DP Attention');
    expect(rows).toHaveLength(1);
  });

  it('includes Model, ISL, and OSL columns from model and sequence', () => {
    const data = [makePoint()];
    const { headers, rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/8k');
    const row = rows[0];

    expect(headers[0]).toBe('Model');
    expect(headers[1]).toBe('ISL');
    expect(headers[2]).toBe('OSL');
    expect(row[0]).toBe('llama-3.1-405b');
    expect(row[1]).toBe(1024);
    expect(row[2]).toBe(8192);
  });

  it('includes throughput and latency values in correct columns', () => {
    const data = [makePoint()];
    const { headers, rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/1k');
    const row = rows[0];

    const tputIdx = headers.indexOf('Throughput/GPU (tok/s)');
    expect(row[tputIdx]).toBe(4800);

    const ttftIdx = headers.indexOf('Mean TTFT (ms)');
    expect(row[ttftIdx]).toBe(120);

    const p99IntIdx = headers.indexOf('P99 Interactivity (tok/s/user)');
    expect(row[p99IntIdx]).toBe(35);
  });

  it('filters out hidden data points', () => {
    const data = [makePoint(), makePoint({ hidden: true })];
    const { rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/1k');
    expect(rows).toHaveLength(1);
  });

  it('includes disaggregated and parallelism fields', () => {
    const data = [makePoint({ disagg: true, num_prefill_gpu: 2, num_decode_gpu: 6, ep: 4 })];
    const { headers, rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/1k');
    const row = rows[0];

    expect(row[headers.indexOf('Disaggregated')]).toBe(true);
    expect(row[headers.indexOf('Num Prefill GPUs')]).toBe(2);
    expect(row[headers.indexOf('Num Decode GPUs')]).toBe(6);
    expect(row[headers.indexOf('EP')]).toBe(4);
  });

  it('handles empty data', () => {
    const { rows } = inferenceChartToCsv([], 'llama-3.1-405b', '1k/1k');
    expect(rows).toHaveLength(0);
  });

  it('only includes data matching selected precisions when pre-filtered (mirrors ChartDisplay export)', () => {
    const fp4Point = makePoint({ hwKey: 'h100-sxm-sglang', precision: 'fp4' });
    const fp8Point = makePoint({ hwKey: 'h100-sxm-sglang', precision: 'fp8' });
    const allData = [fp4Point, fp8Point];

    // Simulate ChartDisplay.tsx onExportCsv filter
    const activeHwTypes = new Set(['h100-sxm-sglang']);
    const selectedPrecisions = ['fp4'];
    const visibleData = allData.filter(
      (d) => activeHwTypes.has(d.hwKey as string) && selectedPrecisions.includes(d.precision),
    );

    const { headers, rows } = inferenceChartToCsv(visibleData, 'llama-3.1-405b', '1k/1k');
    expect(rows).toHaveLength(1);
    expect(rows[0][headers.indexOf('Precision')]).toBe('fp4');
  });

  it('filters by both GPU and precision (mirrors ChartDisplay export)', () => {
    const data = [
      makePoint({ hwKey: 'h100-sxm-sglang', precision: 'fp4' }),
      makePoint({ hwKey: 'h100-sxm-sglang', precision: 'fp8' }),
      makePoint({ hwKey: 'b200-sxm-sglang', precision: 'fp4' }),
      makePoint({ hwKey: 'b200-sxm-sglang', precision: 'fp8' }),
    ];

    const activeHwTypes = new Set(['h100-sxm-sglang']);
    const selectedPrecisions = ['fp4'];
    const visibleData = data.filter(
      (d) => activeHwTypes.has(d.hwKey as string) && selectedPrecisions.includes(d.precision),
    );

    const { headers, rows } = inferenceChartToCsv(visibleData, 'llama-3.1-405b', '1k/1k');
    expect(rows).toHaveLength(1);
    expect(rows[0][headers.indexOf('Hardware Key')]).toBe('h100-sxm-sglang');
    expect(rows[0][headers.indexOf('Precision')]).toBe('fp4');
  });

  it('includes multiple precisions when all are selected', () => {
    const data = [
      makePoint({ hwKey: 'h100-sxm-sglang', precision: 'fp4' }),
      makePoint({ hwKey: 'h100-sxm-sglang', precision: 'fp8' }),
    ];

    const activeHwTypes = new Set(['h100-sxm-sglang']);
    const selectedPrecisions = ['fp4', 'fp8'];
    const visibleData = data.filter(
      (d) => activeHwTypes.has(d.hwKey as string) && selectedPrecisions.includes(d.precision),
    );

    const { rows } = inferenceChartToCsv(visibleData, 'llama-3.1-405b', '1k/1k');
    expect(rows).toHaveLength(2);
  });

  it('uses empty string for missing optional fields', () => {
    // Minimal point — most AggDataEntry fields are optional via Partial
    const data = [
      {
        x: 1,
        y: 2,
        hwKey: 'test',
        precision: 'fp8',
        tp: 1,
        conc: 1,
        date: '2025-01-01',
        tpPerGpu: { y: 0, roof: false },
        tpPerMw: { y: 0, roof: false },
        costh: { y: 0, roof: false },
        costn: { y: 0, roof: false },
        costr: { y: 0, roof: false },
        costhi: { y: 0, roof: false },
        costni: { y: 0, roof: false },
        costri: { y: 0, roof: false },
      } as InferenceData,
    ];
    const { headers, rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/1k');
    const row = rows[0];

    // Missing optional fields should be ''
    expect(row[headers.indexOf('Hardware')]).toBe('');
    expect(row[headers.indexOf('Framework')]).toBe('');
    expect(row[headers.indexOf('Throughput/GPU (tok/s)')]).toBe('');
    expect(row[headers.indexOf('EP')]).toBe('');
  });
});

describe('reliabilityChartToCsv (mirrors ReliabilityChartDisplay export)', () => {
  it('exports reliability data with correct headers and values', () => {
    const data = [
      { model: 'h100-sxm', modelLabel: 'H100 SXM', successRate: 99.5, n_success: 199, total: 200 },
      { model: 'b200-sxm', modelLabel: 'B200 SXM', successRate: 98.0, n_success: 98, total: 100 },
    ];

    const { headers, rows } = reliabilityChartToCsv(data);

    expect(headers).toEqual([
      'GPU Model',
      'GPU Key',
      'Success Rate (%)',
      'Successful Runs',
      'Total Runs',
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['H100 SXM', 'h100-sxm', 99.5, 199, 200]);
    expect(rows[1]).toEqual(['B200 SXM', 'b200-sxm', 98.0, 98, 100]);
  });

  it('handles empty data', () => {
    const { headers, rows } = reliabilityChartToCsv([]);
    expect(headers).toHaveLength(5);
    expect(rows).toHaveLength(0);
  });

  it('exports all visible GPUs from chartData (no extra filtering needed)', () => {
    // ReliabilityChartDisplay passes chartData directly — no precision/GPU filter
    const chartData = [
      { model: 'h100-sxm', modelLabel: 'H100 SXM', successRate: 99.5, n_success: 199, total: 200 },
      { model: 'a100-sxm', modelLabel: 'A100 SXM', successRate: 95.0, n_success: 95, total: 100 },
    ];

    const { rows } = reliabilityChartToCsv(chartData);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('H100 SXM');
    expect(rows[1][0]).toBe('A100 SXM');
  });
});

describe('evaluationChartToCsv (mirrors EvaluationChartDisplay export)', () => {
  const makeEvalPoint = (
    overrides: Partial<{
      configLabel: string;
      hwKey: string;
      score: number;
      scoreError: number;
      minScore: number;
      maxScore: number;
      model: string;
      benchmark: string;
      specDecode: string;
      precision: string;
      framework: string;
      tp: number;
      ep: number;
      dp_attention: boolean;
      conc: number;
      date: string;
    }> = {},
  ) => ({
    configLabel: 'H100 SXM\n(vLLM, FP8, TP4)',
    hwKey: 'h100-sxm-vllm',
    score: 0.9234,
    model: 'llama-3.1-8b',
    benchmark: 'mmlu',
    specDecode: 'none',
    precision: 'fp8',
    framework: 'vllm',
    tp: 4,
    ep: 1,
    dp_attention: false,
    conc: 1,
    date: '2025-01-15',
    ...overrides,
  });

  it('exports all evaluation fields', () => {
    const data = [makeEvalPoint({ scoreError: 0.01, minScore: 0.91, maxScore: 0.935 })];
    const { headers, rows } = evaluationChartToCsv(data);

    expect(headers).toContain('Model');
    expect(headers).toContain('Benchmark');
    expect(headers).toContain('Score Error');
    expect(headers).toContain('Spec Decoding');
    expect(headers).toContain('EP');
    expect(headers).toContain('DP Attention');

    const row = rows[0];
    expect(row[headers.indexOf('Configuration')]).toBe('H100 SXM (vLLM, FP8, TP4)');
    expect(row[headers.indexOf('Model')]).toBe('llama-3.1-8b');
    expect(row[headers.indexOf('Benchmark')]).toBe('mmlu');
    expect(row[headers.indexOf('Mean Score')]).toBe(0.9234);
    expect(row[headers.indexOf('Score Error')]).toBe(0.01);
  });

  it('handles missing optional fields', () => {
    const data = [makeEvalPoint()];
    const { headers, rows } = evaluationChartToCsv(data);

    expect(rows[0][headers.indexOf('Score Error')]).toBe('');
    expect(rows[0][headers.indexOf('Min Score')]).toBe('');
    expect(rows[0][headers.indexOf('Max Score')]).toBe('');
  });

  it('exports all chartData entries directly (no extra filtering needed)', () => {
    // EvaluationChartDisplay passes chartData directly from context
    const data = [
      makeEvalPoint({ hwKey: 'h100-sxm-vllm', precision: 'fp8' }),
      makeEvalPoint({ hwKey: 'b200-sxm-sglang', precision: 'fp4' }),
    ];

    const { headers, rows } = evaluationChartToCsv(data);
    expect(rows).toHaveLength(2);
    expect(rows[0][headers.indexOf('Hardware Key')]).toBe('h100-sxm-vllm');
    expect(rows[1][headers.indexOf('Hardware Key')]).toBe('b200-sxm-sglang');
    expect(rows[0][headers.indexOf('Precision')]).toBe('fp8');
    expect(rows[1][headers.indexOf('Precision')]).toBe('fp4');
  });

  it('includes Benchmark column reflecting the selected eval type (pre-filtered by context)', () => {
    // EvaluationContext filters rawData by selectedBenchmark before building chartData,
    // so all rows in the export share the same benchmark value
    const data = [
      makeEvalPoint({ benchmark: 'mmlu', hwKey: 'h100-sxm-vllm' }),
      makeEvalPoint({ benchmark: 'mmlu', hwKey: 'b200-sxm-sglang' }),
    ];

    const { headers, rows } = evaluationChartToCsv(data);
    expect(headers).toContain('Benchmark');
    expect(rows[0][headers.indexOf('Benchmark')]).toBe('mmlu');
    expect(rows[1][headers.indexOf('Benchmark')]).toBe('mmlu');
  });

  it('only contains data for one benchmark at a time (context filters by selectedBenchmark)', () => {
    // Simulates that context already filtered to only 'humaneval' — no 'mmlu' rows leak through
    const data = [
      makeEvalPoint({ benchmark: 'humaneval', hwKey: 'h100-sxm-vllm' }),
      makeEvalPoint({ benchmark: 'humaneval', hwKey: 'b200-sxm-sglang' }),
    ];

    const { headers, rows } = evaluationChartToCsv(data);
    expect(rows.every((r) => r[headers.indexOf('Benchmark')] === 'humaneval')).toBe(true);
  });
});

describe('calculatorChartToCsv (mirrors ThroughputCalculatorDisplay export)', () => {
  it('exports calculator results with target interactivity', () => {
    const results = [
      {
        resultKey: 'h100-sxm-sglang',
        hwKey: 'h100-sxm-sglang',
        value: 1200,
        outputTputValue: 800,
        inputTputValue: 400,
        cost: 0.52,
        costInput: 0.35,
        costOutput: 0.89,
        tpPerMw: 694,
        inputTpPerMw: 231,
        outputTpPerMw: 463,
        concurrency: 16,
      },
    ];

    const { headers, rows } = calculatorChartToCsv(results, 125);

    expect(headers[0]).toBe('GPU');
    expect(headers[13]).toBe('Target Interactivity (tok/s/user)');
    expect(rows).toHaveLength(1);
    expect(rows[0][3]).toBe(1200);
    expect(rows[0][13]).toBe(125);
  });

  it('uses getLabel to resolve display names', () => {
    const results = [
      {
        resultKey: 'h100-sxm-sglang',
        hwKey: 'h100-sxm-sglang',
        value: 1200,
      },
    ];

    const { rows } = calculatorChartToCsv(results, 125, () => 'H100 SXM (SGLang)');
    expect(rows[0][0]).toBe('H100 SXM (SGLang)');
  });

  it('falls back to resultKey when no getLabel provided', () => {
    const results = [
      {
        resultKey: 'h100-sxm-sglang',
        hwKey: 'h100-sxm-sglang',
        value: 1200,
      },
    ];

    const { rows } = calculatorChartToCsv(results, 125);
    expect(rows[0][0]).toBe('h100-sxm-sglang');
  });

  it('handles multi-precision results with precision field', () => {
    const results = [
      { resultKey: 'b200__fp4', hwKey: 'b200-sxm-sglang', precision: 'FP4', value: 2000 },
      { resultKey: 'b200__fp8', hwKey: 'b200-sxm-sglang', precision: 'FP8', value: 1500 },
    ];

    const { rows } = calculatorChartToCsv(results, 200);
    expect(rows).toHaveLength(2);
    expect(rows[0][2]).toBe('FP4');
    expect(rows[1][2]).toBe('FP8');
  });

  it('handles empty results', () => {
    const { headers, rows } = calculatorChartToCsv([], 100);
    expect(headers).toHaveLength(14);
    expect(rows).toHaveLength(0);
  });

  it('exports results with label resolver (mirrors ThroughputCalculatorDisplay export)', () => {
    // ThroughputCalculatorDisplay uses a getLabel that resolves hwKey → display name
    const results = [
      {
        resultKey: 'h100-sxm-sglang',
        hwKey: 'h100-sxm-sglang',
        precision: 'FP8',
        value: 1200,
        cost: 0.52,
        concurrency: 16,
      },
      {
        resultKey: 'b200-sxm-sglang',
        hwKey: 'b200-sxm-sglang',
        precision: 'FP4',
        value: 2000,
        cost: 0.35,
        concurrency: 32,
      },
    ];

    const labelMap: Record<string, string> = {
      'h100-sxm-sglang': 'H100 SXM (SGLang)',
      'b200-sxm-sglang': 'B200 SXM (SGLang)',
    };

    const { headers, rows } = calculatorChartToCsv(
      results,
      125,
      (hwKey) => labelMap[hwKey] ?? hwKey,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0][headers.indexOf('GPU')]).toBe('H100 SXM (SGLang)');
    expect(rows[0][headers.indexOf('Precision')]).toBe('FP8');
    expect(rows[0][headers.indexOf('Cost per Million Total Tokens ($)')]).toBe(0.52);
    expect(rows[1][headers.indexOf('GPU')]).toBe('B200 SXM (SGLang)');
    expect(rows[1][headers.indexOf('Precision')]).toBe('FP4');
  });
});

describe('historicalTrendToCsv (mirrors HistoricalTrendsDisplay export)', () => {
  it('flattens trend lines into rows with GPU labels', () => {
    const trendLines = new Map([
      [
        'h100-sxm-sglang',
        [
          { date: '2025-01-10', value: 1100, x: 35 },
          { date: '2025-01-11', value: 1200, x: 35 },
        ],
      ],
      ['b200-sxm-sglang__fp4', [{ date: '2025-01-10', value: 2000, x: 35, synthetic: true }]],
    ]);

    const lineConfigs = [
      { id: 'h100-sxm-sglang', label: 'H100 SXM (SGLang)', precision: 'fp8' },
      { id: 'b200-sxm-sglang__fp4', label: 'B200 SXM (SGLang) (FP4)', precision: 'fp4' },
    ];

    const { headers, rows } = historicalTrendToCsv(trendLines, lineConfigs, 'Throughput/GPU', 35);

    expect(headers).toContain('GPU');
    expect(headers).toContain('Throughput/GPU');
    expect(headers).toContain('Synthetic');
    expect(headers).toContain('Target Interactivity (tok/s/user)');
    expect(rows).toHaveLength(3);

    // First GPU, first point
    expect(rows[0][0]).toBe('H100 SXM (SGLang)');
    expect(rows[0][1]).toBe('h100-sxm-sglang');
    expect(rows[0][2]).toBe('fp8');
    expect(rows[0][3]).toBe('2025-01-10');
    expect(rows[0][4]).toBe(1100);

    // Second GPU (multi-precision key splits correctly)
    expect(rows[2][0]).toBe('B200 SXM (SGLang) (FP4)');
    expect(rows[2][1]).toBe('b200-sxm-sglang');
    expect(rows[2][6]).toBe(true); // synthetic
  });

  it('skips groups not in lineConfigs (hidden GPUs)', () => {
    const trendLines = new Map([
      ['h100', [{ date: '2025-01-10', value: 1000, x: 35 }]],
      ['b200', [{ date: '2025-01-10', value: 2000, x: 35 }]],
    ]);

    // Only h100 is configured (b200 is hidden/filtered)
    const lineConfigs = [{ id: 'h100', label: 'H100' }];

    const { rows } = historicalTrendToCsv(trendLines, lineConfigs, 'Metric', 35);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('H100');
  });

  it('handles empty trend lines', () => {
    const { headers, rows } = historicalTrendToCsv(new Map(), [], 'Metric', 100);
    expect(headers).toHaveLength(8);
    expect(rows).toHaveLength(0);
  });

  it('exports with dynamic metric label and target interactivity (mirrors HistoricalTrendsDisplay export)', () => {
    // HistoricalTrendsDisplay passes currentYLabel and targetInteractivity
    const trendLines = new Map([
      [
        'h100-sxm-sglang',
        [
          { date: '2025-01-10', value: 800, x: 50 },
          { date: '2025-01-15', value: 950, x: 50 },
        ],
      ],
    ]);

    const lineConfigs = [{ id: 'h100-sxm-sglang', label: 'H100 SXM (SGLang)', precision: 'fp8' }];

    const { headers, rows } = historicalTrendToCsv(
      trendLines,
      lineConfigs,
      'Cost per Million Tokens ($)',
      50,
    );

    expect(headers).toContain('Cost per Million Tokens ($)');
    expect(headers).toContain('Target Interactivity (tok/s/user)');
    expect(rows).toHaveLength(2);
    expect(rows[0][headers.indexOf('Cost per Million Tokens ($)')]).toBe(800);
    expect(rows[0][headers.indexOf('Target Interactivity (tok/s/user)')]).toBe(50);
    expect(rows[1][headers.indexOf('Date')]).toBe('2025-01-15');
  });
});
