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

import type { DbClient } from '../connection.js';

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
 */
export const STATS_VERSION = 5;

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

export interface MetricPercentiles {
  mean: number;
  p50: number;
  p75: number;
  p90: number;
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
    p99: quantile(sorted, 0.99),
    n: sorted.length,
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
