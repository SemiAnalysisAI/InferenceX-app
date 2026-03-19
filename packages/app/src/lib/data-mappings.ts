export enum Model {
  Llama3_3_70B = 'Llama-3.3-70B-Instruct-FP8',
  Llama3_1_70B = 'Llama-3.1-70B-Instruct-FP8-KV',
  DeepSeek_R1 = 'DeepSeek-R1-0528',
  GptOss = 'gpt-oss-120b',
  Qwen3_5 = 'Qwen-3.5-397B-A17B',
  Kimi_K2_5 = 'Kimi-K2.5',
  MiniMax_M2_5 = 'MiniMax-M2.5',
  GLM_5 = 'GLM-5',
}

export type ModelCategory = 'default' | 'experimental' | 'deprecated' | 'hidden';

/**
 * Single source of truth for model metadata. To add a model:
 * 1. Add an enum member to `Model` above.
 * 2. Add one entry here.
 */
const MODEL_CONFIG: Record<Model, { label: string; prefix: string; category: ModelCategory }> = {
  [Model.Llama3_3_70B]: { label: 'Llama 3.3 70B Instruct', prefix: '70b', category: 'deprecated' },
  [Model.Llama3_1_70B]: { label: 'Llama 3.1 70B Instruct', prefix: '', category: 'hidden' },
  [Model.DeepSeek_R1]: { label: 'DeepSeek R1 0528', prefix: 'dsr1', category: 'default' },
  [Model.GptOss]: { label: 'gpt-oss 120B', prefix: 'gptoss', category: 'default' },
  [Model.Qwen3_5]: { label: 'Qwen 3.5 397B-A17B', prefix: 'qwen3.5', category: 'experimental' },
  [Model.Kimi_K2_5]: { label: 'Kimi K2.5 1T', prefix: 'kimik2.5', category: 'experimental' },
  [Model.MiniMax_M2_5]: {
    label: 'MiniMax M2.5 230B-A10B',
    prefix: 'minimaxm2.5',
    category: 'experimental',
  },
  [Model.GLM_5]: { label: 'GLM 5', prefix: 'glm5', category: 'experimental' },
};

function modelsByCategory(cat: ModelCategory): ReadonlySet<Model> {
  return new Set(
    (Object.entries(MODEL_CONFIG) as [Model, (typeof MODEL_CONFIG)[Model]][])
      .filter(([, c]) => c.category === cat)
      .map(([m]) => m),
  );
}

export const MODEL_OPTIONS = (Object.keys(MODEL_CONFIG) as Model[])
  .filter((m) => MODEL_CONFIG[m].category !== 'hidden')
  .sort((a, b) => a.localeCompare(b));

export const DEFAULT_MODELS: ReadonlySet<Model> = modelsByCategory('default');
export const DEPRECATED_MODELS: ReadonlySet<Model> = modelsByCategory('deprecated');
export const EXPERIMENTAL_MODELS: ReadonlySet<Model> = modelsByCategory('experimental');

export function isModelDefault(model: Model): boolean {
  return DEFAULT_MODELS.has(model);
}
export function isModelDeprecated(model: Model): boolean {
  return DEPRECATED_MODELS.has(model);
}
export function isModelExperimental(model: Model): boolean {
  return EXPERIMENTAL_MODELS.has(model);
}

export function getModelLabel(model: Model): string {
  return MODEL_CONFIG[model]?.label ?? model;
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

const SEQUENCE_CONFIG: Record<Sequence, { label: string; compact: string }> = {
  [Sequence.OneK_OneK]: { label: '1K / 1K', compact: '1k1k' },
  [Sequence.OneK_EightK]: { label: '1K / 8K', compact: '1k8k' },
  [Sequence.EightK_OneK]: { label: '8K / 1K', compact: '8k1k' },
};

export const SEQUENCE_OPTIONS = Object.keys(SEQUENCE_CONFIG) as Sequence[];

export function getSequenceLabel(sequence: Sequence): string {
  return SEQUENCE_CONFIG[sequence]?.label ?? sequence;
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
  FP8 = 'fp8',
  BF16 = 'bf16',
  INT4 = 'int4',
}

const PRECISION_CONFIG: Record<Precision, { label: string }> = {
  [Precision.FP4]: { label: 'FP4' },
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
