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
  // Qwen4-architecture preview, not a Qwen3.5 point release (GatedDeltaNet plus
  // Qwen Sparse Attention, 512 experts), so it gets its own display bucket.
  'qwen3.8next': 'Qwen3.8-Flash-Next',
  'kimik2.5': 'Kimi-K2.5',
  'kimik2.6': 'Kimi-K2.5',
  'kimik2.7-code': 'Kimi-K2.5',
  // K3 is a new architecture (Kimi Delta Attention + Attention Residuals, 2.8T),
  // not a K2 point release, so it gets its own display bucket.
  kimik3: 'Kimi-K3',
  'minimaxm2.5': 'MiniMax-M2.5',
  'minimaxm2.7': 'MiniMax-M2.5',
  minimaxm3: 'MiniMax-M3',
  glm5: 'GLM-5',
  'glm5.1': 'GLM-5',
  'glm5.2': 'GLM-5.2',
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

/**
 * Map a benchmark/availability row to its sequence (scenario) string.
 * - `agentic_traces` rows map to `'agentic-traces'` regardless of isl/osl.
 * - Other rows (today: `single_turn`) fall back to `islOslToSequence`.
 * Returns `null` for rows that can't be classified (e.g. `single_turn` with
 * unmapped isl/osl values).
 */
export function rowToSequence(row: {
  isl: number | null;
  osl: number | null;
  benchmark_type: string;
}): string | null {
  if (row.benchmark_type === 'agentic_traces') return 'agentic-traces';
  if (row.isl === null || row.osl === null) return null;
  return islOslToSequence(row.isl, row.osl);
}

/**
 * Model release dates, keyed by frontend display name (YYYY-MM-DD, UTC).
 *
 * **This is the only release-date table in the repo, and it must stay that way.**
 * These dates were per-entry `releaseDate` fields on `MODEL_ARCHITECTURES`, which
 * is the wrong home for them: a date that captions a diagram is the same fact as
 * a date that anchors a revenue axis, and two copies of one fact drift. Callers
 * go through `getModelReleaseDate`.
 *
 * **What the date means:** the day the weights became publicly downloadable — not
 * the announcement, and not the day InferenceX started benchmarking the model.
 * Inference optimisation cannot begin before the weights are out, so that
 * publication is the honest zero for any "how far has this come since it
 * shipped?" axis. Where a display name groups point releases (`GLM-5` covers
 * both GLM-5 and GLM-5.1), the date is the *earliest* release in the bucket,
 * because that is when the bucket's weights first existed.
 *
 * A date here must never postdate the model's first InferenceX sweep — a model
 * cannot be benchmarked before it exists. That is the check that catches a wrong
 * entry, and it is why these are worth sourcing individually rather than
 * defaulting to whatever `MODELS.md` lists as the date the model was added.
 *
 * Only add an entry you can source, and cite the source in a comment.
 * `getModelReleaseDate` returns null otherwise, so callers fall back to the
 * earliest date they actually have data for.
 */
export const MODEL_RELEASE_DATES: Record<string, string> = {
  // Newest first. `sweep:` is the model's "Date added" from MODELS.md — the first
  // InferenceX benchmark — recorded so the "cannot predate its own weights"
  // invariant above is checkable by eye at review time.
  //
  // Weights published on Hugging Face 2026-07-27 under the Kimi K3 License,
  // eleven days after the 2026-07-16 product launch; the gap was to let vLLM,
  // NVIDIA and AMD prepare day-zero support. sweep: 2026-07-27 — day zero.
  'Kimi-K3': '2026-07-27',
  // Zhipu launched GLM-5.2 on 2026-06-13 via the GLM Coding Plan with MIT
  // weights at zai-org/GLM-5.2; standalone API and provider support followed
  // over the next few days. One source dates the Hugging Face upload 2026-06-16
  // instead, so this is ±3 days — immaterial on a multi-month axis, but it is an
  // announcement-day date rather than a confirmed upload day. sweep: 2026-07-18.
  'GLM-5.2': '2026-06-13',
  // Weights and the official MXFP8 quant live on Hugging Face at
  // MiniMaxAI/MiniMax-M3 by 2026-06-07, under the custom minimax-community
  // license. The 2026-06-01 launch shipped API access only; the arXiv report
  // followed on 2026-06-11. sweep: 2026-06-12.
  'MiniMax-M3': '2026-06-07',
  // V4 Preview — V4-Pro (1.6T total / 49B active) and V4-Flash (284B/13B)
  // published together under MIT on Hugging Face, the API and chat.deepseek.com.
  // V4-Pro-0813 went GA on 2026-08-13, but the Hugging Face repo still hosts the
  // April preview build, so the weights date is unchanged. sweep: 2026-04-25.
  'DeepSeek-V4-Pro': '2026-04-24',
  // Bucket covers GLM-5 and GLM-5.1, so the date is GLM-5's: released
  // 2026-02-13, 744B/40B active, MIT, trained entirely on Huawei Ascend. Sources
  // put the weights in "mid-February" without a day, and reporting clusters on
  // 2026-02-13 and 2026-02-17; the Hugging Face commit history at zai-org/GLM-5
  // is the authority if this ever needs to be exact. GLM-5.1 followed in April
  // 2026. sweep: 2026-03-06.
  'GLM-5': '2026-02-13',
  // Apache 2.0 weights, plus official FP8 and GPTQ-Int4 quants, published at
  // Qwen/Qwen3.5-397B-A17B on 2026-02-16 — the same day InferenceX first swept
  // it. sweep: 2026-02-16 — day zero.
  'Qwen-3.5-397B-A17B': '2026-02-16',
  // Qwen announced the open-sourcing of Qwen3.8-Flash-Next and its FP8 sibling
  // for 23:00 Beijing time on 2026-08-26, which is also the day the SGLang
  // bring-up image tag was published. Some coverage puts the Hugging Face repo
  // live on 08-24; the announced date is the one used here, and either way it
  // precedes the first sweep on 08-27. The model card itself states no date.
  // sweep: 2026-08-27 — day zero.
  'Qwen3.8-Flash-Next': '2026-08-26',
  // Bucket covers M2.5 and M2.7, so the date is M2.5's: announced 2026-02-12
  // with weights on Hugging Face, architecturally unchanged from M2 (230B/10B).
  // Was 2025-10-25, which is M2's launch, not M2.5's — `model-architectures.ts`
  // still points its sourceUrl at MiniMax-M2, which is where that came from.
  // sweep: 2026-02-18.
  'MiniMax-M2.5': '2026-02-12',
  // Weights at moonshotai/Kimi-K2.5 on 2026-01-27 under a modified MIT license,
  // 1.04T total / 32B active. sweep: 2026-02-17.
  'Kimi-K2.5': '2026-01-27',
  // Weights landed on Hugging Face 2025-08-05 under Apache 2.0, alongside
  // gpt-oss-20b — OpenAI's first open-weight release since GPT-2. AWS Bedrock
  // lists the same launch date; the model-card paper followed on 2025-08-08. Was
  // 2025-06-13, which precedes the release by seven weeks and matches no
  // published event. sweep: 2025-09-09.
  'gpt-oss-120b': '2025-08-05',
  // Announced by WeChat post and pushed to Hugging Face on 2025-05-28 under MIT
  // — the date the model name encodes. The model card commit landed a day later,
  // weights first. sweep: 2025-08-13.
  'DeepSeek-R1-0528': '2025-05-28',
  // Meta published Llama 3.3 70B Instruct on 2024-12-06. sweep: 2025-08-12,
  // shipped as workflow templates in the initial repo import.
  'Llama-3.3-70B-Instruct-FP8': '2024-12-06',
  // Llama 3.1 was published 2024-07-23. Hidden in the model selector, but the
  // architecture diagram still captions it. No InferenceX sweep of its own.
  'Llama-3.1-70B-Instruct-FP8-KV': '2024-07-23',
};

/** Release date for a display model name, or null when we have no sourced date. */
export function getModelReleaseDate(displayModel: string): string | null {
  return MODEL_RELEASE_DATES[displayModel] ?? null;
}
