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
}

export interface CacheReuseInput {
  official: readonly GPUDataPoint[];
  /** Every overlay group; only those on the same hardware (and precision) are read. */
  overlay?: Record<string, GPUDataPoint[]>;
  overlayMeta?: Record<string, OverlayGroupMeta>;
  overlayLabels?: Record<number, string>;
  /** The chosen configuration, matched against overlay group metadata. */
  config: GroupMeta;
}

/**
 * The stacked bars for one configuration: its official rows, plus each loaded
 * unofficial run's rows on the same hardware as their own series, so a branch
 * can be read against the published curve concurrency by concurrency.
 */
export function buildCacheReuse(input: CacheReuseInput): CacheReuseResult {
  const series: CacheReuseSeries[] = [{ key: 'official', label: 'official' }];
  const perSeries = new Map<string, readonly GPUDataPoint[]>([['official', input.official]]);

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
    // One bar per concurrency: the latest official row is already unique per
    // (config, concurrency); a run that repeats one keeps its first row.
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
