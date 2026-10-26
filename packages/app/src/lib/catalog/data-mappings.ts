import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants/models';

import type { ExclusionConflictPolicy, ExclusionSpec } from '../benchmarks/exclusion';

export enum Model {
  Llama3_3_70B = 'Llama-3.3-70B-Instruct-FP8',
  Llama3_1_70B = 'Llama-3.1-70B-Instruct-FP8-KV',
  DeepSeek_R1 = 'DeepSeek-R1-0528',
  GptOss = 'gpt-oss-120b',
  Qwen3_5 = 'Qwen-3.5-397B-A17B',
  Qwen3_8_Flash_Next = 'Qwen3.8-Flash-Next',
  Qwen3_8_27B = 'Qwen3.8-27B',
  Qwen3_8_27B_Eager = 'Qwen3.8-27B-Eager',
  Kimi_K2_5 = 'Kimi-K2.5',
  Kimi_K3 = 'Kimi-K3',
  MiniMax_M2_5 = 'MiniMax-M2.5',
  MiniMax_M3 = 'MiniMax-M3',
  MiniMax_M3_1_Flash = 'MiniMax-M3.1-Flash',
  GLM_5 = 'GLM-5',
  GLM_5_2 = 'GLM-5.2',
  DeepSeek_V4_Pro = 'DeepSeek-V4-Pro',
  DeepSeek_V4_1_Flash = 'DeepSeek-V4.1-Flash',
  Muse_Spark_Open = 'Muse-Spark-Open',
}

export type CategoryTag = 'default' | 'experimental' | 'maintenance' | 'deprecated' | 'hidden';

export function groupByCategory<T>(
  items: T[],
  classify: (item: T) => CategoryTag,
): Record<CategoryTag, T[]> {
  const groups: Record<CategoryTag, T[]> = {
    default: [],
    experimental: [],
    maintenance: [],
    deprecated: [],
    hidden: [],
  };
  for (const item of items) {
    groups[classify(item)].push(item);
  }
  return groups;
}

interface ModelConfig {
  label: string;
  prefix: string;
  category: CategoryTag;
  openRouterModelId?: string;
  logo?: string;
  exclusion?: ExclusionSpec[];
}

const MTP_ENGINE_EXCLUSION: ExclusionSpec[] = [
  {
    suffix: '_mtp',
    stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
    scope: 'hardware',
  },
];

const STP_ENGINE_EXCLUSION: ExclusionSpec[] = [
  {
    suffix: null,
    stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
    scope: 'hardware',
  },
];

const GUARDED_ENGINE_FAMILIES = ['vllm', 'sglang'] as const;

const MODEL_CONFIG: Record<Model, ModelConfig> = {
  [Model.Muse_Spark_Open]: {
    label: 'Muse Spark Open 816B',
    prefix: 'musespark',
    category: 'default',
    openRouterModelId: 'meta/muse-spark-open',
    logo: 'muse-mascot.webp',
  },
  [Model.DeepSeek_V4_Pro]: {
    label: 'DeepSeek V4 Pro 0813 1.6T',
    prefix: 'dsv4',
    category: 'default',
    openRouterModelId: 'deepseek/deepseek-v4-pro-0813',
    logo: 'deepseek-color.svg',
    exclusion: MTP_ENGINE_EXCLUSION,
  },
  [Model.DeepSeek_V4_1_Flash]: {
    label: 'DeepSeek V4.1 Flash 552B',
    prefix: 'dsv41flash',
    category: 'default',
    openRouterModelId: 'deepseek/deepseek-v4.1-flash',
    logo: 'deepseek-color.svg',
  },
  [Model.Kimi_K3]: {
    label: 'Kimi K3 2.8T',
    prefix: 'kimik3',
    category: 'default',
    openRouterModelId: 'moonshotai/kimi-k3',
    logo: 'kimi-color.svg',
  },
  [Model.Kimi_K2_5]: {
    label: 'Kimi K2.5/2.6/2.7-Code 1T',
    prefix: 'kimik2.5',
    category: 'deprecated',
    openRouterModelId: 'moonshotai/kimi-k2.7-code',
    logo: 'kimi-color.svg',
  },
  [Model.MiniMax_M3]: {
    label: 'MiniMax M3 428B',
    prefix: 'minimaxm3',
    category: 'deprecated',
    openRouterModelId: 'minimax/minimax-m3',
    logo: 'minimax-color.svg',
  },
  [Model.MiniMax_M3_1_Flash]: {
    label: 'MiniMax M3.1 Flash 428B',
    prefix: 'minimaxm31flash',
    category: 'default',
    openRouterModelId: 'minimax/minimax-m3.1-flash',
    logo: 'minimax-color.svg',
  },
  [Model.DeepSeek_R1]: {
    label: 'DeepSeek R1 0528 671B',
    prefix: 'dsr1',
    category: 'maintenance',
    openRouterModelId: 'deepseek/deepseek-r1-0528',
    logo: 'deepseek-color.svg',
  },
  [Model.GLM_5]: {
    label: 'GLM5/5.1 744B',
    prefix: 'glm5',
    category: 'deprecated',
    openRouterModelId: 'z-ai/glm-5.1',
    logo: 'zai-color.svg',
  },
  [Model.GLM_5_2]: {
    label: 'GLM5.2/GLM5.3 744B',
    prefix: 'glm5.2',
    category: 'default',
    openRouterModelId: 'z-ai/glm-5.3',
    logo: 'zai-color.svg',
  },
  [Model.Qwen3_5]: {
    label: 'Qwen3.5 397B',
    prefix: 'qwen3.5',
    category: 'default',
    openRouterModelId: 'qwen/qwen3.5-397b-a17b',
    logo: 'qwen-color.svg',
  },
  [Model.Qwen3_8_Flash_Next]: {
    label: 'Qwen3.8 Flash Next 176B',
    prefix: 'qwen3.8next',
    category: 'default',
    openRouterModelId: 'qwen/qwen3.8-flash',
    logo: 'qwen-color.svg',
  },
  [Model.Qwen3_8_27B]: {
    label: 'Qwen3.8 27B',
    prefix: 'qwen3.827b',
    category: 'experimental',
    openRouterModelId: 'qwen/qwen3.8-27b',
    logo: 'qwen-color.svg',
  },
  [Model.Qwen3_8_27B_Eager]: {
    label: 'Qwen3.8 27B (eager)',
    prefix: 'qwen3.827beager',
    category: 'experimental',
    openRouterModelId: 'qwen/qwen3.8-27b',
    logo: 'qwen-color.svg',
  },
  [Model.GptOss]: {
    label: 'gpt-oss 120B',
    prefix: 'gptoss',
    category: 'deprecated',
    openRouterModelId: 'openai/gpt-oss-120b',
    logo: 'openai.svg',
  },
  [Model.MiniMax_M2_5]: {
    label: 'MiniMax M2.5/2.7 230B',
    prefix: 'minimaxm2.5',
    category: 'deprecated',
    openRouterModelId: 'minimax/minimax-m2.7',
    logo: 'minimax-color.svg',
  },
  [Model.Llama3_3_70B]: {
    label: 'Llama 3.3 70B Instruct',
    prefix: '70b',
    category: 'deprecated',
    openRouterModelId: 'meta-llama/llama-3.3-70b-instruct',
    logo: 'meta-color.svg',
  },
  [Model.Llama3_1_70B]: {
    label: 'Llama 3.1 70B Instruct',
    prefix: '',
    category: 'hidden',
    openRouterModelId: 'meta-llama/llama-3.1-70b-instruct',
    logo: 'meta-color.svg',
  },
};

function modelsByCategory(cat: CategoryTag): ReadonlySet<Model> {
  return new Set(
    (Object.entries(MODEL_CONFIG) as [Model, (typeof MODEL_CONFIG)[Model]][])
      .filter(([, c]) => c.category === cat)
      .map(([m]) => m),
  );
}

export const MODEL_OPTIONS = (Object.keys(MODEL_CONFIG) as Model[]).filter(
  (m) => MODEL_CONFIG[m].category !== 'hidden',
);

export const DEFAULT_MODELS: ReadonlySet<Model> = modelsByCategory('default');
export const MAINTENANCE_MODELS: ReadonlySet<Model> = modelsByCategory('maintenance');
export const DEPRECATED_MODELS: ReadonlySet<Model> = modelsByCategory('deprecated');
export const EXPERIMENTAL_MODELS: ReadonlySet<Model> = modelsByCategory('experimental');

export function isModelDefault(model: Model): boolean {
  return DEFAULT_MODELS.has(model);
}
export function isModelDeprecated(model: Model): boolean {
  return DEPRECATED_MODELS.has(model);
}
export function isModelMaintenance(model: Model): boolean {
  return MAINTENANCE_MODELS.has(model);
}
export function isModelExperimental(model: Model): boolean {
  return EXPERIMENTAL_MODELS.has(model);
}

export function getModelCategory(model: Model): CategoryTag {
  return MODEL_CONFIG[model]?.category ?? 'default';
}

export function getModelLabel(model: Model): string {
  return MODEL_CONFIG[model]?.label ?? model;
}

export function getOpenRouterModelId(model: Model): string | null {
  return MODEL_CONFIG[model]?.openRouterModelId ?? null;
}

export function getModelLogo(model: Model): string | null {
  return MODEL_CONFIG[model]?.logo ?? null;
}

export function getModelExclusion(model: Model | string | null | undefined): ExclusionSpec[] {
  if (!model) return [];
  return MODEL_CONFIG[model as Model]?.exclusion ?? [];
}

export function hasExclusion(model: Model | string | null | undefined): boolean {
  return getModelExclusion(model).length > 0;
}

export function getChartWatermark(isUnofficialRun = false): 'logo' | 'unofficial' {
  return isUnofficialRun ? 'unofficial' : 'logo';
}

export function getHistoricalChartWatermark(
  model: string | undefined,
  locale: 'en' | 'zh',
): string | undefined {
  if (model !== Model.MiniMax_M3) return undefined;
  return locale === 'zh'
    ? '历史基准测试\n已停止接收提交'
    : 'HISTORICAL BENCHMARK\nSUBMISSIONS CLOSED';
}

export const MODEL_PREFIX_MAPPING: Record<string, Model> = Object.fromEntries(
  (Object.entries(MODEL_CONFIG) as [Model, (typeof MODEL_CONFIG)[Model]][])
    .filter(([, c]) => c.prefix)
    .flatMap(([m, c]) =>
      [...new Set([c.prefix, ...(DISPLAY_MODEL_TO_DB[m] ?? [])])].map((prefix) => [prefix, m]),
    ),
);

const MODEL_PREFIXES_LONGEST_FIRST = Object.keys(MODEL_PREFIX_MAPPING).toSorted(
  (a, b) => b.length - a.length,
);

export enum Sequence {
  OneK_OneK = '1k/1k',
  OneK_EightK = '1k/8k',
  EightK_OneK = '8k/1k',
  AgenticTraces = 'agentic-traces',
}

export type ScenarioKind = 'fixed-seq' | 'agentic';

export function sequenceKind(seq: Sequence): ScenarioKind {
  return seq === Sequence.AgenticTraces ? 'agentic' : 'fixed-seq';
}

interface SequenceConfig {
  label: string;
  labelZh: string;
  compact: string;
  category: CategoryTag;
  kind: ScenarioKind;
  exclusion?: ExclusionSpec[];
  exclusionPolicy?: ExclusionConflictPolicy;
  defaultExclusionGroup?: string;
  exclusionFamilies?: readonly string[];
}

const SEQUENCE_CONFIG: Record<Sequence, SequenceConfig> = {
  [Sequence.OneK_OneK]: {
    label: '1K / 1K',
    labelZh: '1K / 1K',
    compact: '1k1k',
    category: 'deprecated',
    kind: 'fixed-seq',
  },
  [Sequence.OneK_EightK]: {
    label: '1K / 8K',
    labelZh: '1K / 8K',
    compact: '1k8k',
    category: 'deprecated',
    kind: 'fixed-seq',
  },
  [Sequence.EightK_OneK]: {
    label: '8K / 1K',
    labelZh: '8K / 1K',
    compact: '8k1k',
    category: 'default',
    kind: 'fixed-seq',
    exclusion: STP_ENGINE_EXCLUSION,
    exclusionPolicy: 'keep-sticky',
    defaultExclusionGroup: 'vllm',
    exclusionFamilies: GUARDED_ENGINE_FAMILIES,
  },
  [Sequence.AgenticTraces]: {
    label: 'Agentic',
    labelZh: '智能体',
    compact: 'agentic',
    category: 'default',
    kind: 'agentic',
    exclusion: STP_ENGINE_EXCLUSION,
    exclusionPolicy: 'keep-sticky',
    defaultExclusionGroup: 'vllm',
    exclusionFamilies: GUARDED_ENGINE_FAMILIES,
  },
};

export function getSequenceExclusion(
  sequence: Sequence | string | null | undefined,
): ExclusionSpec[] {
  if (!sequence) return [];
  return SEQUENCE_CONFIG[sequence as Sequence]?.exclusion ?? [];
}

export function getSequenceExclusionPolicy(
  sequence: Sequence | string | null | undefined,
): ExclusionConflictPolicy {
  if (!sequence) return 'clear-all';
  return SEQUENCE_CONFIG[sequence as Sequence]?.exclusionPolicy ?? 'clear-all';
}

export function getSequenceDefaultExclusionGroup(
  sequence: Sequence | string | null | undefined,
): string | null {
  if (!sequence) return null;
  return SEQUENCE_CONFIG[sequence as Sequence]?.defaultExclusionGroup ?? null;
}

export function getSequenceExclusionFamilies(
  sequence: Sequence | string | null | undefined,
): readonly string[] | null {
  if (!sequence) return null;
  return SEQUENCE_CONFIG[sequence as Sequence]?.exclusionFamilies ?? null;
}

export const SEQUENCE_OPTIONS = Object.keys(SEQUENCE_CONFIG) as Sequence[];

export enum Percentile {
  P75 = 'p75',
  P90 = 'p90',
}

const PERCENTILE_CONFIG: Record<Percentile, { label: string }> = {
  [Percentile.P75]: { label: 'p75' },
  [Percentile.P90]: { label: 'p90' },
};

export const PERCENTILE_OPTIONS = Object.keys(PERCENTILE_CONFIG) as Percentile[];

export function getPercentileLabel(p: Percentile): string {
  return PERCENTILE_CONFIG[p]?.label ?? p;
}

export const DEPRECATED_SEQUENCES: ReadonlySet<Sequence> = new Set(
  (Object.entries(SEQUENCE_CONFIG) as [Sequence, (typeof SEQUENCE_CONFIG)[Sequence]][])
    .filter(([, c]) => c.category === 'deprecated')
    .map(([s]) => s),
);

export function isSequenceDeprecated(sequence: Sequence): boolean {
  return DEPRECATED_SEQUENCES.has(sequence);
}

export function getSequenceCategory(sequence: Sequence): CategoryTag {
  return SEQUENCE_CONFIG[sequence]?.category ?? 'default';
}

const MODEL_DEPRECATED_SEQUENCES: Partial<Record<Model, ReadonlySet<Sequence>>> = {
  [Model.MiniMax_M3]: new Set([Sequence.EightK_OneK]),
  [Model.DeepSeek_V4_Pro]: new Set([Sequence.EightK_OneK]),
  [Model.GLM_5_2]: new Set([Sequence.EightK_OneK]),
};

export function isSequenceDeprecatedForModel(model: Model, sequence: Sequence): boolean {
  return MODEL_DEPRECATED_SEQUENCES[model]?.has(sequence) ?? false;
}

const MODEL_HIDDEN_SEQUENCES: Partial<Record<Model, ReadonlySet<Sequence>>> = {
  [Model.Muse_Spark_Open]: new Set(
    SEQUENCE_OPTIONS.filter((sequence) => sequence !== Sequence.AgenticTraces),
  ),
  [Model.GLM_5_2]: new Set([Sequence.EightK_OneK]),
};

export function isSequenceHiddenForModel(model: Model, sequence: Sequence): boolean {
  return MODEL_HIDDEN_SEQUENCES[model]?.has(sequence) ?? false;
}

export function getSequenceCategoryForModel(sequence: Sequence, model?: Model | null): CategoryTag {
  if (model && isSequenceDeprecatedForModel(model, sequence)) return 'deprecated';
  return getSequenceCategory(sequence);
}

const MODEL_BEST_PER_SKU_DEFAULT_OFF: Partial<Record<Model, ReadonlySet<Sequence>>> = {};

export function isBestPerSkuDefaultOff(
  model: Model | null | undefined,
  sequence: Sequence | null | undefined,
): boolean {
  if (!model || !sequence) return false;
  return MODEL_BEST_PER_SKU_DEFAULT_OFF[model]?.has(sequence) ?? false;
}

const MODEL_TCO_BASIS_SELECTOR: Partial<Record<Model, ReadonlySet<Sequence>>> = {
  [Model.Qwen3_5]: new Set([Sequence.EightK_OneK, Sequence.AgenticTraces]),
  [Model.Kimi_K3]: new Set([Sequence.EightK_OneK, Sequence.AgenticTraces]),
};

export function showsTcoBasisSelector(
  model: Model | null | undefined,
  sequence: Sequence | null | undefined,
): boolean {
  if (!model || !sequence) return false;
  return MODEL_TCO_BASIS_SELECTOR[model]?.has(sequence) ?? false;
}

export function getSequenceLabel(sequence: Sequence, locale: 'en' | 'zh' = 'en'): string {
  const config = SEQUENCE_CONFIG[sequence];
  if (!config) return sequence;
  return locale === 'zh' ? config.labelZh : config.label;
}

const SEQUENCE_PREFIX_MAPPING: Record<string, Sequence> = Object.fromEntries(
  (Object.entries(SEQUENCE_CONFIG) as [Sequence, (typeof SEQUENCE_CONFIG)[Sequence]][]).map(
    ([s, c]) => [c.compact, s],
  ),
);

export enum Precision {
  FP4 = 'fp4',
  FP4FP8 = 'fp4fp8',
  FP8 = 'fp8',
  BF16 = 'bf16',
  INT4 = 'int4',
}

const PRECISION_CONFIG: Record<Precision, { label: string }> = {
  [Precision.FP4]: { label: 'FP4' },
  [Precision.FP4FP8]: { label: 'FP4+FP8' },
  [Precision.FP8]: { label: 'FP8' },
  [Precision.BF16]: { label: 'BF16' },
  [Precision.INT4]: { label: 'INT4' },
};

export const PRECISION_OPTIONS = Object.keys(PRECISION_CONFIG) as Precision[];

export function getPrecisionLabel(precision: Precision): string {
  return PRECISION_CONFIG[precision]?.label ?? precision;
}

const MODEL_DEFAULT_PRECISIONS: Partial<
  Record<Model, Partial<Record<Sequence, readonly Precision[]>>>
> = {
  [Model.GLM_5_2]: { [Sequence.AgenticTraces]: [Precision.FP4, Precision.FP8] },
  [Model.Qwen3_5]: { [Sequence.AgenticTraces]: [Precision.FP4, Precision.FP8] },
};

export function getModelDefaultPrecisions(
  model: Model,
  sequence: Sequence,
): readonly Precision[] | undefined {
  return MODEL_DEFAULT_PRECISIONS[model]?.[sequence];
}

export enum EvalBenchmark {
  GSM8K = 'gsm8k',
}

const EVAL_BENCHMARK_CONFIG: Record<EvalBenchmark, { label: string }> = {
  [EvalBenchmark.GSM8K]: { label: 'GSM8K' },
};

export function getEvalBenchmarkLabel(benchmark: EvalBenchmark): string {
  return EVAL_BENCHMARK_CONFIG[benchmark]?.label ?? benchmark;
}

export function getModelAndSequence(
  artifactName: string,
): { model: Model; sequence: Sequence } | undefined {
  let model: Model | undefined;
  let sequence: Sequence | undefined;

  for (const key of MODEL_PREFIXES_LONGEST_FIRST) {
    if (artifactName.includes(key)) {
      model = MODEL_PREFIX_MAPPING[key];
      break;
    }
  }

  for (const key in SEQUENCE_PREFIX_MAPPING) {
    if (artifactName.includes(key)) {
      sequence = SEQUENCE_PREFIX_MAPPING[key];
      break;
    }
  }

  if (model && sequence) {
    return { model, sequence };
  }

  return undefined;
}

export function getModelAndSequenceFromArtifact(
  artifact: any,
): { model: Model; sequence: Sequence } | undefined {
  let seq = '';
  seq += artifact.isl === 1024 ? '1k' : '8k';
  seq += artifact.osl === 1024 ? '1k' : '8k';

  const model = MODEL_PREFIX_MAPPING[artifact.infmax_model_prefix as string];
  const sequence = SEQUENCE_PREFIX_MAPPING[seq];
  if (model && sequence) {
    return { model, sequence };
  }

  return undefined;
}
