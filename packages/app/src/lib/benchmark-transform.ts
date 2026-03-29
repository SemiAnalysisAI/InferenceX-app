/**
 * Transforms raw BenchmarkRow[] from the API into InferenceData[] for charts.
 */

import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import type {
  AggDataEntry,
  ChartDefinition,
  HardwareConfig,
  InferenceData,
} from '@/components/inference/types';
import { createChartDataPoint, getHardwareKey } from '@/lib/chart-utils';
import { HARDWARE_CONFIG, getHardwareConfig } from '@/lib/constants';
import type { BenchmarkRow } from '@/lib/api';

/** Convert a DB benchmark row to an AggDataEntry. */
export function rowToAggDataEntry(row: BenchmarkRow): AggDataEntry {
  const m = row.metrics;
  return {
    hw: row.hardware,
    framework: row.framework,
    model: DB_MODEL_TO_DISPLAY[row.model] ?? row.model,
    precision: row.precision,
    hwKey: '' as keyof typeof HARDWARE_CONFIG,
    tp: row.decode_tp,
    conc: row.conc,
    tput_per_gpu: m.tput_per_gpu ?? 0,
    output_tput_per_gpu: m.output_tput_per_gpu ?? 0,
    input_tput_per_gpu: m.input_tput_per_gpu ?? 0,
    mean_ttft: m.mean_ttft ?? 0,
    median_ttft: m.median_ttft ?? 0,
    std_ttft: m.std_ttft ?? 0,
    p99_ttft: m.p99_ttft ?? 0,
    mean_tpot: m.mean_tpot ?? 0,
    median_tpot: m.median_tpot ?? 0,
    std_tpot: m.std_tpot ?? 0,
    p99_tpot: m.p99_tpot ?? 0,
    mean_intvty: m.mean_intvty ?? 0,
    median_intvty: m.median_intvty ?? 0,
    std_intvty: m.std_intvty ?? 0,
    p99_intvty: m.p99_intvty ?? 0,
    mean_itl: m.mean_itl ?? 0,
    median_itl: m.median_itl ?? 0,
    std_itl: m.std_itl ?? 0,
    p99_itl: m.p99_itl ?? 0,
    mean_e2el: m.mean_e2el ?? 0,
    median_e2el: m.median_e2el ?? 0,
    std_e2el: m.std_e2el ?? 0,
    p99_e2el: m.p99_e2el ?? 0,
    disagg: row.disagg,
    num_prefill_gpu: row.num_prefill_gpu,
    num_decode_gpu: row.num_decode_gpu,
    spec_decoding: row.spec_method,
    ep: row.decode_ep,
    dp_attention: row.decode_dp_attention,
    is_multinode: row.is_multinode,
    prefill_tp: row.prefill_tp,
    prefill_ep: row.prefill_ep,
    prefill_dp_attention: row.prefill_dp_attention,
    prefill_num_workers: row.prefill_num_workers,
    decode_tp: row.decode_tp,
    decode_ep: row.decode_ep,
    decode_dp_attention: row.decode_dp_attention,
    decode_num_workers: row.decode_num_workers,
    image: row.image ?? undefined,
    date: row.date,
    actualDate: (row as any).actualDate ?? row.date,
    run_url: row.run_url ?? undefined,
  };
}

interface PreparedEntry {
  entry: AggDataEntry;
  hwKey: string;
  date: string;
}

/**
 * Transform raw BenchmarkRow[] into chart-ready InferenceData[][] and HardwareConfig.
 * Returns one InferenceData[] per chart definition (e2e, interactivity).
 *
 * Converts rows to AggDataEntry once, then reuses for each chart definition.
 */
export function transformBenchmarkRows(rows: BenchmarkRow[]): {
  chartData: InferenceData[][];
  hardwareConfig: HardwareConfig;
} {
  const gpuConfig: HardwareConfig = {};

  // Phase 1: Convert rows once + resolve hardware keys (cache config lookups)
  const hwConfigCache = new Map<string, ReturnType<typeof getHardwareConfig>>();
  const prepared: PreparedEntry[] = Array.from({ length: rows.length });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const entry = rowToAggDataEntry(row);
    const hwKey = getHardwareKey(entry);
    entry.hwKey = hwKey as keyof typeof HARDWARE_CONFIG;

    if (!hwConfigCache.has(hwKey)) {
      const hwConfig = getHardwareConfig(hwKey);
      hwConfigCache.set(hwKey, hwConfig);
      if (hwConfig) gpuConfig[hwKey] = { ...hwConfig, name: hwKey };
    }

    prepared[i] = { entry, hwKey, date: row.date };
  }

  // Phase 2: Build chart data per chart definition (reusing prepared entries)
  const chartData = (chartDefinitions as ChartDefinition[]).map((chartDef) => {
    const groupedByHw: Record<string, InferenceData[]> = {};

    for (let i = 0; i < prepared.length; i++) {
      const { entry, hwKey, date } = prepared[i];

      const dataPoint = createChartDataPoint(
        date,
        entry,
        chartDef.x as keyof AggDataEntry,
        chartDef.y as keyof AggDataEntry,
        hwKey,
      );

      if (!groupedByHw[hwKey]) groupedByHw[hwKey] = [];
      groupedByHw[hwKey].push(dataPoint);
    }

    return Object.values(groupedByHw).flat();
  });

  return { chartData, hardwareConfig: gpuConfig };
}
