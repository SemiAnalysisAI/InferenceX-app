/**
 * Live-computed per-point metrics derived from the stored aiperf
 * `profile_export.jsonl` blob. These aren't precomputed in the metrics JSONB
 * because they require a full pass over the per-request records — work that's
 * cheap once per agentic point but adds up to be meaningful only when
 * actually plotted.
 *
 * - E2E Normalized Interactivity ("e2e interactivity"): per-request output_sequence_length
 *   divided by request_latency — the rate at which the user receives output
 *   tokens INCLUDING the prefill wait, per
 *   https://semianalysis.slack.com/archives/C0AV4T40BT3/p1782432266626969.
 *   Algebraically `OSL / (TTFT + decode_time) ≈ 1 / (ITL + TTFT/OSL)`: plain
 *   interactivity with a penalty that grows when TTFT is large relative to
 *   the output produced, so prefill-delaying can't inflate the metric the way
 *   it can with 1/TPOT.
 *
 *   Percentiles follow the slow-tail convention the mapper enforces for
 *   `*_intvty` (1/p(ITL), not p(1/ITL)): we store percentiles of the
 *   per-request E2EL/OSL ratio (seconds per output token) and the read path
 *   inverts, so `p90 E2E Normalized Interactivity = 1 / p90(E2EL/OSL)` is the 90th-percentile
 *   WORST request's effective token rate.
 */

import { gunzipSync } from 'node:zlib';

import type { DbClient } from '../connection.js';
import {
  extractIslOsl,
  fetchAggregateStatsRows,
  percentilesOf,
  readNum,
  STATS_VERSION,
  writeBackTraceReplayJsonb,
  type MetricPercentiles,
} from './agentic-shared';

export interface DerivedAgenticMetric {
  /** benchmark_results.id this entry belongs to. */
  id: number;
  /** Slow-tail P75 E2E Normalized Interactivity in tok/s/user — 1 / p75(per-request E2EL/OSL). */
  p75_e2e_norm_intvty: number | null;
  /** Slow-tail P90 E2E Normalized Interactivity in tok/s/user — 1 / p90(per-request E2EL/OSL). */
  p90_e2e_norm_intvty: number | null;
}

export type DerivedAgenticMetricMap = Record<number, DerivedAgenticMetric>;

/**
 * The full `aggregate_stats` JSONB shape (mirrors `AggregateStats` in
 * etl/compute-aggregate-stats.ts). Duplicated here rather than imported to keep
 * this module off the etl import graph. When we self-heal from the profile blob
 * alone, the server-derived fields (kvCacheUtil, prefixCacheHitRate) are carried
 * forward untouched from the stale row — never re-reading the huge server blob.
 * This mirrors the profile-only upgrade `backfill-aggregate-stats.ts` performs;
 * the agentic-aggregates route (which does read the server blob) heals those
 * server fields.
 */
interface StoredAggregateStats {
  version: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
  e2elPerOsl: MetricPercentiles | null;
}

/**
 * JSONL blobs can be ~1-2 MB compressed (~5-10 MB raw) and Neon's serverless
 * HTTP driver caps responses at 64 MB — chunk to stay well under.
 */
const QUERY_CHUNK_SIZE = 6;

interface RecordMetrics {
  request_latency?: { value?: number; unit?: string } | number;
  time_to_first_token?: { value?: number; unit?: string } | number;
  input_sequence_length?: { value?: number } | number;
  output_sequence_length?: { value?: number } | number;
}

interface RecordMetadata {
  conversation_id?: string;
  turn_index?: number;
  benchmark_phase?: string;
}

interface ProfileRecord {
  metadata?: RecordMetadata;
  metrics?: RecordMetrics;
}

interface TurnFields {
  request_latency_ms: number;
  ttft_ms: number;
  isl: number;
  osl: number;
}

function extractTurn(rec: ProfileRecord): TurnFields | null {
  const m = rec.metrics ?? {};
  const rl = readNum(m.request_latency);
  const tt = readNum(m.time_to_first_token);
  const isl = readNum(m.input_sequence_length);
  const osl = readNum(m.output_sequence_length);
  if (rl === undefined || tt === undefined || isl === undefined || osl === undefined) return null;
  if (rl <= 0 || tt <= 0 || isl <= 0 || osl <= 0) return null;
  return { request_latency_ms: rl, ttft_ms: tt, isl, osl };
}

/** 1/x for a positive stored ratio; null when the bundle/percentile is absent. */
function invertRatio(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? 1 / v : null;
}

/**
 * Parse one point's JSONL and return the per-request E2EL/OSL ratio
 * percentiles (seconds per output token). Every profiling-phase turn with
 * complete, positive fields contributes one sample — the distribution pools
 * turns across all sessions so a percentile sees the full request population.
 * Returns `{ e2el_per_osl: null }` if the blob has no usable records.
 */
export function computeDerivedFromBlob(jsonl: string): {
  e2el_per_osl: MetricPercentiles | null;
} {
  const ratios: number[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line) continue;
    let rec: ProfileRecord;
    try {
      rec = JSON.parse(line) as ProfileRecord;
    } catch {
      continue;
    }
    if (rec.metadata?.benchmark_phase && rec.metadata.benchmark_phase !== 'profiling') continue;
    const turn = extractTurn(rec);
    if (!turn) continue;
    ratios.push(turn.request_latency_ms / 1000 / turn.osl);
  }
  return { e2el_per_osl: percentilesOf(ratios) };
}

export async function getDerivedAgenticMetrics(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<DerivedAgenticMetricMap> {
  if (benchmarkResultIds.length === 0) return {};

  const result: DerivedAgenticMetricMap = {};

  // Fast path: read the pre-computed ratio bundle out of `aggregate_stats`.
  // The ingest pipeline computes it in the same pass that produces the
  // percentile bundles, so a single SQL round-trip covers most ids without
  // touching the gzipped profile blob.
  const statsRows = await fetchAggregateStatsRows<StoredAggregateStats>(sql, benchmarkResultIds);

  const idsNeedingBlob: number[] = [];
  // Carry each stale/missing row's existing stats into the fallback so a
  // self-heal preserves the server-derived fields (kvCacheUtil,
  // prefixCacheHitRate) it can't recompute from the profile blob alone.
  const staleStatsById = new Map<number, StoredAggregateStats | null>();
  for (const row of statsRows) {
    const id = Number(row.benchmark_result_id);
    if (row.stats && Number(row.stats.version) === STATS_VERSION) {
      result[id] = {
        id,
        p75_e2e_norm_intvty: invertRatio(row.stats.e2elPerOsl?.p75),
        p90_e2e_norm_intvty: invertRatio(row.stats.e2elPerOsl?.p90),
      };
    } else {
      idsNeedingBlob.push(id);
      staleStatsById.set(id, row.stats ?? null);
    }
  }

  if (idsNeedingBlob.length === 0) return result;

  // Fallback: parse the profile blob directly. Used for rows whose
  // `aggregate_stats` is null or computed by an older STATS_VERSION; the
  // backfill script drains the population so this path should be rare.
  // `trace_replay_id` + the (small) stale `aggregate_stats` come along on the
  // same join — no extra round-trip — so we can self-heal after recompute.
  const rows: {
    benchmark_result_id: number;
    trace_replay_id: number;
    blob: Buffer;
  }[] = [];
  for (let i = 0; i < idsNeedingBlob.length; i += QUERY_CHUNK_SIZE) {
    const chunk = idsNeedingBlob.slice(i, i + QUERY_CHUNK_SIZE);
    const chunkRows = (await sql`
      select
        br.id as benchmark_result_id,
        atr.id as trace_replay_id,
        atr.profile_export_jsonl_gz as blob
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = any(${chunk}::bigint[])
        and atr.profile_export_jsonl_gz is not null
    `) as { benchmark_result_id: number; trace_replay_id: number; blob: Buffer }[];
    rows.push(...chunkRows);
  }

  for (const row of rows) {
    const id = Number(row.benchmark_result_id);
    try {
      const jsonl = gunzipSync(row.blob).toString('utf8');
      const { e2el_per_osl } = computeDerivedFromBlob(jsonl);
      result[id] = {
        id,
        p75_e2e_norm_intvty: invertRatio(e2el_per_osl?.p75),
        p90_e2e_norm_intvty: invertRatio(e2el_per_osl?.p90),
      };

      // Self-heal the shared `aggregate_stats` bundle. We only have the profile
      // blob here, so recompute the profile-derived fields (isl/osl + the
      // ratio bundle) and carry the stale row's server-derived fields
      // forward untouched — the profile-only upgrade the backfill CLI also
      // performs. Fire-and-forget, best-effort (no-ops on a read-only replica).
      //
      // Only stamp the bundle when the stale row actually HAS server-derived
      // fields to carry forward. Writing nulls at the current version would
      // look complete to everyone downstream: the backfill skips the row
      // (its candidate query matches on version) and the agentic-aggregates
      // route takes the fast path, so kvCacheUtil / prefixCacheHitRate would
      // stay null forever. Leaving the row stale instead costs one repeat
      // parse and lets a reader that CAN see the server blob heal it fully.
      const prior = staleStatsById.get(id) ?? null;
      const canPreserveServerFields = Boolean(prior?.kvCacheUtil || prior?.prefixCacheHitRate);
      if (canPreserveServerFields) {
        const { isl, osl } = extractIslOsl(jsonl);
        const merged: StoredAggregateStats = {
          version: STATS_VERSION,
          isl: percentilesOf(isl),
          osl: percentilesOf(osl),
          kvCacheUtil: prior?.kvCacheUtil ?? null,
          prefixCacheHitRate: prior?.prefixCacheHitRate ?? null,
          e2elPerOsl: e2el_per_osl,
        };
        writeBackTraceReplayJsonb(sql, 'aggregate_stats', Number(row.trace_replay_id), merged);
      }
    } catch {
      // Skip malformed blobs silently — frontend treats missing ids as "no data".
    }
  }
  return result;
}
