import type { DbClient } from '../connection.js';

/** Map of `benchmark_results.id` → true for each id with a linked server log. */
export type ServerLogAvailabilityMap = Record<number, true>;

export interface ServerLogChunk {
  serverLog: string;
  offset: number;
  nextOffset: number | null;
}

/**
 * Fetch a server log by benchmark_result_id. Returns null if not found.
 */
export async function getServerLog(
  sql: DbClient,
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

/**
 * Fetch a bounded character range from a server log.
 *
 * Some production logs are hundreds of megabytes, so the UI must never read
 * the complete PostgreSQL text value just to render the first screen. Reading
 * one extra character lets the API report whether another chunk exists
 * without computing the full log length.
 */
export async function getServerLogChunk(
  sql: DbClient,
  benchmarkResultId: number,
  offset: number,
  limit: number,
): Promise<ServerLogChunk | null> {
  const rows = (await sql`
    select substring(
      sl.server_log
      from ${offset + 1}::integer
      for ${limit + 1}::integer
    ) as server_log
    from benchmark_results br
    join server_logs sl on sl.id = br.server_log_id
    where br.id = ${benchmarkResultId}
  `) as { server_log: string }[];
  const raw = rows[0]?.server_log;
  if (raw === undefined) return null;

  const serverLog = raw.slice(0, limit);
  return {
    serverLog,
    offset,
    nextOffset: raw.length > limit ? offset + serverLog.length : null,
  };
}

/** Lightweight bulk lookup used to decide whether a point exposes "View logs". */
export async function getServerLogAvailability(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<ServerLogAvailabilityMap> {
  if (benchmarkResultIds.length === 0) return {};

  const rows = (await sql`
    select br.id
    from benchmark_results br
    where br.id = any(${benchmarkResultIds}::bigint[])
      and br.server_log_id is not null
  `) as { id: number }[];

  const result: ServerLogAvailabilityMap = {};
  for (const row of rows) result[Number(row.id)] = true;
  return result;
}
