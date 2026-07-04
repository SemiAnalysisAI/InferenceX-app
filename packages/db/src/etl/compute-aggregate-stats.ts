/**
 * Pre-compute the per-row aggregate stats for an `agentic_trace_replay`
 * blob pair. The output lands in the `aggregate_stats` JSONB column so the
 * detail page can serve the "Aggregates across configs" view and the
 * derived chart x-axis modes from a single SQL row read, instead of
 * parsing the raw blobs on demand.
 *
 * Shape is intentionally versioned — bump `STATS_VERSION` whenever the
 * computation changes so the backfill script knows which rows to recompute.
 */

import { gunzipSync } from 'node:zlib';

import { isStringTooLongError, streamCollectKeys } from './gzip-json-stream';
import { computeDerivedFromBlob } from '../queries/derived-agentic-metrics';
import {
  STATS_VERSION,
  extractIslOsl,
  extractServerMetricSamples,
  percentilesOf,
  type MetricPercentiles,
} from '../queries/agentic-aggregates';

export { STATS_VERSION };

export interface AggregateStats {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
  /** Mean of (per-session e2e time × mean_load / session_load) across sessions. */
  normalizedSessionTimeS: number | null;
  /** P90 of per-turn ISL/TTFT pooled across every session's turns. */
  p90PrefillTpsPerUser: number | null;
  /** Per-request normalized E2E distribution at a fixed 400-token OSL. */
  normalizedE2e400: MetricPercentiles | null;
}

/**
 * Upgrade an existing stats bundle when only profile-derived fields changed.
 * This avoids re-reading and decompressing the much larger server-metrics blob
 * while preserving its already-computed KV/cache distributions.
 */
export function mergeProfileStatsUpgrade(
  existing: Omit<AggregateStats, 'normalizedE2e400'> & {
    normalizedE2e400?: MetricPercentiles | null;
  },
  profile: AggregateStats,
): AggregateStats {
  return {
    ...profile,
    isl: profile.isl ?? existing.isl,
    osl: profile.osl ?? existing.osl,
    normalizedSessionTimeS: profile.normalizedSessionTimeS ?? existing.normalizedSessionTimeS,
    p90PrefillTpsPerUser: profile.p90PrefillTpsPerUser ?? existing.p90PrefillTpsPerUser,
    kvCacheUtil: existing.kvCacheUtil,
    prefixCacheHitRate: existing.prefixCacheHitRate,
  };
}

/** Metric subtrees we extract via stream-parse on oversized server blobs. */
const TARGET_METRIC_KEYS = new Set([
  'vllm:kv_cache_usage_perc',
  'vllm:gpu_cache_usage_perc',
  'vllm:prefix_cache_hits',
  'vllm:prefix_cache_queries',
  'vllm:gpu_prefix_cache_hits',
  'vllm:gpu_prefix_cache_queries',
]);

/**
 * Stream-parse the gzipped server_metrics_json and collect just the metric
 * subtrees we care about. Avoids Node's 512 MB max-string-length cap that
 * `gunzipSync().toString('utf8')` hits on high-conc TP+EP rows.
 */
async function streamExtractServer(
  buffer: Buffer,
): Promise<{ kvCacheUtil: number[]; prefixCacheHitRate: number[] }> {
  const collected = await streamCollectKeys<unknown>(buffer, 'metrics', TARGET_METRIC_KEYS);
  return extractServerMetricSamples(JSON.stringify({ metrics: collected }));
}

/**
 * Compute the full versioned stats bundle from a (profile, server-metrics)
 * blob pair. Either blob may be null (e.g. only the server file existed) —
 * the corresponding stats just come back null.
 */
export async function computeAggregateStats(args: {
  profileBlob: Buffer | null;
  serverBlob: Buffer | null;
}): Promise<AggregateStats> {
  let islPct: MetricPercentiles | null = null;
  let oslPct: MetricPercentiles | null = null;
  let normalized: number | null = null;
  let prefillP90: number | null = null;
  let normalizedE2e400: MetricPercentiles | null = null;

  if (args.profileBlob) {
    try {
      const jsonl = gunzipSync(args.profileBlob).toString('utf8');
      const { isl, osl } = extractIslOsl(jsonl);
      islPct = percentilesOf(isl);
      oslPct = percentilesOf(osl);
      const derived = computeDerivedFromBlob(jsonl);
      normalized = derived.normalized_session_time_s;
      prefillP90 = derived.p90_prefill_tps_per_user;
      normalizedE2e400 = derived.normalized_e2e_400;
    } catch {
      // ignore malformed blob — leave nulls
    }
  }

  let kvPct: MetricPercentiles | null = null;
  let prefixPct: MetricPercentiles | null = null;
  if (args.serverBlob) {
    let server: { kvCacheUtil: number[]; prefixCacheHitRate: number[] } | null = null;
    try {
      const json = gunzipSync(args.serverBlob).toString('utf8');
      server = extractServerMetricSamples(json);
    } catch (error) {
      // ERR_STRING_TOO_LONG hits on high-conc TP+EP rows. Stream-parse to
      // pull just the metric subtrees we need without materializing the
      // full 500+ MB JSON string.
      if (isStringTooLongError(error)) {
        try {
          server = await streamExtractServer(args.serverBlob);
        } catch {
          // stream fallback failed too — leave nulls
        }
      }
    }
    if (server) {
      kvPct = percentilesOf(server.kvCacheUtil);
      prefixPct = percentilesOf(server.prefixCacheHitRate);
    }
  }

  return {
    version: STATS_VERSION,
    isl: islPct,
    osl: oslPct,
    kvCacheUtil: kvPct,
    prefixCacheHitRate: prefixPct,
    normalizedSessionTimeS: normalized,
    p90PrefillTpsPerUser: prefillP90,
    normalizedE2e400,
  };
}
