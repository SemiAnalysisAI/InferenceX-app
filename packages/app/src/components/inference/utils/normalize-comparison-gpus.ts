/** Maximum distinct hwKeys for GPU comparison (URL, presets, UI slots). */
export const MAX_COMPARISON_GPUS = 4;

/** Up to {@link MAX_COMPARISON_GPUS} distinct hwKeys, preserving order. */
export function normalizeComparisonGpuList(gpus: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of gpus) {
    if (!g || seen.has(g)) continue;
    seen.add(g);
    out.push(g);
    if (out.length >= MAX_COMPARISON_GPUS) break;
  }
  return out;
}
