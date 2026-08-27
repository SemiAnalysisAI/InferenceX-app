import type { ExclusionConflictPolicy, ExclusionSpec } from './exclusion';

export enum Model {
  Llama3_3_70B = 'Llama-3.3-70B-Instruct-FP8',
  Llama3_1_70B = 'Llama-3.1-70B-Instruct-FP8-KV',
  DeepSeek_R1 = 'DeepSeek-R1-0528',
  GptOss = 'gpt-oss-120b',
  Qwen3_5 = 'Qwen-3.5-397B-A17B',
  Qwen3_8_Flash_Next = 'Qwen3.8-Flash-Next',
  Kimi_K2_5 = 'Kimi-K2.5',
  Kimi_K3 = 'Kimi-K3',
  MiniMax_M2_5 = 'MiniMax-M2.5',
  MiniMax_M3 = 'MiniMax-M3',
  GLM_5 = 'GLM-5',
  GLM_5_2 = 'GLM-5.2',
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
   * Filename under `public/logos/` for the model creator's logo, shown beside
   * the model name in UI surfaces such as the inference chart caption. Absent =
   * no logo rendered. Monochrome `currentColor`/black SVGs are inverted in dark
   * mode by `ModelLogo`; colored raster assets (`.webp`) are shown as-is.
   */
  logo?: string;
  /**
   * Data-driven exclusion rules for this model (see `exclusion.ts`). Each spec
   * partitions matching config keys into comparability groups that can't share
   * a graph with each other. Absent/empty = no exclusion.
   */
  exclusion?: ExclusionSpec[];
}

/**
 * dsv4 MTP exclusion: MTP configs (`*_mtp`) from different engine families can't
 * be active together because their acceptance-rate forcing implementations
 * differ. ATOM and SGLang share the upstream ROCm MTP path, so they form one
 * comparability group; vLLM is its own group.
 *
 * Scoped to `hardware` for the same reason the STP rule below is: the guard
 * exists to stop two engines being read off one SKU's curve, not to stop a
 * chart holding two SKUs. B200 vLLM MTP next to B300 SGLang MTP compares
 * hardware, which is the point of the chart. Where only one engine has a run
 * for a SKU there is nothing to confuse, so that SKU is free to show it.
 *
 * ATOM is its own family and is deliberately NOT grouped with SGLang, so it
 * stays comparable with everything — including both vLLM and SGLang on the
 * SKUs where it runs.
 */
const MTP_ENGINE_EXCLUSION: ExclusionSpec[] = [
  {
    suffix: '_mtp',
    stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
    scope: 'hardware',
  },
];

/**
 * STP exclusion: unsuffixed standard-token configs for the same hardware SKU
 * can't mix engine families, because each engine tunes its serving path
 * differently. Different hardware may use different engines on one graph.
 * `dynamo-`/`mori-`/`llmd-`/`mooncake-` are routers, not engines, so
 * `dynamo-sglang` is SGLang and is guarded as such.
 *
 * ATOM is its own family and is not aliased to SGLang — it stays comparable
 * with everything.
 */
const STP_ENGINE_EXCLUSION: ExclusionSpec[] = [
  {
    suffix: null,
    stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
    scope: 'hardware',
  },
];

/**
 * Engine families guarded on the 8K/1K and Agentic Traces charts. vLLM and
 * SGLang tune their runs against engine-specific serving paths, so their
 * numbers aren't directly comparable on one SKU — for standard-token and MTP
 * configs alike. The resulting matrix, per SKU:
 *
 *   vLLM ↔ SGLang           blocked  (standard-token and MTP)
 *   TRTLLM ↔ vLLM           allowed
 *   TRTLLM ↔ SGLang         allowed
 *   TRTLLM ↔ ATOM           allowed
 *   ATOM ↔ vLLM or SGLang   allowed
 *
 * Every engine outside this list is comparable with everything: TRTLLM, ATOM,
 * and Mooncake ATOMesh stay freely selectable next to either guarded engine and
 * next to each other. Because the list is matched before `groupAliases`, ATOM
 * escapes even though the MTP rule folds it into SGLang's comparability group.
 *
 * Both scenarios share the list. AgentX guarded every engine family while the
 * agentic benchmark was new; that blocked TRTLLM against vLLM, SGLang, and ATOM
 * on the same SKU, which the pairs above now allow.
 */
const GUARDED_ENGINE_FAMILIES = ['vllm', 'sglang'] as const;

// Total parameter counts appended to each label so users can compare model
// scale at a glance in the dropdown. For Llama and gpt-oss the count is
// already part of the canonical name (Llama 3.3 70B, gpt-oss 120B) so no
// duplication needed.
const MODEL_CONFIG: Record<Model, ModelConfig> = {
  [Model.DeepSeek_V4_Pro]: {
    label: 'DeepSeek V4 Pro 0813 1.6T',
    prefix: 'dsv4',
    category: 'default',
    logo: 'deepseek-color.svg',
    exclusion: MTP_ENGINE_EXCLUSION,
  },
  [Model.Kimi_K3]: {
    // K3 is a separate 2.8T KDA/MLA-hybrid architecture, not a K2 point release,
    // so it stays out of the K2.5/2.6/2.7-Code grouping below.
    label: 'Kimi K3 2.8T',
    prefix: 'kimik3',
    category: 'default',
    logo: 'models/kimi.svg',
  },
  [Model.Kimi_K2_5]: {
    // K2.5, K2.6, and K2.7-Code share an architecture, so the dropdown surfaces
    // all versions joined with a slash — matches the GLM5/5.1 pattern. The
    // hyphenated `Model.Kimi_K2_5` enum value stays as-is for internal
    // routing / DB key mapping.
    //
    // Fully retired after 2026-08-06 per MODELS.md: agentic coding was
    // deprecated first, then Single-turn 8k1k — its last active scenario — so
    // no scenario remains. Kimi-K3 (launched 2026-07-27) takes the cluster
    // time. Historical rows stay queryable; the model just leaves the active
    // groups in the selector.
    label: 'Kimi K2.5/2.6/2.7-Code 1T',
    prefix: 'kimik2.5',
    category: 'deprecated',
    logo: 'models/kimi.svg',
  },
  [Model.MiniMax_M3]: {
    label: 'MiniMax M3 428B',
    prefix: 'minimaxm3',
    category: 'default',
    logo: 'minimax-color.svg',
  },
  [Model.DeepSeek_R1]: {
    label: 'DeepSeek R1 0528 671B',
    prefix: 'dsr1',
    category: 'maintenance',
    logo: 'deepseek-color.svg',
  },
  [Model.GLM_5]: {
    label: 'GLM5/5.1 744B',
    prefix: 'glm5',
    category: 'deprecated',
    logo: 'models/zai.svg',
  },
  // GLM-5.2 and GLM-5.3 share the same architecture and inference profile, so
  // the selector presents both releases over the existing GLM-5.2 data bucket.
  [Model.GLM_5_2]: {
    label: 'GLM5.2/GLM5.3 744B',
    prefix: 'glm5.2',
    category: 'default',
    logo: 'models/zai.svg',
  },
  [Model.Qwen3_5]: {
    label: 'Qwen3.5 397B',
    prefix: 'qwen3.5',
    category: 'default',
    logo: 'qwen-color.svg',
  },
  // 176B total: a 125B main model plus a 51B n-gram embedding table, 6B active
  // per forward pass, and a separate 4B MTP head the parameter count excludes.
  // Default alongside the other current models, so it appears in the /overview
  // matrix from day zero. The matrix is built from DEFAULT_MODELS, so its
  // fixed-sequence row stays empty until the sweep covers 8k1k as well as the
  // agentic scenario.
  [Model.Qwen3_8_Flash_Next]: {
    label: 'Qwen3.8 Flash Next 176B',
    prefix: 'qwen3.8next',
    category: 'default',
    logo: 'qwen-color.svg',
  },
  [Model.GptOss]: {
    label: 'gpt-oss 120B',
    prefix: 'gptoss',
    category: 'deprecated',
    logo: 'openai.svg',
  },
  [Model.MiniMax_M2_5]: {
    // M2.5 and M2.7 share an architecture — same GLM5/5.1 pattern as Kimi.
    // Superseded by MiniMax M3, so it's deprecated (no longer actively benchmarked).
    label: 'MiniMax M2.5/2.7 230B',
    prefix: 'minimaxm2.5',
    category: 'deprecated',
    logo: 'minimax-color.svg',
  },
  [Model.Llama3_3_70B]: {
    label: 'Llama 3.3 70B Instruct',
    prefix: '70b',
    category: 'deprecated',
    logo: 'meta-color.svg',
  },
  [Model.Llama3_1_70B]: {
    label: 'Llama 3.1 70B Instruct',
    prefix: '',
    category: 'hidden',
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

/**
 * Filename under `public/logos/` for the model creator's logo, or null when the
 * model has no configured logo. Callers render it via `ModelLogo`, which
 * handles dark-mode inversion and load-failure fallback.
 */
export function getModelLogo(model: Model): string | null {
  return MODEL_CONFIG[model]?.logo ?? null;
}

/**
 * Exclusion specs configured for a model (see `exclusion.ts`). Empty when the
 * model has no exclusion rules.
 */
export function getModelExclusion(model: Model | string | null | undefined): ExclusionSpec[] {
  if (!model) return [];
  return MODEL_CONFIG[model as Model]?.exclusion ?? [];
}

/** True if the model has any config-exclusion rule. */
export function hasExclusion(model: Model | string | null | undefined): boolean {
  return getModelExclusion(model).length > 0;
}

/**
 * Pick the chart watermark for a given run state. Unofficial-run charts get
 * the red unofficial-run warning; everything else gets the logo.
 */
export function getChartWatermark(isUnofficialRun = false): 'logo' | 'unofficial' {
  return isUnofficialRun ? 'unofficial' : 'logo';
}

export const MODEL_PREFIX_MAPPING: Record<string, Model> = Object.fromEntries(
  (Object.entries(MODEL_CONFIG) as [Model, (typeof MODEL_CONFIG)[Model]][])
    .filter(([, c]) => c.prefix)
    .map(([m, c]) => [c.prefix, m]),
);

// Specific point-release prefixes must win over family prefixes such as
// `glm5`; precompute once rather than sorting for every artifact.
const MODEL_PREFIXES_LONGEST_FIRST = Object.keys(MODEL_PREFIX_MAPPING).toSorted(
  (a, b) => b.length - a.length,
);

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

export enum Sequence {
  OneK_OneK = '1k/1k',
  OneK_EightK = '1k/8k',
  EightK_OneK = '8k/1k',
  AgenticTraces = 'agentic-traces',
}

/**
 * Top-level scenario kind. Fixed-seq sequences cluster under a single group
 * in the selector; agentic traces sit alongside as their own kind.
 */
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
  /**
   * How this scenario resolves a selection that spans several comparability
   * groups. `clear-all` (the default) deselects every conflicting group so the
   * user opts into one; `keep-sticky` keeps a single group so the chart still
   * renders data on load.
   */
  exclusionPolicy?: ExclusionConflictPolicy;
  /**
   * Comparability group preferred when `keep-sticky` has to choose and the
   * user has no prior selection to honor. Without it the tie-break is
   * alphabetical, which would silently land on a different engine.
   */
  defaultExclusionGroup?: string;
  /**
   * The only engine families guarded on this scenario, narrowing EVERY rule in
   * scope — the model's variant specs as well as this sequence's own. Families
   * outside the list are comparable with everything here. Omit to let each spec
   * decide (by default: every family participates).
   */
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

/** Exclusion specs configured for a sequence. Empty when no rule applies. */
export function getSequenceExclusion(
  sequence: Sequence | string | null | undefined,
): ExclusionSpec[] {
  if (!sequence) return [];
  return SEQUENCE_CONFIG[sequence as Sequence]?.exclusion ?? [];
}

/** Multi-group conflict policy for a sequence. Defaults to `clear-all`. */
export function getSequenceExclusionPolicy(
  sequence: Sequence | string | null | undefined,
): ExclusionConflictPolicy {
  if (!sequence) return 'clear-all';
  return SEQUENCE_CONFIG[sequence as Sequence]?.exclusionPolicy ?? 'clear-all';
}

/** Preferred comparability group for a sequence, or null when unconfigured. */
export function getSequenceDefaultExclusionGroup(
  sequence: Sequence | string | null | undefined,
): string | null {
  if (!sequence) return null;
  return SEQUENCE_CONFIG[sequence as Sequence]?.defaultExclusionGroup ?? null;
}

/**
 * The only engine families guarded on a sequence, or null when the sequence
 * doesn't narrow its rules.
 */
export function getSequenceExclusionFamilies(
  sequence: Sequence | string | null | undefined,
): readonly string[] | null {
  if (!sequence) return null;
  return SEQUENCE_CONFIG[sequence as Sequence]?.exclusionFamilies ?? null;
}

export const SEQUENCE_OPTIONS = Object.keys(SEQUENCE_CONFIG) as Sequence[];

/**
 * Percentile of the latency distribution used for the chart x-axis when
 * viewing agentic traces. Agentic rows carry median/p75/p90/p95/p99/p99.9
 * variants for ttft, ttlt (=e2el), and itl (and intvty derived from itl);
 * p75 and p90 are surfaced in the UI.
 */
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

// ---------------------------------------------------------------------------
// Artifact parsing
// ---------------------------------------------------------------------------

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
