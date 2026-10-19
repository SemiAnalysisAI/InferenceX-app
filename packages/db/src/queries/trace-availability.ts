import type { DbClient } from '../connection.js';

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
      and (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0)
  `) as { id: number }[];

  const result: TraceAvailabilityMap = {};
  for (const row of rows) result[Number(row.id)] = true;
  return result;
}
