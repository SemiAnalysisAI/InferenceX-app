export interface FwEntry {
  label: string;
}

export const FW_REGISTRY: Record<string, FwEntry> = {
  atom: { label: 'ATOM¹' },
  'coreweave-vera-rubin': { label: 'Vera Rubin' },
  'dynamo-sglang': { label: 'Dynamo SGLang' },
  'dynamo-trt': { label: 'Dynamo TRTLLM' },
  'dynamo-vllm': { label: 'Dynamo vLLM' },
  'llmd-vllm': { label: 'llm-d vLLM' },
  'mooncake-atom': { label: 'Mooncake ATOMesh¹' },
  'mori-sglang': { label: 'MoRI SGLang' },
  'vllm-disagg': { label: 'MoRI vLLM' },
  'rubin-july': { label: 'July' },
  sglang: { label: 'SGLang' },
  tilert: { label: 'TileRT' },
  teacup: { label: 'Teacup' },
  trt: { label: 'TRTLLM' },
  vllm: { label: 'vLLM' },
};

export const FRAMEWORK_KEYS = new Set(Object.keys(FW_REGISTRY));

export const SPEC_METHOD_KEYS = new Set(['mtp', 'none']);

export const FRAMEWORK_ALIASES: Record<string, { canonical: string; disagg?: boolean }> = {
  'atom-disagg': { canonical: 'mooncake-atom', disagg: true },
  'sglang-disagg': { canonical: 'mori-sglang', disagg: true },
  trtllm: { canonical: 'trt' },
  'dynamo-trtllm': { canonical: 'dynamo-trt' },
};

export const FRAMEWORK_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(FW_REGISTRY).map(([k, v]) => [k, v.label])),
  ...Object.fromEntries(
    Object.entries(FRAMEWORK_ALIASES).map(([alias, { canonical }]) => [
      alias,
      FW_REGISTRY[canonical]?.label ?? canonical,
    ]),
  ),
  mtp: 'MTP',
  aiperf: 'AIPerf',
};

export const MODEL_SPEC_METHOD_LABELS: Record<string, Record<string, string>> = {
  'MiniMax-M3': { mtp: 'M3 EAGLE' },
  'Kimi-K3': { mtp: 'DSpark' },
};

export function resolveFrameworkPartLabel(model: string | undefined, part: string): string {
  return (
    (model ? MODEL_SPEC_METHOD_LABELS[model]?.[part] : undefined) ??
    FRAMEWORK_LABELS[part] ??
    part.toUpperCase()
  );
}

export function resolveFrameworkAlias(fw: string): string {
  return FRAMEWORK_ALIASES[fw.toLowerCase()]?.canonical ?? fw.toLowerCase();
}

const SORTED_ALIASES = Object.entries(FRAMEWORK_ALIASES).toSorted(
  ([a], [b]) => b.length - a.length,
);

export function resolveFrameworkAliasesInString(s: string): string {
  let result = s;
  for (const [alias, { canonical }] of SORTED_ALIASES) {
    result = result.replaceAll(alias, canonical);
  }
  return result;
}
