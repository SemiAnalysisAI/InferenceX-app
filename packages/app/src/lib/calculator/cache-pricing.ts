export const DEFAULT_CACHED_INPUT_PRICE_RATIO = 0.1;

export interface CacheHitMetrics {
  server_gpu_cache_hit_rate?: number;
  server_external_cache_hit_rate?: number;
  server_cpu_cache_hit_rate?: number;
}

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

export const CACHE_HIT_RATE_FALLBACK_HARDWARE: ReadonlySet<string> = new Set(['gb300']);

export interface PricingCacheHitPoint extends CacheHitMetrics {
  hw?: string;
  theoretical_cache_hit_rate?: number;
}

export function pricingCacheHitRate(point: PricingCacheHitPoint): number | null {
  const measured = measuredCacheHitRate(point);
  if (measured !== null) return measured;
  if (point.hw === undefined || !CACHE_HIT_RATE_FALLBACK_HARDWARE.has(point.hw)) return null;
  const theoretical = point.theoretical_cache_hit_rate;
  if (typeof theoretical !== 'number' || !Number.isFinite(theoretical)) return null;
  return Math.max(0, Math.min(1, theoretical));
}
