import type postgres from 'postgres';

import { redactChartSeriesJson, redactChartSeriesSummaryGz } from '../etl/chart-series-redaction';
import type { Sql } from '../etl/db-utils';
import { redactText } from '../etl/log-redaction';
import { writeTextAsBlocks } from '../etl/server-log-block-writer';

type Db = Sql | postgres.TransactionSql;

export interface StoredServerLogFile {
  logId: string;
  fileName: string;
  /** The file lives in `server_logs.server_log` rather than `server_log_files`. */
  primary: boolean;
}

export interface ServerLogRedaction {
  changed: boolean;
  /** The file had blocks, which a write rebuilt from the redacted text. */
  blockBacked: boolean;
}

/**
 * Redact one stored server-log file. With `write`, the text column is replaced
 * and any blocks are rebuilt from the redacted text in the same transaction, so
 * block offsets, sizes and bloom filters keep describing the stored text.
 */
export async function redactStoredServerLogFile(
  tx: postgres.TransactionSql,
  file: StoredServerLogFile,
  key: Uint8Array,
  write: boolean,
): Promise<ServerLogRedaction> {
  const { logId, fileName, primary } = file;
  const [row] = primary
    ? await tx<{ text: string }[]>`
        select server_log as text from server_logs where id = ${logId} for update`
    : await tx<{ text: string }[]>`
        select log_text as text from server_log_files
        where server_log_id = ${logId} and file_name = ${fileName} for update`;
  if (!row) return { changed: false, blockBacked: false };
  const redacted = redactText(row.text, key);
  if (redacted === row.text) return { changed: false, blockBacked: false };
  const [marker] = await tx`
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

export interface ChartSeriesRedaction {
  series: boolean;
  summary: boolean;
}

/**
 * Redact the stored `chart_series` and `chart_series_summary_gz` of one trace
 * replay. Each write applies only while the column still holds what was read,
 * so a concurrent recompute (which redacts on its own) is never overwritten.
 */
export async function redactStoredChartSeries(
  sql: Db,
  traceReplayId: number | string,
  key: Uint8Array,
  write: boolean,
): Promise<ChartSeriesRedaction> {
  const [row] = await sql<
    {
      series: string | null;
      series_md5: string | null;
      summary: Buffer | null;
      summary_md5: string | null;
    }[]
  >`
    select chart_series::text as series, md5(chart_series::text) as series_md5,
      chart_series_summary_gz as summary, md5(chart_series_summary_gz) as summary_md5
    from agentic_trace_replay where id = ${traceReplayId}
  `;
  if (!row) return { series: false, summary: false };
  const series = row.series === null ? null : redactChartSeriesJson(row.series, key);
  const summary = row.summary === null ? null : redactChartSeriesSummaryGz(row.summary, key);
  if (write && series !== null) {
    await sql`
      update agentic_trace_replay set chart_series = ${series}::jsonb
      where id = ${traceReplayId} and md5(chart_series::text) = ${row.series_md5}
    `;
  }
  if (write && summary !== null) {
    await sql`
      update agentic_trace_replay set chart_series_summary_gz = ${summary}
      where id = ${traceReplayId} and md5(chart_series_summary_gz) = ${row.summary_md5}
    `;
  }
  return { series: series !== null, summary: summary !== null };
}
