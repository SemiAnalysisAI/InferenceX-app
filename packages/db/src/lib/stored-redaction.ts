import type postgres from 'postgres';

import type { Sql } from '../etl/db-utils';
import { nonPublicRepository, sanitizeLogText } from '../etl/repo-visibility';
import { writeTextAsBlocks } from '../etl/server-log-block-writer';

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

/** Server-log files of the run `runId`, or of every run, newest log first. */
export async function listStoredServerLogFiles(
  sql: Sql,
  runId: number | undefined,
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
      const repositories = await Promise.all(file.run_urls.map(nonPublicRepository));
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

/** Count of runs in scope from repositories that are not public. `write` sanitizes their URLs. */
export async function sanitizeRunUrls(
  sql: Sql,
  runId: number | undefined,
  write: boolean,
): Promise<number> {
  const runs = await sql<{ id: string; html_url: string }[]>`
    select id::text, html_url from workflow_runs
    where html_url is not null
      and (${runId ?? null}::bigint is null or github_run_id = ${runId ?? null}::bigint)
  `;
  let count = 0;
  for (const run of runs) {
    if ((await nonPublicRepository(run.html_url)) === null) continue;
    count++;
    if (write) await sql`update workflow_runs set html_url = null where id = ${run.id}`;
  }
  return count;
}

export interface ServerLogRedaction {
  changed: boolean;
  /** The file had blocks, which a write rebuilt from the sanitized text. */
  blockBacked: boolean;
}

/**
 * Sanitize one stored server-log file. With `write`, the text column is replaced
 * and any blocks are rebuilt from the sanitized text in the same transaction, so
 * block offsets, sizes and bloom filters keep describing the stored text.
 */
export async function redactStoredServerLogFile(
  tx: postgres.TransactionSql,
  file: StoredServerLogFile,
  write: boolean,
): Promise<ServerLogRedaction> {
  const { logId, fileName, primary, shadowed, repositories } = file;
  const lock = write ? tx`for update` : tx``;
  const [row] = primary
    ? await tx<{ text: string }[]>`
        select server_log as text from server_logs where id = ${logId} ${lock}`
    : await tx<{ text: string }[]>`
        select log_text as text from server_log_files
        where server_log_id = ${logId} and file_name = ${fileName} ${lock}`;
  if (!row) return { changed: false, blockBacked: false };
  const redacted = sanitizeLogText(row.text, repositories);
  if (redacted === row.text) return { changed: false, blockBacked: false };
  const [marker] = shadowed
    ? []
    : await tx`
        select 1 from server_log_block_files
        where server_log_id = ${logId} and file_name = ${fileName}
      `;
  if (!write) return { changed: true, blockBacked: Boolean(marker) };
  await (primary
    ? tx`update server_logs set server_log = ${redacted} where id = ${logId}`
    : tx`
        update server_log_files set log_text = ${redacted}
        where server_log_id = ${logId} and file_name = ${fileName}
      `);
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
