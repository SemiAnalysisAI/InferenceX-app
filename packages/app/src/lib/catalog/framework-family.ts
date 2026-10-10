/**
 * Map a raw framework string (for example `dynamo-trt`, `mori-sglang`, or
 * `mooncake-atom`) to its serving-engine family.
 */
export function frameworkFamily(framework: string | undefined): string | undefined {
  if (!framework) return undefined;
  const normalized = framework.toLowerCase();
  if (normalized.includes('vllm')) return 'vllm';
  if (normalized.includes('sglang')) return 'sglang';
  if (normalized.includes('trt')) return 'trt';
  if (normalized.includes('atom')) return 'atom';
  return undefined;
}
