import type postgres from 'postgres';

import { redactText } from '../etl/log-redaction';
import { writeTextAsBlocks } from '../etl/server-log-block-writer';

export interface StoredServerLogFile {
  logId: string;
  fileName: string;
  /** The file lives in `server_logs.server_log` rather than `server_log_files`. */
  primary: boolean;
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
  const { logId, fileName, primary } = file;
  const [row] = primary
    ? await tx<{ text: string }[]>`
        select server_log as text from server_logs where id = ${logId} for update`
    : await tx<{ text: string }[]>`
        select log_text as text from server_log_files
        where server_log_id = ${logId} and file_name = ${fileName} for update`;
  if (!row) return { changed: false, blockBacked: false };
  const redacted = redactText(row.text);
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
