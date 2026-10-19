export const DB_MODEL_TO_DISPLAY: Record<string, string> = {
  dsr1: 'DeepSeek-R1-0528',
  gptoss120b: 'gpt-oss-120b',
  llama70b: 'Llama-3.3-70B-Instruct-FP8',
  'qwen3.5': 'Qwen-3.5-397B-A17B',
  'qwen3.8next': 'Qwen3.8-Flash-Next',
  'qwen3.827b': 'Qwen3.8-27B',
  'qwen3.827beager': 'Qwen3.8-27B-Eager',
  'kimik2.5': 'Kimi-K2.5',
  'kimik2.6': 'Kimi-K2.5',
  'kimik2.7-code': 'Kimi-K2.5',
  kimik3: 'Kimi-K3',
  'minimaxm2.5': 'MiniMax-M2.5',
  'minimaxm2.7': 'MiniMax-M2.5',
  minimaxm3: 'MiniMax-M3',
  glm5: 'GLM-5',
  'glm5.1': 'GLM-5',
  'glm5.2': 'GLM-5.2',
  'glm5.3': 'GLM-5.2',
  dsv4: 'DeepSeek-V4-Pro',
  dsv41flash: 'DeepSeek-V4.1-Flash',
  musespark: 'Muse-Spark-Open',
};

export const DISPLAY_MODEL_TO_DB: Record<string, string[]> = Object.entries(
  DB_MODEL_TO_DISPLAY,
).reduce<Record<string, string[]>>((acc, [dbKey, displayName]) => {
  (acc[displayName] ??= []).push(dbKey);
  return acc;
}, {});

export function sequenceToIslOsl(seq: string): { isl: number; osl: number } | null {
  const map: Record<string, { isl: number; osl: number }> = {
    '1k/1k': { isl: 1024, osl: 1024 },
    '1k/8k': { isl: 1024, osl: 8192 },
    '8k/1k': { isl: 8192, osl: 1024 },
  };
  return map[seq] ?? null;
}

export function islOslToSequence(isl: number, osl: number): string | null {
  const map: Record<string, string> = {
    '1024_1024': '1k/1k',
    '1024_8192': '1k/8k',
    '8192_1024': '8k/1k',
  };
  return map[`${isl}_${osl}`] ?? null;
}

export function rowToSequence(row: {
  isl: number | null;
  osl: number | null;
  benchmark_type: string;
}): string | null {
  if (row.benchmark_type === 'agentic_traces') return 'agentic-traces';
  if (row.isl === null || row.osl === null) return null;
  return islOslToSequence(row.isl, row.osl);
}

export const MODEL_RELEASE_DATES: Record<string, string> = {
  'DeepSeek-V4.1-Flash': '2026-09-10',
  'Kimi-K3': '2026-07-27',
  'GLM-5.2': '2026-06-13',
  'MiniMax-M3': '2026-06-07',
  'DeepSeek-V4-Pro': '2026-04-24',
  'GLM-5': '2026-02-13',
  'Qwen-3.5-397B-A17B': '2026-02-16',
  'Qwen3.8-Flash-Next': '2026-08-26',
  'Qwen3.8-27B': '2026-08-05',
  'Qwen3.8-27B-Eager': '2026-08-05',
  'MiniMax-M2.5': '2026-02-12',
  'Kimi-K2.5': '2026-01-27',
  'gpt-oss-120b': '2025-08-05',
  'DeepSeek-R1-0528': '2025-05-28',
  'Llama-3.3-70B-Instruct-FP8': '2024-12-06',
  'Llama-3.1-70B-Instruct-FP8-KV': '2024-07-23',
};

export function getModelReleaseDate(displayModel: string): string | null {
  return MODEL_RELEASE_DATES[displayModel] ?? null;
}
