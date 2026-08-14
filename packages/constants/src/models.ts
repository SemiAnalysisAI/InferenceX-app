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
  'DeepSeek-R1-0528': '2025-05-28',
  'Llama-3.3-70B-Instruct-FP8': '2024-12-06',
  'Llama-3.1-70B-Instruct-FP8-KV': '2024-07-23',
  'gpt-oss-120b': '2025-06-13',
  'Kimi-K2.5': '2026-01-27',
  'Kimi-K3': '2026-06-13',
  'MiniMax-M2.5': '2025-10-25',
  'DeepSeek-V4-Pro': '2026-06-08',
};

/** Release date for a display model name, or null when we have no sourced date. */
export function getModelReleaseDate(displayModel: string): string | null {
  return MODEL_RELEASE_DATES[displayModel] ?? null;
}
