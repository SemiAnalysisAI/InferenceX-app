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
  'minimaxm2.5': 'MiniMax-M2.5',
  'minimaxm2.7': 'MiniMax-M2.5',
  glm5: 'GLM-5',
  'glm5.1': 'GLM-5',
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
