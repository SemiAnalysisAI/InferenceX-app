import type { BenchmarkRow } from '@/lib/api';
import { Model, Sequence } from '@/lib/data-mappings';

export interface FavoritePreset {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: 'comparison' | 'improvements';
  config: {
    model: Model;
    sequence: Sequence;
    precisions: string[];
    yAxisMetric: string;
    gpus?: string[];
    hwFilter?: string[];
    useDateRange?: boolean;
    dateRangeMonths?: number;
  };
}

/**
 * Find the closest available date to a target date string (YYYY-MM-DD).
 * Returns the date from availableDates that is closest to targetDate.
 */
export function findClosestDate(availableDates: string[], targetDate: string): string {
  if (availableDates.length === 0) return '';

  const target = new Date(targetDate).getTime();
  let closest = availableDates[0];
  let minDiff = Math.abs(new Date(closest).getTime() - target);

  for (const date of availableDates) {
    const diff = Math.abs(new Date(date).getTime() - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = date;
    }
  }

  return closest;
}

/**
 * Subtract months from a date string (YYYY-MM-DD format).
 */
export function subtractMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().split('T')[0];
}

/**
 * Given history rows for a model+sequence, find dates within a range where
 * net-new configs first appeared for specific GPUs and precisions.
 * Tracks the cumulative set of all configs seen — a date is included only
 * when it introduces a config key never seen on any earlier date.
 * The first date in the range is always included.
 */
export function findConfigChangeDates(
  rows: Pick<
    BenchmarkRow,
    | 'hardware'
    | 'framework'
    | 'precision'
    | 'conc'
    | 'decode_tp'
    | 'decode_ep'
    | 'decode_dp_attention'
    | 'date'
  >[],
  gpuPrefixes: string[],
  precisions: string[],
  startDate: string,
  endDate: string,
): string[] {
  // Filter to matching GPU+precision within date range
  const filtered = rows.filter(
    (r) =>
      precisions.includes(r.precision) &&
      r.date >= startDate &&
      r.date <= endDate &&
      gpuPrefixes.some((prefix) => `${r.hardware}_${r.framework}`.startsWith(prefix)),
  );

  // Group by date
  const byDate = new Map<string, Set<string>>();
  for (const r of filtered) {
    const key = `${r.conc}_${r.decode_tp}_${r.decode_ep}_${r.decode_dp_attention}`;
    let set = byDate.get(r.date);
    if (!set) {
      set = new Set();
      byDate.set(r.date, set);
    }
    set.add(key);
  }

  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];

  // Flag dates where the config set differs from the previous date
  let prevConfigs: Set<string> | null = null;
  const result: string[] = [];
  for (const date of dates) {
    const configs = byDate.get(date)!;
    if (
      prevConfigs === null ||
      configs.size !== prevConfigs.size ||
      [...configs].some((k) => !prevConfigs!.has(k))
    ) {
      result.push(date);
    }
    prevConfigs = configs;
  }

  return result;
}

export const FAVORITE_PRESETS: FavoritePreset[] = [
  // 1 — NVIDIA
  {
    id: 'gb200-vs-b200',
    title: 'GB200 NVL72 vs B200 — Multi vs Single Node',
    description: 'GB200 NVL72 Dynamo TRT vs B200 Dynamo TRT on DeepSeek R1 (8k/1k) at FP4.',
    tags: ['DeepSeek', 'GB200', 'B200', 'Dynamo', 'FP4', 'NVL72'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp4'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['gb200_dynamo-trt', 'b200_dynamo-trt'],
    },
  },
  // 2 — NVIDIA
  {
    id: 'b200-vs-h200',
    title: 'B200 vs H200 — Blackwell vs Hopper',
    description:
      'Blackwell B200 vs Hopper H200 Dynamo TRT throughput per GPU on DeepSeek R1 (8k/1k) at FP8.',
    tags: ['DeepSeek', 'B200', 'H200', 'Dynamo', 'FP8'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['b200_dynamo-trt', 'h200_dynamo-trt'],
    },
  },
  // 3 — AMD
  {
    id: 'amd-generations',
    title: 'AMD MI300X → MI325X → MI355X',
    description:
      'Three generations of AMD Instinct on SGLang at FP8. Generational throughput scaling on DeepSeek R1 (8k/1k).',
    tags: ['DeepSeek', 'MI300X', 'MI325X', 'MI355X', 'SGLang', 'FP8'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['mi300x_sglang', 'mi325x_sglang', 'mi355x_sglang'],
    },
  },
  // 4 — NVIDIA disagg generational
  {
    id: 'h100-vs-gb300-disagg',
    title: 'H100 vs GB300 Disagg — DeepSeek',
    description: 'H100 FP8 disagg vs GB300 FP8 disagg vs GB300 FP4 disagg on DeepSeek R1 (8k/1k).',
    tags: ['DeepSeek', 'H100', 'GB300', 'Disagg', 'FP8', 'FP4'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp4', 'fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['h100_dynamo-trt_mtp', 'gb300_dynamo-trt_mtp'],
    },
  },
  // 5 — Disagg cross-vendor
  {
    id: 'disagg-b200-vs-mi355x',
    title: 'Disagg B200 SGLang vs MI355X vs B200 TRT',
    description:
      'Disaggregated B200 Dynamo SGLang vs MI355X MoRI SGLang vs B200 Dynamo TRT on DeepSeek R1 (8k/1k) at FP8.',
    tags: ['DeepSeek', 'B200', 'MI355X', 'Dynamo', 'MoRI', 'FP8', 'Disagg'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['b200_dynamo-sglang', 'mi355x_mori-sglang', 'b200_dynamo-trt'],
    },
  },
  // 6 — AMD
  {
    id: 'mi355x-sglang-disagg-timeline',
    title: 'MI355X SGLang Disagg Over Time — DeepSeek (FP8)',
    description:
      'MI355X SGLang disaggregated inference on DeepSeek R1 (8k/1k) FP8. Tracks throughput improvements over time.',
    tags: ['DeepSeek', 'MI355X', 'SGLang', 'FP8', 'Disagg', 'Timeline'],
    category: 'improvements',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp8'],
      yAxisMetric: 'y_tpPerGpu',
      gpus: ['mi355x_mori-sglang'],
      useDateRange: true,
    },
  },
];
