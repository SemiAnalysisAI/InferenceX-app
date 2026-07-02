/**
 * Per-id aggregate stats for the "Aggregates across configs" view on the
 * agentic detail page. Each id contributes one summary number per metric per
 * percentile so the frontend can plot how each metric varies across the
 * SKU's parallelism + concurrency configs.
 *
 * Sources:
 *  - `profile_export.jsonl` → ISL / OSL per request (filtered to profiling phase)
 *  - `server_metrics_json` → time-series of KV cache utilization +
 *     prefix-cache hit rate per scrape interval
 *
 * Returns mean/p50/p75/p90/p99 per metric. Nulls when the blob is missing
 * or has no usable samples — frontend treats those as "no data".
 */

import { Readable } from 'node:stream';
import { createGunzip, gunzipSync } from 'node:zlib';

import { chain } from 'stream-chain';

import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';

import type { DbClient } from '../connection.js';
import {
  fetchAggregateStatsRows,
  percentilesOf,
  readNum,
  type MetricPercentiles,
} from './agentic-shared';

// Percentile math + envelope reader live in agentic-shared.ts; re-exported
// here because etl/compute-aggregate-stats and the API layer import them
// from this module.
export { percentilesOf, type MetricPercentiles } from './agentic-shared';

/**
 * Bump when the aggregate-stats computation algorithm changes — the backfill
 * script recomputes any row whose stored `aggregate_stats.version` is older.
 * Lives here (rather than in compute-aggregate-stats.ts) to avoid a circular
 * import: the compute helper depends on the extractors below.
 *
 * v2: aggregate vllm gauges/counters across all engine series (was reading
 * only series[0], which under-counted by Nx on multi-engine DP/PP deployments).
 *
 * v3: extract sglang:* metrics too — kv_cache_util + prefix_cache_hit_rate
 * populate for SGLang runs (qwen3.5/h100, mi355x sglang, etc.) the same way
 * they do for vllm runs.
 *
 * v4: add per-request normalized E2E percentiles at a fixed 400-token OSL.
 *
 * v5: reject osl <= 0 in extractTurn to exclude cancelled/empty-output turns
 * whose decode-interval math would explode normalized E2E to thousands of seconds.
 */
export const STATS_VERSION = 5;

export interface AgenticAggregate {
  id: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
}

export type AgenticAggregateMap = Record<number, AgenticAggregate>;

/**
 * `profile_export_jsonl_gz` is small (~1-3 MB) so we can batch many per
 * round-trip. `server_metrics_json_gz` is much bigger (~17 MB compressed
 * for high-conc TP+EP runs; Neon encodes bytea over HTTP at ~1.6× wire
 * size, so two of those = ~50 MB and three already trips the 64 MB cap).
 * We fetch the two blob types in separate queries with different chunk
 * sizes.
 */
const PROFILE_CHUNK_SIZE = 8;
const SERVER_CHUNK_SIZE = 1;

interface ProfileRecord {
  metadata?: { benchmark_phase?: string };
  metrics?: {
    input_sequence_length?: { value?: number } | number;
    output_sequence_length?: { value?: number } | number;
  };
}

/** Parse the profile_export.jsonl → per-request ISL + OSL arrays. */
export function extractIslOsl(jsonl: string): { isl: number[]; osl: number[] } {
  const isl: number[] = [];
  const osl: number[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line) continue;
    let rec: ProfileRecord;
    try {
      rec = JSON.parse(line) as ProfileRecord;
    } catch {
      continue;
    }
    if (rec.metadata?.benchmark_phase && rec.metadata.benchmark_phase !== 'profiling') continue;
    const m = rec.metrics ?? {};
    const i = readNum(m.input_sequence_length);
    const o = readNum(m.output_sequence_length);
    if (typeof i === 'number') isl.push(i);
    if (typeof o === 'number') osl.push(o);
  }
  return { isl, osl };
}

interface TimeSlice {
  start_ns?: number;
  end_ns?: number;
  avg?: number;
  rate?: number;
  count?: number;
  sum?: number;
}
interface Series {
  labels?: Record<string, string>;
  timeslices?: TimeSlice[];
}
interface MetricMeta {
  series?: Series[];
}
interface MetricsJson {
  metrics?: Record<string, MetricMeta>;
}

/**
 * Aggregate a per-timeslice field across all series of a metric, indexed by
 * the timeslice's `start_ns`. vllm reports one series per engine on
 * multi-engine DP/PP deployments, so we sum (or average) across engines to
 * get the cluster-wide value at each timeslice.
 *
 * `field` selects which numeric field on a timeslice to read (`avg` for
 * gauges, `rate` for counter deltas). `combine` controls cross-engine math:
 * 'sum' for running/waiting/throughput counters where the cluster total is
 * the sum; 'avg' for KV cache utilization, which is bounded [0, 1] per
 * engine and should be averaged across engines for the cluster view.
 */
function aggregateSeriesByStart(
  metricSeries: readonly Series[] | undefined,
  field: 'avg' | 'rate',
  combine: 'sum' | 'avg',
): Map<number, number> {
  const sums = new Map<number, number>();
  const counts = new Map<number, number>();
  for (const s of metricSeries ?? []) {
    for (const ts of s.timeslices ?? []) {
      if (typeof ts.start_ns !== 'number') continue;
      const v = ts[field];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      sums.set(ts.start_ns, (sums.get(ts.start_ns) ?? 0) + v);
      counts.set(ts.start_ns, (counts.get(ts.start_ns) ?? 0) + 1);
    }
  }
  if (combine === 'sum') return sums;
  const out = new Map<number, number>();
  for (const [t, s] of sums) out.set(t, s / (counts.get(t) ?? 1));
  return out;
}

/**
 * Parse the server_metrics_json → time-series arrays for KV cache util and
 * prefix cache hit rate (per-interval, computed from the prometheus
 * counters the same way trace-server-metrics does it).
 *
 * Aggregates across all engine series so multi-engine DP/PP deployments are
 * counted correctly (previously we only read engine 0).
 */
/** First metric whose series array is non-empty; supports vllm/sglang fallback. */
function pickFirstNonEmpty(
  metrics: Record<string, MetricMeta>,
  ...names: string[]
): Series[] | undefined {
  for (const name of names) {
    const s = metrics[name]?.series;
    if (s && s.length > 0) return s;
  }
  return undefined;
}

export function extractServerMetricSamples(json: string): {
  kvCacheUtil: number[];
  prefixCacheHitRate: number[];
} {
  const parsed = JSON.parse(json) as MetricsJson;
  const metrics = parsed.metrics ?? {};

  // KV cache util — per-engine gauge in [0, 1]. Average across engines so the
  // value stays a percentage; summing would give meaningless 0..N.
  const kvSeriesAll = pickFirstNonEmpty(
    metrics,
    'vllm:kv_cache_usage_perc',
    'vllm:gpu_cache_usage_perc',
    'sglang:token_usage',
  );
  const kvCacheUtil = [...aggregateSeriesByStart(kvSeriesAll, 'avg', 'avg').values()];

  // Prefix cache hit rate per interval = Σhits.rate / Σqueries.rate across
  // all engines. Sum first, then divide. SGLang names: cached_tokens / prompt_tokens.
  const hitsAll = pickFirstNonEmpty(
    metrics,
    'vllm:prefix_cache_hits',
    'vllm:gpu_prefix_cache_hits',
    'sglang:cached_tokens',
  );
  const queriesAll = pickFirstNonEmpty(
    metrics,
    'vllm:prefix_cache_queries',
    'vllm:gpu_prefix_cache_queries',
    'vllm:prompt_tokens',
    'sglang:prompt_tokens',
  );
  const hitsByT = aggregateSeriesByStart(hitsAll, 'rate', 'sum');
  const qByT = aggregateSeriesByStart(queriesAll, 'rate', 'sum');
  const prefixCacheHitRate: number[] = [];
  for (const [t, h] of hitsByT) {
    const q = qByT.get(t);
    if (q !== undefined && q > 0) prefixCacheHitRate.push(h / q);
  }

  return { kvCacheUtil, prefixCacheHitRate };
}

/** Metrics our aggregates pipeline cares about. Anything else in the blob is skipped. */
const TARGET_METRIC_KEYS = new Set([
  // vLLM
  'vllm:kv_cache_usage_perc',
  'vllm:gpu_cache_usage_perc',
  'vllm:prefix_cache_hits',
  'vllm:prefix_cache_queries',
  'vllm:gpu_prefix_cache_hits',
  'vllm:gpu_prefix_cache_queries',
  'vllm:prompt_tokens',
  // SGLang
  'sglang:token_usage',
  'sglang:cached_tokens',
  'sglang:prompt_tokens',
]);

/**
 * Stream-parse the gzipped server_metrics_json and collect ONLY the metrics
 * we need. Avoids the Node 512 MB string cap that JSON.parse hits on
 * server_metrics blobs from high-conc TP+EP runs (which can decompress to
 * >500 MB because vllm dumps `cache_config_info` every scrape interval).
 *
 * Pipeline: Buffer → gunzip → JSON parser → Pick('metrics') →
 * StreamObject (one metric per chunk) → keep only the keys we care about.
 *
 * Returns the same `{ kvCacheUtil, prefixCacheHitRate }` shape as the
 * synchronous fast path so callers can use either interchangeably.
 */
async function streamExtractServerMetricSamples(
  buffer: Buffer,
): Promise<{ kvCacheUtil: number[]; prefixCacheHitRate: number[] }> {
  const collected: Record<string, MetricMeta> = {};
  // stream-json's TypeScript types don't compose cleanly with node:stream's
  // pipeline() generic, and several `.pipe()`/event APIs are typed loosely —
  // cast to any for this local pipe chain. It works at runtime.
  // stream-json composes transforms via stream-chain. `pick`/`streamObject`
  // each return a Transform when called; `chain([...])` wires them.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pipeline = chain([
    Readable.from(buffer),
    createGunzip(),
    parser(),
    pick({ filter: 'metrics' }),
    streamObject(),
  ]);
  await new Promise<void>((resolve, reject) => {
    (pipeline as any).on('data', (chunk: unknown) => {
      const { key, value } = chunk as { key: string; value: MetricMeta };
      if (TARGET_METRIC_KEYS.has(key)) collected[key] = value;
    });
    (pipeline as any).on('end', resolve);
    (pipeline as any).on('error', reject);
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return extractServerMetricSamples(JSON.stringify({ metrics: collected }));
}

export async function getAgenticAggregates(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<AgenticAggregateMap> {
  if (benchmarkResultIds.length === 0) return {};

  const result: AgenticAggregateMap = {};

  // Fast path: read the pre-computed `aggregate_stats` JSONB written by the
  // ingest pipeline (and back-filled by `backfill-aggregate-stats.ts`). One
  // round-trip pulls everything we need for every requested id with no blob
  // decompression, so the slow blob-parsing fallback only runs for ids
  // whose stats are missing or were produced by an older `STATS_VERSION`.
  const statsRows = await fetchAggregateStatsRows<AggregateStatsRow>(sql, benchmarkResultIds);

  const idsNeedingProfile: number[] = [];
  const idsNeedingServer: number[] = [];
  for (const row of statsRows) {
    const id = Number(row.benchmark_result_id);
    const agg = blankAggregate(id);
    if (row.stats && Number(row.stats.version) === STATS_VERSION) {
      agg.isl = row.stats.isl ?? null;
      agg.osl = row.stats.osl ?? null;
      agg.kvCacheUtil = row.stats.kvCacheUtil ?? null;
      agg.prefixCacheHitRate = row.stats.prefixCacheHitRate ?? null;
    } else {
      // No stats (or stale version) — schedule the blob-parse fallback below
      // so the response still surfaces data. Backfill should drain these.
      idsNeedingProfile.push(id);
      idsNeedingServer.push(id);
    }
    result[id] = agg;
  }
  // Also fall back for ids that didn't return a row at all (no trace_replay
  // link) — keep the caller contract: every id we know about lands in the map.
  for (const id of benchmarkResultIds) {
    if (!(id in result)) result[id] = blankAggregate(id);
  }

  if (idsNeedingProfile.length === 0 && idsNeedingServer.length === 0) {
    return result;
  }

  // ── Fallback Pass 1: profile_export blobs (cheap; large batches). ──────
  for (let i = 0; i < idsNeedingProfile.length; i += PROFILE_CHUNK_SIZE) {
    const chunk = idsNeedingProfile.slice(i, i + PROFILE_CHUNK_SIZE);
    const rows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.profile_export_jsonl_gz as profile_blob
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
    `) as { benchmark_result_id: number; profile_blob: Buffer | null }[];
    for (const row of rows) {
      const id = Number(row.benchmark_result_id);
      result[id] ??= blankAggregate(id);
      if (row.profile_blob) {
        try {
          const jsonl = gunzipSync(row.profile_blob).toString('utf8');
          const { isl, osl } = extractIslOsl(jsonl);
          result[id].isl = percentilesOf(isl);
          result[id].osl = percentilesOf(osl);
        } catch {
          // ignore malformed blob
        }
      }
    }
  }
  // ── Fallback Pass 2: server_metrics blobs (huge; one at a time). ───────
  // Serial to avoid OOM on the decompressed JSON of a high-conc TP+EP row
  // (>500 MB raw). The aggregator is fronted by a blob cache, so the slow
  // path runs at most once per sibling set.
  for (let i = 0; i < idsNeedingServer.length; i += SERVER_CHUNK_SIZE) {
    const chunk = idsNeedingServer.slice(i, i + SERVER_CHUNK_SIZE);
    const rows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.server_metrics_json_gz as server_blob
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
    `) as { benchmark_result_id: number; server_blob: Buffer | null }[];
    for (const row of rows) {
      const id = Number(row.benchmark_result_id);
      result[id] ??= blankAggregate(id);
      if (!row.server_blob) continue;
      let parsed: { kvCacheUtil: number[]; prefixCacheHitRate: number[] } | null = null;
      try {
        const json = gunzipSync(row.server_blob).toString('utf8');
        parsed = extractServerMetricSamples(json);
      } catch (error) {
        // ERR_STRING_TOO_LONG (>512 MB) hits on high-conc TP+EP rows whose
        // server_metrics_json decompresses past Node's max string length.
        // Stream-parse to extract just the metric subtrees we care about.
        const code = error && (error as NodeJS.ErrnoException).code;
        const msg = error instanceof Error ? error.message : String(error);
        if (code === 'ERR_STRING_TOO_LONG' || msg.includes('longer than 0x1fffffe8')) {
          try {
            parsed = await streamExtractServerMetricSamples(row.server_blob);
          } catch {
            // stream fallback failed too — leave nulls
          }
        }
      }
      if (parsed) {
        result[id].kvCacheUtil = percentilesOf(parsed.kvCacheUtil);
        result[id].prefixCacheHitRate = percentilesOf(parsed.prefixCacheHitRate);
      }
    }
  }
  return result;
}

/** Shape of the JSONB column when read back via postgres-js. */
interface AggregateStatsRow {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
  normalizedSessionTimeS: number | null;
  p90PrefillTpsPerUser: number | null;
}

function blankAggregate(id: number): AgenticAggregate {
  return { id, isl: null, osl: null, kvCacheUtil: null, prefixCacheHitRate: null };
}
