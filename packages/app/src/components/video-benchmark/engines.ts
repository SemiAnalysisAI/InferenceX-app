/** Serving engines in display order. */
const ENGINES = [
  { key: 'sglang', label: 'SGLang' },
  { key: 'vllm-omni', label: 'vLLM-Omni' },
  { key: 'sol-engine', label: 'NVIDIA Sol Engine' },
] as const;

/** A listed engine. The results chart gives each one a point shape. */
export type EngineKey = (typeof ENGINES)[number]['key'];

const entry = (key: string | null) => ENGINES.find((engine) => engine.key === key);

export const engineLabel = (key: string): string => entry(key)?.label ?? key;

/** Registry order; unlisted engines after listed ones, a missing engine last. */
export function engineSort(key: string | null): number {
  if (key === null) return ENGINES.length + 1;
  const index = ENGINES.findIndex((engine) => engine.key === key);
  return index === -1 ? ENGINES.length : index;
}
