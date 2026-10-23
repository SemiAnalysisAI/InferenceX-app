import type { BenchmarkRow } from '@/lib/api/api';
import { getModelExclusion, Model, Sequence } from '@/lib/catalog/data-mappings';

export interface FavoritePreset {
  id: string;
  title: string;
  titleZh?: string;
  description: string;
  descriptionZh?: string;
  tags: string[];
  category: 'comparison' | 'improvements';
  wide?: boolean;
  hidden?: boolean;
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

export function matchesPresetHwFilter(
  hwKey: string,
  filter: string[],
  model: Model | string | null | undefined,
): boolean {
  const excludedSuffixes = getModelExclusion(model)
    .map((spec) => spec.suffix)
    .filter((suffix): suffix is string => suffix !== null);
  const isExcludedVariant = excludedSuffixes.some((suffix) => hwKey.endsWith(suffix));
  return filter.some(
    (f) => hwKey === f || (!f.includes('_') && hwKey.startsWith(`${f}_`) && !isExcludedVariant),
  );
}

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

export function subtractMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().split('T')[0];
}

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
  const filtered = rows.filter(
    (r) =>
      precisions.includes(r.precision) &&
      r.date >= startDate &&
      r.date <= endDate &&
      gpuPrefixes.some((prefix) => `${r.hardware}_${r.framework}`.startsWith(prefix)),
  );

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

  const dates = [...byDate.keys()].toSorted();
  if (dates.length === 0) return [];

  let prevConfigs: Set<string> | null = null;
  const result: string[] = [];
  for (const date of dates) {
    const configs = byDate.get(date)!;
    const prev = prevConfigs;
    if (prev === null || configs.size !== prev.size || [...configs].some((k) => !prev.has(k))) {
      result.push(date);
    }
    prevConfigs = configs;
  }

  return result;
}

export const FAVORITE_PRESETS: FavoritePreset[] = [
  {
    id: 'kimi-k3-launch',
    title: 'Kimi K3 — First Look',
    titleZh: 'Kimi K3 — 首发基准测试',
    description:
      'First benchmarks of Kimi K3 across every available chip. New configurations appear here as they come online.',
    descriptionZh: '涵盖所有可用芯片的 Kimi K3 首批基准测试结果。新配置上线后将在此同步更新。',
    tags: ['Kimi', 'K3', 'New'],
    category: 'comparison',
    wide: true,
    config: {
      model: Model.Kimi_K3,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp4', 'fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['h100', 'h200', 'b200', 'b300', 'gb200', 'gb300', 'mi300x', 'mi325x', 'mi355x'],
    },
  },
  {
    id: 'minimax-m3-launch',
    title: 'MiniMax M3 — First Look',
    titleZh: 'MiniMax M3 — 首发基准测试',
    description:
      'First benchmarks of MiniMax M3 across every available chip. New configurations appear here as they come online.',
    descriptionZh: '涵盖所有可用芯片的 MiniMax M3 首批基准测试结果。新配置上线后将在此同步更新。',
    tags: ['MiniMax', 'M3'],
    category: 'comparison',
    wide: true,
    hidden: true,
    config: {
      model: Model.MiniMax_M3,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp4', 'fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['h100', 'h200', 'b200', 'b300', 'gb200', 'gb300', 'mi300x', 'mi325x', 'mi355x'],
    },
  },
  {
    id: 'dsv4-launch',
    title: 'DeepSeek V4 Pro — First Look',
    description:
      'First benchmarks of DeepSeek V4 Pro across every available chip. New configurations appear here as they come online.',
    tags: ['DeepSeek', 'V4-Pro'],
    category: 'comparison',
    wide: true,
    hidden: true,
    config: {
      model: Model.DeepSeek_V4_Pro,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp4', 'fp4fp8', 'fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['h100', 'h200', 'b200', 'b300', 'gb200', 'gb300', 'mi300x', 'mi325x', 'mi355x'],
    },
  },
  {
    id: 'dsv4-launch-nvidia',
    title: 'DeepSeek V4 Pro — NVIDIA First Look',
    description:
      'First benchmarks of DeepSeek V4 Pro on NVIDIA chips. New configurations appear here as they come online.',
    tags: ['DeepSeek', 'V4-Pro', 'NVIDIA'],
    category: 'comparison',
    wide: true,
    hidden: true,
    config: {
      model: Model.DeepSeek_V4_Pro,
      sequence: Sequence.EightK_OneK,
      precisions: ['fp4', 'fp4fp8', 'fp8'],
      yAxisMetric: 'y_tpPerGpu',
      hwFilter: ['h100', 'h200', 'b200', 'b300', 'gb200', 'gb300'],
    },
  },
  {
    id: 'gb200-vs-b200',
    title: 'GB200 NVL72 vs B200 — Multi vs Single Node',
    titleZh: 'GB200 NVL72 vs B200 — 多节点 vs 单节点',
    description: 'GB200 NVL72 Dynamo TRTLLM vs B200 Dynamo TRTLLM on DeepSeek R1 (8k/1k) at FP4.',
    descriptionZh:
      'GB200 NVL72 Dynamo TRTLLM vs B200 Dynamo TRTLLM，基于 DeepSeek R1 (8k/1k)，FP4 精度。',
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
  {
    id: 'b200-vs-h200',
    title: 'B200 vs H200 — Blackwell vs Hopper',
    titleZh: 'B200 vs H200 — Blackwell vs Hopper',
    description:
      'Blackwell B200 vs Hopper H200 Dynamo TRTLLM throughput per chip on DeepSeek R1 (8k/1k) at FP8.',
    descriptionZh:
      'Blackwell B200 vs Hopper H200 Dynamo TRTLLM 每芯片吞吐量对比，基于 DeepSeek R1 (8k/1k)，FP8 精度。',
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
  {
    id: 'amd-generations',
    title: 'AMD MI300X → MI325X → MI355X',
    titleZh: 'AMD MI300X → MI325X → MI355X',
    description:
      'Three generations of AMD Instinct on SGLang at FP8. Generational throughput scaling on DeepSeek R1 (8k/1k).',
    descriptionZh:
      'AMD Instinct 三代产品在 SGLang FP8 下的对比。DeepSeek R1 (8k/1k) 代际吞吐量提升趋势。',
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
  {
    id: 'h100-vs-gb300-disagg',
    title: 'H100 vs GB300 Disagg — DeepSeek',
    titleZh: 'H100 vs GB300 分离式推理 — DeepSeek',
    description: 'H100 FP8 disagg vs GB300 FP8 disagg vs GB300 FP4 disagg on DeepSeek R1 (8k/1k).',
    descriptionZh:
      'H100 FP8 分离式 vs GB300 FP8 分离式 vs GB300 FP4 分离式，基于 DeepSeek R1 (8k/1k)。',
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
  {
    id: 'disagg-b200-vs-mi355x',
    title: 'Disagg B200 SGLang vs MI355X vs B200 TRTLLM',
    titleZh: '分离式 B200 SGLang vs MI355X vs B200 TRTLLM',
    description:
      'Disaggregated B200 Dynamo SGLang vs MI355X MoRI SGLang vs B200 Dynamo TRTLLM on DeepSeek R1 (8k/1k) at FP8.',
    descriptionZh:
      '分离式 B200 Dynamo SGLang vs MI355X MoRI SGLang vs B200 Dynamo TRTLLM，基于 DeepSeek R1 (8k/1k)，FP8 精度。',
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
  {
    id: 'mi355x-sglang-disagg-timeline',
    title: 'MI355X SGLang Disagg Over Time — DeepSeek (FP8)',
    titleZh: 'MI355X SGLang 分离式推理历史趋势 — DeepSeek (FP8)',
    description:
      'MI355X SGLang disaggregated inference on DeepSeek R1 (8k/1k) FP8. Tracks throughput improvements over time.',
    descriptionZh:
      'MI355X SGLang 分离式推理在 DeepSeek R1 (8k/1k) FP8 下的表现，追踪吞吐量随时间的提升。',
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
