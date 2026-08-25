/**
 * Helpers shared by the agentic per-point queries (`agentic-aggregates.ts`,
 * `derived-agentic-metrics.ts`): percentile math over aiperf samples,
 * the `{value, unit}` metric-envelope reader, the single-round-trip
 * `aggregate_stats` fetch both fast paths start from, and the best-effort
 * write-back both use to self-heal a stale precomputed payload.
 *
 * `STATS_VERSION` and the profile-blob extractor `extractIslOsl` live here (the
 * dependency-free leaf) rather than in `agentic-aggregates.ts` so both query
 * modules — and `etl/compute-aggregate-stats.ts` — can share them without an
 * import cycle: `agentic-aggregates` ⇄ `derived-agentic-metrics` would
 * otherwise close a loop once each needs the other's blob helpers for
 * write-back. (agentic-aggregates re-exports both for existing importers.)
 */

import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import type { DbClient } from '../connection.js';

import {
  buildTokenLengthSketch,
  type TokenLengthSketch,
} from '@semianalysisai/inferencex-constants';

/**
 * Bump when the aggregate-stats computation algorithm changes — the backfill
 * script recomputes any row whose stored `aggregate_stats.version` is older,
 * and the read-path fast/slow branches key off it.
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
 *
 * v6: drop the retired per-point derived metrics (normalizedSessionTimeS,
 * p90PrefillTpsPerUser, normalizedE2e400) along with the experimental chart
 * modes they fed.
 *
 * v7: add `e2elPerOsl` — percentiles of per-request E2E latency divided by
 * OSL (seconds per output token), the inverse of the "E2E Normalized Interactivity" x-axis
 * metric.
 *
 * v8: add p95 and bounded mergeable ISL/OSL sketches. The dashboard merges
 * the sketches for all resident chart points instead of loading request-level
 * timelines or attempting to combine per-point percentiles.
 *
 * v9: add `requestLengthMoments` — exact joint moments of the per-request
 * (ISL, OSL) pairs (n, ΣISL, ΣISL², ΣOSL, ΣOSL², ΣISL·OSL). The frontend
 * integrates model-specific attention-FLOPs formulas over the true request
 * population from these sums (prefill attention is quadratic in context, so
 * E[ISL²] ≠ E[ISL]² matters); marginal percentiles/sketches can't provide the
 * joint ISL·OSL term the decode integral needs.
 */
export const STATS_VERSION = 9;

/**
 * Exact sums over the per-request (ISL, OSL) pairs of one benchmark point.
 * Only records carrying BOTH sequence lengths contribute, so every sum is
 * over the same request population and cross-terms stay consistent.
 *
 * These six sums are sufficient statistics for any attention-cost integral
 * that is polynomial (≤ quadratic) in per-request context length: e.g.
 * Σᵢ suffix-prefill context = (1−r²)/2 · ΣISL² and Σᵢ decode context =
 * ΣISL·OSL + (ΣOSL² + ΣOSL)/2, with r the point's theoretical cache hit rate.
 */
export interface RequestLengthMoments {
  /** Number of requests with both ISL and OSL present. */
  n: number;
  sumIsl: number;
  sumIslSq: number;
  sumOsl: number;
  sumOslSq: number;
  sumIslOsl: number;
}

/** Accumulate the joint moments for paired per-request (ISL, OSL) samples. */
export function requestLengthMomentsOf(
  pairs: readonly { isl: number; osl: number }[],
): RequestLengthMoments | null {
  if (pairs.length === 0) return null;
  const m: RequestLengthMoments = {
    n: 0,
    sumIsl: 0,
    sumIslSq: 0,
    sumOsl: 0,
    sumOslSq: 0,
    sumIslOsl: 0,
  };
  for (const { isl, osl } of pairs) {
    if (!Number.isFinite(isl) || !Number.isFinite(osl) || isl < 0 || osl < 0) continue;
    m.n += 1;
    m.sumIsl += isl;
    m.sumIslSq += isl * isl;
    m.sumOsl += osl;
    m.sumOslSq += osl * osl;
    m.sumIslOsl += isl * osl;
  }
  return m.n > 0 ? m : null;
}

interface ProfileRecord {
  metadata?: { benchmark_phase?: string; was_cancelled?: boolean };
  metrics?: {
    request_latency?: { value?: number; unit?: string } | number;
    time_to_first_token?: { value?: number; unit?: string } | number;
    input_sequence_length?: { value?: number } | number;
    output_sequence_length?: { value?: number } | number;
  };
}

/**
 * Per-request samples pulled from a profile_export.jsonl blob in one pass —
 * the raw material every profile-derived aggregate is computed from. Both
 * query fallbacks and the ingest/backfill path share this single extractor so
 * the fast (stored bundle) and slow (blob recompute) paths can never drift.
 */
export interface ProfileSamples {
  isl: number[];
  osl: number[];
  /** Per-request E2E latency / OSL ratios (seconds per output token). */
  e2elPerOsl: number[];
  /** (ISL, OSL) pairs over records carrying both lengths. */
  pairs: { isl: number; osl: number }[];
}

function addProfileSampleLine(acc: ProfileSamples, line: string): void {
  if (!line) return;
  let rec: ProfileRecord;
  try {
    rec = JSON.parse(line) as ProfileRecord;
  } catch {
    return;
  }
  if (rec.metadata?.benchmark_phase && rec.metadata.benchmark_phase !== 'profiling') return;
  if (rec.metadata?.was_cancelled === true) return;
  const m = rec.metrics ?? {};
  const isl = readNum(m.input_sequence_length);
  const osl = readNum(m.output_sequence_length);
  if (isl !== undefined) acc.isl.push(isl);
  if (osl !== undefined) acc.osl.push(osl);
  if (isl !== undefined && osl !== undefined) acc.pairs.push({ isl, osl });
  const rl = readNum(m.request_latency);
  const tt = readNum(m.time_to_first_token);
  if (
    rl !== undefined &&
    tt !== undefined &&
    isl !== undefined &&
    osl !== undefined &&
    rl > 0 &&
    tt > 0 &&
    isl > 0 &&
    osl > 0
  ) {
    acc.e2elPerOsl.push(rl / 1000 / osl);
  }
}

/** Collect profile samples from an already-decompressed JSONL string. */
export function collectProfileSamplesFromJsonl(jsonl: string): ProfileSamples {
  const acc: ProfileSamples = { isl: [], osl: [], e2elPerOsl: [], pairs: [] };
  for (const line of jsonl.split('\n')) addProfileSampleLine(acc, line);
  return acc;
}

/**
 * Stream a gzipped profile export line by line so exceptionally large traces
 * never materialize their multi-gigabyte decompressed JSONL as one string.
 * The numeric sample arrays are tiny relative to the source and are needed
 * for exact percentile calculation.
 */
export async function extractProfileSamples(
  compressedChunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<ProfileSamples> {
  const input = Readable.from(compressedChunks).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  const acc: ProfileSamples = { isl: [], osl: [], e2elPerOsl: [], pairs: [] };
  for await (const line of lines) addProfileSampleLine(acc, line);
  return acc;
}

/**
 * Parse the profile_export.jsonl → per-request ISL + OSL arrays, plus the
 * joint (ISL, OSL) moments over records carrying both lengths.
 */
export function extractIslOsl(jsonl: string): {
  isl: number[];
  osl: number[];
  requestLengthMoments: RequestLengthMoments | null;
} {
  const { isl, osl, pairs } = collectProfileSamplesFromJsonl(jsonl);
  return { isl, osl, requestLengthMoments: requestLengthMomentsOf(pairs) };
}

/**
 * 8 MiB of bytea per `substring` read — the hex wire encoding doubles it, so
 * each response stays far under Neon's serverless-HTTP 64 MB response cap.
 * Production profile blobs reach >240 MB compressed (server blobs are of the
 * same order), so selecting a whole blob column inline is NEVER safe: the
 * driver rejects the response (HTTP 507) and the whole query fails.
 */
export const BLOB_CHUNK_BYTES = 8 * 1024 * 1024;

export type TraceReplayBlobColumn = 'profile_export_jsonl_gz' | 'server_metrics_json_gz';

/** Normalize a driver-returned bytea value (Buffer, Uint8Array, or hex text). */
function asBuffer(v: unknown): Buffer | null {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === 'string' && v.startsWith(String.raw`\x`)) return Buffer.from(v.slice(2), 'hex');
  return null;
}

/**
 * Stream a gzipped blob column in bounded `substring` chunks. Self-terminating
 * on the first short/empty chunk, so no size pre-query is needed and a
 * `pg_column_size` vs `octet_length` mismatch can never truncate the stream.
 */
export async function* streamTraceReplayBlob(
  sql: DbClient,
  column: TraceReplayBlobColumn,
  traceReplayId: number,
): AsyncGenerator<Buffer> {
  for (let offset = 1; ; offset += BLOB_CHUNK_BYTES) {
    // Static SQL per column (no dynamic identifiers) — `column` is a
    // closed union, not caller-supplied text.
    const rows = (await (column === 'profile_export_jsonl_gz'
      ? sql`
          select substring(profile_export_jsonl_gz from ${offset} for ${BLOB_CHUNK_BYTES}) as chunk
          from agentic_trace_replay
          where id = ${traceReplayId}
        `
      : sql`
          select substring(server_metrics_json_gz from ${offset} for ${BLOB_CHUNK_BYTES}) as chunk
          from agentic_trace_replay
          where id = ${traceReplayId}
        `)) as { chunk: unknown }[];
    const chunk = asBuffer(rows[0]?.chunk);
    if (!chunk || chunk.length === 0) break;
    yield chunk;
    if (chunk.length < BLOB_CHUNK_BYTES) break;
  }
}

/** Read a whole blob column via bounded chunks; null when absent/empty. */
export async function readTraceReplayBlob(
  sql: DbClient,
  column: TraceReplayBlobColumn,
  traceReplayId: number,
): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of streamTraceReplayBlob(sql, column, traceReplayId)) chunks.push(chunk);
  return chunks.length > 0 ? Buffer.concat(chunks) : null;
}

export interface MetricPercentiles {
  mean: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  /** Sample count used to compute the percentiles. */
  n: number;
}

/** Linear-interpolated percentile (matches numpy's default linear method). */
export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (pos - lo);
}

export function meanOf(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Compute the percentile bundle for an array of samples; null if empty. */
export function percentilesOf(samples: number[]): MetricPercentiles | null {
  const clean = samples.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  const sorted = [...clean].toSorted((a, b) => a - b);
  return {
    mean: meanOf(sorted),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    n: sorted.length,
  };
}

export interface SequenceLengthSketches {
  isl: TokenLengthSketch | null;
  osl: TokenLengthSketch | null;
}

export function sequenceLengthSketches(
  isl: readonly number[],
  osl: readonly number[],
): SequenceLengthSketches {
  return {
    isl: buildTokenLengthSketch(isl),
    osl: buildTokenLengthSketch(osl),
  };
}

/** Pull a numeric metric out of the {value, unit} envelope (or a bare number). */
export function readNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value?: unknown }).value;
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
  }
  return undefined;
}

/**
 * One round-trip fetch of the pre-computed `aggregate_stats` JSONB for a set
 * of benchmark_results ids (via their trace_replay link). Both agentic fast
 * paths read from this; ids without a trace_replay row simply don't appear.
 * `Stats` is the caller's view of the JSONB shape.
 */
export async function fetchAggregateStatsRows<Stats>(
  sql: DbClient,
  benchmarkResultIds: readonly number[],
): Promise<{ benchmark_result_id: number; stats: Stats | null }[]> {
  return (await sql`
    select
      br.id as benchmark_result_id,
      atr.aggregate_stats as stats
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = any(${benchmarkResultIds}::bigint[])
  `) as unknown as { benchmark_result_id: number; stats: Stats | null }[];
}

/** Trace-replay JSONB columns the read path may self-heal after a recompute. */
export type WriteBackColumn = 'aggregate_stats' | 'chart_series' | 'request_timeline';

/** Logged once per process so a read-only connection doesn't spam the console. */
let writeBackWarned = false;

/** Reset the once-per-process warning latch (test-only). */
export function _resetWriteBackWarned(): void {
  writeBackWarned = false;
}

/**
 * Issue the fixed-column UPDATE. Kept as one tagged-template call per column so
 * the SQL text is fully static — no column name is ever interpolated — which
 * keeps it injection-proof and driver-agnostic. The bound value is the plain
 * payload OBJECT cast to `::jsonb`: both the neon HTTP driver and postgres.js
 * JSON-serialize an object parameter exactly once, so `::jsonb` parses it to a
 * JSONB object. (Passing `JSON.stringify(payload)` instead double-encodes into
 * a JSONB *string* — `jsonb_typeof` = 'string' — which is why we don't.) The
 * abstract `DbClient` doesn't expose postgres.js's `sql.json()`, so this is the
 * portable way to write JSONB.
 */
function updateJsonbColumn(
  sql: DbClient,
  column: WriteBackColumn,
  traceReplayId: number,
  value: unknown,
): Promise<unknown> {
  switch (column) {
    case 'aggregate_stats': {
      return sql`update agentic_trace_replay set aggregate_stats = ${value}::jsonb where id = ${traceReplayId}`;
    }
    case 'chart_series': {
      return sql`update agentic_trace_replay set chart_series = ${value}::jsonb where id = ${traceReplayId}`;
    }
    case 'request_timeline': {
      return sql`update agentic_trace_replay set request_timeline = ${value}::jsonb where id = ${traceReplayId}`;
    }
  }
}

/**
 * Best-effort, fire-and-forget persist of a freshly recomputed versioned
 * payload back into an `agentic_trace_replay` JSONB column, so the next request
 * takes the precomputed fast path instead of re-gunzipping the raw blob.
 *
 * The read path runs on the READONLY connection. On a true read replica (prod's
 * `DATABASE_READONLY_URL`) the UPDATE fails at the wire — this catches the
 * rejection and silently no-ops (warning once) so the response is never delayed
 * or failed. On local/superuser connections (where the readonly URL is also
 * write-capable) it self-heals the stored payload. Callers must only pass a
 * COMPLETE recomputed payload — never a partial/null-blob result — so a
 * self-heal never clobbers good data with holes.
 */
export function writeBackTraceReplayJsonb(
  sql: DbClient,
  column: WriteBackColumn,
  traceReplayId: number,
  payload: unknown,
): void {
  if (payload === null || payload === undefined) return;
  // structuredClone strips any class prototypes so the driver serializes plain
  // data only — matches `jsonbParam` in the backfill runner.
  const value = structuredClone(payload);
  void updateJsonbColumn(sql, column, traceReplayId, value).catch((error: unknown) => {
    if (!writeBackWarned) {
      writeBackWarned = true;
      console.warn(
        `[agentic write-back] could not persist ${column} (read-only connection?) — ` +
          `serving recomputed result without caching. ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  });
}
