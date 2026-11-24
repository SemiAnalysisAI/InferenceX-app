import type postgres from 'postgres';

import type { Sql } from '../etl/db-utils';
import { nonPublicRepository, sanitizeLogText } from '../etl/repo-visibility';
import { lockServerLogFile, writeTextAsBlocks } from '../etl/server-log-block-writer';
import { recordRedactedRunUrls, type RedactedRunUrl } from './redacted-run-urls';

export interface StoredServerLogFile {
  logId: string;
  fileName: string;
  /** The file lives in `server_logs.server_log` rather than `server_log_files`. */
  primary: boolean;
  /** A child sharing its primary's name, whose blocks belong to the primary. */
  shadowed: boolean;
  /** Repositories that are not public among the runs using the log. */
  repositories: string[];
}

/**
 * Server-log files of the run `runId`, or of every run, newest log first. With
 * `checkRepositories` false (a downstream database, whose own private runs are its
 * business) no file carries repositories and GitHub is never asked.
 */
export async function listStoredServerLogFiles(
  sql: Sql,
  runId: number | undefined,
  checkRepositories = true,
): Promise<StoredServerLogFile[]> {
  const files = await sql<
    {
      log_id: string;
      file_name: string;
      is_primary: boolean;
      shadowed: boolean;
      run_urls: string[];
    }[]
  >`
    with scoped as (
      select s.id, s.file_name from server_logs s
      where ${runId ?? null}::bigint is null or exists (
        select 1 from benchmark_results br
        join workflow_runs wr on wr.id = br.workflow_run_id
        where br.server_log_id = s.id and wr.github_run_id = ${runId ?? null}::bigint)
    ), urls as (
      select br.server_log_id as id, array_agg(distinct wr.html_url) as run_urls
      from benchmark_results br join workflow_runs wr on wr.id = br.workflow_run_id
      where br.server_log_id is not null and wr.html_url is not null
      group by br.server_log_id
    )
    select log_id, file_name, is_primary, shadowed, coalesce(urls.run_urls, '{}') as run_urls from (
      select id::text as log_id, file_name, true as is_primary, false as shadowed, id from scoped
      union all
      select f.server_log_id::text, f.file_name, false, f.file_name = scoped.file_name, f.server_log_id
      from server_log_files f join scoped on scoped.id = f.server_log_id
    ) files left join urls using (id)
    order by id desc, is_primary desc, file_name
  `;
  return Promise.all(
    files.map(async (file) => {
      const repositories = checkRepositories
        ? await Promise.all(file.run_urls.map(nonPublicRepository))
        : [];
      return {
        logId: file.log_id,
        fileName: file.file_name,
        primary: file.is_primary,
        shadowed: file.shadowed,
        repositories: repositories.filter((repository) => repository !== null),
      };
    }),
  );
}

/**
 * Count of runs in scope from repositories that are not public. `write` records their URLs in the
 * operator-only `urlMapFile` (see `recordRedactedRunUrls`) and then clears them.
 */
export async function sanitizeRunUrls(
  sql: Sql,
  runId: number | undefined,
  write: boolean,
  urlMapFile: string,
): Promise<number> {
  const runs = await sql<RedactedRunUrl[]>`
    select github_run_id::text, run_attempt, html_url from workflow_runs
    where html_url is not null
      and (${runId ?? null}::bigint is null or github_run_id = ${runId ?? null}::bigint)
    order by id
  `;
  const redacted: RedactedRunUrl[] = [];
  for (const run of runs) {
    if ((await nonPublicRepository(run.html_url)) !== null) redacted.push(run);
  }
  if (!write || redacted.length === 0) return redacted.length;
  recordRedactedRunUrls(urlMapFile, redacted);
  await sql`
    update workflow_runs set html_url = null
    where html_url = any(${redacted.map((run) => run.html_url)}::text[])
  `;
  return redacted.length;
}

export interface ServerLogRedaction {
  /** The text changed, or its blocks no longer matched it. */
  changed: boolean;
  /** The file had blocks, which a write rebuilt from the sanitized text. */
  blockBacked: boolean;
}

/**
 * Sanitize one stored server-log file. With `write`, the text column is replaced
 * and any blocks are rebuilt from the sanitized text in the same transaction, so
 * block offsets, sizes and bloom filters keep describing the stored text. Blocks
 * whose character count differs from already-sanitized text (built from the raw
 * text by a compaction that raced an earlier run) are rebuilt too. The file's
 * advisory lock keeps `compact-server-logs` from building blocks meanwhile.
 */
export async function redactStoredServerLogFile(
  tx: postgres.TransactionSql,
  file: StoredServerLogFile,
  write: boolean,
): Promise<ServerLogRedaction> {
  const { logId, fileName, primary, shadowed, repositories } = file;
  if (write) await lockServerLogFile(tx, logId, fileName);
  const lock = write ? tx`for update` : tx``;
  const [row] = primary
    ? await tx<{ text: string; chars: string }[]>`
        select server_log as text, char_length(server_log)::text as chars
        from server_logs where id = ${logId} ${lock}`
    : await tx<{ text: string; chars: string }[]>`
        select log_text as text, char_length(log_text)::text as chars from server_log_files
        where server_log_id = ${logId} and file_name = ${fileName} ${lock}`;
  if (!row) return { changed: false, blockBacked: false };
  const redacted = sanitizeLogText(row.text, repositories);
  const [marker] = shadowed
    ? []
    : await tx<{ char_count: string }[]>`
        select char_count::text from server_log_block_files
        where server_log_id = ${logId} and file_name = ${fileName}
      `;
  const textChanged = redacted !== row.text;
  if (!textChanged && (!marker || marker.char_count === row.chars)) {
    return { changed: false, blockBacked: false };
  }
  if (!write) return { changed: true, blockBacked: Boolean(marker) };
  if (textChanged) {
    await (primary
      ? tx`update server_logs set server_log = ${redacted} where id = ${logId}`
      : tx`
          update server_log_files set log_text = ${redacted}
          where server_log_id = ${logId} and file_name = ${fileName}
        `);
  }
  if (marker) {
    await tx`
      delete from server_log_blocks where server_log_id = ${logId} and file_name = ${fileName}
    `;
    await tx`
      delete from server_log_block_files where server_log_id = ${logId} and file_name = ${fileName}
    `;
    await writeTextAsBlocks(tx, logId, fileName, redacted);
  }
  return { changed: true, blockBacked: Boolean(marker) };
}

export interface LogRedactionBackfillOptions {
  /** GitHub run ID to scope the backfill to; every run when undefined. */
  runId: number | undefined;
  write: boolean;
  /** Files sanitized at once, each in its own transaction. */
  concurrency: number;
  /**
   * Operator-only file that receives the URLs of private-repository runs before they are cleared.
   */
  urlMapFile: string;
  /**
   * A downstream database: keep its private repository names and run URLs, apply only the shared
   * rules, and never ask GitHub.
   */
  downstream?: boolean;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

export interface LogRedactionBackfillResult {
  files: number;
  changed: number;
  blockBacked: number;
  failed: number;
  /**
   * Run URLs from repositories that are not public; null when a failed file left them alone or
   * `downstream` skipped them.
   */
  runUrls: number | null;
}

/**
 * Sanitize every stored server-log file in scope, one transaction per file, then the run URLs of
 * repositories that are not public. Logs are sanitized against those URLs, so the URLs change only
 * after every file succeeded and a rerun still knows which repositories to remove.
 */
export async function backfillLogRedaction(
  sql: Sql,
  {
    runId,
    write,
    concurrency,
    urlMapFile,
    downstream = false,
    log = console.log,
    error = console.error,
  }: LogRedactionBackfillOptions,
): Promise<LogRedactionBackfillResult> {
  const files = await listStoredServerLogFiles(sql, runId, !downstream);
  log(`Scanning ${files.length} server-log file(s)`);
  let changed = 0;
  let blockBacked = 0;
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < files.length) {
        const file = files[next++]!;
        try {
          const result = await sql.begin((tx) => redactStoredServerLogFile(tx, file, write));
          if (!result.changed) continue;
          changed++;
          if (result.blockBacked) blockBacked++;
          log(`  ${file.logId} ${file.fileName}: ${write ? 'sanitized' : 'would change'}`);
        } catch (error_) {
          failed++;
          error(`  ✗ ${file.logId} ${file.fileName}: ${String(error_)}`);
        }
      }
    }),
  );
  const runUrls =
    failed > 0 || downstream ? null : await sanitizeRunUrls(sql, runId, write, urlMapFile);
  return { files: files.length, changed, blockBacked, failed, runUrls };
}
