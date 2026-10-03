import { parallelismLabel } from '@/components/inference/utils/parallelism-label';
import { frameworkFamily } from '@/lib/framework-family';
import { isKvOffloadEnabled } from '@/lib/kv-offload';

import type { GPUDataPoint } from './types';
import type { GroupMeta, OverlayGroupMeta } from './useThroughputData';

/**
 * Prefix-cache reuse: where a configuration's prompt tokens came from at each
 * concurrency — HBM (the chip's own KV cache), the host tier behind it, or
 * nowhere (recomputed) — as shares of all prompt tokens.
 *
 * Every bar is one measured row. The host segment is the CPU-offload rate
 * (HiCache and its peers report host-memory hits there) and falls back to the
 * router's external rate only when a row reports no CPU figure. This differs
 * from `measuredCacheHitRate`, which prices cached input conservatively by
 * preferring the external figure: that guards a revenue number against
 * double-counting, whereas this chart names the tier a token was served from,
 * and on SGLang rows the host figure is the CPU one. Both tiers are never
 * summed here, so the bar cannot double count.
 *
 * TensorRT-LLM with offload enabled reports HBM and host as one combined figure
 * (the point summary labels it "Combined chip + CPU"), so those rows draw one
 * reused segment rather than inventing a split the data does not have.
 */

export type CacheTier = 'hbm' | 'host' | 'unreused';

/** Tier colors, fixed rather than per-hardware: the bars compare tiers, not chips. */
export const CACHE_TIER_COLORS: Record<CacheTier, string> = {
  hbm: '#3f9fe0',
  host: '#f2b13a',
  unreused: '#5f6672',
};

export interface CacheShare {
  /** Prompt tokens served from the chip's KV cache, 0..1. */
  hbm: number;
  /** Prompt tokens served from the host tier (CPU offload, else the router's external cache), 0..1. */
  host: number;
  /** Prompt tokens recomputed, 0..1; the three shares sum to 1. */
  unreused: number;
  /** The runtime folded host hits into the HBM figure, so `hbm` is both tiers. */
  combined: boolean;
  hostSource: 'cpu' | 'external' | null;
  /** Infinite-cache ceiling from the trace itself, when the row carries one. */
  theoretical: number | null;
  /** Reported tiers summed before clamping; above 1 the runtime over-reported. */
  reportedTotal: number;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Prompt-token shares for one row, or null when the runtime reported no tier at all. */
export function cacheShareOf(point: GPUDataPoint): CacheShare | null {
  const row = point.sourceRow;
  if (!row) return null;
  const m = row.metrics;
  const gpu = m.server_gpu_cache_hit_rate;
  const external = m.server_external_cache_hit_rate;
  const cpu = m.server_cpu_cache_hit_rate;
  if (!finite(gpu) && !finite(external) && !finite(cpu)) return null;

  const offloadOn = isKvOffloadEnabled({
    kv_offloading: typeof m.kv_offloading === 'string' ? m.kv_offloading : null,
    offload_mode: row.offload_mode,
  });
  const combined = offloadOn && frameworkFamily(row.framework) === 'trt';

  const hostSource: CacheShare['hostSource'] = combined
    ? null
    : finite(cpu)
      ? 'cpu'
      : finite(external)
        ? 'external'
        : null;
  const hostRaw = hostSource === 'cpu' ? cpu! : hostSource === 'external' ? external! : 0;
  const hbm = clamp01(finite(gpu) ? gpu : 0);
  const host = Math.max(0, Math.min(1 - hbm, hostRaw));

  return {
    hbm,
    host,
    unreused: Math.max(0, 1 - hbm - host),
    combined,
    hostSource,
    theoretical: finite(m.theoretical_cache_hit_rate)
      ? clamp01(m.theoretical_cache_hit_rate)
      : null,
    reportedTotal: (finite(gpu) ? gpu : 0) + hostRaw,
  };
}

export interface CacheReuseSeries {
  /** `official`, or `run:<index>` for an unofficial run. */
  key: string;
  label: string;
  runIndex?: number;
}

export interface CacheReuseBar {
  key: string;
  concurrency: number;
  seriesKey: string;
  runIndex?: number;
  point: GPUDataPoint;
  share: CacheShare;
}

export interface CacheReuseResult {
  series: CacheReuseSeries[];
  /** Ascending, the union across series. */
  concurrencies: number[];
  bars: CacheReuseBar[];
  /** Rows of the chosen configuration that reported no cache tier, per series. */
  unmeasured: { seriesKey: string; concurrency: number; point: GPUDataPoint }[];
  anyCombined: boolean;
  /** Official recipes of the configuration, for the recipe selector. */
  recipes: CacheReuseRecipe[];
  /** The recipe the official series plots; null when there are no official rows. */
  recipe: string | null;
}

export interface CacheReuseInput {
  official: readonly GPUDataPoint[];
  /** Every overlay group; only those on the same hardware (and precision) are read. */
  overlay?: Record<string, GPUDataPoint[]>;
  overlayMeta?: Record<string, OverlayGroupMeta>;
  overlayLabels?: Record<number, string>;
  /** The chosen configuration, matched against overlay group metadata. */
  config: GroupMeta;
  /**
   * The serving recipe plotted, a `recipeKeyOf` value. Absent or unknown means
   * the official recipe with the most tiered rows.
   */
  recipe?: string;
}

/**
 * One serving recipe inside a configuration group. A group is hardware +
 * framework (+ precision) only, so the same concurrency can carry several
 * recipes — 4×DEP8 with KV offload off and on, 2×TP16 — each with its own cache
 * behaviour. Bars from different recipes are not comparable along one sweep.
 */
export interface CacheReuseRecipe {
  key: string;
  label: string;
  rows: number;
  tiered: number;
}

/**
 * Everything that makes two rows of one group different deployments at the same
 * concurrency: parallelism, worker layout, disaggregation, speculative decoding,
 * KV offload, and the recipe fingerprint when the producer stamps one.
 */
export function recipeKeyOf(point: GPUDataPoint): string {
  const row = point.sourceRow;
  if (!row) return `tp${point.tp}`;
  return [
    row.disagg ? 'disagg' : 'agg',
    row.is_multinode ? 'mn' : 'sn',
    `p${row.prefill_num_workers}x${row.prefill_tp}/${row.prefill_ep}/${row.prefill_dp_attention ? 'dpa' : '-'}`,
    `d${row.decode_num_workers}x${row.decode_tp}/${row.decode_ep}/${row.decode_dp_attention ? 'dpa' : '-'}`,
    `g${row.num_prefill_gpu}+${row.num_decode_gpu}`,
    `spec-${row.spec_method || 'none'}`,
    `offload-${row.offload_mode || 'off'}`,
    row.recipe_fingerprint ? `fp-${row.recipe_fingerprint}` : '',
  ].join('|');
}

export function recipeLabelOf(point: GPUDataPoint): string {
  const row = point.sourceRow;
  if (!row) return `TP${point.tp}`;
  const decodeOnly = !row.disagg && row.decode_tp > 0;
  const parallel = parallelismLabel({
    tp: decodeOnly ? row.decode_tp : row.prefill_tp,
    ep: decodeOnly ? row.decode_ep : row.prefill_ep,
    dpAttention: decodeOnly ? row.decode_dp_attention : row.prefill_dp_attention,
    disagg: row.disagg,
    isMultinode: row.is_multinode,
    prefillTp: row.prefill_tp,
    prefillEp: row.prefill_ep,
    prefillDpAttention: row.prefill_dp_attention,
    prefillNumWorkers: row.prefill_num_workers,
    decodeTp: row.decode_tp,
    decodeEp: row.decode_ep,
    decodeDpAttention: row.decode_dp_attention,
    decodeNumWorkers: row.decode_num_workers,
  });
  const workers = !row.disagg && row.decode_num_workers > 1 ? `${row.decode_num_workers}×` : '';
  const bareTp = [...parallel].every((c) => c >= '0' && c <= '9');
  const parts = [`${workers}${bareTp ? `TP${parallel}` : parallel}`];
  if (row.spec_method && row.spec_method !== 'none') parts.push(row.spec_method.toUpperCase());
  const offloadOn = isKvOffloadEnabled({
    kv_offloading: typeof row.metrics.kv_offloading === 'string' ? row.metrics.kv_offloading : null,
    offload_mode: row.offload_mode,
  });
  parts.push(offloadOn ? 'KV offload' : 'no offload');
  if (row.recipe_fingerprint) parts.push(row.recipe_fingerprint.slice(0, 7));
  return parts.join(' · ');
}

/** Recipes in a group, most tiered rows first, then most rows, then label. */
export function cacheReuseRecipes(points: readonly GPUDataPoint[]): CacheReuseRecipe[] {
  const byKey = new Map<string, CacheReuseRecipe>();
  for (const point of points) {
    const key = recipeKeyOf(point);
    const entry = byKey.get(key) ?? { key, label: recipeLabelOf(point), rows: 0, tiered: 0 };
    entry.rows += 1;
    if (cacheShareOf(point)) entry.tiered += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].toSorted(
    (a, b) => b.tiered - a.tiered || b.rows - a.rows || a.label.localeCompare(b.label),
  );
}

/** The requested recipe when the points carry it, else the best-covered one. */
export function resolveRecipe(
  points: readonly GPUDataPoint[],
  requested: string | undefined,
): string | null {
  const recipes = cacheReuseRecipes(points);
  if (requested && recipes.some((r) => r.key === requested)) return requested;
  return recipes[0]?.key ?? null;
}

/**
 * The stacked bars for one configuration: its official rows, plus each loaded
 * unofficial run's rows on the same hardware as their own series, so a branch
 * can be read against the published curve concurrency by concurrency.
 */
export function buildCacheReuse(input: CacheReuseInput): CacheReuseResult {
  // A configuration that exists only in a loaded run has no official slot;
  // listing one anyway would halve every run bar beside an empty column.
  const recipes = cacheReuseRecipes(input.official);
  const recipe = resolveRecipe(input.official, input.recipe);
  // One recipe per series. A run keeps the plotted recipe when it measured it,
  // and otherwise its own best-covered recipe, so a branch that tries a new
  // layout still draws without mixing layouts within its bars.
  const ofRecipe = (points: readonly GPUDataPoint[], wanted: string | null) => {
    const key = points.some((p) => recipeKeyOf(p) === wanted)
      ? wanted
      : resolveRecipe(points, undefined);
    return points.filter((p) => recipeKeyOf(p) === key);
  };
  const official = ofRecipe(input.official, recipe);
  const series: CacheReuseSeries[] =
    official.length > 0 ? [{ key: 'official', label: 'official' }] : [];
  const perSeries = new Map<string, readonly GPUDataPoint[]>([['official', official]]);

  const runIndexes = new Set<number>();
  for (const [groupKey, meta] of Object.entries(input.overlayMeta ?? {})) {
    if (meta.hwKey !== input.config.hwKey) continue;
    if (input.config.precision !== undefined && meta.precision !== input.config.precision) continue;
    const points = input.overlay?.[groupKey];
    if (!points || points.length === 0) continue;
    runIndexes.add(meta.runIndex);
    const key = `run:${meta.runIndex}`;
    perSeries.set(key, [...(perSeries.get(key) ?? []), ...points]);
  }
  for (const runIndex of runIndexes) {
    const key = `run:${runIndex}`;
    perSeries.set(key, ofRecipe(perSeries.get(key) ?? [], recipe));
  }
  for (const runIndex of [...runIndexes].toSorted((a, b) => a - b)) {
    series.push({
      key: `run:${runIndex}`,
      label: `✕ ${input.overlayLabels?.[runIndex] ?? `run ${runIndex + 1}`}`,
      runIndex,
    });
  }

  const bars: CacheReuseBar[] = [];
  const unmeasured: CacheReuseResult['unmeasured'] = [];
  const concurrencies = new Set<number>();
  for (const entry of series) {
    // One bar per concurrency: within one recipe the latest official row is
    // unique per concurrency; a run that repeats one keeps its first row.
    const seen = new Set<number>();
    for (const point of perSeries.get(entry.key) ?? []) {
      if (seen.has(point.concurrency)) continue;
      seen.add(point.concurrency);
      concurrencies.add(point.concurrency);
      const share = cacheShareOf(point);
      if (!share) {
        unmeasured.push({ seriesKey: entry.key, concurrency: point.concurrency, point });
        continue;
      }
      bars.push({
        key: `${point.concurrency}|${entry.key}`,
        concurrency: point.concurrency,
        seriesKey: entry.key,
        ...(entry.runIndex === undefined ? {} : { runIndex: entry.runIndex }),
        point,
        share,
      });
    }
  }

  return {
    series,
    concurrencies: [...concurrencies].toSorted((a, b) => a - b),
    bars,
    unmeasured,
    anyCombined: bars.some((b) => b.share.combined),
    recipes,
    recipe,
  };
}

export function tieredRowCount(points: readonly GPUDataPoint[]): number {
  return points.filter((p) => cacheShareOf(p) !== null).length;
}

/**
 * The configuration the page opens on: the one with the most rows reporting
 * cache tiers, preferring an SGLang-family config on a tie because SGLang
 * separates HBM from host hits. Null when no group reports any tier.
 */
export function defaultCacheReuseGroup(
  groups: Record<string, GPUDataPoint[]>,
  meta: Record<string, GroupMeta>,
): string | null {
  let best: { key: string; tiered: number; sglang: boolean } | null = null;
  for (const [key, points] of Object.entries(groups)) {
    const tiered = tieredRowCount(points);
    if (tiered === 0) continue;
    const sglang = frameworkFamily(meta[key]?.hwKey ?? key) === 'sglang';
    if (
      best === null ||
      tiered > best.tiered ||
      (tiered === best.tiered && sglang && !best.sglang) ||
      (tiered === best.tiered && sglang === best.sglang && key.localeCompare(best.key) < 0)
    ) {
      best = { key, tiered, sglang };
    }
  }
  return best?.key ?? null;
}

export const formatShare = (share: number): string => `${(share * 100).toFixed(1)}%`;
