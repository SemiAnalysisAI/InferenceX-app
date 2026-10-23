import { parallelismLabel } from '@/components/inference/utils/parallelism-label';
import type { BenchmarkRow } from '@/lib/api/api';
import { frameworkFamily } from '@/lib/catalog/framework-family';
import { isKvOffloadEnabled } from '@/lib/benchmarks/kv-offload';

import type { GPUDataPoint } from './types';
import type { GroupMeta, OverlayGroupMeta } from './useThroughputData';

export type CacheTier = 'hbm' | 'host' | 'unreused';

export const CACHE_TIER_COLORS: Record<CacheTier, string> = {
  hbm: '#3f9fe0',
  host: '#f2b13a',
  unreused: '#5f6672',
};

export interface CacheShare {
  hbm: number;
  host: number;
  unreused: number;
  combined: boolean;
  hostSource: 'cpu' | 'external' | null;
  theoretical: number | null;
  reportedTotal: number;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

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
  concurrencies: number[];
  bars: CacheReuseBar[];
  unmeasured: { seriesKey: string; concurrency: number; point: GPUDataPoint }[];
  anyCombined: boolean;
  recipes: CacheReuseRecipe[];
  recipe: string | null;
}

export interface CacheReuseInput {
  official: readonly GPUDataPoint[];
  overlay?: Record<string, GPUDataPoint[]>;
  overlayMeta?: Record<string, OverlayGroupMeta>;
  overlayLabels?: Record<number, string>;
  config: GroupMeta;
  recipe?: string;
}

export interface CacheReuseRecipe {
  key: string;
  label: string;
  rows: number;
  tiered: number;
}

export function recipeKeyOf(point: GPUDataPoint): string {
  const row = point.sourceRow;
  if (!row) return `tp${point.tp}`;
  return cacheReuseRecipeKey(row);
}

export function cacheReuseRecipeKey(
  row: Pick<
    BenchmarkRow,
    | 'disagg'
    | 'is_multinode'
    | 'prefill_tp'
    | 'prefill_ep'
    | 'prefill_dp_attention'
    | 'prefill_num_workers'
    | 'decode_tp'
    | 'decode_ep'
    | 'decode_dp_attention'
    | 'decode_num_workers'
    | 'num_prefill_gpu'
    | 'num_decode_gpu'
    | 'recipe_fingerprint'
    | 'spec_method'
  > & { offload_mode: string | null; metrics?: BenchmarkRow['metrics'] },
): string {
  const dwdp = row.metrics?.prefill_dwdp_size ?? 1;
  return [
    row.disagg ? 'disagg' : 'agg',
    row.is_multinode ? 'mn' : 'sn',
    `p${row.prefill_num_workers}x${row.prefill_tp}/${row.prefill_ep}/${row.prefill_dp_attention ? 'dpa' : '-'}`,
    `d${row.decode_num_workers}x${row.decode_tp}/${row.decode_ep}/${row.decode_dp_attention ? 'dpa' : '-'}`,
    `g${row.num_prefill_gpu}+${row.num_decode_gpu}`,
    ...(dwdp > 1 ? [`dwdp-${dwdp}`] : []),
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
    prefillDwdp: row.metrics.prefill_dwdp_size,
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

export function resolveRecipe(
  points: readonly GPUDataPoint[],
  requested: string | undefined,
): string | null {
  const recipes = cacheReuseRecipes(points);
  if (requested && recipes.some((r) => r.key === requested)) return requested;
  return recipes[0]?.key ?? null;
}

export function buildCacheReuse(input: CacheReuseInput): CacheReuseResult {
  const perSeries = new Map<string, readonly GPUDataPoint[]>();

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
  const recipePoints = input.official.length > 0 ? input.official : [...perSeries.values()].flat();
  const recipes = cacheReuseRecipes(recipePoints);
  const recipe = resolveRecipe(recipePoints, input.recipe);
  const ofRecipe = (points: readonly GPUDataPoint[], wanted: string | null) => {
    const key = points.some((p) => recipeKeyOf(p) === wanted)
      ? wanted
      : resolveRecipe(points, undefined);
    return points.filter((p) => recipeKeyOf(p) === key);
  };
  const official = ofRecipe(input.official, recipe);
  const series: CacheReuseSeries[] =
    official.length > 0 ? [{ key: 'official', label: 'official' }] : [];
  perSeries.set('official', official);
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
