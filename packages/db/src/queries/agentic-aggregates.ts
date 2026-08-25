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
import { createGunzip } from 'node:zlib';

import { chain } from 'stream-chain';

import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';

import { gunzipJsonWithinLimit } from '../etl/gzip-json-stream';
import type { DbClient } from '../connection.js';
import {
  extractProfileSamples,
  fetchAggregateStatsRows,
  percentilesOf,
  readTraceReplayBlob,
  requestLengthMomentsOf,
  sequenceLengthSketches,
  STATS_VERSION,
  streamTraceReplayBlob,
  writeBackTraceReplayJsonb,
  type MetricPercentiles,
  type RequestLengthMoments,
  type SequenceLengthSketches,
} from './agentic-shared';

// STATS_VERSION, the profile extractor `extractIslOsl`, and the percentile
// math + envelope reader all live in agentic-shared.ts (the cycle-free leaf).
// Re-exported here because etl/compute-aggregate-stats and the API layer
// import them from this module.
export {
  extractIslOsl,
  percentilesOf,
  sequenceLengthSketches,
  STATS_VERSION,
  type MetricPercentiles,
  type SequenceLengthSketches,
} from './agentic-shared';

export interface AgenticAggregate {
  id: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
}

export type AgenticAggregateMap = Record<number, AgenticAggregate>;

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
    }
    result[id] = agg;
  }
  // Also fall back for ids that didn't return a row at all (no trace_replay
  // link) — keep the caller contract: every id we know about lands in the map.
  for (const id of benchmarkResultIds) {
    if (!(id in result)) result[id] = blankAggregate(id);
  }

  if (idsNeedingProfile.length === 0) {
    return result;
  }

  // Accumulate a complete, version-stamped `aggregate_stats` bundle per id as
  // the two passes recompute it, so we can self-heal the shared JSONB column
  // afterward (see the write-back loop below). Only ids whose profile blob
  // parsed cleanly get an entry — a null/malformed blob must never overwrite
  // good stored data.
  const pendingById = new Map<number, { traceReplayId: number; stats: FullAggregateStats }>();

  // Both passes stream blobs through bounded `substring` chunks instead of
  // selecting whole bytea columns: production profile blobs reach >240 MB
  // compressed while Neon's serverless HTTP driver caps a single response at
  // 64 MB (HTTP 507 above that), so an inline blob select can fail the whole
  // query — the failure mode that blanked derived metrics for stale-version
  // rows. One cheap metadata query maps ids to trace_replay rows first.
  const metaRows = (await sql`
    select
      br.id as benchmark_result_id,
      atr.id as trace_replay_id,
      (atr.profile_export_jsonl_gz is not null) as has_profile_blob,
      (atr.server_metrics_json_gz is not null) as has_server_blob
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = any(${idsNeedingProfile}::bigint[])
  `) as {
    benchmark_result_id: number;
    trace_replay_id: number;
    has_profile_blob: boolean;
    has_server_blob: boolean;
  }[];

  // ── Fallback Pass 1: profile_export blobs (streamed line parse). ──────
  for (const row of metaRows) {
    const id = Number(row.benchmark_result_id);
    result[id] ??= blankAggregate(id);
    if (!row.has_profile_blob) continue;
    try {
      // One pass yields every profile-derived field so the self-healed
      // bundle is complete at the new version. Server-derived fields are
      // filled in Pass 2 (or stay null without a server blob).
      const { isl, osl, e2elPerOsl, pairs } = await extractProfileSamples(
        streamTraceReplayBlob(sql, 'profile_export_jsonl_gz', Number(row.trace_replay_id)),
      );
      const islPct = percentilesOf(isl);
      const oslPct = percentilesOf(osl);
      result[id].isl = islPct;
      result[id].osl = oslPct;
      pendingById.set(id, {
        traceReplayId: Number(row.trace_replay_id),
        stats: {
          version: STATS_VERSION,
          isl: islPct,
          osl: oslPct,
          kvCacheUtil: null,
          prefixCacheHitRate: null,
          e2elPerOsl: percentilesOf(e2elPerOsl),
          sequenceLengths: sequenceLengthSketches(isl, osl),
          requestLengthMoments: requestLengthMomentsOf(pairs),
        },
      });
    } catch {
      // ignore malformed/unreadable blob — never fail the whole response
    }
  }
  // ── Fallback Pass 2: server_metrics blobs (huge; one at a time). ───────
  // Serial to avoid OOM on the decompressed JSON of a high-conc TP+EP row
  // (>500 MB raw). The aggregator is fronted by a blob cache, so the slow
  // path runs at most once per sibling set.
  for (const row of metaRows) {
    const id = Number(row.benchmark_result_id);
    result[id] ??= blankAggregate(id);
    if (!row.has_server_blob) continue;
    let parsed: { kvCacheUtil: number[]; prefixCacheHitRate: number[] } | null = null;
    try {
      const serverBlob = await readTraceReplayBlob(
        sql,
        'server_metrics_json_gz',
        Number(row.trace_replay_id),
      );
      if (!serverBlob) continue;
      const json = gunzipJsonWithinLimit(serverBlob);
      parsed =
        json === null
          ? await streamExtractServerMetricSamples(serverBlob)
          : extractServerMetricSamples(json);
    } catch {
      // malformed blob or failed stream fallback — leave nulls
    }
    if (parsed) {
      const kvPct = percentilesOf(parsed.kvCacheUtil);
      const prefixPct = percentilesOf(parsed.prefixCacheHitRate);
      result[id].kvCacheUtil = kvPct;
      result[id].prefixCacheHitRate = prefixPct;
      const pending = pendingById.get(id);
      if (pending) {
        pending.stats.kvCacheUtil = kvPct;
        pending.stats.prefixCacheHitRate = prefixPct;
      }
    }
  }

  // Self-heal the shared `aggregate_stats` column: persist the freshly
  // recomputed, version-stamped bundle so the next request (this route AND the
  // derived-agentic-metrics route, which read the same column) takes the fast
  // path instead of re-decompressing these blobs. Only ids whose profile blob
  // parsed cleanly are in `pendingById`, so a null/malformed recompute never
  // clobbers good data. Fire-and-forget, best-effort (no-ops on a read-only
  // replica) — never delays or fails the response.
  for (const { traceReplayId, stats } of pendingById.values()) {
    writeBackTraceReplayJsonb(sql, 'aggregate_stats', traceReplayId, stats);
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
}

/**
 * The complete `aggregate_stats` bundle we write back on the fallback path.
 * Mirrors `AggregateStats` in etl/compute-aggregate-stats.ts (kept local to
 * avoid an import cycle with that module, which depends on this one).
 */
interface FullAggregateStats {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
  e2elPerOsl: MetricPercentiles | null;
  sequenceLengths: SequenceLengthSketches;
  requestLengthMoments: RequestLengthMoments | null;
}

function blankAggregate(id: number): AgenticAggregate {
  return { id, isl: null, osl: null, kvCacheUtil: null, prefixCacheHitRate: null };
}
