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

export interface CacheValidityMetrics {
  server_overall_cache_hit_rate?: number;
  server_cache_core_schema_version?: number;
  server_cache_detail_schema_code?: number;
  server_cache_status_class_code?: number;
  server_cache_published?: number;
  server_cache_pricing_eligible?: number;
  server_cache_invalid_rate_fields?: number;
  server_cache_basis_code?: number;
  server_cache_overall_source_code?: number;
}

export interface PricingCacheHitPoint extends CacheHitMetrics, CacheValidityMetrics {
  hw?: string;
  theoretical_cache_hit_rate?: number;
  benchmark_type?: string;
}

export type CacheRatePolicy = 'legacy' | 'enforce-when-present' | 'strict';

export const DEFAULT_CACHE_RATE_POLICY: CacheRatePolicy = 'legacy';

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
  reason?: string;
}

const HALF_STEP = 0.5 * 10 ** -CACHE_RATE_DECIMALS;
const FLOAT_SLACK = 1e-12;
// Each stored rate contributes at most one half-step of rounding error.
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

function hasValidityTraces(point: PricingCacheHitPoint): boolean {
  return CACHE_VALIDITY_TRACE_KEYS.some((key) => point[key] !== undefined);
}

function coreCacheBasis(point: PricingCacheHitPoint): PricingCacheBasis {
  const version = point.server_cache_core_schema_version;
  if (version === undefined) {
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

export interface FrontierCachePoint {
  rate?: number | null;
  source?: PricingCacheSource;
  reason?: string;
}

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

export function pricingCacheHitRate(
  point: PricingCacheHitPoint,
  policy: CacheRatePolicy = DEFAULT_CACHE_RATE_POLICY,
): number | null {
  return selectPricingCacheBasis(point, policy).rate;
}
