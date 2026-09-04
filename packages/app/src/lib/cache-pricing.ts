/** Default cached-input sale price, matching Fleet Lifecycle's assumption. */
export const DEFAULT_CACHED_INPUT_PRICE_RATIO = 0.1;

export interface CacheHitMetrics {
  server_gpu_cache_hit_rate?: number;
  server_external_cache_hit_rate?: number;
  server_cpu_cache_hit_rate?: number;
}

/**
 * Fraction of input tokens served from a measured prefix-cache tier.
 *
 * GPU hits and external hits are disjoint. CPU hits are added only when the
 * runtime did not report an external tier, because the external/router metric
 * already contains CPU/offload hits on the production rows that carry both.
 */
export function measuredCacheHitRate(metrics: CacheHitMetrics): number | null {
  const gpu = metrics.server_gpu_cache_hit_rate;
  const external = metrics.server_external_cache_hit_rate;
  const cpu = metrics.server_cpu_cache_hit_rate;
  const hasExternal = typeof external === 'number';
  const secondary = hasExternal ? external : typeof cpu === 'number' ? cpu : undefined;
  if (typeof gpu !== 'number' && secondary === undefined) return null;

  const sum = (typeof gpu === 'number' ? gpu : 0) + (secondary ?? 0);
  return Math.max(0, Math.min(1, sum));
}

/**
 * Hardware whose AgentX sweeps may lack a server-side prefix-cache measurement.
 *
 * The GB300 launcher pins srt-slurm builds that do not hand AIPerf the backend
 * worker `/metrics` URLs, so only the Dynamo frontend gets scraped and every
 * `server_*_cache_hit_rate` lands as null. Every other hardware measures its
 * own rate, so the fallback below is deliberately not extended to them: a
 * missing rate there is a data bug to fix at ingest, not something to paper
 * over.
 */
export const CACHE_HIT_RATE_FALLBACK_HARDWARE: ReadonlySet<string> = new Set(['gb300']);

export interface PricingCacheHitPoint extends CacheHitMetrics {
  /** Base hardware key, for example `gb300`. */
  hw?: string;
  /** Infinite-cache theoretical hit rate (0..1) computed from the trace. */
  theoretical_cache_hit_rate?: number;
}

/**
 * Cache hit rate used to price cached input tokens.
 *
 * Prefers the measured server rate. When a GB300 point carries none, falls
 * back to the trace's theoretical hit rate so cache-aware revenue does not bill
 * ~97% cache hits at the uncached price. Other hardware never falls back.
 */
export function pricingCacheHitRate(point: PricingCacheHitPoint): number | null {
  const measured = measuredCacheHitRate(point);
  if (measured !== null) return measured;
  if (point.hw === undefined || !CACHE_HIT_RATE_FALLBACK_HARDWARE.has(point.hw)) return null;
  const theoretical = point.theoretical_cache_hit_rate;
  if (typeof theoretical !== 'number' || !Number.isFinite(theoretical)) return null;
  return Math.max(0, Math.min(1, theoretical));
}
