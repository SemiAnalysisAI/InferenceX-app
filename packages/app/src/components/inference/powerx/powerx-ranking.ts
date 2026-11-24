/**
 * PowerX line naming: the short GPU name and framework tag the Energy and Power charts'
 * direct line labels and the Over time ranking rows use.
 */

/** Short GPU name for a direct line label: the hardware key's base, e.g. GB300. */
export function powerXShortGpuName(hwKey: string): string {
  return (hwKey.split('_')[0] ?? hwKey).toUpperCase();
}

/** The framework from a hardware label suffix: '(Dynamo vLLM)' → 'Dynamo vLLM'. */
export function powerXFrameworkName(suffix: string): string {
  return suffix.replaceAll(/^\(|\)$/gu, '').trim();
}

/** A short framework tag from a hardware label suffix: '(Dynamo vLLM)' → 'vLLM'. */
export function powerXFrameworkTag(suffix: string): string {
  const bare = powerXFrameworkName(suffix);
  return bare.replace(/^Dynamo\s+/u, '').trim() || bare;
}

export interface PowerXDirectLabelSeries {
  key: string;
  hwKey: string;
  /** The framework tag appended only when another visible series shares the GPU. */
  frameworkTag: string;
  /** ' prefill' / ' decode' for a pool line, '' for the all-GPU line. */
  poolTag: string;
}

/** Direct label text per series: the short GPU name, plus framework only on a shared GPU. */
export function powerXDirectLabelTexts(
  series: readonly PowerXDirectLabelSeries[],
): Map<string, string> {
  const byGpuPool = new Map<string, Set<string>>();
  for (const entry of series) {
    const id = `${powerXShortGpuName(entry.hwKey)}|${entry.poolTag}`;
    const keys = byGpuPool.get(id) ?? new Set<string>();
    keys.add(entry.hwKey);
    byGpuPool.set(id, keys);
  }
  const texts = new Map<string, string>();
  for (const entry of series) {
    const gpu = powerXShortGpuName(entry.hwKey);
    const shared = (byGpuPool.get(`${gpu}|${entry.poolTag}`)?.size ?? 0) > 1;
    const tag = shared && entry.frameworkTag ? ` ${entry.frameworkTag}` : '';
    texts.set(entry.key, `${gpu}${tag}${entry.poolTag}`);
  }
  return texts;
}

export interface PowerXLabelBox {
  key: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Nudges direct labels apart vertically: labels that overlap in x keep at least `gap`
 * px between baselines, pushed down first, then pulled back up from the plot bottom.
 */
export function nudgePowerXLabels<T extends PowerXLabelBox>(
  labels: readonly T[],
  { gap = 15, minY, maxY }: { gap?: number; minY: number; maxY: number },
): T[] {
  const placed = labels.map((label) => ({ ...label })).sort((a, b) => a.y - b.y);
  const overlapX = (a: T, b: T) => a.x < b.x + b.width + 4 && b.x < a.x + a.width + 4;
  for (let i = 1; i < placed.length; i++) {
    for (let j = 0; j < i; j++) {
      if (overlapX(placed[i], placed[j]) && placed[i].y - placed[j].y < gap) {
        placed[i].y = placed[j].y + gap;
      }
    }
  }
  for (let i = placed.length - 1; i >= 0; i--) {
    if (placed[i].y > maxY) placed[i].y = maxY;
    for (let j = i + 1; j < placed.length; j++) {
      if (overlapX(placed[i], placed[j]) && placed[j].y - placed[i].y < gap) {
        placed[i].y = placed[j].y - gap;
      }
    }
  }
  for (const label of placed) label.y = Math.max(minY, label.y);
  return placed;
}
