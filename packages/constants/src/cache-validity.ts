/**
 * The producer's cache-validity core (`infx-cache-validity-core/1`) encoded for
 * the numeric `metrics` JSONB. The producer writes strings and booleans; ETL
 * stores these codes so API rows stay `Record<string, number>` and every
 * consumer reads one vocabulary.
 */
export const CACHE_VALIDITY_CORE_SCHEMA_PREFIX = 'infx-cache-validity-core/';

/** The only core version whose semantics consumers implement. */
export const CACHE_VALIDITY_CORE_VERSION = 1;

/**
 * Decimal places the producer keeps on every rate (`round_floats` in
 * `process_agentic_result.py`), so each stored rate is off by at most half a
 * step from the value it was computed as.
 */
export const CACHE_RATE_DECIMALS = 5;

/** Code = index + 1. Code 0 marks a value this consumer does not recognise. */
export const CACHE_STATUS_CLASSES = [
  'VALID_COMPLETE',
  'VALID_ZERO',
  'VALID_INTERVAL',
  'PARTIAL',
  'UNRESOLVED',
  'CONTAMINATED',
  'INVALID',
  'MISSING',
  'NOT_EVALUATED',
] as const;

/** `tiers`: GPU/CPU/external rates written; `combined`: only the overall rate. */
export const CACHE_BASES = ['tiers', 'combined'] as const;

/** Evidence behind a combined overall rate. A router estimate is a prediction. */
export const CACHE_OVERALL_SOURCES = ['worker_counters', 'frontend', 'router_estimate'] as const;

/**
 * `cache_validity.schema`: the adapter's own detail contract. #3964 ships the
 * ATOM detail without the common core; other adapters repeat the core schema.
 */
export const CACHE_DETAIL_SCHEMAS = [
  'atom-cache-validity/1',
  'infx-cache-validity-core/1',
] as const;

export type CacheStatusClass = (typeof CACHE_STATUS_CLASSES)[number];
export type CacheBasis = (typeof CACHE_BASES)[number];
export type CacheOverallSource = (typeof CACHE_OVERALL_SOURCES)[number];

/** Rate keys a validity core vouches for, in `server_metrics.cache` field order. */
export const CACHE_RATE_METRIC_KEYS = [
  'server_gpu_cache_hit_rate',
  'server_cpu_cache_hit_rate',
  'server_external_cache_hit_rate',
  'server_overall_cache_hit_rate',
] as const;

/**
 * Keys whose presence means the producer wrote a validity contract for the
 * row, valid or not. A row carrying any of them is never a pre-core row.
 */
export const CACHE_VALIDITY_TRACE_KEYS = [
  'server_cache_core_schema_version',
  'server_cache_detail_schema_code',
  'server_cache_status_class_code',
  'server_cache_published',
  'server_cache_pricing_eligible',
  'server_cache_basis_code',
  'server_cache_invalid_rate_fields',
] as const;

/** Metric keys ETL writes for the cache-validity core. */
export const CACHE_VALIDITY_METRIC_KEYS = [
  'server_overall_cache_hit_rate',
  'server_cache_overall_source_code',
  ...CACHE_VALIDITY_TRACE_KEYS,
] as const;

/** Code for `value` in `vocabulary`: undefined when absent, 0 when unrecognised. */
export function cacheVocabularyCode(
  vocabulary: readonly string[],
  value: unknown,
): number | undefined {
  if (value === null || value === undefined) return undefined;
  return (typeof value === 'string' ? vocabulary.indexOf(value) : -1) + 1;
}

/** Inverse of {@link cacheVocabularyCode}; undefined for absent, 0 or unknown codes. */
export function cacheVocabularyName<T extends string>(
  vocabulary: readonly T[],
  code: number | undefined,
): T | undefined {
  return code === undefined || !Number.isInteger(code) || code < 1
    ? undefined
    : vocabulary[code - 1];
}

const CORE_SCHEMA_PATTERN = /^infx-cache-validity-core\/(?<version>[1-9][0-9]*)$/;

/**
 * Core version from `core_schema`: undefined when absent, 0 unless the string is
 * exactly `infx-cache-validity-core/N` with a canonical decimal N, so `01`,
 * `1.0` and `1e0` are not read as version 1.
 */
export function cacheCoreSchemaVersion(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const match = typeof value === 'string' ? CORE_SCHEMA_PATTERN.exec(value) : null;
  return match?.groups ? Number(match.groups.version) : 0;
}

/**
 * JSON booleans as 1/0. Anything else that is present is -1, never dropped:
 * `"true"` or `1` must not pass a numeric parse into eligibility, and a value
 * that is there but invalid must stay distinguishable from one that is absent.
 */
export function strictBooleanCode(value: unknown): -1 | 0 | 1 | undefined {
  if (value === null || value === undefined) return undefined;
  if (value === true) return 1;
  if (value === false) return 0;
  return -1;
}
