import type { ShapeKey } from '@/lib/charts/chart-rendering';

export interface EngineStyle {
  /** Point shape on the results chart. */
  shape: ShapeKey;
  /** SVG stroke-dasharray of the engine's frontier line. */
  dasharray: string;
}

/** Serving engines in display order. Color stays the hardware's; the engine sets shape and dash. */
const ENGINES: readonly ({ key: string; label: string } & EngineStyle)[] = [
  { key: 'sglang', label: 'SGLang', shape: 'circle', dasharray: 'none' },
  { key: 'vllm-omni', label: 'vLLM-Omni', shape: 'diamond', dasharray: '6 4' },
];

/** An engine outside the registry, or none recorded, still gets a style no listed engine uses. */
const UNLISTED: EngineStyle = { shape: 'square', dasharray: '2 3' };

const entry = (key: string | null) => ENGINES.find((engine) => engine.key === key);

export const engineLabel = (key: string): string => entry(key)?.label ?? key;

/** Registry order; unlisted engines after listed ones, a missing engine last. */
export function engineSort(key: string | null): number {
  if (key === null) return ENGINES.length + 1;
  const index = ENGINES.findIndex((engine) => engine.key === key);
  return index === -1 ? ENGINES.length : index;
}

export const engineStyle = (key: string | null): EngineStyle => entry(key) ?? UNLISTED;
