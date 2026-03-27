/** Canonical set of framework key strings used across all packages. */
export const FRAMEWORK_KEYS = new Set([
  'atom',
  'dynamo-sglang',
  'dynamo-trt',
  'mori-sglang',
  'sglang',
  'trt',
  'vllm',
]);

/** Canonical set of speculative decoding method strings. */
export const SPEC_METHOD_KEYS = new Set(['mtp', 'none']);

/**
 * Canonical mapping of legacy/renamed framework identifiers.
 * Single source of truth — consumed by ETL, frontend, and changelog processing.
 */
export const FRAMEWORK_ALIASES: Record<string, { canonical: string; disagg?: boolean }> = {
  'sglang-disagg': { canonical: 'mori-sglang', disagg: true },
  trtllm: { canonical: 'trt' },
  'dynamo-trtllm': { canonical: 'dynamo-trt' },
};

/**
 * Resolve a framework name to its canonical form.
 * Returns the input lowercased if no alias exists.
 */
export function resolveFrameworkAlias(fw: string): string {
  return FRAMEWORK_ALIASES[fw.toLowerCase()]?.canonical ?? fw.toLowerCase();
}

// Sorted longest-first to avoid substring conflicts (e.g. `dynamo-trtllm` before `trtllm`).
const SORTED_ALIASES = Object.entries(FRAMEWORK_ALIASES).sort(([a], [b]) => b.length - a.length);

/**
 * Replace all legacy framework substrings in a string with their canonical form.
 * Useful for normalizing compound keys like config keys (e.g. `dsr1-fp8-mi355x-sglang-disagg`).
 */
export function resolveFrameworkAliasesInString(s: string): string {
  let result = s;
  for (const [alias, { canonical }] of SORTED_ALIASES) {
    result = result.replaceAll(alias, canonical);
  }
  return result;
}
