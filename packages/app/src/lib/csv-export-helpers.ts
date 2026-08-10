/**
 * CSV data generation helpers for each chart type.
 * These functions convert chart-specific data structures into
 * { headers, rows } suitable for csv-export.ts.
 *
 * Inference export includes benchmark summary fields beyond the currently
 * plotted x/y axes.
 */

import type { InferenceData, TrendDataPoint } from '@/components/inference/types';
import type { SubmissionVolumeRow } from '@/lib/submissions-types';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

interface CsvData {
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}

export interface InferenceCsvDisplayedMetrics {
  yHeader: string;
  yPath: string;
  xHeader: string;
}

function nestedMetric(point: InferenceData, path: string): number | '' {
  const [key, nestedKey] = path.split('.');
  const value = point[key as keyof InferenceData];
  if (nestedKey && typeof value === 'object' && value !== null && nestedKey in value) {
    const nestedValue = (value as Record<string, unknown>)[nestedKey];
    return typeof nestedValue === 'number' ? nestedValue : '';
  }
  return typeof value === 'number' ? value : '';
}

/** Preserve a real zero while leaving source metrics that were not measured blank. */
function benchmarkMetric(point: InferenceData, key: string): number | '' {
  if (point.rawMetricKeys && !point.rawMetricKeys.includes(key)) return '';
  const value = point[key as keyof InferenceData];
  return typeof value === 'number' ? value : '';
}

/**
 * Generate CSV data from inference scatter/GPU chart data points.
 * Exports benchmark summary metrics regardless of which axes are currently
 * plotted. Visible unofficial-run rows are appended after official rows.
 */
export function inferenceChartToCsv(
  data: InferenceData[],
  model: string,
  sequence: string,
  overlayData: InferenceData[] = [],
  displayedMetrics?: InferenceCsvDisplayedMetrics,
): CsvData {
  const islOsl = sequenceToIslOsl(sequence);
  const headers = [
    'Model',
    'ISL',
    'OSL',
    'Hardware',
    'Hardware Key',
    'Framework',
    'Precision',
    'TP',
    'Concurrency',
    'Date',
    // Throughput
    'Throughput/Chip (tok/s)',
    'Output Throughput/Chip (tok/s)',
    'Input Throughput/Chip (tok/s)',
    // Latency — TTFT
    'Mean TTFT (s)',
    'Median TTFT (s)',
    'P99 TTFT (s)',
    'Std TTFT (s)',
    // Latency — TPOT
    'Mean TPOT (s)',
    'Median TPOT (s)',
    'P99 TPOT (s)',
    'Std TPOT (s)',
    // Interactivity
    'Mean Interactivity (tok/s/user)',
    'Median Interactivity (tok/s/user)',
    'P99 Interactivity (tok/s/user)',
    'Std Interactivity (tok/s/user)',
    // ITL
    'Mean ITL (s)',
    'Median ITL (s)',
    'P99 ITL (s)',
    'Std ITL (s)',
    // E2E Latency
    'Mean E2E Latency (s)',
    'Median E2E Latency (s)',
    'P99 E2E Latency (s)',
    'Std E2E Latency (s)',
    // Disaggregated
    'Disaggregated',
    'Num Prefill Chips',
    'Num Decode Chips',
    'Spec Decoding',
    // Parallelism
    'EP',
    'DP Attention',
    'Is Multinode',
    // Provenance (especially important when unofficial-run rows are included)
    'Run URL',
  ];

  const displayedColumns = displayedMetrics
    ? [
        {
          header: displayedMetrics.yHeader,
          value: (point: InferenceData) => nestedMetric(point, displayedMetrics.yPath),
        },
        { header: displayedMetrics.xHeader, value: (point: InferenceData) => point.x },
      ].filter(
        (column, index, columns) =>
          !headers.includes(column.header) &&
          columns.findIndex((candidate) => candidate.header === column.header) === index,
      )
    : [];
  headers.splice(10, 0, ...displayedColumns.map((column) => column.header));

  const rows = [...data, ...overlayData]
    .filter((d) => !d.hidden)
    .map((d) => {
      const row = [
        model,
        islOsl?.isl ?? '',
        islOsl?.osl ?? '',
        d.hw ?? '',
        d.hwKey,
        d.framework ?? '',
        d.precision,
        d.tp,
        d.conc,
        d.date,
        benchmarkMetric(d, 'tput_per_gpu'),
        benchmarkMetric(d, 'output_tput_per_gpu'),
        benchmarkMetric(d, 'input_tput_per_gpu'),
        benchmarkMetric(d, 'mean_ttft'),
        benchmarkMetric(d, 'median_ttft'),
        benchmarkMetric(d, 'p99_ttft'),
        benchmarkMetric(d, 'std_ttft'),
        benchmarkMetric(d, 'mean_tpot'),
        benchmarkMetric(d, 'median_tpot'),
        benchmarkMetric(d, 'p99_tpot'),
        benchmarkMetric(d, 'std_tpot'),
        benchmarkMetric(d, 'mean_intvty'),
        benchmarkMetric(d, 'median_intvty'),
        benchmarkMetric(d, 'p99_intvty'),
        benchmarkMetric(d, 'std_intvty'),
        benchmarkMetric(d, 'mean_itl'),
        benchmarkMetric(d, 'median_itl'),
        benchmarkMetric(d, 'p99_itl'),
        benchmarkMetric(d, 'std_itl'),
        benchmarkMetric(d, 'mean_e2el'),
        benchmarkMetric(d, 'median_e2el'),
        benchmarkMetric(d, 'p99_e2el'),
        benchmarkMetric(d, 'std_e2el'),
        d.disagg ?? false,
        d.num_prefill_gpu ?? '',
        d.num_decode_gpu ?? '',
        d.spec_decoding ?? '',
        d.ep ?? '',
        d.dp_attention ?? '',
        d.is_multinode ?? '',
        d.run_url ?? '',
      ];
      row.splice(10, 0, ...displayedColumns.map((column) => column.value(d)));
      return row;
    });

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
  const headers = ['Chip Model', 'Chip Key', 'Success Rate (%)', 'Successful Runs', 'Total Runs'];

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
    d.configLabel.replaceAll('\n', ' '),
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
    'Chip',
    'Hardware Key',
    'Precision',
    'Total Throughput (tok/s/chip)',
    'Output Throughput (tok/s/chip)',
    'Input Throughput (tok/s/chip)',
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
    'Chip',
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

/**
 * Generate CSV data from submission volume rows.
 * Exports daily datapoint counts per hardware key.
 */
export function submissionsVolumeToCsv(volume: SubmissionVolumeRow[]): CsvData {
  const headers = ['Date', 'Hardware', 'Datapoints'];

  const rows = [...volume]
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.hardware.localeCompare(b.hardware))
    .map((r) => [r.date, r.hardware, r.datapoints]);

  return { headers, rows };
}
