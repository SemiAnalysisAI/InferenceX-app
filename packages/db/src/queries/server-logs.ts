import type { DbClient } from '../connection.js';

/** Map of `benchmark_results.id` → true for each id with a linked log bundle. */
export type ServerLogAvailabilityMap = Record<number, true>;

export interface ServerLogChunk {
  fileName: string;
  serverLog: string;
  offset: number;
  nextOffset: number | null;
}

export interface ServerLogSearchMatch {
  fileName: string;
  offset: number;
  before: string;
  match: string;
  after: string;
}

export interface ServerLogSearchResult {
  matches: ServerLogSearchMatch[];
  /** More matches exist than `limit`. */
  truncated: boolean;
  /** The scan budget ran out before every stored character was searched. */
  incomplete: boolean;
}

/** Size of one stored file, plus its text when it fits within the caller's byte cap. */
export interface BoundedServerLog {
  fileName: string;
  bytes: number;
  /** Null when the file is larger than the requested byte cap. */
  serverLog: string | null;
}

/** Characters read from PostgreSQL per search query. */
export const SERVER_LOG_SEARCH_CHUNK_CHARACTERS = 4 * 1024 * 1024;
/** Total characters one search request may scan across every file. */
export const SERVER_LOG_SEARCH_MAX_SCANNED_CHARACTERS = 64_000_000;
/** Wall-clock budget for one search request. */
export const SERVER_LOG_SEARCH_DEADLINE_MS = 25_000;

/** A search ran past its wall-clock budget. */
export class ServerLogSearchTimeoutError extends Error {
  constructor() {
    super('Server log search exceeded its time budget');
    this.name = 'ServerLogSearchTimeoutError';
  }
}

export interface ServerLogSearchOptions {
  maxScannedCharacters?: number;
  deadlineMs?: number;
  now?: () => number;
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

/**
 * Read one stored file only when its UTF-8 size is at most `maxBytes`.
 *
 * `octet_length` reads the TOAST header, so the size check costs the same for
 * a 1 KB log as for a 900 MB one. Neon's HTTP driver rejects responses over
 * 64 MB, so a caller must never ask for a complete value it has not sized.
 * Pass `maxBytes = 0` to fetch only the size and resolved filename.
 */
export async function getBoundedServerLog(
  sql: DbClient,
  benchmarkResultId: number,
  maxBytes: number,
  fileName?: string,
): Promise<BoundedServerLog | null> {
  try {
    const requestedFile = fileName ?? null;
    const rows = (await sql`
      with selected_log as (
        select sl.file_name, octet_length(sl.server_log) as bytes, sl.server_log as log_text, 0 as priority
        from benchmark_results br
        join server_logs sl on sl.id = br.server_log_id
        where br.id = ${benchmarkResultId}
          and (${requestedFile}::text is null or sl.file_name = ${requestedFile})
        union all
        select slf.file_name, octet_length(slf.log_text) as bytes, slf.log_text, 1 as priority
        from benchmark_results br
        join server_log_files slf on slf.server_log_id = br.server_log_id
        where br.id = ${benchmarkResultId}
          and ${requestedFile}::text is not null
          and slf.file_name = ${requestedFile}
        order by priority
        limit 1
      )
      select
        file_name,
        bytes,
        case when bytes <= ${maxBytes}::bigint then log_text end as log_text
      from selected_log
    `) as { file_name: string; bytes: number | string; log_text: string | null }[];
    const row = rows[0];
    if (!row) return null;
    return { fileName: row.file_name, bytes: Number(row.bytes), serverLog: row.log_text };
  } catch (error) {
    if (!isPreLogFilesSchema(error)) throw error;
    if (fileName && fileName !== 'server.log') return null;
    const rows = (await sql`
      select
        octet_length(sl.server_log) as bytes,
        case when octet_length(sl.server_log) <= ${maxBytes}::bigint then sl.server_log end as log_text
      from benchmark_results br
      join server_logs sl on sl.id = br.server_log_id
      where br.id = ${benchmarkResultId}
    `) as { bytes: number | string; log_text: string | null }[];
    const row = rows[0];
    if (!row) return null;
    return { fileName: 'server.log', bytes: Number(row.bytes), serverLog: row.log_text };
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

/**
 * Search every stored file without transferring complete logs out of PostgreSQL.
 *
 * Each query reads one bounded slice. A slice at character offset N costs
 * PostgreSQL a decompression of the first N characters of the TOASTed value,
 * so the total characters scanned per request is capped and the result says
 * when that cap stopped the scan. A wall-clock budget turns a slow database
 * into a `ServerLogSearchTimeoutError` instead of a 300 s function timeout.
 * Matching uses `strpos(lower(...))`, which allocates about one copy of the
 * slice, rather than a case-insensitive regex, which needs several.
 */
export async function searchServerLogs(
  sql: DbClient,
  benchmarkResultId: number,
  searchTerm: string,
  limit: number,
  options: ServerLogSearchOptions = {},
): Promise<ServerLogSearchResult> {
  const maxScanned = options.maxScannedCharacters ?? SERVER_LOG_SEARCH_MAX_SCANNED_CHARACTERS;
  const now = options.now ?? Date.now;
  const deadline = now() + (options.deadlineMs ?? SERVER_LOG_SEARCH_DEADLINE_MS);
  try {
    interface SearchRow extends Record<string, unknown> {
      file_name: string;
      match_position: number;
      before_text: string;
      match_text: string;
      after_text: string;
      char_count: number;
      has_more: boolean;
    }
    const chunkSize = SERVER_LOG_SEARCH_CHUNK_CHARACTERS;
    const searchLength = [...searchTerm].length;
    const overlap = Math.min(Math.max(0, searchLength - 1), 255);
    const fileNames = (await getServerLogFileNames(sql, benchmarkResultId)) ?? [];
    const matches: ServerLogSearchMatch[] = [];
    let scannedBeforeFile = 0;
    let incomplete = false;
    for (const [fileIndex, fileName] of fileNames.entries()) {
      if (scannedBeforeFile >= maxScanned) {
        incomplete = true;
        break;
      }
      let offset = 0;
      let fileEnd = 0;
      while (matches.length <= limit) {
        if (scannedBeforeFile + offset >= maxScanned) {
          incomplete = true;
          break;
        }
        if (now() > deadline) throw new ServerLogSearchTimeoutError();
        const rows = (fileIndex === 0
          ? await sql`
                with selected_chunk as materialized (
                  select
                    sl.file_name,
                    substring(sl.server_log from ${offset + 1}::integer for ${chunkSize}::integer) as chunk_text,
                    substring(sl.server_log from ${offset + chunkSize + 1}::integer for 1) <> '' as has_more
                  from benchmark_results br
                  join server_logs sl on sl.id = br.server_log_id
                  where br.id = ${benchmarkResultId}
                    and sl.file_name = ${fileName}
                  limit 1
                ), located_match as (
                  select
                    file_name,
                    chunk_text,
                    char_length(chunk_text) as char_count,
                    has_more,
                    strpos(lower(chunk_text), lower(${searchTerm})) as match_position
                  from selected_chunk
                )
                select
                  file_name,
                  match_position,
                  case when match_position > 0 then substring(
                    chunk_text
                    from greatest(1, match_position - 120)
                    for match_position - greatest(1, match_position - 120)
                  ) else '' end as before_text,
                  case when match_position > 0 then substring(
                    chunk_text from match_position for ${searchLength}::integer
                  ) else '' end as match_text,
                  case when match_position > 0 then substring(
                    chunk_text from match_position + ${searchLength}::integer for 120
                  ) else '' end as after_text,
                  char_count,
                  has_more
                from located_match
              `
          : await sql`
                with selected_chunk as materialized (
                  select
                    slf.file_name,
                    substring(slf.log_text from ${offset + 1}::integer for ${chunkSize}::integer) as chunk_text,
                    substring(slf.log_text from ${offset + chunkSize + 1}::integer for 1) <> '' as has_more
                  from benchmark_results br
                  join server_log_files slf on slf.server_log_id = br.server_log_id
                  where br.id = ${benchmarkResultId}
                    and slf.file_name = ${fileName}
                  limit 1
                ), located_match as (
                  select
                    file_name,
                    chunk_text,
                    char_length(chunk_text) as char_count,
                    has_more,
                    strpos(lower(chunk_text), lower(${searchTerm})) as match_position
                  from selected_chunk
                )
                select
                  file_name,
                  match_position,
                  case when match_position > 0 then substring(
                    chunk_text
                    from greatest(1, match_position - 120)
                    for match_position - greatest(1, match_position - 120)
                  ) else '' end as before_text,
                  case when match_position > 0 then substring(
                    chunk_text from match_position for ${searchLength}::integer
                  ) else '' end as match_text,
                  case when match_position > 0 then substring(
                    chunk_text from match_position + ${searchLength}::integer for 120
                  ) else '' end as after_text,
                  char_count,
                  has_more
                from located_match
              `) as unknown as SearchRow[];
        const row = rows[0];
        if (!row) break;
        const matchPosition = Number(row.match_position);
        const charCount = Number(row.char_count);
        fileEnd = Math.max(fileEnd, offset + charCount);
        if (matchPosition > 0) {
          const matchOffset = offset + matchPosition - 1;
          matches.push({
            fileName: row.file_name,
            offset: matchOffset,
            before: row.before_text,
            match: row.match_text,
            after: row.after_text,
          });
          offset = matchOffset + searchLength;
          continue;
        }
        if (!row.has_more) break;
        const advance = charCount - overlap;
        if (advance <= 0) break;
        offset += advance;
      }
      if (matches.length > limit || incomplete) break;
      scannedBeforeFile += fileEnd;
    }
    const truncated = matches.length > limit;
    return { matches: matches.slice(0, limit), truncated, incomplete: incomplete && !truncated };
  } catch (error) {
    if (!isPreLogFilesSchema(error)) throw error;
    const legacyLog = await getServerLog(sql, benchmarkResultId);
    if (legacyLog === null) return { matches: [], truncated: false, incomplete: false };

    const matches: ServerLogSearchMatch[] = [];
    const searchableLog = legacyLog.toLocaleLowerCase();
    const needle = searchTerm.toLocaleLowerCase();
    let offset = 0;
    while (matches.length <= limit) {
      const matchOffset = searchableLog.indexOf(needle, offset);
      if (matchOffset === -1) break;
      matches.push({
        fileName: 'server.log',
        offset: matchOffset,
        before: legacyLog.slice(Math.max(0, matchOffset - 120), matchOffset),
        match: legacyLog.slice(matchOffset, matchOffset + searchTerm.length),
        after: legacyLog.slice(
          matchOffset + searchTerm.length,
          matchOffset + searchTerm.length + 120,
        ),
      });
      offset = matchOffset + searchTerm.length;
    }
    return {
      matches: matches.slice(0, limit),
      truncated: matches.length > limit,
      incomplete: false,
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
