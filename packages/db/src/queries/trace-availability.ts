/**
 * Bulk "does this point have a trace_replay blob?" lookup. Used by the
 * inference scatter chart to decide whether to render a "View charts"
 * button in the pinned tooltip — a pure presence check that doesn't need
 * the multi-megabyte blob payload `getTraceHistograms` ships.
 *
 * Going through `trace-histograms` for this trips Neon's 64 MB
 * per-HTTP-response cap as soon as one chunk's combined gzip payload
 * exceeds the cap (high-conc 8×8 rows can be 13 MB compressed each).
 */

import type { DbClient } from '../connection.js';

/** Map of `benchmark_results.id` → true for each id that has a trace_replay blob. */
export type TraceAvailabilityMap = Record<number, true>;

export async function getTraceAvailability(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<TraceAvailabilityMap> {
  if (benchmarkResultIds.length === 0) return {};

  const rows = (await sql`
    select br.id
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = any(${benchmarkResultIds}::bigint[])
      and atr.profile_export_jsonl_gz is not null
  `) as { id: number }[];

  const result: TraceAvailabilityMap = {};
  for (const row of rows) result[Number(row.id)] = true;
  return result;
}
