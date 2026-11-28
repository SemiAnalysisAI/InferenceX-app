import {
  DB_MODEL_TO_DISPLAY,
  FRAMEWORK_ALIASES,
  GPU_KEYS,
  GPU_RUNNER_ALIASES,
  MODEL_PREFIX_ALIASES,
  MODEL_TO_KEY,
  PRECISION_ALIASES,
} from '@semianalysisai/inferencex-constants';

export { GPU_KEYS };

export function hwBaseKey(hw: string): string {
  const raw = hw.toLowerCase().split(':').pop()!.split('-')[0];
  return GPU_RUNNER_ALIASES[raw] ?? raw;
}

export function hwToGpuKey(hw: string): string | null {
  const base = hwBaseKey(hw);
  return GPU_KEYS.has(base) ? base : null;
}

const DB_MODEL_KEYS = new Set(Object.keys(DB_MODEL_TO_DISPLAY));

const PRECISION_SUFFIX = /-(?:fp4|fp8|mxfp4|nvfp4)(?:-.*)?$/iu;

function resolvePrefixToKey(prefix: string): string | null {
  const lower = prefix.toLowerCase();
  if (DB_MODEL_KEYS.has(lower)) return lower;
  if (MODEL_PREFIX_ALIASES[lower]) return MODEL_PREFIX_ALIASES[lower];
  const stripped = lower.replace(PRECISION_SUFFIX, '');
  if (DB_MODEL_KEYS.has(stripped)) return stripped;
  return MODEL_PREFIX_ALIASES[stripped] ?? null;
}

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
