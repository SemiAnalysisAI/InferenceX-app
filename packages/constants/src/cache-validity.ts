export const CACHE_VALIDITY_CORE_SCHEMA_PREFIX = 'infx-cache-validity-core/';

export const CACHE_VALIDITY_CORE_VERSION = 1;

// Matches the producer's round_floats precision.
export const CACHE_RATE_DECIMALS = 5;

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

export const CACHE_BASES = ['tiers', 'combined'] as const;

export const CACHE_OVERALL_SOURCES = ['worker_counters', 'frontend', 'router_estimate'] as const;

export const CACHE_DETAIL_SCHEMAS = [
  'atom-cache-validity/1',
  'infx-cache-validity-core/1',
] as const;

export type CacheStatusClass = (typeof CACHE_STATUS_CLASSES)[number];
export type CacheBasis = (typeof CACHE_BASES)[number];
export type CacheOverallSource = (typeof CACHE_OVERALL_SOURCES)[number];

export const CACHE_RATE_METRIC_KEYS = [
  'server_gpu_cache_hit_rate',
  'server_cpu_cache_hit_rate',
  'server_external_cache_hit_rate',
  'server_overall_cache_hit_rate',
] as const;

export const CACHE_VALIDITY_TRACE_KEYS = [
  'server_cache_core_schema_version',
  'server_cache_detail_schema_code',
  'server_cache_status_class_code',
  'server_cache_published',
  'server_cache_pricing_eligible',
  'server_cache_basis_code',
  'server_cache_invalid_rate_fields',
] as const;

export const CACHE_VALIDITY_METRIC_KEYS = [
  'server_overall_cache_hit_rate',
  'server_cache_overall_source_code',
  ...CACHE_VALIDITY_TRACE_KEYS,
] as const;

export function cacheVocabularyCode(
  vocabulary: readonly string[],
  value: unknown,
): number | undefined {
  if (value === null || value === undefined) return undefined;
  return (typeof value === 'string' ? vocabulary.indexOf(value) : -1) + 1;
}

export function cacheVocabularyName<T extends string>(
  vocabulary: readonly T[],
  code: number | undefined,
): T | undefined {
  return code === undefined || !Number.isInteger(code) || code < 1
    ? undefined
    : vocabulary[code - 1];
}

const CORE_SCHEMA_PATTERN = /^infx-cache-validity-core\/(?<version>[1-9][0-9]*)$/;

export function cacheCoreSchemaVersion(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const match = typeof value === 'string' ? CORE_SCHEMA_PATTERN.exec(value) : null;
  return match?.groups ? Number(match.groups.version) : 0;
}

export function strictBooleanCode(value: unknown): -1 | 0 | 1 | undefined {
  if (value === null || value === undefined) return undefined;
  if (value === true) return 1;
  if (value === false) return 0;
  return -1;
}
