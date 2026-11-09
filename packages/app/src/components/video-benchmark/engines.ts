import type { ShapeKey } from '@/lib/charts/chart-rendering';

/** Serving engines in display order. Color stays the hardware's; the engine sets the point shape. */
const ENGINES: readonly { key: string; label: string; shape: ShapeKey }[] = [
  { key: 'sglang', label: 'SGLang', shape: 'circle' },
  { key: 'vllm-omni', label: 'vLLM-Omni', shape: 'diamond' },
  { key: 'sol-engine', label: 'NVIDIA Sol Engine', shape: 'triangle' },
];

/** An engine outside the registry, or none recorded, still gets a shape no listed engine uses. */
const UNLISTED: ShapeKey = 'square';

const entry = (key: string | null) => ENGINES.find((engine) => engine.key === key);

export const engineLabel = (key: string): string => entry(key)?.label ?? key;

/** Registry order; unlisted engines after listed ones, a missing engine last. */
export function engineSort(key: string | null): number {
  if (key === null) return ENGINES.length + 1;
  const index = ENGINES.findIndex((engine) => engine.key === key);
  return index === -1 ? ENGINES.length : index;
}

export const engineShape = (key: string | null): ShapeKey => entry(key)?.shape ?? UNLISTED;
