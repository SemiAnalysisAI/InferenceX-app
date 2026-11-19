import { nearestByInteractivity } from './powerx-compare-at';

/**
 * The PowerX ranking at Compare at: one row per GPU config, read at the point of its drawn
 * line nearest the Compare at interactivity, ranked lowest first (energy and power: lower
 * is better), with Δ vs the best visible row. The ranking is also the legend: a hidden row
 * stays listed, struck through, at the bottom.
 */

/** The ranking header's Show choice, mapped onto Optimal Only and Best per SKU. */
export type PowerXShow = 'best' | 'configs' | 'points';
export const POWERX_SHOWS = ['best', 'configs', 'points'] as const satisfies readonly PowerXShow[];

/** All points when Optimal Only is off; otherwise Best per GPU or every config's line. */
export function powerXShowFor(optimalOnly: boolean, bestPerSku: boolean): PowerXShow {
  if (!optimalOnly) return 'points';
  return bestPerSku ? 'best' : 'configs';
}

/** The Optimal Only and Best per SKU values a Show choice writes. */
export function powerXShowState(show: PowerXShow): { optimalOnly: boolean; bestPerSku: boolean } {
  return { optimalOnly: show !== 'points', bestPerSku: show === 'best' };
}

export interface PowerXRankingPoint {
  x: number;
  y: number;
}

export interface PowerXRankingInput<P extends PowerXRankingPoint> {
  key: string;
  /** Switched off in the legend state. */
  hidden: boolean;
  /** Under a GPU role, a config with no per-pool line: listed, dimmed, never valued. */
  aggregated: boolean;
  /** The line the row reads (All GPUs, or the role's pool). */
  points: readonly P[];
  /** Prefill vs decode: each pool's line, shown beside the all-GPU value. */
  pools?: { prefill: readonly P[]; decode: readonly P[] };
}

export interface PowerXRankingRow<P extends PowerXRankingPoint> {
  key: string;
  /** 1-based among the visible rows that have a value; null for the rest. */
  rank: number | null;
  /** The point the row reads; for an aggregated row the nearest drawn all-GPU point, if any. */
  point: P | null;
  /** The ranked value; null for aggregated rows and rows with no point. */
  value: number | null;
  /** 'best', '+34%', or null (hidden, aggregated or no value). */
  delta: string | null;
  hidden: boolean;
  aggregated: boolean;
  pools: { prefill: P | null; decode: P | null } | null;
}

/** Δ vs best: 'best' for the lowest value, otherwise the rounded excess, at least +1%. */
export function powerXDeltaVsBest(value: number, best: number): string {
  if (!(best > 0) || value - best <= Math.abs(best) * 1e-9) return 'best';
  return `+${Math.max(1, Math.round((value / best - 1) * 100))}%`;
}

const nearest = <P extends PowerXRankingPoint>(points: readonly P[], at: number) =>
  nearestByInteractivity(points, at, (point) => point.x);

export function powerXRankingRows<P extends PowerXRankingPoint>(
  inputs: readonly PowerXRankingInput<P>[],
  at: number,
): PowerXRankingRow<P>[] {
  const rows = inputs.map((input, order) => {
    const point = nearest(input.points, at);
    const value =
      input.aggregated || !point || !Number.isFinite(point.y) ? null : (point.y as number);
    const pools =
      input.pools && !input.aggregated
        ? { prefill: nearest(input.pools.prefill, at), decode: nearest(input.pools.decode, at) }
        : null;
    return { input, order, point, value, pools };
  });
  rows.sort(
    (a, b) =>
      Number(a.input.hidden) - Number(b.input.hidden) ||
      Number(a.value === null) - Number(b.value === null) ||
      Number(a.input.aggregated) - Number(b.input.aggregated) ||
      (a.value ?? 0) - (b.value ?? 0) ||
      a.order - b.order,
  );
  const ranked = rows.filter((row) => !row.input.hidden && row.value !== null);
  const best = ranked.length > 0 ? Math.min(...ranked.map((row) => row.value as number)) : null;
  let rank = 0;
  return rows.map(({ input, point, value, pools }) => {
    const counted = !input.hidden && value !== null;
    if (counted) rank++;
    return {
      key: input.key,
      rank: counted ? rank : null,
      point,
      value,
      delta: counted && best !== null ? powerXDeltaVsBest(value, best) : null,
      hidden: input.hidden,
      aggregated: input.aggregated,
      pools,
    };
  });
}

/**
 * The next legend selection after a ranking row click: a visible row hides, a hidden one
 * shows. The last visible row cannot hide (an empty selection reads as the default).
 */
export function powerXRankingToggle(
  active: ReadonlySet<string>,
  key: string,
): { action: 'hide' | 'show' | 'none'; next: Set<string> } {
  if (active.has(key)) {
    if (active.size <= 1) return { action: 'none', next: new Set(active) };
    const next = new Set(active);
    next.delete(key);
    return { action: 'hide', next };
  }
  return { action: 'show', next: new Set([...active, key]) };
}

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
