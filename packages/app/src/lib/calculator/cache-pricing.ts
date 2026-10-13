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

/** Decoding of `server_cache_validity_code` (mirrors the ETL table in agentic-v3-flatten.ts). */
export const CACHE_VALIDITY_REASONS: Readonly<Record<number, string>> = {
  1: 'VALID_COMPLETE',
  2: 'VALID_ZERO',
  10: 'PARTIAL_COMPONENT',
  11: 'MISSING_OBSERVATION',
  12: 'ROLE_OR_COVERAGE_UNRESOLVED',
  13: 'WINDOW_UNRESOLVED',
  14: 'REQUEST_SCOPE_UNRESOLVED',
  15: 'INVALID_COUNTER',
  98: 'VALIDITY_CONFLICT',
  99: 'UNKNOWN_VALIDITY',
};

/** Validity codes the producer marks as a complete actual observation. */
const PRICEABLE_VALIDITY_CODES: ReadonlySet<number> = new Set([1, 2]);

/**
 * The producer serialises each rate to 5 decimal places, so GPU + CPU of a valid observation can
 * exceed 1 by at most two half-units of the fifth decimal.
 */
export const SERIALIZED_RATE_SUM_TOLERANCE = 1e-5;

/**
 * ATOM runs whose published cache rates are confirmed wrong without validity metadata: run
 * 36734492117 summed prefill and decode denominators and priced LMCache transfer volume as CPU
 * reuse. A re-derived row that carries producer validity is judged by that metadata instead.
 */
export const KNOWN_BAD_ATOM_CACHE_RUNS: ReadonlySet<string> = new Set(['36734492117']);

export interface CacheRateValidityPoint extends CacheHitMetrics {
  framework?: string;
  run_url?: string | null;
  server_cache_pricing_eligible?: number;
  server_cache_validity_code?: number;
}

const isUnitRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const present = (value: unknown) => value !== undefined && value !== null;

/** Why this row's own rates are not a complete actual observation, or null when they are. */
function atomRateDefect(point: CacheRateValidityPoint): string | null {
  const gpu: unknown = point.server_gpu_cache_hit_rate;
  const cpu: unknown = point.server_cpu_cache_hit_rate;
  const external: unknown = point.server_external_cache_hit_rate;
  if (!present(gpu) && !present(cpu) && !present(external)) return 'MISSING_OBSERVATION';
  if (!present(gpu) || (!present(cpu) && !present(external))) return 'PARTIAL_COMPONENT';
  if (!isUnitRate(gpu)) return 'INVALID_RATE';
  if (present(cpu) && !isUnitRate(cpu)) return 'INVALID_RATE';
  if (present(external) && !isUnitRate(external)) return 'INVALID_RATE';
  // External is an alias of the CPU reuse for ATOM; two different values are not one observation.
  if (present(cpu) && present(external) && cpu !== external) return 'CPU_EXTERNAL_CONFLICT';
  const secondary = (present(external) ? external : cpu) as number;
  return gpu + secondary > 1 + SERIALIZED_RATE_SUM_TOLERANCE ? 'INVALID_RATE' : null;
}

/**
 * Why an ATOM row's measured cache rate must not be priced as a complete actual observation, or
 * null when it may be. The producer flag, its status code and the row's own rates must agree;
 * missing is not zero and a partial reading is not the full hit rate. Other frameworks keep their
 * existing behaviour.
 */
export function actualCacheRateUnavailable(point: CacheRateValidityPoint): string | null {
  if (!point.framework?.toLowerCase().startsWith('atom')) return null;
  const eligible = point.server_cache_pricing_eligible;
  const code = point.server_cache_validity_code;
  if (eligible !== undefined || code !== undefined) {
    if (eligible === 0) return CACHE_VALIDITY_REASONS[code ?? 99] ?? 'UNKNOWN_VALIDITY';
    if (eligible !== 1) return 'UNKNOWN_VALIDITY';
    if (code === undefined || !PRICEABLE_VALIDITY_CODES.has(code)) return 'VALIDITY_CONFLICT';
  } else {
    const run = /\/runs\/(?<run>\d+)/.exec(point.run_url ?? '')?.groups?.run;
    if (run !== undefined && KNOWN_BAD_ATOM_CACHE_RUNS.has(run))
      return 'KNOWN_BAD_HISTORICAL_RESULT';
  }
  return atomRateDefect(point);
}
