import type { DbClient } from '../connection.js';
import { readServerLogBlocks } from '../server-log-blocks';
import {
  type BlockSearchFile,
  readBlockSearchIndexes,
  searchBlockFile,
} from './server-log-block-search';

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
  truncated: boolean;
}

const isPreLogFilesSchema = (error: unknown): boolean => {
  const code = (error as { code?: unknown })?.code;
  return code === '42P01' || code === '42703';
};

/** Escape user text for PostgreSQL's POSIX regex engine. */
export const escapePostgresRegexLiteral = (value: string): string =>
  value.replaceAll(/[\\^$.*+?()[\]{}|]/gu, String.raw`\$&`);

interface BlockBackedFile {
  logId: string;
  fileName: string;
  charCount: number;
}

/**
 * Code points [offset, offset + length) of the file a request names, in one
 * query, when the file is stored as blocks. Resolves the file the same way the
 * text readers do (primary stream first). Null sends the caller to the text
 * columns: no such file, no block marker, or tables older than migration 021.
 */
async function readBlockBacked(
  sql: DbClient,
  benchmarkResultId: number,
  requestedFile: string | null = null,
  offset = 0,
  length = Number.MAX_SAFE_INTEGER,
): Promise<{ file: BlockBackedFile; text: string } | null> {
  let rows: {
    log_id: string;
    file_name: string;
    file_chars: number | string;
    char_offset: number | string | null;
    char_count: number | null;
    ascii: boolean | null;
    data: Uint8Array | null;
  }[];
  try {
    rows = (await sql`
      with selected_log as (
        select sl.id as server_log_id, sl.file_name, 0 as priority
        from benchmark_results br
        join server_logs sl on sl.id = br.server_log_id
        where br.id = ${benchmarkResultId}
          and (${requestedFile}::text is null or sl.file_name = ${requestedFile})
        union all
        select slf.server_log_id, slf.file_name, 1 as priority
        from benchmark_results br
        join server_log_files slf on slf.server_log_id = br.server_log_id
        where br.id = ${benchmarkResultId}
          and ${requestedFile}::text is not null
          and slf.file_name = ${requestedFile}
        order by priority
        limit 1
      ), target as (
        select s.server_log_id, s.file_name, m.char_count as file_chars
        from selected_log s
        join server_log_block_files m
          on m.server_log_id = s.server_log_id and m.file_name = s.file_name
      )
      select t.server_log_id::text as log_id, t.file_name, t.file_chars,
             b.char_offset, b.char_count, b.ascii, b.data
      from target t
      left join server_log_blocks b
        on b.server_log_id = t.server_log_id
        and b.file_name = t.file_name
        and b.char_offset < least(${offset}::bigint + ${length}::bigint, t.file_chars)
        and b.char_offset + b.char_count > ${offset}::bigint
      order by b.block_index
    `) as typeof rows;
  } catch (error) {
    if (isPreLogFilesSchema(error)) return null;
    throw error;
  }
  const first = rows[0];
  if (!first) return null;
  const file = {
    logId: first.log_id,
    fileName: first.file_name,
    charCount: Number(first.file_chars),
  };
  const end = Math.min(offset + length, file.charCount);
  const blocks = rows.flatMap((row) =>
    row.data === null
      ? []
      : [
          {
            charOffset: Number(row.char_offset),
            charCount: Number(row.char_count),
            ascii: row.ascii === true,
            data: row.data,
          },
        ],
  );
  return { file, text: offset >= end ? '' : readServerLogBlocks(blocks, offset, end - offset) };
}

/** Fetch a complete log file. Omit fileName for the primary/legacy stream. */
export async function getServerLog(
  sql: DbClient,
  benchmarkResultId: number,
  fileName?: string,
): Promise<string | null> {
  const block = await readBlockBacked(sql, benchmarkResultId, fileName);
  if (block) return block.text;
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
  const block = await readBlockBacked(sql, benchmarkResultId, fileName, offset, limit);
  if (block) {
    // Same values as the text path: `has_more` is "a character exists after the range".
    const charCount = Math.max(0, Math.min(limit, block.file.charCount - offset));
    return {
      fileName: block.file.fileName,
      serverLog: block.text,
      offset,
      nextOffset: offset + limit < block.file.charCount ? offset + charCount : null,
    };
  }
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
 * PostgreSQL's case-insensitive regex on an escaped literal: each needle
 * character matches itself, its lowercase or its uppercase. Not Unicode case
 * folding, which would also match U+212A KELVIN SIGN to `k`.
 */
function caseInsensitiveLiteral(term: string): RegExp {
  const classes = [...term].map((ch) => {
    const variants = new Set(
      [ch, ch.toLowerCase(), ch.toUpperCase()].filter((v) => [...v].length === 1),
    );
    return `[${[...variants].map((v) => v.replaceAll(/[\\\]^[-]/gu, String.raw`\$&`)).join('')}]`;
  });
  return new RegExp(classes.join(''), 'u');
}

/** Search every stored file without transferring complete logs out of PostgreSQL. */
export async function searchServerLogs(
  sql: DbClient,
  benchmarkResultId: number,
  searchTerm: string,
  limit: number,
): Promise<ServerLogSearchResult> {
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
    const chunkSize = 16 * 1024 * 1024;
    const searchLength = [...searchTerm].length;
    const overlap = Math.min(Math.max(0, searchLength - 1), 255);
    const searchPattern = escapePostgresRegexLiteral(searchTerm);
    const blockPattern = caseInsensitiveLiteral(searchTerm);
    const fileNames = (await getServerLogFileNames(sql, benchmarkResultId)) ?? [];
    const matches: ServerLogSearchMatch[] = [];
    let blockFiles = new Map<string, BlockSearchFile>();
    try {
      blockFiles = await readBlockSearchIndexes(sql, benchmarkResultId, fileNames, searchTerm);
    } catch (error) {
      if (!isPreLogFilesSchema(error)) throw error;
    }
    for (const [fileIndex, fileName] of fileNames.entries()) {
      const blockFile = blockFiles.get(fileName);
      if (blockFile) {
        await searchBlockFile(
          sql,
          blockFile,
          blockPattern,
          searchLength,
          chunkSize,
          overlap,
          matches,
          limit,
        );
        if (matches.length > limit) break;
        continue;
      }
      let offset = 0;
      while (matches.length <= limit) {
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
                    regexp_instr(chunk_text, ${searchPattern}, 1, 1, 0, 'i') as match_position
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
                    regexp_instr(chunk_text, ${searchPattern}, 1, 1, 0, 'i') as match_position
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
      if (matches.length > limit) break;
    }
    return { matches: matches.slice(0, limit), truncated: matches.length > limit };
  } catch (error) {
    if (!isPreLogFilesSchema(error)) throw error;
    const legacyLog = await getServerLog(sql, benchmarkResultId);
    if (legacyLog === null) return { matches: [], truncated: false };

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
    return { matches: matches.slice(0, limit), truncated: matches.length > limit };
  }
}
