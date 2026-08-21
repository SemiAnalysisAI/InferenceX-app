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

import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { gunzipJsonWithinLimit, streamCollectKeys } from './gzip-json-stream';
import {
  STATS_VERSION,
  extractServerMetricSamples,
  percentilesOf,
  sequenceLengthSketches,
  type MetricPercentiles,
  type SequenceLengthSketches,
} from '../queries/agentic-aggregates';

export { STATS_VERSION };

export interface AggregateStats {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
  /**
   * Per-request E2E latency / OSL (seconds per output token) percentiles.
   * The read path inverts to plot the slow-tail "E2E Normalized Interactivity" x-axis metric
   * (tok/s/user): pXX E2E Normalized Interactivity = 1 / pXX(E2EL/OSL).
   */
  e2elPerOsl: MetricPercentiles | null;
  /** Bounded mergeable distributions used by the chart-level subtitle. */
  sequenceLengths: SequenceLengthSketches;
}

interface ProfileMetricEnvelope {
  value?: number;
}

interface ProfileRecord {
  metadata?: {
    benchmark_phase?: string;
    was_cancelled?: boolean;
  };
  metrics?: {
    input_sequence_length?: ProfileMetricEnvelope | number;
    output_sequence_length?: ProfileMetricEnvelope | number;
    request_latency?: ProfileMetricEnvelope | number;
    time_to_first_token?: ProfileMetricEnvelope | number;
  };
}

function profileMetricValue(value: ProfileMetricEnvelope | number | undefined): number | undefined {
  const number = typeof value === 'number' ? value : value?.value;
  return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
}

/**
 * Stream a profile export line by line so exceptionally large traces never
 * materialize their multi-gigabyte decompressed JSONL as one string. The
 * numeric sample arrays are tiny relative to the source and are needed for
 * exact percentile calculation.
 */
async function extractProfileSamples(
  compressedChunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<{
  isl: number[];
  osl: number[];
  e2elPerOsl: number[];
}> {
  const input = Readable.from(compressedChunks).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  const isl: number[] = [];
  const osl: number[] = [];
  const e2elPerOsl: number[] = [];

  for await (const line of lines) {
    if (!line) continue;
    let record: ProfileRecord;
    try {
      record = JSON.parse(line) as ProfileRecord;
    } catch {
      continue;
    }
    if (record.metadata?.benchmark_phase && record.metadata.benchmark_phase !== 'profiling') {
      continue;
    }
    if (record.metadata?.was_cancelled === true) continue;

    const metrics = record.metrics ?? {};
    const inputLength = profileMetricValue(metrics.input_sequence_length);
    const outputLength = profileMetricValue(metrics.output_sequence_length);
    if (inputLength !== undefined) isl.push(inputLength);
    if (outputLength !== undefined) osl.push(outputLength);

    const requestLatencyMs = profileMetricValue(metrics.request_latency);
    const ttftMs = profileMetricValue(metrics.time_to_first_token);
    if (
      requestLatencyMs !== undefined &&
      ttftMs !== undefined &&
      inputLength !== undefined &&
      outputLength !== undefined &&
      requestLatencyMs > 0 &&
      ttftMs > 0 &&
      inputLength > 0 &&
      outputLength > 0
    ) {
      e2elPerOsl.push(requestLatencyMs / 1000 / outputLength);
    }
  }

  return { isl, osl, e2elPerOsl };
}

/**
 * Compute the profile-derived half of the aggregate bundle from compressed
 * chunks. Backfills use this for oversized TOAST values so neither Postgres
 * nor the JS driver has to materialize one enormous bytea response.
 */
export async function computeProfileAggregateStatsFromCompressedChunks(
  compressedChunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<AggregateStats> {
  let islPct: MetricPercentiles | null = null;
  let oslPct: MetricPercentiles | null = null;
  let e2elPerOsl: MetricPercentiles | null = null;
  let sequenceLengths: SequenceLengthSketches = { isl: null, osl: null };

  try {
    const { isl, osl, e2elPerOsl: ratios } = await extractProfileSamples(compressedChunks);
    islPct = percentilesOf(isl);
    oslPct = percentilesOf(osl);
    sequenceLengths = sequenceLengthSketches(isl, osl);
    e2elPerOsl = percentilesOf(ratios);
  } catch {
    // Ignore malformed blobs and leave the profile-derived fields null.
  }

  return {
    version: STATS_VERSION,
    isl: islPct,
    osl: oslPct,
    kvCacheUtil: null,
    prefixCacheHitRate: null,
    e2elPerOsl,
    sequenceLengths,
  };
}

/**
 * The subset of an older-version bundle a profile-only upgrade carries
 * forward. Pre-v6 bundles also carry the since-retired derived metrics
 * (normalizedSessionTimeS, p90PrefillTpsPerUser, normalizedE2e400) — spreading
 * `profile` first drops them from the merged result.
 */
interface ProfileUpgradeCarryover {
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
}

/**
 * Upgrade an existing stats bundle when only profile-derived fields changed.
 * This avoids re-reading and decompressing the much larger server-metrics blob
 * while preserving its already-computed KV/cache distributions.
 */
export function mergeProfileStatsUpgrade(
  existing: ProfileUpgradeCarryover,
  profile: AggregateStats,
): AggregateStats {
  return {
    ...profile,
    isl: profile.isl ?? existing.isl,
    osl: profile.osl ?? existing.osl,
    kvCacheUtil: existing.kvCacheUtil,
    prefixCacheHitRate: existing.prefixCacheHitRate,
  };
}

/** Metric subtrees we extract via stream-parse on oversized server blobs. */
export const AGGREGATE_SERVER_METRIC_KEYS = new Set([
  'vllm:kv_cache_usage_perc',
  'vllm:gpu_cache_usage_perc',
  'vllm:prefix_cache_hits',
  'vllm:prefix_cache_queries',
  'vllm:gpu_prefix_cache_hits',
  'vllm:gpu_prefix_cache_queries',
]);

/**
 * Stream-parse the gzipped server_metrics_json and collect just the metric
 * subtrees we care about when the full JSON exceeds the in-memory fast-path
 * ceiling.
 */
async function streamExtractServer(
  buffer: Buffer,
): Promise<{ kvCacheUtil: number[]; prefixCacheHitRate: number[] }> {
  const collected = await streamCollectKeys<unknown>(
    buffer,
    'metrics',
    AGGREGATE_SERVER_METRIC_KEYS,
  );
  return extractServerMetricSamples(JSON.stringify({ metrics: collected }));
}

/**
 * Add server-derived distributions to profile stats using an already parsed
 * profiling metric map. Ingest uses this to share one server JSON parse with
 * chart-series generation; the output shape and ordering match
 * `computeAggregateStats()` exactly.
 */
export function withServerMetricAggregateStats(
  profileStats: AggregateStats,
  metrics: Record<string, unknown>,
): AggregateStats {
  try {
    const server = extractServerMetricSamples(JSON.stringify({ metrics }));
    return {
      ...profileStats,
      kvCacheUtil: percentilesOf(server.kvCacheUtil),
      prefixCacheHitRate: percentilesOf(server.prefixCacheHitRate),
    };
  } catch {
    return profileStats;
  }
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
  const profile = args.profileBlob
    ? await computeProfileAggregateStatsFromCompressedChunks([args.profileBlob])
    : await computeProfileAggregateStatsFromCompressedChunks([]);

  let kvPct: MetricPercentiles | null = null;
  let prefixPct: MetricPercentiles | null = null;
  if (args.serverBlob) {
    let server: { kvCacheUtil: number[]; prefixCacheHitRate: number[] } | null = null;
    try {
      const json = gunzipJsonWithinLimit(args.serverBlob);
      server =
        json === null
          ? await streamExtractServer(args.serverBlob)
          : extractServerMetricSamples(json);
    } catch {
      // malformed blob or failed stream fallback — leave nulls
    }
    if (server) {
      kvPct = percentilesOf(server.kvCacheUtil);
      prefixPct = percentilesOf(server.prefixCacheHitRate);
    }
  }

  return {
    ...profile,
    kvCacheUtil: kvPct,
    prefixCacheHitRate: prefixPct,
  };
}
