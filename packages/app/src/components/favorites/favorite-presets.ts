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

  // Track cumulative configs — flag dates that introduce net-new keys
  const seen = new Set<string>();
  const result: string[] = [];
  for (const date of dates) {
    const configs = byDate.get(date)!;
    let hasNew = false;
    for (const key of configs) {
      if (!seen.has(key)) {
        hasNew = true;
        seen.add(key);
      }
    }
    if (result.length === 0 || hasNew) {
      result.push(date);
    }
  }

  return result;
}

export const FAVORITE_PRESETS: FavoritePreset[] = [
  // 1 — NVIDIA
  {
    id: 'gb200-vs-b200',
    title: 'GB200 NVL72 vs B200 — Multi vs Single Node',
    description:
      'GB200 NVL72 Dynamo prefill-decode disaggregation vs B200 single-node on DeepSeek R1 (1k/1k) at FP4.',
    tags: ['DeepSeek', 'GB200', 'B200', 'Dynamo', 'FP4', 'NVL72'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.OneK_OneK,
      precisions: ['fp4'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['gb200', 'b200'],
    },
  },
  // 2 — NVIDIA
  {
    id: 'b200-vs-h200',
    title: 'B200 vs H200 — Blackwell vs Hopper',
    description:
      'Blackwell B200 vs Hopper H200 single-node throughput per GPU on DeepSeek R1 (1k/8k) at FP8.',
    tags: ['DeepSeek', 'B200', 'H200', 'FP8'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.OneK_EightK,
      precisions: ['fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['b200', 'h200'],
    },
  },
  // 3 — AMD
  {
    id: 'amd-generations',
    title: 'AMD MI300X → MI325X → MI355X',
    description:
      'Three generations of AMD Instinct on SGLang at FP8. Generational throughput scaling on DeepSeek R1 (1k/8k).',
    tags: ['DeepSeek', 'MI300X', 'MI325X', 'MI355X', 'SGLang', 'FP8'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.OneK_EightK,
      precisions: ['fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['mi300x', 'mi325x', 'mi355x'],
    },
  },
  // 4 — NVIDIA
  {
    id: 'b200-trt-timeline',
    title: 'B200 TensorRT-LLM Over Time — DeepSeek (FP4)',
    description:
      'B200 TensorRT-LLM config expansion on DeepSeek R1 (1k/8k) FP4. Shows 4 waves of new configs from Oct 2025 to Feb 2026.',
    tags: ['DeepSeek', 'B200', 'TensorRT-LLM', 'FP4', 'Timeline'],
    category: 'improvements',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.OneK_EightK,
      precisions: ['fp4'],
      yAxisMetric: 'y_tpPerGpu',
      gpus: ['b200_trt'],
      useDateRange: true,
      dateRangeMonths: 5,
    },
  },
  // 5 — AMD
  {
    id: 'mi355x-sglang-vs-atom',
    title: 'MI355X — SGLang vs Atom Framework',
    description:
      'Compare SGLang and Atom runtimes on MI355X at FP8. Same hardware, different frameworks on DeepSeek R1 (1k/8k).',
    tags: ['DeepSeek', 'MI355X', 'SGLang', 'Atom', 'FP8'],
    category: 'comparison',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.OneK_EightK,
      precisions: ['fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['mi355x'],
    },
  },
  // 6 — AMD
  {
    id: 'mi355x-atom-timeline',
    title: 'MI355X Atom Over Time — DeepSeek (FP4)',
    description:
      'MI355X Atom config expansion on DeepSeek R1 (1k/8k) FP4. Tracks new configs from Jan to Feb 2026.',
    tags: ['DeepSeek', 'MI355X', 'Atom', 'FP4', 'Timeline'],
    category: 'improvements',
    config: {
      model: Model.DeepSeek_R1,
      sequence: Sequence.OneK_EightK,
      precisions: ['fp4'],
      yAxisMetric: 'y_tpPerGpu',
      gpus: ['mi355x_atom'],
      useDateRange: true,
      dateRangeMonths: 2,
    },
  },
];
