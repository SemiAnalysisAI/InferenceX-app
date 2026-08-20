import type { DbClient } from '../connection.js';

/** Map of `benchmark_results.id` → true for each id with a linked log bundle. */
export type ServerLogAvailabilityMap = Record<number, true>;

export interface ServerLogChunk {
  fileName: string;
  serverLog: string;
  offset: number;
  nextOffset: number | null;
}

const isPreLogFilesSchema = (error: unknown): boolean => {
  const code = (error as { code?: unknown })?.code;
  return code === '42P01' || code === '42703';
};

/** Fetch a complete log file. Omit fileName for the primary/legacy stream. */
export async function getServerLog(
  sql: DbClient,
  benchmarkResultId: number,
  fileName?: string,
): Promise<string | null> {
  try {
    const requestedFile = fileName ?? null;
    const rows = (await sql`
      with selected_log as (
        select sl.file_name, sl.server_log as log_text, 0 as priority
        from benchmark_results br
        join server_logs sl on sl.id = br.server_log_id
        where br.id = ${benchmarkResultId}
          and (${requestedFile}::text is null or sl.file_name = ${requestedFile})
        union all
        select slf.file_name, slf.log_text, 1 as priority
        from benchmark_results br
        join server_log_files slf on slf.server_log_id = br.server_log_id
        where br.id = ${benchmarkResultId}
          and ${requestedFile}::text is not null
          and slf.file_name = ${requestedFile}
        order by priority
        limit 1
      )
      select log_text from selected_log
    `) as { log_text: string }[];
    return rows[0]?.log_text ?? null;
  } catch (error) {
    if (!isPreLogFilesSchema(error)) throw error;
    if (fileName && fileName !== 'server.log') return null;
    const rows = (await sql`
      select sl.server_log
      from benchmark_results br
      join server_logs sl on sl.id = br.server_log_id
      where br.id = ${benchmarkResultId}
    `) as { server_log: string }[];
    return rows[0]?.server_log ?? null;
  }
}

/** List the artifact-relative filenames for one benchmark result, primary first. */
export async function getServerLogFileNames(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<string[] | null> {
  try {
    const rows = (await sql`
      select file_name
      from (
        select sl.file_name, 0 as priority
        from benchmark_results br
        join server_logs sl on sl.id = br.server_log_id
        where br.id = ${benchmarkResultId}
        union all
        select slf.file_name, 1 as priority
        from benchmark_results br
        join server_logs sl on sl.id = br.server_log_id
        join server_log_files slf on slf.server_log_id = sl.id
        where br.id = ${benchmarkResultId}
          and slf.file_name <> sl.file_name
      ) files
      order by priority, file_name
    `) as { file_name: string }[];
    return rows.length > 0 ? rows.map((row) => row.file_name) : null;
  } catch (error) {
    if (!isPreLogFilesSchema(error)) throw error;
    return (await getServerLog(sql, benchmarkResultId)) === null ? null : ['server.log'];
  }
}

/**
 * Fetch a bounded character range from one stored log file.
 *
 * Some production logs are hundreds of megabytes, so the UI must never read
 * the complete PostgreSQL text value just to render the first screen. Reading
 * one extra character reports whether another chunk exists without computing
 * the full log length.
 */
export async function getServerLogChunk(
  sql: DbClient,
  benchmarkResultId: number,
  offset: number,
  limit: number,
  fileName?: string,
): Promise<ServerLogChunk | null> {
  try {
    const requestedFile = fileName ?? null;
    const rows = (await sql`
      with selected_log as (
        select
          sl.file_name,
          substring(
            sl.server_log
            from ${offset + 1}::integer
            for ${limit}::integer
          ) as log_text,
          substring(sl.server_log from ${offset + limit + 1}::integer for 1) <> '' as has_more,
          0 as priority
        from benchmark_results br
        join server_logs sl on sl.id = br.server_log_id
        where br.id = ${benchmarkResultId}
          and (${requestedFile}::text is null or sl.file_name = ${requestedFile})
        union all
        select
          slf.file_name,
          substring(
            slf.log_text
            from ${offset + 1}::integer
            for ${limit}::integer
          ) as log_text,
          substring(slf.log_text from ${offset + limit + 1}::integer for 1) <> '' as has_more,
          1 as priority
        from benchmark_results br
        join server_log_files slf on slf.server_log_id = br.server_log_id
        where br.id = ${benchmarkResultId}
          and ${requestedFile}::text is not null
          and slf.file_name = ${requestedFile}
        order by priority
        limit 1
      )
      select file_name, log_text, char_length(log_text) as char_count, has_more
      from selected_log
    `) as { file_name: string; log_text: string; char_count: number; has_more: boolean }[];
    const row = rows[0];
    if (!row) return null;
    return {
      fileName: row.file_name,
      serverLog: row.log_text,
      offset,
      nextOffset: row.has_more ? offset + Number(row.char_count) : null,
    };
  } catch (error) {
    if (!isPreLogFilesSchema(error)) throw error;
    if (fileName && fileName !== 'server.log') return null;
    const rows = (await sql`
      with selected_log as (
        select
          substring(
            sl.server_log
            from ${offset + 1}::integer
            for ${limit}::integer
          ) as server_log,
          substring(sl.server_log from ${offset + limit + 1}::integer for 1) <> '' as has_more
        from benchmark_results br
        join server_logs sl on sl.id = br.server_log_id
        where br.id = ${benchmarkResultId}
      )
      select server_log, char_length(server_log) as char_count, has_more
      from selected_log
    `) as { server_log: string; char_count: number; has_more: boolean }[];
    const row = rows[0];
    if (!row) return null;
    return {
      fileName: 'server.log',
      serverLog: row.server_log,
      offset,
      nextOffset: row.has_more ? offset + Number(row.char_count) : null,
    };
  }
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
