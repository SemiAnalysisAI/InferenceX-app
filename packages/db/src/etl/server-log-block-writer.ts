import type { TransactionSql } from 'postgres';

import {
  countCodePoints,
  encodeServerLogBlocks,
  SERVER_LOG_BLOCK_CHARS,
  SERVER_LOG_BLOOM_LOOKAHEAD,
  sliceCodePoints,
  type ServerLogBlock,
} from '../server-log-blocks';

/** `SERVER_LOG_BLOCKS=1` also stores new logs as compressed blocks (needs migration 021). */
export const serverLogBlocksEnabled = (): boolean => process.env.SERVER_LOG_BLOCKS === '1';

const INSERT_BATCH = 32;

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

/**
 * Store one file as blocks read in ranges of whole blocks, then its marker row,
 * inside the caller's transaction. Returns false when the file already has a marker.
 * `readRange(start, length)` returns code points [start, start + length).
 */
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
    // The blooms of a range's last block read past it.
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

/** Store a log already held in memory (ingest caps files at 128 MiB). */
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
