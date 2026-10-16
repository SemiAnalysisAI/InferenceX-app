import {
  CACHE_BASES,
  CACHE_DETAIL_SCHEMAS,
  CACHE_OVERALL_SOURCES,
  CACHE_RATE_DECIMALS,
  CACHE_STATUS_CLASSES,
  CACHE_VALIDITY_CORE_VERSION,
  CACHE_VALIDITY_TRACE_KEYS,
  cacheVocabularyName,
} from '@semianalysisai/inferencex-constants';

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

/**
 * The producer's cache-validity core as ETL encodes it (see
 * `CACHE_VALIDITY_METRIC_KEYS`). Every field is absent on rows ingested before
 * the core existed.
 */
export interface CacheValidityMetrics {
  /** Combined prefix-cache hit rate; the only rate on `combined` rows. */
  server_overall_cache_hit_rate?: number;
  /** `N` from `infx-cache-validity-core/N`; 0 for an unrecognised schema. */
  server_cache_core_schema_version?: number;
  /** 1-based index into `CACHE_DETAIL_SCHEMAS`; 0 for an unrecognised detail schema. */
  server_cache_detail_schema_code?: number;
  /** 1-based index into `CACHE_STATUS_CLASSES`; 0 for an unrecognised class. */
  server_cache_status_class_code?: number;
  /** 1 when the producer wrote any standard rate; -1 when not a boolean. Never grants eligibility. */
  server_cache_published?: number;
  /** 1 only for a JSON `true`; 0 for `false`; -1 when present but not a boolean. */
  server_cache_pricing_eligible?: number;
  /** Bitmask over `CACHE_RATE_METRIC_KEYS` of rates that were present but not finite numbers. */
  server_cache_invalid_rate_fields?: number;
  /** 1-based index into `CACHE_BASES`; 0 for an unrecognised basis. */
  server_cache_basis_code?: number;
  /** 1-based index into `CACHE_OVERALL_SOURCES`; 0 for an unrecognised source. */
  server_cache_overall_source_code?: number;
}

export interface PricingCacheHitPoint extends CacheHitMetrics, CacheValidityMetrics {
  /** Base hardware key, for example `gb300`. */
  hw?: string;
  /** Infinite-cache theoretical hit rate (0..1) computed from the trace. */
  theoretical_cache_hit_rate?: number;
  /** Only `agentic_traces` rows without a core are subject to the strict policy. */
  benchmark_type?: string;
}

/**
 * How strictly actual cache pricing follows the producer's validity core.
 *
 * - `legacy`: the pre-core rule for every row.
 * - `enforce-when-present`: rows carrying the core must prove eligibility;
 *   older rows keep the pre-core rule.
 * - `strict`: every agentic row must prove eligibility; older rows have no
 *   actual rate.
 */
export type CacheRatePolicy = 'legacy' | 'enforce-when-present' | 'strict';

/** Stays `legacy` until the app maintainers choose a policy. */
export const DEFAULT_CACHE_RATE_POLICY: CacheRatePolicy = 'legacy';

/**
 * Where a pricing hit rate came from. Only `measured` is a validated actual
 * rate. `unavailable` means the actual rate is unproven: it must not be priced
 * as zero hits, and `none` (no cache to discount) must not be mistaken for it.
 * `theoretical` is the explicit theoretical mode, never an actual rate.
 */
export type PricingCacheSource =
  | 'measured'
  | 'legacy-measured'
  | 'theoretical-fallback'
  | 'theoretical'
  | 'none'
  | 'unavailable';

export interface PricingCacheBasis {
  rate: number | null;
  source: PricingCacheSource;
  /** Why the actual rate is unavailable. */
  reason?: string;
}

/**
 * Each stored rate is the producer's value rounded to `CACHE_RATE_DECIMALS`,
 * so an identity over k stored rates holds to within k half-steps. Nothing
 * looser is accepted as agreement.
 */
const HALF_STEP = 0.5 * 10 ** -CACHE_RATE_DECIMALS;
const FLOAT_SLACK = 1e-12;
const withinRounding = (stored: number) => stored * HALF_STEP + FLOAT_SLACK;

function isUnitRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function legacyCacheBasis(point: PricingCacheHitPoint): PricingCacheBasis {
  const measured = measuredCacheHitRate(point);
  if (measured !== null) return { rate: measured, source: 'legacy-measured' };
  if (point.hw === undefined || !CACHE_HIT_RATE_FALLBACK_HARDWARE.has(point.hw)) {
    return { rate: null, source: 'none' };
  }
  const theoretical = point.theoretical_cache_hit_rate;
  if (typeof theoretical !== 'number' || !Number.isFinite(theoretical)) {
    return { rate: null, source: 'none' };
  }
  return { rate: Math.max(0, Math.min(1, theoretical)), source: 'theoretical-fallback' };
}

/** Rate on a `tiers` row, or why it cannot be priced. */
function tiersRate(point: PricingCacheHitPoint): number | string {
  const gpu = point.server_gpu_cache_hit_rate;
  const external = point.server_external_cache_hit_rate;
  const cpu = point.server_cpu_cache_hit_rate;
  const overall = point.server_overall_cache_hit_rate;
  // Producer tiers rows write both GPU and external, with an explicit 0 for a
  // tier the deployment does not have. A missing component is never read as 0.
  if (typeof gpu !== 'number' || typeof external !== 'number') {
    return 'incomplete:tiers-need-gpu-and-external';
  }
  const written = [gpu, external, cpu, overall].filter((rate) => typeof rate === 'number');
  if (!written.every(isUnitRate)) return 'invalid:tier-rate-out-of-range';
  // GPU and external hits are disjoint. CPU hits are part of the external tier
  // (the same quantity on ATOM), so the three tiers never add up.
  if (typeof cpu === 'number' && cpu > external + withinRounding(2)) {
    return 'conflict:cpu-exceeds-external';
  }
  const sum = gpu + external;
  if (sum > 1 + withinRounding(2)) return 'invalid:tier-sum-above-one';
  if (typeof overall === 'number' && Math.abs(overall - sum) > withinRounding(3)) {
    return 'conflict:tiers-disagree-with-overall';
  }
  // Worker counters are the only overall source consistent with tiers.
  const sourceCode = point.server_cache_overall_source_code;
  const source = cacheVocabularyName(CACHE_OVERALL_SOURCES, sourceCode);
  if (sourceCode !== undefined && source !== 'worker_counters') {
    return `conflict:tiers-with-${source ?? 'unknown'}-overall`;
  }
  return Math.min(1, sum);
}

/** Rate on a `combined` row, or why it cannot be priced. */
function combinedRate(point: PricingCacheHitPoint): number | string {
  const tiers = [
    point.server_gpu_cache_hit_rate,
    point.server_external_cache_hit_rate,
    point.server_cpu_cache_hit_rate,
  ];
  if (tiers.some((rate) => typeof rate === 'number')) return 'conflict:combined-with-tier-rates';
  const overall = point.server_overall_cache_hit_rate;
  if (typeof overall !== 'number') return 'conflict:combined-without-overall';
  if (!isUnitRate(overall)) return 'invalid:overall-out-of-range';
  const source = cacheVocabularyName(CACHE_OVERALL_SOURCES, point.server_cache_overall_source_code);
  if (source === undefined) return 'combined-without-source';
  if (source === 'router_estimate') return 'router-estimate';
  return overall;
}

function unavailable(reason: string): PricingCacheBasis {
  return { rate: null, source: 'unavailable', reason };
}

/** Whether the producer wrote any validity contract for this row, valid or not. */
function hasValidityTraces(point: PricingCacheHitPoint): boolean {
  return CACHE_VALIDITY_TRACE_KEYS.some((key) => point[key] !== undefined);
}

function coreCacheBasis(point: PricingCacheHitPoint): PricingCacheBasis {
  const version = point.server_cache_core_schema_version;
  if (version === undefined) {
    // #3964 ships the ATOM detail without the common core; it stays out of
    // actual pricing until the core lands rather than passing as pre-core.
    const detail = cacheVocabularyName(CACHE_DETAIL_SCHEMAS, point.server_cache_detail_schema_code);
    return unavailable(
      detail === 'atom-cache-validity/1'
        ? 'atom-detail-without-core'
        : 'malformed-core:missing-schema',
    );
  }
  if (version !== CACHE_VALIDITY_CORE_VERSION) return unavailable('unsupported-core-schema');
  if (point.server_cache_invalid_rate_fields) return unavailable('invalid:non-numeric-rate');
  const status =
    cacheVocabularyName(CACHE_STATUS_CLASSES, point.server_cache_status_class_code) ??
    'unknown-status';
  if (point.server_cache_pricing_eligible === -1) {
    return unavailable('malformed-core:non-boolean-eligibility');
  }
  if (point.server_cache_pricing_eligible !== 1) return unavailable(`not-eligible:${status}`);
  if (status !== 'VALID_COMPLETE' && status !== 'VALID_ZERO') {
    return unavailable(`conflict:eligible-with-${status}`);
  }
  if (point.server_cache_published !== 1) return unavailable('conflict:eligible-without-rate');
  const basis = cacheVocabularyName(CACHE_BASES, point.server_cache_basis_code);
  const rate =
    basis === 'tiers' ? tiersRate(point) : basis === 'combined' ? combinedRate(point) : 'no-basis';
  if (typeof rate === 'string') return unavailable(rate);
  if (status === 'VALID_ZERO' && rate !== 0) return unavailable('conflict:valid-zero-with-hits');
  return { rate, source: 'measured' };
}

/**
 * The one place every agentic revenue consumer gets its cache hit rate from.
 *
 * Under the core, a rate is actual only when the producer marked it eligible
 * with a status that allows exact pricing, the numbers are finite, in range
 * and consistent with the basis, and a combined rate comes from counters
 * rather than a router estimate. A real zero stays priceable. Everything else
 * is `unavailable`, never zero hits and never a silent theoretical stand-in.
 * A row with any validity trace is judged by the contract even when its
 * schema is missing or broken: deleting the schema cannot undo a verdict.
 */
export function selectPricingCacheBasis(
  point: PricingCacheHitPoint,
  policy: CacheRatePolicy = DEFAULT_CACHE_RATE_POLICY,
): PricingCacheBasis {
  if (policy !== 'legacy' && hasValidityTraces(point)) return coreCacheBasis(point);
  if (policy === 'strict' && point.benchmark_type === 'agentic_traces') {
    return unavailable('no-validity-core');
  }
  return legacyCacheBasis(point);
}

/** One frontier point's cache standing, as carried by calculator points or a basis. */
export interface FrontierCachePoint {
  rate?: number | null;
  source?: PricingCacheSource;
  reason?: string;
}

/**
 * Why the points of one frontier cannot be priced with an actual cache rate
 * together, or undefined when they can. One unproven point withholds the
 * operating point, and so does a contract-verified point next to a point with
 * no rate: splining around the gap would bill the verified hits as zero.
 * Frontiers without a verified point keep the pre-core all-or-nothing rule.
 */
export function frontierCacheUnavailableReason(
  points: readonly FrontierCachePoint[],
): string | undefined {
  const unproven = points.find((point) => point.source === 'unavailable');
  if (unproven) return unproven.reason ?? 'unproven-point';
  const verified = points.some((point) => point.source === 'measured');
  if (verified && points.some((point) => typeof point.rate !== 'number')) {
    return 'mixed-frontier-missing-rate';
  }
  return undefined;
}

/**
 * Cache hit rate used to price cached input tokens.
 *
 * Under the pre-core rule this prefers the measured server rate. When a GB300
 * point carries none, it falls back to the trace's theoretical hit rate so
 * cache-aware revenue does not bill ~97% cache hits at the uncached price.
 * Other hardware never falls back. Callers that must tell an unproven rate
 * from "no discount" use {@link selectPricingCacheBasis}.
 */
export function pricingCacheHitRate(
  point: PricingCacheHitPoint,
  policy: CacheRatePolicy = DEFAULT_CACHE_RATE_POLICY,
): number | null {
  return selectPricingCacheBasis(point, policy).rate;
}
