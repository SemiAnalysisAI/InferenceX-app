import {
  DB_MODEL_TO_DISPLAY,
  FRAMEWORK_ALIASES,
  GPU_KEYS,
  GPU_RUNNER_ALIASES,
} from '@semianalysisai/inferencex-constants';

export { GPU_KEYS };

export function hwToGpuKey(hw: string): string | null {
  const raw = hw.toLowerCase().split(':').pop()!.split('-')[0];
  const base = GPU_RUNNER_ALIASES[raw] ?? raw;
  return GPU_KEYS.has(base) ? base : null;
}

const DB_MODEL_KEYS = new Set(Object.keys(DB_MODEL_TO_DISPLAY));

const PRECISION_SUFFIX = /-(?:fp4|fp8|mxfp4|nvfp4)(?:-.*)?$/iu;

const PREFIX_ALIASES: Record<string, string> = {
  gptoss: 'gptoss120b',
  dsv4pro: 'dsv4',
  'kimik2.7': 'kimik2.7-code',
};

function resolvePrefixToKey(prefix: string): string | null {
  const lower = prefix.toLowerCase();
  if (DB_MODEL_KEYS.has(lower)) return lower;
  if (PREFIX_ALIASES[lower]) return PREFIX_ALIASES[lower];
  const stripped = lower.replace(PRECISION_SUFFIX, '');
  if (DB_MODEL_KEYS.has(stripped)) return stripped;
  return PREFIX_ALIASES[stripped] ?? null;
}

export const MODEL_TO_KEY: Record<string, string> = {
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
  'XiaomiMiMo/MiMo-V2.6-Flash-RL': 'mimov2.6flash',
};

export function resolveModelKey(row: Record<string, any>): string | null {
  const prefix = row.infmax_model_prefix ?? row.model_prefix;
  if (prefix) {
    const k = resolvePrefixToKey(String(prefix));
    if (k) return k;
  }
  return row.model ? (MODEL_TO_KEY[String(row.model)] ?? null) : null;
}

export function normalizeFramework(
  fw: string,
  disaggField: unknown,
): { framework: string; disagg: boolean } {
  const lower = fw.toLowerCase();
  const alias = FRAMEWORK_ALIASES[lower];
  const canonical = alias?.canonical ?? lower;
  const explicitDisagg = parseOptionalBool(disaggField);
  const disagg =
    alias?.disagg ??
    explicitDisagg ??
    (canonical.startsWith('mori-') || canonical.startsWith('dynamo-'));
  return { framework: canonical, disagg };
}

const PRECISION_ALIASES: Record<string, string> = {
  nvfp4: 'fp4',
  mxfp4: 'fp4',
};

export function normalizePrecision(raw: string): string {
  const lower = raw.toLowerCase();
  return PRECISION_ALIASES[lower] ?? lower;
}

export function normalizeSpecMethod(spec: unknown): string {
  if (!spec || spec === '') return 'none';
  return String(spec).toLowerCase();
}

export function parseOptionalBool(v: unknown): boolean | undefined {
  if (v === true || v === 'true' || v === 'True') return true;
  if (v === false || v === 'false' || v === 'False') return false;
  return undefined;
}

export function parseBool(v: unknown): boolean {
  return parseOptionalBool(v) ?? false;
}

export function parseNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return isNaN(n) ? undefined : n;
}

export function parseInt2(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'string' ? parseInt(v, 10) : Math.round(Number(v));
  return isNaN(n) ? undefined : n;
}

const ISL_OSL_PATTERN = /[_-](?<isl>\d+)k(?<osl>\d+)k[_\-.]/iu;

export function parseIslOsl(name: string): { isl: number; osl: number } | null {
  const m = name.match(ISL_OSL_PATTERN);
  if (!m) return null;
  return { isl: parseInt(m[1], 10) * 1024, osl: parseInt(m[2], 10) * 1024 };
}
