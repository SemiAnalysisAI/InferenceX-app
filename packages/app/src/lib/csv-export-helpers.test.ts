import { describe, it, expect } from 'vitest';

import {
  inferenceChartToCsv,
  reliabilityChartToCsv,
  evaluationChartToCsv,
  calculatorChartToCsv,
  historicalTrendToCsv,
} from './csv-export-helpers';
import type { InferenceData } from '@/components/inference/types';

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
  mean_ttft: 0.12,
  median_ttft: 0.11,
  p99_ttft: 0.25,
  std_ttft: 0.03,
  mean_tpot: 0.015,
  median_tpot: 0.014,
  p99_tpot: 0.028,
  std_tpot: 0.004,
  mean_intvty: 66,
  median_intvty: 71,
  p99_intvty: 35,
  std_intvty: 12,
  mean_itl: 0.016,
  median_itl: 0.015,
  p99_itl: 0.03,
  std_itl: 0.005,
  mean_e2el: 5,
  median_e2el: 4.8,
  p99_e2el: 8,
  std_e2el: 1.2,
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

describe('inferenceChartToCsv', () => {
  it('exports benchmark summary fields', () => {
    const data = [makePoint()];
    const { headers, rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/1k');

    // Should have all metric columns
    expect(headers).toContain('Throughput/Chip (tok/s)');
    expect(headers).toContain('Mean TTFT (s)');
    expect(headers).toContain('P99 TTFT (s)');
    expect(headers).toContain('Mean Interactivity (tok/s/user)');
    expect(headers).toContain('Mean E2E Latency (s)');
    expect(headers).toContain('Disaggregated');
    expect(headers).toContain('EP');
    expect(headers).toContain('DP Attention');
    expect(headers).toContain('Run URL');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(headers.length);
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

    const tputIdx = headers.indexOf('Throughput/Chip (tok/s)');
    expect(row[tputIdx]).toBe(4800);

    const ttftIdx = headers.indexOf('Mean TTFT (s)');
    expect(row[ttftIdx]).toBe(0.12);

    const p99IntIdx = headers.indexOf('P99 Interactivity (tok/s/user)');
    expect(row[p99IntIdx]).toBe(35);
  });

  it('exports the derived Y metric and X value displayed by the table', () => {
    const data = [makePoint({ x: 42, costh: { y: 0.512, roof: false } })];
    const overlay = makePoint({
      x: 37,
      hwKey: 'b200-sxm-vllm',
      costh: { y: 0.431, roof: false },
    });
    const { headers, rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/1k', [overlay], {
      yHeader: 'Cost per Million Total Tokens ($)',
      yPath: 'costh.y',
      xHeader: 'Interactivity (tok/s/user)',
    });

    expect(rows[0][headers.indexOf('Cost per Million Total Tokens ($)')]).toBe(0.512);
    expect(rows[0][headers.indexOf('Interactivity (tok/s/user)')]).toBe(42);
    expect(rows[1][headers.indexOf('Cost per Million Total Tokens ($)')]).toBe(0.431);
    expect(rows[1][headers.indexOf('Interactivity (tok/s/user)')]).toBe(37);
    expect(rows.every((row) => row.length === headers.length)).toBe(true);
  });

  it('does not duplicate an agentic P99 X metric already in the fixed schema', () => {
    const { headers, rows } = inferenceChartToCsv(
      [makePoint({ x: 35 })],
      'agentx-model',
      'agentic',
      [],
      {
        yHeader: 'Cost per Million Total Tokens ($)',
        yPath: 'costh.y',
        xHeader: 'P99 Interactivity (tok/s/user)',
      },
    );

    expect(headers.filter((header) => header === 'P99 Interactivity (tok/s/user)')).toHaveLength(1);
    expect(rows[0][headers.indexOf('P99 Interactivity (tok/s/user)')]).toBe(35);
    expect(new Set(headers).size).toBe(headers.length);
    expect(rows[0]).toHaveLength(headers.length);
  });

  it('labels raw latency statistics as seconds without changing their values', () => {
    const issueMetrics = {
      mean_ttft: 1.615576321,
      median_ttft: 0.403875659,
      p99_ttft: 20.67356789,
      std_ttft: 3.964372301,
      mean_tpot: 0.048823025,
      median_tpot: 0.0490139,
      p99_tpot: 0.061919564,
      std_tpot: 0.005588959,
      mean_itl: 0.048892513,
      median_itl: 0.02832133,
      p99_itl: 0.190448091,
      std_itl: 0.091604103,
      mean_e2el: 46.55299096,
      median_e2el: 45.77583359,
      p99_e2el: 75.47229264,
      std_e2el: 8.356892074,
    };
    const { headers, rows } = inferenceChartToCsv(
      [makePoint(issueMetrics)],
      'llama-3.1-405b',
      '1k/1k',
    );
    const row = rows[0];

    for (const [metric, value] of Object.entries(issueMetrics)) {
      const [stat, ...nameParts] = metric.split('_');
      const metricName =
        nameParts.join('_') === 'e2el' ? 'E2E Latency' : nameParts.join('_').toUpperCase();
      const statName = stat === 'std' ? 'Std' : `${stat[0].toUpperCase()}${stat.slice(1)}`;
      const header = `${statName} ${metricName} (s)`;

      expect(headers).toContain(header);
      expect(row[headers.indexOf(header)]).toBe(value);
    }

    expect(headers.filter((header) => header.endsWith('(ms)'))).toEqual([]);
  });

  it('exports visible unofficial-run rows with their provenance', () => {
    const official = makePoint({
      hwKey: 'h100-sxm-sglang',
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100',
    });
    const overlay = makePoint({
      hwKey: 'b200-sxm-vllm',
      hw: 'B200 SXM (vLLM)',
      framework: 'vllm',
      mean_tpot: 0.048823025,
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/2405',
    });
    const { headers, rows } = inferenceChartToCsv([official], 'llama-3.1-405b', '1k/1k', [overlay]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.length === headers.length)).toBe(true);
    expect(rows[1][headers.indexOf('Hardware Key')]).toBe('b200-sxm-vllm');
    expect(rows[1][headers.indexOf('Mean TPOT (s)')]).toBe(0.048823025);
    expect(rows[1][headers.indexOf('Run URL')]).toBe(
      'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/2405',
    );
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
    expect(row[headers.indexOf('Num Prefill Chips')]).toBe(2);
    expect(row[headers.indexOf('Num Decode Chips')]).toBe(6);
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
    expect(row[headers.indexOf('Throughput/Chip (tok/s)')]).toBe('');
    expect(row[headers.indexOf('EP')]).toBe('');
  });

  it('exports missing source metrics as blank while preserving a measured zero', () => {
    const data = [
      makePoint({
        rawMetricKeys: ['median_ttft'],
        mean_ttft: 0,
        median_ttft: 0,
      }),
    ];
    const { headers, rows } = inferenceChartToCsv(data, 'llama-3.1-405b', '1k/1k');

    expect(rows[0][headers.indexOf('Mean TTFT (s)')]).toBe('');
    expect(rows[0][headers.indexOf('Median TTFT (s)')]).toBe(0);
  });
});

describe('reliabilityChartToCsv (mirrors ReliabilityChartDisplay export)', () => {
  it('exports reliability data with correct headers and values', () => {
    const data = [
      { model: 'h100-sxm', modelLabel: 'H100 SXM', successRate: 99.5, n_success: 199, total: 200 },
      { model: 'b200-sxm', modelLabel: 'B200 SXM', successRate: 98, n_success: 98, total: 100 },
    ];

    const { headers, rows } = reliabilityChartToCsv(data);

    expect(headers).toEqual([
      'Chip Model',
      'Chip Key',
      'Success Rate (%)',
      'Successful Runs',
      'Total Runs',
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['H100 SXM', 'h100-sxm', 99.5, 199, 200]);
    expect(rows[1]).toEqual(['B200 SXM', 'b200-sxm', 98, 98, 100]);
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
      { model: 'a100-sxm', modelLabel: 'A100 SXM', successRate: 95, n_success: 95, total: 100 },
    ];

    const { rows } = reliabilityChartToCsv(chartData);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('H100 SXM');
    expect(rows[1][0]).toBe('A100 SXM');
  });
});

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

describe('evaluationChartToCsv (mirrors EvaluationChartDisplay export)', () => {
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

    expect(headers[0]).toBe('Chip');
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
    expect(rows[0][headers.indexOf('Chip')]).toBe('H100 SXM (SGLang)');
    expect(rows[0][headers.indexOf('Precision')]).toBe('FP8');
    expect(rows[0][headers.indexOf('Cost per Million Total Tokens ($)')]).toBe(0.52);
    expect(rows[1][headers.indexOf('Chip')]).toBe('B200 SXM (SGLang)');
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

    const { headers, rows } = historicalTrendToCsv(trendLines, lineConfigs, 'Throughput/Chip', 35);

    expect(headers).toContain('Chip');
    expect(headers).toContain('Throughput/Chip');
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
