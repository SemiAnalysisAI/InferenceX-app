import type { DbClient } from '../connection.js';

export type IdRuns = number[];

export interface BenchmarkPresence {
  trace: IdRuns;
  log: IdRuns;
}

export async function getBenchmarkPresence(sql: DbClient): Promise<BenchmarkPresence> {
  const rows = (await sql`
    select trace, string_agg((start - coalesce(previous_end, 0)) || ',' || length, ',' order by start) as runs
    from (
      select trace, start, length, lag(start + length) over (partition by trace order by start) as previous_end
      from benchmark_presence_runs
    ) r
    group by trace
  `) as { trace: boolean; runs: string }[];

  const presence: BenchmarkPresence = { trace: [], log: [] };
  for (const row of rows) presence[row.trace ? 'trace' : 'log'] = JSON.parse(`[${row.runs}]`);
  return presence;
}
