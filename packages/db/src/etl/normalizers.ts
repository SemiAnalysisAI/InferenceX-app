/**
 * Pure normalizer functions and lookup tables shared across all ingest scripts.
 * No DB access, no state — safe to import anywhere.
 */

import {
  DB_MODEL_TO_DISPLAY,
  FRAMEWORK_ALIASES,
  GPU_KEYS,
} from '@semianalysisai/inferencex-constants';

export { GPU_KEYS };

/**
 * Strip known hw suffixes (-trt, -multinode-slurm, -amds, etc.) from a raw
 * hardware identifier and return the canonical lowercase GPU key.
 *
 * @param hw - Raw hardware string from the benchmark artifact (e.g. `"h200-nv"`, `"mi355x-amds"`).
 * @returns The canonical GPU key (e.g. `"h200"`, `"mi355x"`), or `null` if the
 *   stripped base is not in `GPU_KEYS`.
 */
export function hwToGpuKey(hw: string): string | null {
  const base = hw
    .toLowerCase()
    .replace(/_\d+$/, '') // strip runner index suffix (e.g. mi355x-amd_0 → mi355x-amd)
    .replace(/-trt$/, '')
    .replace(/-multinode-slurm$/, '')
    .replace(/-multinode$/, '')
    .replace(/-nvs$/, '')
    .replace(/-disagg$/, '')
    .replace(/-amds$/, '')
    .replace(/-amd$/, '')
    .replace(/-nvd$/, '')
    .replace(/-dgxc-slurm$/, '')
    .replace(/-dgxc$/, '')
    .replace(/-nb$/, '')
    .replace(/-nv$/, '');
  return GPU_KEYS.has(base) ? base : null;
}

/**
 * DB model keys derived from `DB_MODEL_TO_DISPLAY` — the single source of truth.
 * A prefix resolves automatically if it matches a DB key after stripping precision
 * suffixes (e.g. `-fp8`, `-fp4`). Only non-obvious aliases need explicit entries
 * in `PREFIX_ALIASES`.
 */
const DB_MODEL_KEYS = new Set(Object.keys(DB_MODEL_TO_DISPLAY));

/** Precision suffixes that can appear on `infmax_model_prefix` values. */
const PRECISION_SUFFIX = /-(?:fp4|fp8|mxfp4|nvfp4)(?:-.*)?$/i;

/** Explicit aliases for prefixes that don't match any DB key after suffix stripping. */
const PREFIX_ALIASES: Record<string, string> = {
  gptoss: 'gptoss120b',
};

function resolvePrefixToKey(prefix: string): string | null {
  const lower = prefix.toLowerCase();
  if (DB_MODEL_KEYS.has(lower)) return lower;
  if (PREFIX_ALIASES[lower]) return PREFIX_ALIASES[lower];
  const stripped = lower.replace(PRECISION_SUFFIX, '');
  if (DB_MODEL_KEYS.has(stripped)) return stripped;
  return PREFIX_ALIASES[stripped] ?? null;
}

/**
 * Full model path/name → DB model key. Covers all variants seen across the
 * backup history (HuggingFace paths, local mounts, shorthand names, etc.).
 */
export const MODEL_TO_KEY: Record<string, string> = {
  // DeepSeek-R1
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
  // GPT-OSS-120B
  'openai/gpt-oss-120b': 'gptoss120b',
  '/mnt/lustre01/models/gpt-oss-120b': 'gptoss120b',
  // Llama-3.3-70B
  'nvidia/Llama-3.3-70B-Instruct-FP8': 'llama70b',
  'nvidia/Llama-3.3-70B-Instruct-FP4': 'llama70b',
  'amd/Llama-3.3-70B-Instruct-FP8-KV': 'llama70b',
  'amd/Llama-3.3-70B-Instruct-MXFP4-Preview': 'llama70b',
  // Qwen3.5
  'Qwen/Qwen3.5-397B-A17B': 'qwen3.5',
  'Qwen/Qwen3.5-397B-A17B-FP8': 'qwen3.5',
  // Kimi-K2.5
  'moonshotai/Kimi-K2.5': 'kimik2.5',
  // MiniMax-M2.5
  'MiniMaxAI/MiniMax-M2.5': 'minimaxm2.5',
  // GLM-5
  'zai-org/GLM-5-FP8': 'glm5',
};

/**
 * Resolve a DB model key from a raw benchmark row.
 * Prefers `infmax_model_prefix` (canonical, present 2025-12-08+) over the
 * full `model` path, which may be a HuggingFace path, local mount, or shorthand.
 *
 * @param row - Raw benchmark dict from the artifact JSON.
 * @returns The canonical DB model key (e.g. `"dsr1"`, `"llama70b"`), or `null`
 *   if neither field can be resolved.
 */
export function resolveModelKey(row: Record<string, any>): string | null {
  // infmax_model_prefix is the canonical source when present;
  // eval artifacts use model_prefix instead.
  const prefix = row.infmax_model_prefix ?? row.model_prefix;
  if (prefix) {
    const k = resolvePrefixToKey(String(prefix));
    if (k) return k;
  }
  return row.model ? (MODEL_TO_KEY[String(row.model)] ?? null) : null;
}

/**
 * Normalize a raw framework string and derive the disaggregated-inference flag.
 * Handles special cases: `sglang-disagg` is normalized to `mori-sglang` + `disagg=true`;
 * `dynamo-trtllm` is renamed to `dynamo-trt`.
 *
 * @param fw - Raw framework value from the artifact (e.g. `"sglang"`, `"sglang-disagg"` → `"mori-sglang"`).
 * @param disaggField - Raw disagg field from the artifact (boolean or string `"True"`/`"true"`).
 * @returns An object with the canonical `framework` string and the `disagg` boolean flag.
 */
export function normalizeFramework(
  fw: string,
  disaggField: any,
): { framework: string; disagg: boolean } {
  const lower = fw.toLowerCase();
  const alias = FRAMEWORK_ALIASES[lower];
  const disagg =
    alias?.disagg ?? (disaggField === true || disaggField === 'True' || disaggField === 'true');
  return { framework: alias?.canonical ?? lower, disagg };
}

/**
 * Normalize a speculative decoding method to a lowercase string.
 * Absent, empty, or null values are canonicalized to `'none'`.
 *
 * @param spec - Raw `spec_decoding` value from the artifact.
 * @returns Lowercase method name, or `'none'` if absent/empty.
 */
export function normalizeSpecMethod(spec: any): string {
  if (!spec || spec === '') return 'none';
  return String(spec).toLowerCase();
}

/**
 * Coerce a loosely-typed value to a boolean.
 * Accepts JS `true`, the string `'true'`, and the Python-style string `'True'`.
 *
 * @param v - Value to coerce (any type).
 * @returns `true` if the value is one of the recognized truthy forms, `false` otherwise.
 */
export function parseBool(v: any): boolean {
  return v === true || v === 'true' || v === 'True';
}

/**
 * Parse a floating-point number from a loosely-typed value.
 * Handles both numeric and string representations.
 *
 * @param v - Value to parse (number, string, null, or undefined).
 * @returns The parsed number, or `undefined` if the input is null/undefined/NaN.
 */
export function parseNum(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return isNaN(n) ? undefined : n;
}

/**
 * Parse an integer from a loosely-typed value.
 * Strings are parsed with base 10; non-integer numbers are rounded.
 *
 * @param v - Value to parse (number, string, null, or undefined).
 * @returns The parsed integer, or `undefined` if the input is null/undefined/NaN.
 */
export function parseInt2(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'string' ? parseInt(v, 10) : Math.round(Number(v));
  return isNaN(n) ? undefined : n;
}

/**
 * Extract ISL (input sequence length) and OSL (output sequence length) in tokens
 * from a file/directory name that encodes them as `{n}k{m}k`.
 *
 * @example
 * parseIslOsl('Full_Sweep_-_1k1k_12345')            // { isl: 1024, osl: 1024 }
 * parseIslOsl('results_dsr1_1k8k_4305020262.zip')   // { isl: 1024, osl: 8192 }
 *
 * @param name - File or directory name containing the encoded sequence lengths.
 * @returns An object with `isl` and `osl` in tokens, or `null` if no match is found.
 */
export function parseIslOsl(name: string): { isl: number; osl: number } | null {
  const m = name.match(/[_-](\d+)k(\d+)k[_\-.]/i);
  if (!m) return null;
  return { isl: parseInt(m[1], 10) * 1024, osl: parseInt(m[2], 10) * 1024 };
}
