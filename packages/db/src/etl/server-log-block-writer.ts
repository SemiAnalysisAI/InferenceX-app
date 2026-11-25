import type { TransactionSql } from 'postgres';

import {
  countCodePoints,
  encodeServerLogBlocks,
  SERVER_LOG_BLOCK_CHARS,
  SERVER_LOG_BLOOM_LOOKAHEAD,
  sliceCodePoints,
  type ServerLogBlock,
} from '../server-log-blocks';

export const serverLogBlocksEnabled = (): boolean => process.env.SERVER_LOG_BLOCKS === '1';

const INSERT_BATCH = 32;
/** Advisory-lock namespace for one stored server-log file (`pg_advisory_xact_lock(int, int)`). */
export const SERVER_LOG_FILE_LOCK_SPACE = 61_457_203;

/**
 * Hold one server-log file's advisory lock until the transaction ends, so compaction never builds
 * blocks from text that a redaction backfill is rewriting, and the reverse.
 */
export async function lockServerLogFile(
  tx: TransactionSql,
  serverLogId: number | string,
  fileName: string,
): Promise<void> {
  await tx`
    select pg_advisory_xact_lock(
      ${SERVER_LOG_FILE_LOCK_SPACE}::int, hashtext(${String(serverLogId)} || '/' || ${fileName})
    )
  `;
}

/**
 * Build blocks for one stored file from its text column, under the file's advisory lock, so a
 * redaction backfill cannot rewrite the text between the length read and the range reads.
 */
export async function compactStoredServerLogFile(
  tx: TransactionSql,
  logId: string,
  fileName: string,
  primary: boolean,
): Promise<{ chars: number; written: boolean }> {
  await lockServerLogFile(tx, logId, fileName);
  const [row] = primary
    ? await tx<{ chars: string }[]>`
        select char_length(server_log)::text as chars from server_logs
        where id = ${logId} and file_name = ${fileName}`
    : await tx<{ chars: string }[]>`
        select char_length(log_text)::text as chars from server_log_files
        where server_log_id = ${logId} and file_name = ${fileName}`;
  if (!row) return { chars: 0, written: false };
  const chars = Number(row.chars);
  const written = await writeServerLogBlocks(tx, logId, fileName, chars, async (start, length) => {
    const [{ text }] = primary
      ? await tx<{ text: string }[]>`
          select substring(server_log from ${start + 1}::integer for ${length}::integer) as text
          from server_logs where id = ${logId}`
      : await tx<{ text: string }[]>`
          select substring(log_text from ${start + 1}::integer for ${length}::integer) as text
          from server_log_files where server_log_id = ${logId} and file_name = ${fileName}`;
    return text;
  });
  return { chars, written };
}

async function insertBlocks(
  tx: TransactionSql,
  serverLogId: number | string,
  fileName: string,
  blocks: readonly ServerLogBlock[],
): Promise<void> {
  for (let i = 0; i < blocks.length; i += INSERT_BATCH) {
    const rows = blocks.slice(i, i + INSERT_BATCH).map((block) => ({
      server_log_id: serverLogId,
      file_name: fileName,
      block_index: block.blockIndex,
      char_offset: block.charOffset,
      char_count: block.charCount,
      ascii: block.ascii,
      data: Buffer.from(block.data),
      bloom: Buffer.from(block.bloom),
    }));
    await tx`insert into server_log_blocks ${tx(rows)}`;
  }
}

export async function writeServerLogBlocks(
  tx: TransactionSql,
  serverLogId: number | string,
  fileName: string,
  charCount: number,
  readRange: (start: number, length: number) => Promise<string>,
  rangeBlocks = 64,
): Promise<boolean> {
  const [existing] = await tx`
    select 1 from server_log_block_files
    where server_log_id = ${serverLogId} and file_name = ${fileName}
  `;
  if (existing) return false;
  const rangeChars = rangeBlocks * SERVER_LOG_BLOCK_CHARS;
  let blockCount = 0;
  for (let start = 0; start < charCount; start += rangeChars) {
    const length = Math.min(rangeChars, charCount - start);
    const read = await readRange(start, length + SERVER_LOG_BLOOM_LOOKAHEAD);
    const ascii = Buffer.byteLength(read, 'utf8') === read.length;
    const text = sliceCodePoints(read, ascii, 0, length);
    const firstIndex = blockCount;
    const rangeStart = start;
    const blocks = encodeServerLogBlocks(text, read.slice(text.length)).map((block) => ({
      ...block,
      blockIndex: block.blockIndex + firstIndex,
      charOffset: block.charOffset + rangeStart,
    }));
    await insertBlocks(tx, serverLogId, fileName, blocks);
    blockCount += blocks.length;
  }
  await tx`
    insert into server_log_block_files (server_log_id, file_name, char_count, block_count)
    values (${serverLogId}, ${fileName}, ${charCount}, ${blockCount})
  `;
  return true;
}

export function writeTextAsBlocks(
  tx: TransactionSql,
  serverLogId: number | string,
  fileName: string,
  text: string,
): Promise<boolean> {
  const ascii = Buffer.byteLength(text, 'utf8') === text.length;
  return writeServerLogBlocks(tx, serverLogId, fileName, countCodePoints(text), (start, length) =>
    Promise.resolve(sliceCodePoints(text, ascii, start, length)),
  );
}
