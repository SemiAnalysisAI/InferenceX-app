import type { DbClient } from '../connection.js';

export type IdRuns = number[];

export interface BenchmarkPresence {
  trace: IdRuns;
  log: IdRuns;
}

export async function getBenchmarkPresence(sql: DbClient): Promise<BenchmarkPresence> {
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
