/**
 * v3 agentic agg schema (2026-07-02+): nested containers → canonical flat keys.
 *
 * v3 artifacts nest their metrics under `request_metrics` / `server_metrics`
 * containers; v1/v2 emitted the same information as flat top-level fields.
 * `flattenAgenticAggRow` maps the nested shape onto the flat schema the DB /
 * API / frontend consume, so the rest of the mapper stays version-agnostic.
 */

import {
  CACHE_BASES,
  CACHE_DETAIL_SCHEMAS,
  CACHE_OVERALL_SOURCES,
  CACHE_RATE_METRIC_KEYS,
  CACHE_STATUS_CLASSES,
  cacheCoreSchemaVersion,
  cacheVocabularyCode,
  strictBooleanCode,
} from '@semianalysisai/inferencex-constants';

import { parseNum } from './normalizers';

/**
 * Distribution stat names accepted from v3 nested stat blocks, with the rename
 * applied when flattening. `p50` is stored as `median_*` to match the
 * established METRIC_KEYS naming (fixed-seq runs and the frontend both use
 * `median_*`; no `p50_*` key exists anywhere downstream).
 */
const V3_STAT_KEYS: Record<string, string> = {
  mean: 'mean',
  p50: 'median',
  median: 'median',
  p75: 'p75',
  p90: 'p90',
  p95: 'p95',
  p99: 'p99',
  'p99.9': 'p99.9',
  std: 'std',
};

/** v3 `request_metrics.latency` sub-blocks → flat metric suffix. */
const V3_LATENCY_METRICS: Record<string, string> = {
  ttft: 'ttft',
  e2el: 'e2el',
  itl: 'itl',
  tpot: 'tpot',
  intvty: 'intvty',
  full_response_itl: 'full_response_itl',
  full_response_intvty: 'full_response_intvty',
};

/** v3 `request_metrics.tokens` sub-blocks → flat metric suffix. */
const V3_TOKEN_METRICS: Record<string, string> = {
  input: 'input_tokens',
  output_actual: 'output_tokens_actual',
  output_expected: 'output_tokens_expected',
};

/**
 * Scalar paths in the v3 nested containers → canonical flat metric key. Keys
 * reuse the flat v2-agentic names wherever one existed so already-ingested runs
 * and the frontend see one consistent schema; genuinely new information gets a
 * new key (registered in METRIC_KEYS).
 */
const V3_SCALAR_PATHS: [string[], string][] = [
  // client-side throughput
  [['request_metrics', 'throughput', 'input', 'tokens_per_second'], 'input_tput_tps'],
  [['request_metrics', 'throughput', 'output', 'tokens_per_second'], 'output_tput_tps'],
  [['request_metrics', 'throughput', 'total', 'tokens_per_second'], 'total_tput_tps'],
  [['request_metrics', 'throughput', 'duration_seconds'], 'duration_seconds'],
  [['request_metrics', 'throughput', 'per_gpu', 'total_tput_tps'], 'tput_per_gpu'],
  [['request_metrics', 'throughput', 'per_gpu', 'output_tput_tps'], 'output_tput_per_gpu'],
  [['request_metrics', 'throughput', 'per_gpu', 'input_tput_tps'], 'input_tput_per_gpu'],
  [['request_metrics', 'cache', 'theoretical_cache_hit_rate'], 'theoretical_cache_hit_rate'],
  // server-side prefix-cache observability (same fields v2 emitted flat)
  [['server_metrics', 'cache', 'gpu_cache_hit_rate'], 'server_gpu_cache_hit_rate'],
  [['server_metrics', 'cache', 'cpu_cache_hit_rate'], 'server_cpu_cache_hit_rate'],
  [['server_metrics', 'cache', 'external_cache_hit_rate'], 'server_external_cache_hit_rate'],
  // KV-cache occupancy (gpu key predates v3 as a flat auto-captured field)
  [['server_metrics', 'kv_cache', 'gpu_usage_pct'], 'gpu_kv_cache_usage_pct'],
  // server token totals
  [['server_metrics', 'tokens', 'prompt_total'], 'total_prompt_tokens'],
  [['server_metrics', 'tokens', 'generation_total'], 'total_generation_tokens'],
  [['server_metrics', 'tokens', 'requests_completed'], 'total_requests_completed'],
  // Deliberately NOT mapped (yet): cache.prefix_cache_hits/queries,
  // kv_cache.cpu_*, tokens.prompt_by_source, sources[] — new v3 detail we don't
  // consume anywhere; add here + METRIC_KEYS when a view needs them. The
  // overall rate and the validity core go through `flattenCacheValidity`.
];

/** Walk a nested object path; returns undefined on any non-object hop. */
function atPath(obj: Record<string, any>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Flatten one v3 stat block ({mean, p50, …}) into `out` as `{stat}_{suffix}`. */
function flattenStatBlock(block: unknown, suffix: string, out: Record<string, number>): void {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return;
  for (const [stat, canonical] of Object.entries(V3_STAT_KEYS)) {
    const n = parseNum((block as Record<string, unknown>)[stat]);
    if (n !== undefined) out[`${canonical}_${suffix}`] = n;
  }
}

/** `server_metrics.cache` rate fields, in `CACHE_RATE_METRIC_KEYS` order. */
const CACHE_RATE_FIELDS = [
  'gpu_cache_hit_rate',
  'cpu_cache_hit_rate',
  'external_cache_hit_rate',
  'overall_cache_hit_rate',
] as const;

/**
 * Encode the producer's cache-validity core and overall rate as numeric
 * metrics. Only what consumers price from is kept; adapter statuses, reasons
 * and raw diagnostics stay in the artifact. Absent fields stay absent so a
 * pre-core row is distinguishable from a core that says "not evaluated", and
 * a field that is present but invalid is recorded as such rather than dropped.
 */
function flattenCacheValidity(row: Record<string, any>, out: Record<string, number>): void {
  const cache = (field: string) => atPath(row, ['server_metrics', 'cache', field]);
  const core = (field: string) => atPath(row, ['server_metrics', 'cache_validity', field]);
  const validity = atPath(row, ['server_metrics', 'cache_validity']);
  const overall = cache('overall_cache_hit_rate');
  const fields = Object.entries({
    server_overall_cache_hit_rate:
      typeof overall === 'number' && Number.isFinite(overall) ? overall : undefined,
    server_cache_overall_source_code: cacheVocabularyCode(
      CACHE_OVERALL_SOURCES,
      cache('overall_source'),
    ),
    server_cache_core_schema_version: cacheCoreSchemaVersion(core('core_schema')),
    server_cache_detail_schema_code: cacheVocabularyCode(CACHE_DETAIL_SCHEMAS, core('schema')),
    server_cache_status_class_code: cacheVocabularyCode(CACHE_STATUS_CLASSES, core('status_class')),
    server_cache_published: strictBooleanCode(core('published')),
    server_cache_pricing_eligible: strictBooleanCode(core('pricing_eligible')),
    server_cache_basis_code: cacheVocabularyCode(CACHE_BASES, core('basis')),
  });
  for (const [key, value] of fields) {
    if (value !== undefined) out[key] = value;
  }

  // On a row with a validity contract, a rate that is present but not a finite
  // number must not reach pricing as `parseNum`'s coercion (`false` -> 0) under
  // the producer's eligibility. Pre-core rows keep the existing parse.
  if (!validity || typeof validity !== 'object' || Array.isArray(validity)) return;
  let invalid = 0;
  for (const [bit, field] of CACHE_RATE_FIELDS.entries()) {
    const raw = cache(field);
    if (raw === null || raw === undefined || (typeof raw === 'number' && Number.isFinite(raw))) {
      continue;
    }
    invalid |= 1 << bit;
    delete out[CACHE_RATE_METRIC_KEYS[bit]];
  }
  if (invalid !== 0) out.server_cache_invalid_rate_fields = invalid;
}

/**
 * Flatten a v3 agentic agg row (nested `request_metrics` / `server_metrics`
 * containers, 2026-07-02+) into the canonical flat metric schema that v1/v2
 * artifacts emitted directly and that the DB / API / frontend consume.
 *
 * Returns the row unchanged when `request_metrics` is absent (v1/v2 rows pass
 * through untouched). Otherwise returns a copy with the flattened metrics
 * merged in; the nested containers stay on the row (they're in NON_METRIC_KEYS
 * so the auto-capture loop ignores them).
 *
 * Notes on the v3 source data:
 * - `p50` percentiles are new (v2 had no median for agentic); stored as
 *   `median_*` to match the frontend's naming.
 * - `latency.intvty` arrives already slow-tail inverted (pXX_intvty =
 *   1/pXX_itl). It's flattened here for completeness, but mapBenchmarkRow's
 *   derive-from-itl invariant still overwrites it, keeping one definition
 *   across all harness versions.
 */
export function flattenAgenticAggRow(row: Record<string, any>): Record<string, any> {
  const rm = row.request_metrics;
  if (!rm || typeof rm !== 'object' || Array.isArray(rm)) return row;

  const flat: Record<string, number> = {};

  // latency distributions
  for (const [metric, suffix] of Object.entries(V3_LATENCY_METRICS)) {
    flattenStatBlock(atPath(row, ['request_metrics', 'latency', metric]), suffix, flat);
  }
  // qps distribution (window_seconds / samples are intentionally not stats)
  flattenStatBlock(atPath(row, ['request_metrics', 'qps']), 'qps', flat);
  // per-request token-count distributions
  for (const [src, suffix] of Object.entries(V3_TOKEN_METRICS)) {
    flattenStatBlock(atPath(row, ['request_metrics', 'tokens', src]), suffix, flat);
  }
  // scalars
  for (const [path, key] of V3_SCALAR_PATHS) {
    const n = parseNum(atPath(row, path));
    if (n !== undefined) flat[key] = n;
  }
  flattenCacheValidity(row, flat);

  return { ...row, ...flat };
}
