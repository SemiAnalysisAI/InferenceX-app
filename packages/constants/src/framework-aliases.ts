export interface FwEntry {
  /** Human-readable display name used in charts and tooltips */
  label: string;
}

/** Single source of truth for framework metadata. Add new frameworks here. */
export const FW_REGISTRY: Record<string, FwEntry> = {
  atom: { label: 'ATOM¹' },
  'dynamo-sglang': { label: 'Dynamo SGLang' },
  'dynamo-trt': { label: 'Dynamo TRT' },
  'dynamo-vllm': { label: 'Dynamo vLLM' },
  'mori-sglang': { label: 'MoRI SGLang' },
  sglang: { label: 'SGLang' },
  trt: { label: 'TRT' },
  vllm: { label: 'vLLM' },
};

/** Canonical set of framework key strings used across all packages. */
export const FRAMEWORK_KEYS = new Set(Object.keys(FW_REGISTRY));

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
 * Framework label lookup — includes canonical keys and aliases.
 * Aliases resolve to their canonical framework's label.
 */
export const FRAMEWORK_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(FW_REGISTRY).map(([k, v]) => [k, v.label])),
  ...Object.fromEntries(
    Object.entries(FRAMEWORK_ALIASES).map(([alias, { canonical }]) => [
      alias,
      FW_REGISTRY[canonical]?.label ?? canonical,
    ]),
  ),
  mtp: 'MTP',
};

/**
 * Resolve a framework name to its canonical form.
 * Returns the input lowercased if no alias exists.
 */
export function resolveFrameworkAlias(fw: string): string {
  return FRAMEWORK_ALIASES[fw.toLowerCase()]?.canonical ?? fw.toLowerCase();
}

// Sorted longest-first to avoid substring conflicts (e.g. `dynamo-trtllm` before `trtllm`).
const SORTED_ALIASES = Object.entries(FRAMEWORK_ALIASES).toSorted(
  ([a], [b]) => b.length - a.length,
);

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
