import { engineLabel } from './engines';
import type { VideoPoint } from './metrics';

/**
 * Runtime optimizations a run can declare, and whether each changes the generated
 * video. Lossless ones compute the same result faster; lossy ones skip or approximate
 * work (cross-step caching, sparse attention), so their speed is not comparable with
 * an exact run. The registry, not the submitter, decides which is which.
 */
const OPTIMIZATIONS: readonly { key: string; label: string; lossy: boolean }[] = [
  { key: 'kernel-fusion', label: 'Kernel fusion', lossy: false },
  { key: 'cuda-graph', label: 'CUDA Graph', lossy: false },
  { key: 'cache-dit', label: 'Cache-DiT', lossy: true },
  { key: 'teacache', label: 'TeaCache', lossy: true },
  { key: 'first-block-cache', label: 'FirstBlockCache', lossy: true },
  { key: 'sol-attn', label: 'Sol-Attn', lossy: true },
  { key: 'subblock-sparse-attn', label: 'Subblock sparse attention', lossy: true },
];

const entry = (key: string) => OPTIMIZATIONS.find((optimization) => optimization.key === key);

/** Runs recorded before optimizations were declared ran each engine's stock configuration. */
export const optimizationsOf = (p: Pick<VideoPoint, 'results'>): readonly string[] =>
  p.results?.optimizations ?? [];

/** An optimization outside the registry counts as lossy until it is reviewed. */
const lossy = (key: string) => entry(key)?.lossy !== false;

export const isLossy = (p: Pick<VideoPoint, 'results'>): boolean => optimizationsOf(p).some(lossy);

/** "Sol-Attn + FirstBlockCache"; null when every declared optimization is lossless. */
export function lossyLabel(optimizations: readonly string[]): string | null {
  const labels = optimizations.filter(lossy).map((key) => entry(key)?.label ?? key);
  return labels.length > 0 ? labels.join(' + ') : null;
}

/** "NVIDIA Sol Engine · Sol-Attn + FirstBlockCache"; the engine alone for an exact run. */
export function runtimeLabel(
  engine: string | null,
  optimizations: readonly string[],
): string | null {
  return (
    [engine && engineLabel(engine), lossyLabel(optimizations)].filter(Boolean).join(' · ') || null
  );
}
