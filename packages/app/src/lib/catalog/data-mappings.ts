import {
  type CategoryTag,
  DB_MODEL_TO_DISPLAY,
  type EnumKeyed,
  MODEL_PREFIX_ALIASES,
  MODEL_REGISTRY,
  type ModelEntry,
  type ModelName,
  PRECISION_REGISTRY,
  type PrecisionEntry,
  type PrecisionKey,
  type ScenarioKind,
  SEQUENCE_REGISTRY,
  type SequenceEntry,
  type SequenceKey,
} from '@semianalysisai/inferencex-constants';

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
  Kimi_K3_1_Pro = 'Kimi-K3.1-Pro',
  MiniMax_M2_5 = 'MiniMax-M2.5',
  MiniMax_M3 = 'MiniMax-M3',
  MiniMax_M3_1_Flash = 'MiniMax-M3.1-Flash',
  GLM_5 = 'GLM-5',
  GLM_5_2 = 'GLM-5.2',
  GLM_5_3_Flash = 'GLM-5.3-Flash',
  DeepSeek_V4_Pro = 'DeepSeek-V4-Pro',
  DeepSeek_V4_1_Flash = 'DeepSeek-V4.1-Flash',
  Muse_Spark_Open = 'Muse-Spark-Open',
}

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

const MODEL_CONFIG: EnumKeyed<Model, ModelName, ModelEntry> = MODEL_REGISTRY;

const MODEL_EXCLUSIONS: Partial<Record<Model, ExclusionSpec[]>> = {
  [Model.DeepSeek_V4_Pro]: MTP_ENGINE_EXCLUSION,
};

function modelsByCategory(cat: CategoryTag): ReadonlySet<Model> {
  return new Set(
    (Object.entries(MODEL_CONFIG) as [Model, (typeof MODEL_CONFIG)[Model]][])
      .filter(([, c]) => c.category === cat)
      .map(([m]) => m),
  );
}

// Selector order is independent of the overview registry order and selected defaults.
const MODEL_SELECTOR_ORDER: readonly Model[] = [
  Model.Kimi_K3_1_Pro,
  Model.DeepSeek_V4_1_Flash,
  Model.GLM_5_2,
  Model.GLM_5_3_Flash,
  Model.MiniMax_M3_1_Flash,
  Model.Muse_Spark_Open,
  Model.Qwen3_5,
  Model.Qwen3_8_Flash_Next,
];

const rank = (model: Model) => {
  const index = MODEL_SELECTOR_ORDER.indexOf(model);
  return index === -1 ? MODEL_SELECTOR_ORDER.length : index;
};

export const MODEL_OPTIONS = (Object.keys(MODEL_CONFIG) as Model[])
  .filter((m) => MODEL_CONFIG[m].category !== 'hidden')
  .sort((a, b) => rank(a) - rank(b));

export const DEFAULT_MODELS: ReadonlySet<Model> = modelsByCategory('default');

export function modelRequiresFeatureGate(model: string): boolean {
  return MODEL_CONFIG[model as Model]?.featureGated === true;
}

export function isModelVisible(model: string, featureGateUnlocked = false): boolean {
  return featureGateUnlocked || !modelRequiresFeatureGate(model);
}
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

export function modelRequiresObservations(model: Model): boolean {
  return MODEL_CONFIG[model]?.requiresObservations ?? false;
}

export function getModelExclusion(model: Model | string | null | undefined): ExclusionSpec[] {
  if (!model) return [];
  return MODEL_EXCLUSIONS[model as Model] ?? [];
}

export function hasExclusion(model: Model | string | null | undefined): boolean {
  return getModelExclusion(model).length > 0;
}

/** False for a model that only an unofficial-run overlay carries, identified by its raw prefix. */
export function isRegisteredModel(model: string): model is Model {
  return Object.hasOwn(MODEL_CONFIG, model);
}

export function getChartWatermark(isUnofficialRun = false): 'logo' | 'unofficial' {
  return isUnofficialRun ? 'unofficial' : 'logo';
}

export const MODEL_PREFIX_MAPPING: Record<string, Model> = {
  ...(DB_MODEL_TO_DISPLAY as Record<string, Model>),
  ...Object.fromEntries(
    Object.entries(MODEL_PREFIX_ALIASES).map(([prefix, dbKey]) => [
      prefix,
      DB_MODEL_TO_DISPLAY[dbKey] as Model,
    ]),
  ),
  // Llama 3.3 artifact names and changelog keys carry the bare `70b` prefix.
  '70b': Model.Llama3_3_70B,
};

const MODEL_PREFIXES_LONGEST_FIRST = Object.keys(MODEL_PREFIX_MAPPING).toSorted(
  (a, b) => b.length - a.length,
);

export enum Sequence {
  OneK_OneK = '1k/1k',
  OneK_EightK = '1k/8k',
  EightK_OneK = '8k/1k',
  AgenticTraces = 'agentic-traces',
}

const SEQUENCE_CONFIG: EnumKeyed<Sequence, SequenceKey, SequenceEntry> = SEQUENCE_REGISTRY;

export function sequenceKind(seq: Sequence): ScenarioKind {
  return SEQUENCE_CONFIG[seq].kind;
}

interface SequenceExclusionConfig {
  exclusion: ExclusionSpec[];
  exclusionPolicy: ExclusionConflictPolicy;
  defaultExclusionGroup: string;
  exclusionFamilies: readonly string[];
}

const GUARDED_ENGINE_EXCLUSION: SequenceExclusionConfig = {
  exclusion: STP_ENGINE_EXCLUSION,
  exclusionPolicy: 'keep-sticky',
  defaultExclusionGroup: 'vllm',
  exclusionFamilies: GUARDED_ENGINE_FAMILIES,
};

const SEQUENCE_EXCLUSIONS: Partial<Record<Sequence, SequenceExclusionConfig>> = {
  [Sequence.EightK_OneK]: GUARDED_ENGINE_EXCLUSION,
  [Sequence.AgenticTraces]: GUARDED_ENGINE_EXCLUSION,
};

export function getSequenceExclusion(
  sequence: Sequence | string | null | undefined,
): ExclusionSpec[] {
  if (!sequence) return [];
  return SEQUENCE_EXCLUSIONS[sequence as Sequence]?.exclusion ?? [];
}

export function getSequenceExclusionPolicy(
  sequence: Sequence | string | null | undefined,
): ExclusionConflictPolicy {
  if (!sequence) return 'clear-all';
  return SEQUENCE_EXCLUSIONS[sequence as Sequence]?.exclusionPolicy ?? 'clear-all';
}

export function getSequenceDefaultExclusionGroup(
  sequence: Sequence | string | null | undefined,
): string | null {
  if (!sequence) return null;
  return SEQUENCE_EXCLUSIONS[sequence as Sequence]?.defaultExclusionGroup ?? null;
}

export function getSequenceExclusionFamilies(
  sequence: Sequence | string | null | undefined,
): readonly string[] | null {
  if (!sequence) return null;
  return SEQUENCE_EXCLUSIONS[sequence as Sequence]?.exclusionFamilies ?? null;
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
  [Model.Qwen3_5]: new Set([Sequence.EightK_OneK]),
  [Model.MiniMax_M3]: new Set([Sequence.EightK_OneK]),
  [Model.DeepSeek_V4_Pro]: new Set([Sequence.EightK_OneK]),
};

export function isSequenceDeprecatedForModel(model: Model, sequence: Sequence): boolean {
  return MODEL_DEPRECATED_SEQUENCES[model]?.has(sequence) ?? false;
}

const MODEL_HIDDEN_SEQUENCES: Partial<Record<Model, ReadonlySet<Sequence>>> = {
  [Model.GLM_5_3_Flash]: new Set(
    SEQUENCE_OPTIONS.filter(
      (sequence) => sequence !== Sequence.AgenticTraces && sequence !== Sequence.EightK_OneK,
    ),
  ),
  [Model.Muse_Spark_Open]: new Set(
    SEQUENCE_OPTIONS.filter((sequence) => sequence !== Sequence.AgenticTraces),
  ),
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
  // Muse Spark Open exposes only Agentic Traces, where its TPUv7 results live.
  [Model.Muse_Spark_Open]: new Set([Sequence.AgenticTraces]),
  // GLM-5.2 and GLM-5.3 Flash have TPUv7 results on Agentic Traces only.
  [Model.GLM_5_2]: new Set([Sequence.AgenticTraces]),
  [Model.GLM_5_3_Flash]: new Set([Sequence.AgenticTraces]),
  // Qwen3.8 Flash Next has TPUv7 results on Agentic Traces only.
  [Model.Qwen3_8_Flash_Next]: new Set([Sequence.AgenticTraces]),
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

const PRECISION_CONFIG: EnumKeyed<Precision, PrecisionKey, PrecisionEntry> = PRECISION_REGISTRY;

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
