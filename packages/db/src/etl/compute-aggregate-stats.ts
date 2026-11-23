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
import { errorMessage } from '../lib/error-message';

export { STATS_VERSION };

export interface AggregateStats {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
  e2elPerOsl: MetricPercentiles | null;
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

async function extractProfileSamples(
  compressedChunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<{
  isl: number[];
  osl: number[];
  e2elPerOsl: number[];
}> {
  const source = Readable.from(compressedChunks);
  const input = createGunzip();
  source.on('error', (error) => input.destroy(error));
  source.pipe(input);
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
 * A corrupt profile leaves the stats empty and appends a warning instead of throwing, so one
 * unreadable blob cannot fail a whole ingest. Callers report the warnings. No bytes at all means
 * there is no profile, which is not a warning.
 */
export async function computeProfileAggregateStatsFromCompressedChunks(
  compressedChunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  warnings: string[] = [],
): Promise<AggregateStats> {
  let islPct: MetricPercentiles | null = null;
  let oslPct: MetricPercentiles | null = null;
  let e2elPerOsl: MetricPercentiles | null = null;
  let sequenceLengths: SequenceLengthSketches = { isl: null, osl: null };

  let emptySource = true;
  let sourceEnded = false;
  async function* tracked() {
    for await (const chunk of compressedChunks) {
      if (chunk.length > 0) emptySource = false;
      yield chunk;
    }
    sourceEnded = true;
  }

  try {
    const { isl, osl, e2elPerOsl: ratios } = await extractProfileSamples(tracked());
    islPct = percentilesOf(isl);
    oslPct = percentilesOf(osl);
    sequenceLengths = sequenceLengthSketches(isl, osl);
    e2elPerOsl = percentilesOf(ratios);
  } catch (error) {
    if (!(emptySource && sourceEnded)) {
      warnings.push(
        `profile export unreadable (${errorMessage(error)}), so ISL, OSL and E2EL/OSL stats are empty`,
      );
    }
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

interface ProfileUpgradeCarryover {
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
}

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

export const AGGREGATE_SERVER_METRIC_KEYS = new Set([
  'vllm:kv_cache_usage_perc',
  'vllm:gpu_cache_usage_perc',
  'vllm:prefix_cache_hits',
  'vllm:prefix_cache_queries',
  'vllm:gpu_prefix_cache_hits',
  'vllm:gpu_prefix_cache_queries',
  'atom:kv_cache_usage_ratio',
  'tokenspeed:kv_cache_usage_perc',
  'atom:prefix_cache_cached_tokens',
  'atom:prefix_cache_full_tokens',
  'atom:prefix_cache_hit_ratio',
  'trtllm_kv_cache_utilization',
  'trtllm_kv_cache_hit_rate',
  'trtllm_prompt_cached_tokens',
  'trtllm_prompt_cached_tokens_total',
  'trtllm_prompt_tokens',
  'trtllm_prompt_tokens_total',
]);

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

export function withServerMetricAggregateStats(
  profileStats: AggregateStats,
  metrics: Record<string, unknown>,
  warnings: string[] = [],
): AggregateStats {
  try {
    const server = extractServerMetricSamples(JSON.stringify({ metrics }));
    return {
      ...profileStats,
      kvCacheUtil: percentilesOf(server.kvCacheUtil),
      prefixCacheHitRate: percentilesOf(server.prefixCacheHitRate),
    };
  } catch (error) {
    warnings.push(serverStatsWarning(error));
    return profileStats;
  }
}

function serverStatsWarning(error: unknown): string {
  return (
    `server metrics unreadable (${errorMessage(error)}), ` +
    'so KV cache utilization and prefix cache hit rate stats are empty'
  );
}

/** Appends to `warnings` like computeProfileAggregateStatsFromCompressedChunks. */
export async function computeAggregateStats(
  args: {
    profileBlob: Buffer | null;
    serverBlob: Buffer | null;
  },
  warnings: string[] = [],
): Promise<AggregateStats> {
  const profile = await computeProfileAggregateStatsFromCompressedChunks(
    args.profileBlob ? [args.profileBlob] : [],
    warnings,
  );

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
    } catch (error) {
      warnings.push(serverStatsWarning(error));
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
