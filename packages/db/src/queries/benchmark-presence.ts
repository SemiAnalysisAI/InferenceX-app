/**
 * Which benchmark points have a stored trace or a linked server log, for every
 * point at once. The chart decides from these whether a point offers "View
 * charts" and "View logs". `/api/v1/trace-availability` and
 * `/api/v1/log-availability` answer their `?ids=` lookups from the same sets.
 *
 * Ids are sorted and sent as runs of consecutive ids, because ingest assigns a
 * run's rows adjacent ids. On production data that is about 1.1k runs for
 * 26k ids, a few KB of JSON for the whole table.
 */

import type { DbClient } from '../connection.js';

/**
 * Ascending ids as `[gap, length, gap, length, ...]`. Each run covers ids
 * `start .. start + length - 1`, where `start` is `gap` past the end of the
 * previous run (the first run's `gap` is its start id).
 */
export type IdRuns = number[];

export interface BenchmarkPresence {
  /** Points whose trace replay has a stored profile export. */
  trace: IdRuns;
  /** Points with a linked server log bundle. */
  log: IdRuns;
}

export async function getBenchmarkPresence(sql: DbClient): Promise<BenchmarkPresence> {
  // Grouping by `id - row_number()` collapses each run of consecutive ids into
  // one row, so the database returns runs rather than every id.
  const rows = (await sql`
    with present as (
      select br.id, true as trace
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0
      union all
      select br.id, false as trace
      from benchmark_results br
      where br.server_log_id is not null
    )
    select trace, min(id) as start, count(*) as length
    from (
      select trace, id, id - row_number() over (partition by trace order by id) as island
      from present
    ) runs
    group by trace, island
    order by trace, start
  `) as { trace: boolean; start: number | string; length: number | string }[];

  const presence: BenchmarkPresence = { trace: [], log: [] };
  let traceEnd = 0;
  let logEnd = 0;
  for (const row of rows) {
    const start = Number(row.start);
    const length = Number(row.length);
    if (row.trace) {
      presence.trace.push(start - traceEnd, length);
      traceEnd = start + length;
    } else {
      presence.log.push(start - logEnd, length);
      logEnd = start + length;
    }
  }
  return presence;
}
