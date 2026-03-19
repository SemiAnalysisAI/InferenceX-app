import type { NeonClient } from '../connection.js';

/**
 * Fetch a server log by benchmark_result_id. Returns null if not found.
 */
export async function getServerLog(
  sql: NeonClient,
  benchmarkResultId: number,
): Promise<string | null> {
  const rows = (await sql`
    select sl.server_log
    from benchmark_results br
    join server_logs sl on sl.id = br.server_log_id
    where br.id = ${benchmarkResultId}
  `) as { server_log: string }[];
  return rows[0]?.server_log ?? null;
}
