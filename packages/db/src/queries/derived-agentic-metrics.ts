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

import type { DbClient } from '../connection.js';
import {
  collectProfileSamplesFromJsonl,
  extractProfileSamples,
  fetchAggregateStatsRows,
  percentilesOf,
  requestLengthMomentsOf,
  sequenceLengthSketches,
  STATS_VERSION,
  streamTraceReplayBlob,
  writeBackTraceReplayJsonb,
  type MetricPercentiles,
  type RequestLengthMoments,
  type SequenceLengthSketches,
} from './agentic-shared';

export interface DerivedAgenticMetric {
  /** benchmark_results.id this entry belongs to. */
  id: number;
  /** Slow-tail P75 E2E Normalized Interactivity in tok/s/user — 1 / p75(per-request E2EL/OSL). */
  p75_e2e_norm_intvty: number | null;
  /** Slow-tail P90 E2E Normalized Interactivity in tok/s/user — 1 / p90(per-request E2EL/OSL). */
  p90_e2e_norm_intvty: number | null;
  /**
   * Exact joint (ISL, OSL) sums over the request population. The frontend
   * integrates per-model attention-FLOPs formulas over these for the
   * TFLOP/s-per-chip y-metric. Null when the blob had no usable records or
   * the stored bundle predates v9 and hasn't self-healed yet.
   */
  request_length_moments: RequestLengthMoments | null;
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
  sequenceLengths: SequenceLengthSketches;
  requestLengthMoments?: RequestLengthMoments | null;
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
  request_length_moments: RequestLengthMoments | null;
} {
  // Moments only need the sequence-length pair — the shared collector keeps
  // them even when the latency fields the ratio requires are missing or
  // non-positive.
  const { e2elPerOsl, pairs } = collectProfileSamplesFromJsonl(jsonl);
  return {
    e2el_per_osl: percentilesOf(e2elPerOsl),
    request_length_moments: requestLengthMomentsOf(pairs),
  };
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
        request_length_moments: row.stats.requestLengthMoments ?? null,
      };
    } else {
      idsNeedingBlob.push(id);
      staleStatsById.set(id, row.stats ?? null);
    }
  }

  if (idsNeedingBlob.length === 0) return result;

  // Fallback: recompute from the profile blob. Used for rows whose
  // `aggregate_stats` is null or computed by an older STATS_VERSION; the
  // backfill script drains the population so this path should be rare.
  //
  // The blob is NEVER selected whole: production profile exports reach
  // >240 MB compressed while Neon's serverless HTTP driver caps a response at
  // 64 MB (HTTP 507 above that — the failure that blanked the TFLOP/s
  // metric for every pre-v9 row). Instead a cheap metadata query maps ids to
  // trace_replay rows, then each blob streams through bounded `substring`
  // chunks into a streaming gunzip line parser — the same pattern
  // backfill-aggregate-stats.ts uses for oversized TOAST values.
  const metaRows = (await sql`
    select
      br.id as benchmark_result_id,
      atr.id as trace_replay_id
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = any(${idsNeedingBlob}::bigint[])
      and atr.profile_export_jsonl_gz is not null
  `) as { benchmark_result_id: number; trace_replay_id: number }[];

  // Serial on purpose: each blob already parallelizes nothing and bounding
  // concurrency keeps peak memory at one decompression stream.
  for (const row of metaRows) {
    const id = Number(row.benchmark_result_id);
    try {
      const { isl, osl, e2elPerOsl, pairs } = await extractProfileSamples(
        streamTraceReplayBlob(sql, 'profile_export_jsonl_gz', Number(row.trace_replay_id)),
      );
      const e2el_per_osl = percentilesOf(e2elPerOsl);
      const request_length_moments = requestLengthMomentsOf(pairs);
      result[id] = {
        id,
        p75_e2e_norm_intvty: invertRatio(e2el_per_osl?.p75),
        p90_e2e_norm_intvty: invertRatio(e2el_per_osl?.p90),
        request_length_moments,
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
        const merged: StoredAggregateStats = {
          version: STATS_VERSION,
          isl: percentilesOf(isl),
          osl: percentilesOf(osl),
          kvCacheUtil: prior?.kvCacheUtil ?? null,
          prefixCacheHitRate: prior?.prefixCacheHitRate ?? null,
          e2elPerOsl: e2el_per_osl,
          sequenceLengths: sequenceLengthSketches(isl, osl),
          requestLengthMoments: request_length_moments,
        };
        writeBackTraceReplayJsonb(sql, 'aggregate_stats', Number(row.trace_replay_id), merged);
      }
    } catch {
      // One malformed/unreadable blob must never take down the whole
      // response — the frontend treats missing ids as "no data".
    }
  }
  return result;
}
