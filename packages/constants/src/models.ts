/**
 * DB model key → frontend display name (Model enum value).
 *
 * Multiple DB keys may map to the same display name. This is how point releases
 * are grouped for display: the DB stores `glm5` and `glm5.1` as distinct buckets
 * (faithful to the submitted data), but both render under the single "GLM-5"
 * display option in the UI. See `DISPLAY_MODEL_TO_DB` for the inverse mapping.
 */
export const DB_MODEL_TO_DISPLAY: Record<string, string> = {
  dsr1: 'DeepSeek-R1-0528',
  gptoss120b: 'gpt-oss-120b',
  llama70b: 'Llama-3.3-70B-Instruct-FP8',
  'qwen3.5': 'Qwen-3.5-397B-A17B',
  'kimik2.5': 'Kimi-K2.5',
  'kimik2.6': 'Kimi-K2.5',
  'kimik2.7-code': 'Kimi-K2.5',
  'minimaxm2.5': 'MiniMax-M2.5',
  'minimaxm2.7': 'MiniMax-M2.5',
  minimaxm3: 'MiniMax-M3',
  glm5: 'GLM-5',
  'glm5.1': 'GLM-5',
  dsv4: 'DeepSeek-V4-Pro',
};

/**
 * Frontend display name → array of DB model keys.
 *
 * Returns an array because one display name can back multiple DB buckets
 * (point-release grouping). Callers querying benchmark data should pass the
 * full array to the query layer so all buckets are included. Comparing a single
 * row's `model` field against an entry should use `.includes()`, not `===`.
 */
export const DISPLAY_MODEL_TO_DB: Record<string, string[]> = Object.entries(
  DB_MODEL_TO_DISPLAY,
).reduce<Record<string, string[]>>((acc, [dbKey, displayName]) => {
  (acc[displayName] ??= []).push(dbKey);
  return acc;
}, {});

/** Convert a frontend sequence string to ISL/OSL in tokens. */
export function sequenceToIslOsl(seq: string): { isl: number; osl: number } | null {
  const map: Record<string, { isl: number; osl: number }> = {
    '1k/1k': { isl: 1024, osl: 1024 },
    '1k/8k': { isl: 1024, osl: 8192 },
    '8k/1k': { isl: 8192, osl: 1024 },
  };
  return map[seq] ?? null;
}

/** Convert ISL/OSL in tokens to a frontend sequence string. */
export function islOslToSequence(isl: number, osl: number): string | null {
  const map: Record<string, string> = {
    '1024_1024': '1k/1k',
    '1024_8192': '1k/8k',
    '8192_1024': '8k/1k',
  };
  return map[`${isl}_${osl}`] ?? null;
}

// ---------------------------------------------------------------------------
// ExclusionSpec — pure data interface shared by model config and the app's
// exclusion logic. Defined here so it can live in constants without pulling
// in any React/app dependencies.
// ---------------------------------------------------------------------------

/** Data params defining one exclusion rule. */
export interface ExclusionSpec {
  /** Only hwKeys ending in this suffix participate in the rule (e.g. `_mtp`). */
  suffix: string;
  /**
   * Engine-family prefixes stripped from the framework segment before grouping
   * (e.g. `dynamo-`, `mori-`), so `h100_dynamo-vllm_mtp` resolves to `vllm`.
   */
  stripPrefixes?: string[];
  /**
   * Raw family → shared comparability-group id. Two families can co-exist on a
   * graph iff they resolve to the same group; families omitted here are their
   * own group. (e.g. `{ atom: 'sglang' }` — ATOM and SGLang are comparable.)
   */
  groupAliases?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Model enum + metadata
// ---------------------------------------------------------------------------

export enum Model {
  Llama3_3_70B = 'Llama-3.3-70B-Instruct-FP8',
  Llama3_1_70B = 'Llama-3.1-70B-Instruct-FP8-KV',
  DeepSeek_R1 = 'DeepSeek-R1-0528',
  GptOss = 'gpt-oss-120b',
  Qwen3_5 = 'Qwen-3.5-397B-A17B',
  Kimi_K2_5 = 'Kimi-K2.5',
  MiniMax_M2_5 = 'MiniMax-M2.5',
  MiniMax_M3 = 'MiniMax-M3',
  GLM_5 = 'GLM-5',
  DeepSeek_V4_Pro = 'DeepSeek-V4-Pro',
}

export type CategoryTag = 'default' | 'experimental' | 'maintenance' | 'deprecated' | 'hidden';

/**
 * Partition a list of values by their category using a classifier function.
 */
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

/**
 * Single source of truth for model metadata. To add a model:
 * 1. Add an enum member to `Model` above.
 * 2. Add one entry here.
 */
interface ModelConfig {
  label: string;
  prefix: string;
  category: CategoryTag;
  /**
   * Data-driven exclusion rules for this model (see the app's `exclusion.ts`).
   * Each spec partitions matching config keys into comparability groups that
   * can't share a graph with each other. Absent/empty = no exclusion.
   */
  exclusion?: ExclusionSpec[];
}

/**
 * dsv4 MTP exclusion: MTP configs (`*_mtp`) from different engine families can't
 * be active together because their acceptance-rate forcing implementations
 * differ. ATOM and SGLang share the upstream ROCm MTP path, so they form one
 * comparability group; vLLM is its own group.
 */
const MTP_ENGINE_EXCLUSION: ExclusionSpec[] = [
  { suffix: '_mtp', stripPrefixes: ['dynamo-', 'mori-'], groupAliases: { atom: 'sglang' } },
];

// Total parameter counts appended to each label so users can compare model
// scale at a glance in the dropdown. For Llama and gpt-oss the count is
// already part of the canonical name (Llama 3.3 70B, gpt-oss 120B) so no
// duplication needed.
const MODEL_CONFIG: Record<Model, ModelConfig> = {
  [Model.DeepSeek_V4_Pro]: {
    label: 'DeepSeek V4 Pro 1.6T',
    prefix: 'dsv4',
    category: 'default',
    exclusion: MTP_ENGINE_EXCLUSION,
  },
  [Model.Kimi_K2_5]: {
    // K2.5, K2.6, and K2.7-Code share an architecture, so the dropdown surfaces
    // all versions joined with a slash — matches the GLM5/5.1 pattern. The
    // hyphenated `Model.Kimi_K2_5` enum value stays as-is for internal
    // routing / DB key mapping.
    label: 'Kimi K2.5/2.6/2.7-Code 1T',
    prefix: 'kimik2.5',
    category: 'default',
  },
  [Model.MiniMax_M3]: {
    label: 'MiniMax M3 428B',
    prefix: 'minimaxm3',
    category: 'default',
  },
  [Model.DeepSeek_R1]: {
    label: 'DeepSeek R1 0528 671B',
    prefix: 'dsr1',
    category: 'maintenance',
  },
  [Model.GLM_5]: { label: 'GLM5/5.1 744B', prefix: 'glm5', category: 'default' },
  [Model.Qwen3_5]: { label: 'Qwen3.5 397B', prefix: 'qwen3.5', category: 'default' },
  [Model.GptOss]: { label: 'gpt-oss 120B', prefix: 'gptoss', category: 'maintenance' },
  [Model.MiniMax_M2_5]: {
    // M2.5 and M2.7 share an architecture — same GLM5/5.1 pattern as Kimi.
    // Superseded by MiniMax M3, so it's deprecated (no longer actively benchmarked).
    label: 'MiniMax M2.5/2.7 230B',
    prefix: 'minimaxm2.5',
    category: 'deprecated',
  },
  [Model.Llama3_3_70B]: { label: 'Llama 3.3 70B Instruct', prefix: '70b', category: 'deprecated' },
  [Model.Llama3_1_70B]: { label: 'Llama 3.1 70B Instruct', prefix: '', category: 'hidden' },
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

/**
 * Exclusion specs configured for a model (see the app's `exclusion.ts`). Empty
 * when the model has no exclusion rules.
 */
export function getModelExclusion(model: Model | string | null | undefined): ExclusionSpec[] {
  if (!model) return [];
  return MODEL_CONFIG[model as Model]?.exclusion ?? [];
}

/** True if the model has any config-exclusion rule. */
export function hasExclusion(model: Model | string | null | undefined): boolean {
  return getModelExclusion(model).length > 0;
}

export const MODEL_PREFIX_MAPPING: Record<string, Model> = Object.fromEntries(
  (Object.entries(MODEL_CONFIG) as [Model, (typeof MODEL_CONFIG)[Model]][])
    .filter(([, c]) => c.prefix)
    .map(([m, c]) => [c.prefix, m]),
);

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

export enum Sequence {
  OneK_OneK = '1k/1k',
  OneK_EightK = '1k/8k',
  EightK_OneK = '8k/1k',
}

const SEQUENCE_CONFIG: Record<Sequence, { label: string; compact: string; category: CategoryTag }> =
  {
    [Sequence.OneK_OneK]: { label: '1K / 1K', compact: '1k1k', category: 'default' },
    [Sequence.OneK_EightK]: { label: '1K / 8K', compact: '1k8k', category: 'deprecated' },
    [Sequence.EightK_OneK]: { label: '8K / 1K', compact: '8k1k', category: 'default' },
  };

export const SEQUENCE_OPTIONS = Object.keys(SEQUENCE_CONFIG) as Sequence[];

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

export function getSequenceLabel(sequence: Sequence): string {
  return SEQUENCE_CONFIG[sequence]?.label ?? sequence;
}

export const SEQUENCE_PREFIX_MAPPING: Record<string, Sequence> = Object.fromEntries(
  (Object.entries(SEQUENCE_CONFIG) as [Sequence, (typeof SEQUENCE_CONFIG)[Sequence]][]).map(
    ([s, c]) => [c.compact, s],
  ),
);

// ---------------------------------------------------------------------------
// Artifact parsing — depends on MODEL_PREFIX_MAPPING + SEQUENCE_PREFIX_MAPPING
// ---------------------------------------------------------------------------

export function getModelAndSequence(
  artifactName: string,
): { model: Model; sequence: Sequence } | undefined {
  let model: Model | undefined;
  let sequence: Sequence | undefined;

  for (const key in MODEL_PREFIX_MAPPING) {
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
  artifact: Record<string, unknown>,
): { model: Model; sequence: Sequence } | undefined {
  let seq = '';
  seq += artifact['isl'] === 1024 ? '1k' : '8k';
  seq += artifact['osl'] === 1024 ? '1k' : '8k';

  const model = MODEL_PREFIX_MAPPING[artifact['infmax_model_prefix'] as string];
  const sequence = SEQUENCE_PREFIX_MAPPING[seq];
  if (model && sequence) {
    return { model, sequence };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Precisions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Eval benchmarks
// ---------------------------------------------------------------------------

export enum EvalBenchmark {
  GSM8K = 'gsm8k',
}

const EVAL_BENCHMARK_CONFIG: Record<EvalBenchmark, { label: string }> = {
  [EvalBenchmark.GSM8K]: { label: 'GSM8K' },
};

export function getEvalBenchmarkLabel(benchmark: EvalBenchmark): string {
  return EVAL_BENCHMARK_CONFIG[benchmark]?.label ?? benchmark;
}
