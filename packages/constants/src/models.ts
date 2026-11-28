export type CategoryTag = 'default' | 'experimental' | 'maintenance' | 'deprecated' | 'hidden';

export interface ModelEntry {
  /**
   * DB model keys stored under this model, oldest first. The DB keeps point
   * releases as distinct buckets (`glm5`, `glm5.1`); listing them together is
   * what groups them under one model in the UI. Queries pass the whole list.
   */
  dbKeys: readonly string[];
  /** Name of a point-release bucket where it differs from the model name. */
  releaseNames?: Readonly<Record<string, string>>;
  /** Retired or misspelled names API clients still send for this model. */
  aliases?: readonly string[];
  /** Selector and chart label. */
  label: string;
  /** Label on pages and cards outside the dashboard, where it differs from `label`. */
  pageLabel?: string;
  /** URL segment on the inference, compare, model and per-model dashboard routes. */
  slug: string;
  /** Family-level or older-version slugs that redirect to `slug`. */
  slugAliases?: readonly string[];
  /** Name used in page titles and meta descriptions. */
  seoName: string;
  category: CategoryTag;
  /**
   * Day the weights became publicly downloadable (YYYY-MM-DD, UTC): not the
   * announcement, and not the day InferenceX first benchmarked the model.
   * Inference optimisation cannot begin before the weights are out, so it is
   * the honest zero for a "how far has this come since it shipped?" axis. For a
   * model that groups point releases it is the earliest release, and it must
   * never postdate the model's first InferenceX sweep. Omit it unless it can be
   * sourced, and cite the source; callers then fall back to the earliest date
   * they have data for.
   */
  releaseDate?: string;
  logo?: string;
  openRouterModelId?: string;
  /** Model-specific names for speculative decoding methods (`mtp`). */
  specMethodLabels?: Readonly<Record<string, string>>;
  /** Pending registrations remain inference-selectable, but are not measured fallback choices. */
  requiresObservations?: boolean;
  /** UI visibility only; raw benchmark/API identities remain available. */
  featureGated?: boolean;
}

/**
 * Every model, keyed by display name. Adding a model is one entry here plus its
 * `Model` enum member in the app. Declaration order is the overview's row order
 * within a category; the app's `MODEL_SELECTOR_ORDER` ranks selectors and lists.
 *
 * `sweep:` in a release-date note is the model's "Date added" from MODELS.md,
 * the first InferenceX benchmark, recorded so "cannot predate its own weights"
 * is checkable by eye at review time.
 */
const MODELS = {
  'Muse-Spark-Open': {
    dbKeys: ['musespark'],
    label: 'Muse Spark 1.3/Open 816B',
    slug: 'muse-spark-open',
    seoName: 'Muse Spark 1.3/Open',
    category: 'default',
    // Meta's open-weight launch announcement (not the earlier closed Muse Spark service):
    // https://research.meta.ai/blog/muse-spark-open — October 15, 2026.
    releaseDate: '2026-10-15',
    logo: 'meta-color.svg',
  },
  'DeepSeek-V4-Pro': {
    dbKeys: ['dsv4'],
    // The dashboard label carries the checkpoint date.
    aliases: ['DeepSeek-V4-Pro-0813'],
    label: 'DeepSeek V4 Pro 0813 1.6T',
    slug: 'deepseek-v4',
    seoName: 'DeepSeek V4 Pro',
    category: 'deprecated',
    // V4 Preview — V4-Pro (1.6T total / 49B active) and V4-Flash (284B/13B)
    // published together under MIT on Hugging Face, the API and chat.deepseek.com.
    // V4-Pro-0813 went GA on 2026-08-13, but the Hugging Face repo still hosts the
    // April preview build, so the weights date is unchanged. sweep: 2026-04-25.
    releaseDate: '2026-04-24',
    logo: 'deepseek-color.svg',
    openRouterModelId: 'deepseek/deepseek-v4-pro-0813',
  },
  'DeepSeek-V4.1-Flash': {
    // V4.1-Flash is a separate CED/CSA2 architecture (552B backbone, 8B prefill /
    // 16B decode active), not a V4-Pro point release, so it gets its own bucket.
    dbKeys: ['dsv41flash'],
    label: 'DeepSeek V4.1 Flash 552B',
    slug: 'deepseek-v41-flash',
    seoName: 'DeepSeek V4.1 Flash',
    category: 'default',
    // MIT weights published at deepseek-ai/DeepSeek-V4.1-Flash on 2026-09-10 UTC
    // (HF repo initial commit 02:17Z, tech report 05:34Z). The vLLM bring-up image
    // is tagged `deepseekv41-flash-0909`, a day earlier, but that is the image
    // build date, not the weights date. sweep: 2026-09-10 — day zero.
    releaseDate: '2026-09-10',
    logo: 'deepseek-color.svg',
    openRouterModelId: 'deepseek/deepseek-v4.1-flash',
  },
  'Kimi-K3.1-Pro': {
    // K3.1 Pro (moonshotai/Kimi-K3.1-Pro) is a separate checkpoint from K3, so it
    // gets its own display bucket rather than folding into Kimi-K3.
    dbKeys: ['kimik3.1'],
    aliases: ['Kimi-K3.1'],
    label: 'Kimi K3.1 Pro 2.8T',
    slug: 'kimi-k31-pro',
    seoName: 'Kimi K3.1 Pro',
    category: 'default',
    // Moonshot opened the weights at moonshotai/Kimi-K3.1-Pro on 2026-11-04, the
    // date it set at the 2026-10-23 API launch. The repo's only commit is dated
    // 2026-11-02 04:13Z, before it went public. sweep: 2026-11-04 (InferenceX#4803)
    // — day zero.
    releaseDate: '2026-11-04',
    logo: 'kimi-color.svg',
    openRouterModelId: 'moonshotai/kimi-k3.1-pro',
  },
  'Kimi-K3': {
    // K3 is a new architecture (Kimi Delta Attention + Attention Residuals, 2.8T),
    // not a K2 point release, so it gets its own display bucket.
    dbKeys: ['kimik3'],
    label: 'Kimi K3 2.8T',
    slug: 'kimi-k3',
    seoName: 'Kimi K3',
    category: 'deprecated',
    // Weights published on Hugging Face 2026-07-27 under the Kimi K3 License,
    // eleven days after the 2026-07-16 product launch; the gap was to let vLLM,
    // NVIDIA and AMD prepare day-zero support. sweep: 2026-07-27 — day zero.
    releaseDate: '2026-07-27',
    logo: 'kimi-color.svg',
    openRouterModelId: 'moonshotai/kimi-k3',
    specMethodLabels: { mtp: 'DSpark' },
  },
  'Kimi-K2.5': {
    dbKeys: ['kimik2.5', 'kimik2.6', 'kimik2.7-code'],
    releaseNames: { 'kimik2.6': 'Kimi-K2.6', 'kimik2.7-code': 'Kimi-K2.7-Code' },
    label: 'Kimi K2.5/2.6/2.7-Code 1T',
    slug: 'kimi-k26',
    slugAliases: ['kimi', 'kimi-k25'],
    seoName: 'Kimi K2.6',
    category: 'deprecated',
    // Weights at moonshotai/Kimi-K2.5 on 2026-01-27 under a modified MIT license,
    // 1.04T total / 32B active. sweep: 2026-02-17.
    releaseDate: '2026-01-27',
    logo: 'kimi-color.svg',
    openRouterModelId: 'moonshotai/kimi-k2.7-code',
  },
  'MiniMax-M3': {
    dbKeys: ['minimaxm3'],
    label: 'MiniMax M3 428B',
    slug: 'minimax-m3',
    seoName: 'MiniMax M3',
    category: 'deprecated',
    // Weights and the official MXFP8 quant live on Hugging Face at
    // MiniMaxAI/MiniMax-M3 by 2026-06-07, under the custom minimax-community
    // license. The 2026-06-01 launch shipped API access only; the arXiv report
    // followed on 2026-06-11. sweep: 2026-06-12.
    releaseDate: '2026-06-07',
    logo: 'minimax-color.svg',
    openRouterModelId: 'minimax/minimax-m3',
    specMethodLabels: { mtp: 'M3 EAGLE' },
  },
  'MiniMax-M3.1-Flash': {
    // M3.1-Flash keeps M3's 428B/23B MoE but ships NVFP4 experts, a QAT NVFP4 KV
    // cache and a built-in DSpark drafter, so it gets its own display bucket.
    dbKeys: ['minimaxm31flash'],
    label: 'MiniMax M3.1 Flash 428B',
    slug: 'minimax-m31-flash',
    seoName: 'MiniMax M3.1 Flash',
    category: 'default',
    // Weights published at MiniMaxAI/MiniMax-M3.1-Flash on 2026-10-23 UTC (HF
    // "Init" commit 03:37Z), the same day as the vLLM day-0 blog post.
    // sweep: 2026-10-23 — day zero.
    releaseDate: '2026-10-23',
    logo: 'minimax-color.svg',
    openRouterModelId: 'minimax/minimax-m3.1-flash',
    specMethodLabels: { mtp: 'DSpark' },
  },
  'DeepSeek-R1-0528': {
    dbKeys: ['dsr1'],
    label: 'DeepSeek R1 0528 671B',
    slug: 'deepseek-r1',
    slugAliases: ['deepseek'],
    seoName: 'DeepSeek R1',
    category: 'maintenance',
    // Announced by WeChat post and pushed to Hugging Face on 2025-05-28 under MIT
    // — the date the model name encodes. The model card commit landed a day later,
    // weights first. sweep: 2025-08-13.
    releaseDate: '2025-05-28',
    logo: 'deepseek-color.svg',
    openRouterModelId: 'deepseek/deepseek-r1-0528',
  },
  'GLM-5': {
    dbKeys: ['glm5', 'glm5.1'],
    releaseNames: { 'glm5.1': 'GLM-5.1' },
    label: 'GLM5/5.1 744B',
    slug: 'glm-5-1',
    slugAliases: ['glm', 'glm-5'],
    seoName: 'GLM-5',
    category: 'deprecated',
    // Bucket covers GLM-5 and GLM-5.1, so the date is GLM-5's: released
    // 2026-02-13, 744B/40B active, MIT, trained entirely on Huawei Ascend. Sources
    // put the weights in "mid-February" without a day, and reporting clusters on
    // 2026-02-13 and 2026-02-17; the Hugging Face commit history at zai-org/GLM-5
    // is the authority if this ever needs to be exact. GLM-5.1 followed in April
    // 2026. sweep: 2026-03-06.
    releaseDate: '2026-02-13',
    logo: 'zai-color.svg',
    openRouterModelId: 'z-ai/glm-5.1',
  },
  'GLM-5.2': {
    // GLM-5.3 (zai-org/GLM-5.3) is a distinct checkpoint that InferenceX reports
    // under its own `glm5.3` prefix (InferenceX#3330); it shares the GLM-5.2
    // display bucket the same way glm5.1 folds into GLM-5.
    dbKeys: ['glm5.2', 'glm5.3'],
    releaseNames: { 'glm5.3': 'GLM-5.3' },
    label: 'GLM5.2/GLM5.3 744B',
    // Cards and compare pages name the bucket's current release only.
    pageLabel: 'GLM 5.3 744B',
    slug: 'glm-5-3',
    slugAliases: ['glm-5-2'],
    seoName: 'GLM-5.3',
    category: 'default',
    // Zhipu launched GLM-5.2 on 2026-06-13 via the GLM Coding Plan with MIT
    // weights at zai-org/GLM-5.2; standalone API and provider support followed
    // over the next few days. One source dates the Hugging Face upload 2026-06-16
    // instead, so this is ±3 days — immaterial on a multi-month axis, but it is an
    // announcement-day date rather than a confirmed upload day. sweep: 2026-07-18.
    releaseDate: '2026-06-13',
    logo: 'zai-color.svg',
    openRouterModelId: 'z-ai/glm-5.3',
  },
  'Qwen-3.5-397B-A17B': {
    dbKeys: ['qwen3.5'],
    // The display name has a hyphen after Qwen; the model card does not.
    aliases: ['Qwen3.5-397B-A17B'],
    label: 'Qwen3.5 397B',
    slug: 'qwen-3-5',
    slugAliases: ['qwen'],
    seoName: 'Qwen3.5',
    category: 'default',
    // Apache 2.0 weights, plus official FP8 and GPTQ-Int4 quants, published at
    // Qwen/Qwen3.5-397B-A17B on 2026-02-16 — the same day InferenceX first swept
    // it. sweep: 2026-02-16 — day zero.
    releaseDate: '2026-02-16',
    logo: 'qwen-color.svg',
    openRouterModelId: 'qwen/qwen3.5-397b-a17b',
  },
  'GLM-5.3-Flash': {
    // Experimental AgentX producer identity (InferenceX#4718 / #4714), not
    // the historical non-Flash glm5.3 bucket under GLM-5.2.
    dbKeys: ['glm5.3flash'],
    label: 'GLM 5.3 Flash',
    slug: 'glm-5-3-flash',
    seoName: 'GLM-5.3-Flash',
    category: 'default',
    logo: 'zai-color.svg',
    requiresObservations: true,
    featureGated: true,
  },
  'Qwen3.8-Flash-Next': {
    // Qwen4-architecture preview, not a Qwen3.5 point release (GatedDeltaNet plus
    // Qwen Sparse Attention, 512 experts), so it gets its own display bucket.
    dbKeys: ['qwen3.8next'],
    label: 'Qwen3.8 Flash Next 176B',
    slug: 'qwen-3-8-flash-next',
    seoName: 'Qwen3.8-Flash-Next',
    category: 'default',
    // Qwen announced the open-sourcing of Qwen3.8-Flash-Next and its FP8 sibling
    // for 23:00 Beijing time on 2026-08-26, which is also the day the SGLang
    // bring-up image tag was published. Some coverage puts the Hugging Face repo
    // live on 08-24; the announced date is the one used here, and either way it
    // precedes the first sweep on 08-27. The model card itself states no date.
    // sweep: 2026-08-27 — day zero.
    releaseDate: '2026-08-26',
    logo: 'qwen-color.svg',
    openRouterModelId: 'qwen/qwen3.8-flash',
  },
  'Qwen3.8-27B': {
    // Qwen3.8-27B is the dense 27B member of the Qwen3.8 family (hybrid GDN linear
    // attention, 48 of 64 layers), served bf16 with the RadixArk DSpark drafter.
    dbKeys: ['qwen3.827b'],
    label: 'Qwen3.8 27B',
    slug: 'qwen-3-8-27b',
    seoName: 'Qwen3.8-27B',
    category: 'experimental',
    // Apache-2.0 weights at Qwen/Qwen3.8-27B: the Hugging Face repo was created
    // 2026-08-05T08:22Z (its first commit) and last modified 2026-08-14.
    // sweep: 2026-09-18 (InferenceX#3260).
    releaseDate: '2026-08-05',
    logo: 'qwen-color.svg',
    openRouterModelId: 'qwen/qwen3.8-27b',
  },
  'Qwen3.8-27B-Eager': {
    // The Qwen3.8-27B checkpoint served with CUDA graphs disabled (--enforce-eager
    // on target and drafter); it keeps its own DB bucket and display name so the
    // two serving modes never collapse onto one chart point.
    dbKeys: ['qwen3.827beager'],
    label: 'Qwen3.8 27B (eager)',
    slug: 'qwen-3-8-27b-eager',
    seoName: 'Qwen3.8-27B Eager',
    category: 'experimental',
    releaseDate: '2026-08-05',
    logo: 'qwen-color.svg',
    openRouterModelId: 'qwen/qwen3.8-27b',
  },
  'gpt-oss-120b': {
    dbKeys: ['gptoss120b'],
    label: 'gpt-oss 120B',
    slug: 'gptoss-120b',
    slugAliases: ['gptoss'],
    seoName: 'gpt-oss-120b',
    category: 'deprecated',
    // Weights landed on Hugging Face 2025-08-05 under Apache 2.0, alongside
    // gpt-oss-20b — OpenAI's first open-weight release since GPT-2. AWS Bedrock
    // lists the same launch date; the model-card paper followed on 2025-08-08.
    // sweep: 2025-09-09.
    releaseDate: '2025-08-05',
    logo: 'openai.svg',
    openRouterModelId: 'openai/gpt-oss-120b',
  },
  'MiniMax-M2.5': {
    dbKeys: ['minimaxm2.5', 'minimaxm2.7'],
    releaseNames: { 'minimaxm2.7': 'MiniMax-M2.7' },
    label: 'MiniMax M2.5/2.7 230B',
    slug: 'minimax-m27',
    slugAliases: ['minimax', 'minimax-m25'],
    seoName: 'MiniMax M2.7',
    category: 'deprecated',
    // Bucket covers M2.5 and M2.7, so the date is M2.5's: announced 2026-02-12
    // with weights on Hugging Face, architecturally unchanged from M2 (230B/10B).
    // sweep: 2026-02-18.
    releaseDate: '2026-02-12',
    logo: 'minimax-color.svg',
    openRouterModelId: 'minimax/minimax-m2.7',
  },
  'Llama-3.3-70B-Instruct-FP8': {
    dbKeys: ['llama70b'],
    aliases: ['Llama-3.3-70B-Instruct'],
    label: 'Llama 3.3 70B Instruct',
    slug: 'llama-3-3-70b',
    slugAliases: ['llama'],
    seoName: 'Llama 3.3 70B',
    category: 'deprecated',
    // Meta published Llama 3.3 70B Instruct on 2024-12-06. sweep: 2025-08-12,
    // shipped as workflow templates in the initial repo import.
    releaseDate: '2024-12-06',
    logo: 'meta-color.svg',
    openRouterModelId: 'meta-llama/llama-3.3-70b-instruct',
  },
  'Llama-3.1-70B-Instruct-FP8-KV': {
    // No InferenceX sweep of its own, so no DB bucket and no model pages; the
    // architecture diagram still captions it.
    dbKeys: [],
    label: 'Llama 3.1 70B Instruct',
    slug: 'llama-3-1-70b',
    seoName: 'Llama 3.1 70B',
    category: 'hidden',
    // Llama 3.1 was published 2024-07-23.
    releaseDate: '2024-07-23',
    logo: 'meta-color.svg',
    openRouterModelId: 'meta-llama/llama-3.1-70b-instruct',
  },
} as const satisfies Record<string, ModelEntry>;

export type ModelName = keyof typeof MODELS;
export type DbModelKey = (typeof MODELS)[ModelName]['dbKeys'][number];

export const MODEL_REGISTRY: Record<ModelName, ModelEntry> = MODELS;

/** DB model key → display name. Several keys can share one name; see `ModelEntry.dbKeys`. */
export const DB_MODEL_TO_DISPLAY: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_REGISTRY).flatMap(([name, entry]) =>
    entry.dbKeys.map((dbKey) => [dbKey, name]),
  ),
);

/**
 * Display name → its DB model keys. Callers querying benchmark data pass the
 * full array so every bucket is included; comparing one row's `model` against
 * an entry uses `.includes()`, not `===`.
 */
export const DISPLAY_MODEL_TO_DB: Record<string, string[]> = Object.fromEntries(
  Object.entries(MODEL_REGISTRY)
    .filter(([, entry]) => entry.dbKeys.length > 0)
    .map(([name, entry]) => [name, [...entry.dbKeys]]),
);

/** DB model key → the name of that bucket's own release (`kimik2.6` is Kimi-K2.6). */
export const DB_MODEL_RELEASE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_REGISTRY).flatMap(([name, entry]) =>
    entry.dbKeys.map((dbKey) => [dbKey, entry.releaseNames?.[dbKey] ?? name]),
  ),
);

/** Release date for a display model name, or null when we have no sourced date. */
export function getModelReleaseDate(displayModel: string): string | null {
  return MODEL_REGISTRY[displayModel as ModelName]?.releaseDate ?? null;
}

/** `infmax_model_prefix` values that differ from their DB key after the precision suffix is stripped. */
export const MODEL_PREFIX_ALIASES: Record<string, DbModelKey> = {
  gptoss: 'gptoss120b',
  dsv4pro: 'dsv4',
  'kimik2.7': 'kimik2.7-code',
};

/**
 * Raw model identifiers seen in benchmark artifacts (HF paths, mount paths) → DB
 * key, for rows that carry no usable prefix. Add only paths a real run reported.
 */
export const MODEL_TO_KEY: Record<string, DbModelKey> = {
  'nvidia/DeepSeek-R1-0528-FP4-V2': 'dsr1',
  'nvidia/DeepSeek-R1-0528-FP4-v2': 'dsr1',
  'nvidia/DeepSeek-R1-0528-FP4': 'dsr1',
  'deepseek-ai/DeepSeek-R1-0528': 'dsr1',
  'deepseek-ai/DeepSeek-R1': 'dsr1',
  'amd/DeepSeek-R1-0528-MXFP4': 'dsr1',
  'amd/DeepSeek-R1-0528-MXFP4-Preview': 'dsr1',
  '/mnt/lustre01/models/deepseek-r1-0528-fp4-v2': 'dsr1',
  '/models/DeepSeek-R1': 'dsr1',
  '/models/DeepSeek-R1-0528-MXFP4-Preview': 'dsr1',
  'DeepSeek-R1-0528': 'dsr1',
  'deepseek-r1-0528': 'dsr1',
  'deepseek-r1-0528-fp4-v2': 'dsr1',
  'deepseek-r1-0528-nvfp4-v2': 'dsr1',
  'dsr1-0528-fp8': 'dsr1',
  'dsr1-0528-nvfp4-v2': 'dsr1',
  'dsr1-fp8': 'dsr1',
  'openai/gpt-oss-120b': 'gptoss120b',
  '/mnt/lustre01/models/gpt-oss-120b': 'gptoss120b',
  'nvidia/Llama-3.3-70B-Instruct-FP8': 'llama70b',
  'nvidia/Llama-3.3-70B-Instruct-FP4': 'llama70b',
  'amd/Llama-3.3-70B-Instruct-FP8-KV': 'llama70b',
  'amd/Llama-3.3-70B-Instruct-MXFP4-Preview': 'llama70b',
  'Qwen/Qwen3.5-397B-A17B': 'qwen3.5',
  'Qwen/Qwen3.5-397B-A17B-FP8': 'qwen3.5',
  'Qwen/Qwen3.8-Flash-Next-FP8': 'qwen3.8next',
  'RadixArk/Qwen3.8-Flash-Next-NVFP4': 'qwen3.8next',
  'Qwen/Qwen3.8-27B': 'qwen3.827b',
  'moonshotai/Kimi-K2.5': 'kimik2.5',
  'moonshotai/Kimi-K2.6': 'kimik2.6',
  'moonshotai/Kimi-K2.7-Code': 'kimik2.7-code',
  'amd/Kimi-K2.7-Code-MXFP4': 'kimik2.7-code',
  'moonshotai/Kimi-K3': 'kimik3',
  'moonshotai/Kimi-K3.1-Pro': 'kimik3.1',
  'MiniMaxAI/MiniMax-M2.5': 'minimaxm2.5',
  'MiniMaxAI/MiniMax-M3': 'minimaxm3',
  'MiniMaxAI/MiniMax-M3.1-Flash': 'minimaxm31flash',
  'zai-org/GLM-5-FP8': 'glm5',
  'amd/GLM-5.1-MXFP4': 'glm5.1',
  'zai-org/GLM-5.2-FP8': 'glm5.2',
  'zai-org/GLM-5.3': 'glm5.3',
  'zai-org/GLM-5.3-Flash': 'glm5.3flash',
  'nvidia/GLM-5.3-Flash-NVFP4': 'glm5.3flash',
  'deepseek-ai/DeepSeek-V4-Pro': 'dsv4',
  'deepseek-ai/DeepSeek-V4.1-Flash': 'dsv41flash',
  'amd/Muse-Spark-Open-816B-A42B-Quark-MXFP4': 'musespark',
  'meta-models/Muse-Spark-Open-816B-A42B-NVFP4': 'musespark',
};
