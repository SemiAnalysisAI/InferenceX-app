/**
 * CSV data generation helpers for each chart type.
 * These functions convert chart-specific data structures into
 * { headers, rows } suitable for csv-export.ts.
 *
 * Inference export dumps ALL raw benchmark fields from the DB,
 * not just the currently plotted x/y axes.
 */

import type { InferenceData, TrendDataPoint } from '@/components/inference/types';

interface CsvData {
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}

/**
 * Generate CSV data from inference scatter/GPU chart data points.
 * Exports all raw benchmark metrics so the user gets a full data dump,
 * regardless of which axes are currently plotted.
 */
export function inferenceChartToCsv(data: InferenceData[]): CsvData {
  const headers = [
    'Hardware',
    'Hardware Key',
    'Framework',
    'Precision',
    'TP',
    'Concurrency',
    'Date',
    // Throughput
    'Throughput/GPU (tok/s)',
    'Output Throughput/GPU (tok/s)',
    'Input Throughput/GPU (tok/s)',
    // Latency — TTFT
    'Mean TTFT (ms)',
    'Median TTFT (ms)',
    'P99 TTFT (ms)',
    'Std TTFT (ms)',
    // Latency — TPOT
    'Mean TPOT (ms)',
    'Median TPOT (ms)',
    'P99 TPOT (ms)',
    'Std TPOT (ms)',
    // Interactivity
    'Mean Interactivity (tok/s/user)',
    'Median Interactivity (tok/s/user)',
    'P99 Interactivity (tok/s/user)',
    'Std Interactivity (tok/s/user)',
    // ITL
    'Mean ITL (ms)',
    'Median ITL (ms)',
    'P99 ITL (ms)',
    'Std ITL (ms)',
    // E2E Latency
    'Mean E2E Latency (ms)',
    'Median E2E Latency (ms)',
    'P99 E2E Latency (ms)',
    'Std E2E Latency (ms)',
    // Disaggregated
    'Disaggregated',
    'Num Prefill GPUs',
    'Num Decode GPUs',
    'Spec Decoding',
    // Parallelism
    'EP',
    'DP Attention',
    'Is Multinode',
  ];

  const rows = data
    .filter((d) => !d.hidden)
    .map((d) => [
      d.hw ?? '',
      d.hwKey,
      d.framework ?? '',
      d.precision,
      d.tp,
      d.conc,
      d.date,
      d.tput_per_gpu ?? '',
      d.output_tput_per_gpu ?? '',
      d.input_tput_per_gpu ?? '',
      d.mean_ttft ?? '',
      d.median_ttft ?? '',
      d.p99_ttft ?? '',
      d.std_ttft ?? '',
      d.mean_tpot ?? '',
      d.median_tpot ?? '',
      d.p99_tpot ?? '',
      d.std_tpot ?? '',
      d.mean_intvty ?? '',
      d.median_intvty ?? '',
      d.p99_intvty ?? '',
      d.std_intvty ?? '',
      d.mean_itl ?? '',
      d.median_itl ?? '',
      d.p99_itl ?? '',
      d.std_itl ?? '',
      d.mean_e2el ?? '',
      d.median_e2el ?? '',
      d.p99_e2el ?? '',
      d.std_e2el ?? '',
      d.disagg ?? false,
      d.num_prefill_gpu ?? '',
      d.num_decode_gpu ?? '',
      d.spec_decoding ?? '',
      d.ep ?? '',
      d.dp_attention ?? '',
      d.is_multinode ?? '',
    ]);

  return { headers, rows };
}

/**
 * Generate CSV data from reliability chart data.
 */
export function reliabilityChartToCsv(
  data: {
    model: string;
    modelLabel: string;
    successRate: number;
    n_success: number;
    total: number;
  }[],
): CsvData {
  const headers = ['GPU Model', 'GPU Key', 'Success Rate (%)', 'Successful Runs', 'Total Runs'];

  const rows = data.map((d) => [d.modelLabel, d.model, d.successRate, d.n_success, d.total]);

  return { headers, rows };
}

/**
 * Generate CSV data from evaluation chart data.
 */
export function evaluationChartToCsv(
  data: {
    configLabel: string;
    hwKey: string | number;
    score: number;
    scoreError?: number;
    minScore?: number;
    maxScore?: number;
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
  }[],
): CsvData {
  const headers = [
    'Configuration',
    'Hardware Key',
    'Model',
    'Benchmark',
    'Mean Score',
    'Score Error',
    'Min Score',
    'Max Score',
    'Precision',
    'Framework',
    'Spec Decoding',
    'TP',
    'EP',
    'DP Attention',
    'Concurrency',
    'Date',
  ];

  const rows = data.map((d) => [
    d.configLabel.replace(/\n/g, ' '),
    d.hwKey,
    d.model,
    d.benchmark,
    d.score,
    d.scoreError ?? '',
    d.minScore ?? '',
    d.maxScore ?? '',
    d.precision,
    d.framework,
    d.specDecode,
    d.tp,
    d.ep,
    d.dp_attention,
    d.conc,
    d.date,
  ]);

  return { headers, rows };
}

/**
 * Generate CSV data from TCO calculator interpolated results.
 * Takes a label resolver so the GPU column shows display names.
 */
export function calculatorChartToCsv(
  results: {
    resultKey: string;
    hwKey: string;
    precision?: string;
    value: number;
    outputTputValue?: number;
    inputTputValue?: number;
    cost?: number;
    costInput?: number;
    costOutput?: number;
    tpPerMw?: number;
    inputTpPerMw?: number;
    outputTpPerMw?: number;
    concurrency?: number;
  }[],
  targetInteractivity: number,
  getLabel?: (hwKey: string) => string,
): CsvData {
  const headers = [
    'GPU',
    'Hardware Key',
    'Precision',
    'Total Throughput (tok/s/gpu)',
    'Output Throughput (tok/s/gpu)',
    'Input Throughput (tok/s/gpu)',
    'Cost per Million Total Tokens ($)',
    'Cost per Million Input Tokens ($)',
    'Cost per Million Output Tokens ($)',
    'Total tok/s/MW',
    'Input tok/s/MW',
    'Output tok/s/MW',
    'Concurrency at Operating Point',
    'Target Interactivity (tok/s/user)',
  ];

  const rows = results.map((r) => [
    getLabel ? getLabel(r.hwKey) : r.resultKey,
    r.hwKey,
    r.precision ?? '',
    r.value,
    r.outputTputValue ?? '',
    r.inputTputValue ?? '',
    r.cost ?? '',
    r.costInput ?? '',
    r.costOutput ?? '',
    r.tpPerMw ?? '',
    r.inputTpPerMw ?? '',
    r.outputTpPerMw ?? '',
    r.concurrency ?? '',
    targetInteractivity,
  ]);

  return { headers, rows };
}

/**
 * Generate CSV data from historical trend interpolated data.
 * Flattens the Map<groupKey, TrendDataPoint[]> into rows with GPU labels.
 */
export function historicalTrendToCsv(
  trendLines: Map<string, TrendDataPoint[]>,
  lineConfigs: { id: string; label: string; precision?: string }[],
  metricLabel: string,
  targetInteractivity: number,
): CsvData {
  const headers = [
    'GPU',
    'Hardware Key',
    'Precision',
    'Date',
    metricLabel,
    'Interactivity (tok/s/user)',
    'Synthetic',
    'Target Interactivity (tok/s/user)',
  ];

  const configById = new Map(lineConfigs.map((c) => [c.id, c]));

  const rows: (string | number | boolean | null | undefined)[][] = [];
  for (const [groupKey, points] of trendLines) {
    const config = configById.get(groupKey);
    if (!config) continue;
    const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
    for (const p of points) {
      rows.push([
        config.label,
        baseHwKey,
        config.precision ?? '',
        p.date,
        p.value,
        p.x,
        p.synthetic ?? false,
        targetInteractivity,
      ]);
    }
  }

  return { headers, rows };
}
