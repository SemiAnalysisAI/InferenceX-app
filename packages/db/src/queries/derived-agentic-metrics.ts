/**
 * Live-computed per-point metrics derived from the stored aiperf
 * `profile_export.jsonl` blob. These aren't precomputed in the metrics JSONB
 * because they require grouping by `conversation_id` and aggregating per
 * session — work that's cheap once per agentic point but adds up to be
 * meaningful only when actually plotted.
 *
 * - normalized_session_time_s: per the "Mean Normalized Session Time" proposal
 *   (https://gist.github.com/xinli-sw/115d370c17f6d1b977878b68530981fa). Sum of
 *   per-turn `request_latency` per session (inter-turn tool/thinking gaps are
 *   inherently excluded since we only sum the active GPU time, not wallclock).
 *   Each session's time is rescaled by `mean_load / session_load`, where load
 *   is Σ(ISL+OSL) across turns. The plotted value is the mean across sessions.
 *
 * - p90_prefill_tps_per_user: per the same gist's "Prefill" Pareto chart.
 *   Per turn: prefill_tps = ISL / TTFT_seconds. Single P90 across every turn
 *   in every session — the per-session percentile + cross-session mean
 *   sandwich was discarded because it just dampens tail behavior.
 */

import { gunzipSync } from 'node:zlib';

import { NORMALIZED_E2E_OUTPUT_TOKENS } from '@semianalysisai/inferencex-constants';

import type { DbClient } from '../connection.js';
import {
  extractIslOsl,
  fetchAggregateStatsRows,
  meanOf,
  percentilesOf,
  quantile,
  readNum,
  STATS_VERSION,
  writeBackTraceReplayJsonb,
  type MetricPercentiles,
} from './agentic-shared';

export interface DerivedAgenticMetric {
  /** benchmark_results.id this entry belongs to. */
  id: number;
  /** Mean normalized session time in seconds. */
  normalized_session_time_s: number | null;
  /** P90 of per-turn prefill tps/user (ISL / TTFT) across every turn in every session. */
  p90_prefill_tps_per_user: number | null;
  /** P75 normalized per-request E2E at a fixed 400-token output length. */
  p75_normalized_e2e_400_s: number | null;
  /** P90 normalized per-request E2E at a fixed 400-token output length. */
  p90_normalized_e2e_400_s: number | null;
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
  normalizedSessionTimeS: number | null;
  p90PrefillTpsPerUser: number | null;
  normalizedE2e400: MetricPercentiles | null;
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

/**
 * Parse one point's JSONL and return the two derived metrics. Returns
 * `{ session_time: null, prefill: null }` if the blob has no usable records.
 */
export function computeDerivedFromBlob(jsonl: string): {
  normalized_session_time_s: number | null;
  p90_prefill_tps_per_user: number | null;
  normalized_e2e_400: MetricPercentiles | null;
} {
  // Group records by conversation_id, filter to the profiling phase.
  const bySession = new Map<string, TurnFields[]>();
  for (const line of jsonl.split('\n')) {
    if (!line) continue;
    let rec: ProfileRecord;
    try {
      rec = JSON.parse(line) as ProfileRecord;
    } catch {
      continue;
    }
    if (rec.metadata?.benchmark_phase && rec.metadata.benchmark_phase !== 'profiling') continue;
    const sid = rec.metadata?.conversation_id;
    if (!sid) continue;
    const turn = extractTurn(rec);
    if (!turn) continue;
    let list = bySession.get(sid);
    if (!list) {
      list = [];
      bySession.set(sid, list);
    }
    list.push(turn);
  }
  if (bySession.size === 0) {
    return {
      normalized_session_time_s: null,
      p90_prefill_tps_per_user: null,
      normalized_e2e_400: null,
    };
  }

  // Per-session aggregates for session time; per-turn prefill rates pool into
  // a single global array so the percentile sees the full distribution.
  const sessionTimesS: number[] = [];
  const sessionLoads: number[] = [];
  const allPrefillRates: number[] = [];
  const allNormalizedE2eS: number[] = [];
  for (const turns of bySession.values()) {
    let timeMs = 0;
    let load = 0;
    for (const t of turns) {
      timeMs += t.request_latency_ms;
      load += t.isl + t.osl;
      const ttftSec = t.ttft_ms / 1000;
      if (ttftSec > 0) allPrefillRates.push(t.isl / ttftSec);

      // Keep the observed TTFT, then project the request's mean decode
      // interval to a fixed output length. Do this per request before taking
      // percentiles so long original outputs do not dominate the tail.
      const observedDecodeIntervals = Math.max(t.osl - 1, 1);
      const itlMs = (t.request_latency_ms - t.ttft_ms) / observedDecodeIntervals;
      const normalizedMs = t.ttft_ms + (NORMALIZED_E2E_OUTPUT_TOKENS - 1) * itlMs;
      if (
        Number.isFinite(itlMs) &&
        itlMs >= 0 &&
        Number.isFinite(normalizedMs) &&
        normalizedMs > 0
      ) {
        allNormalizedE2eS.push(normalizedMs / 1000);
      }
    }
    if (load > 0) {
      sessionTimesS.push(timeMs / 1000);
      sessionLoads.push(load);
    }
  }

  // Normalized session time: T̃_i = T_i × (mean_load / load_i), then mean.
  let normalized: number | null = null;
  if (sessionTimesS.length > 0) {
    const meanLoad = meanOf(sessionLoads);
    if (meanLoad > 0) {
      const scaled: number[] = [];
      for (let i = 0; i < sessionTimesS.length; i++) {
        const ti = sessionTimesS[i]!;
        const li = sessionLoads[i]!;
        if (li > 0) scaled.push(ti * (meanLoad / li));
      }
      normalized = scaled.length > 0 ? meanOf(scaled) : null;
    }
  }

  let prefill: number | null = null;
  if (allPrefillRates.length > 0) {
    allPrefillRates.sort((a, b) => a - b);
    prefill = quantile(allPrefillRates, 0.9);
  }

  return {
    normalized_session_time_s: normalized,
    p90_prefill_tps_per_user: prefill,
    normalized_e2e_400: percentilesOf(allNormalizedE2eS),
  };
}

export async function getDerivedAgenticMetrics(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<DerivedAgenticMetricMap> {
  if (benchmarkResultIds.length === 0) return {};

  const result: DerivedAgenticMetricMap = {};

  // Fast path: read the pre-computed values out of `aggregate_stats`. The
  // ingest pipeline computes both metrics in the same pass that produces the
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
        normalized_session_time_s: row.stats.normalizedSessionTimeS ?? null,
        p90_prefill_tps_per_user: row.stats.p90PrefillTpsPerUser ?? null,
        p75_normalized_e2e_400_s: row.stats.normalizedE2e400?.p75 ?? null,
        p90_normalized_e2e_400_s: row.stats.normalizedE2e400?.p90 ?? null,
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
      const { normalized_session_time_s, p90_prefill_tps_per_user, normalized_e2e_400 } =
        computeDerivedFromBlob(jsonl);
      result[id] = {
        id,
        normalized_session_time_s,
        p90_prefill_tps_per_user,
        p75_normalized_e2e_400_s: normalized_e2e_400?.p75 ?? null,
        p90_normalized_e2e_400_s: normalized_e2e_400?.p90 ?? null,
      };

      // Self-heal the shared `aggregate_stats` bundle. We only have the profile
      // blob here, so recompute the profile-derived fields (isl/osl + the three
      // derived metrics) and carry the stale row's server-derived fields
      // forward untouched — the profile-only upgrade the backfill CLI also
      // performs. Fire-and-forget, best-effort (no-ops on a read-only replica).
      const { isl, osl } = extractIslOsl(jsonl);
      const prior = staleStatsById.get(id) ?? null;
      const merged: StoredAggregateStats = {
        version: STATS_VERSION,
        isl: percentilesOf(isl),
        osl: percentilesOf(osl),
        kvCacheUtil: prior?.kvCacheUtil ?? null,
        prefixCacheHitRate: prior?.prefixCacheHitRate ?? null,
        normalizedSessionTimeS: normalized_session_time_s,
        p90PrefillTpsPerUser: p90_prefill_tps_per_user,
        normalizedE2e400: normalized_e2e_400,
      };
      writeBackTraceReplayJsonb(sql, 'aggregate_stats', Number(row.trace_replay_id), merged);
    } catch {
      // Skip malformed blobs silently — frontend treats missing ids as "no data".
    }
  }
  return result;
}
