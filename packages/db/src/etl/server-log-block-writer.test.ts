import type { TransactionSql } from 'postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  countCodePoints,
  encodeServerLogBlocks,
  SERVER_LOG_BLOCK_CHARS,
  sliceCodePoints,
} from '../server-log-blocks';
import {
  serverLogBlocksEnabled,
  writeServerLogBlocks,
  writeTextAsBlocks,
} from './server-log-block-writer';

interface BlockRow {
  server_log_id: number | string;
  file_name: string;
  block_index: number;
  char_offset: number;
  char_count: number;
  ascii: boolean;
  data: Buffer;
  bloom: Buffer;
}

function recordingTx(hasMarker = false) {
  const batches: BlockRow[][] = [];
  const markers: unknown[][] = [];
  const tx = (first: TemplateStringsArray | BlockRow[], ...values: unknown[]) => {
    if (!('raw' in first)) return first;
    const text = first.join('?');
    if (text.includes('from server_log_block_files')) {
      return Promise.resolve(hasMarker ? [{ exists: 1 }] : []);
    }
    if (text.includes('insert into server_log_blocks')) batches.push(values[0] as BlockRow[]);
    else if (text.includes('insert into server_log_block_files')) markers.push(values);
    return Promise.resolve([]);
  };
  return { tx: tx as unknown as TransactionSql, batches, markers };
}

const B = SERVER_LOG_BLOCK_CHARS;

function mixedLog(chars: number): string {
  const line = 'INFO request done in 12 ms\n';
  let text = line.repeat(Math.ceil(chars / line.length)).slice(0, chars);
  for (const at of [B - 1, B + 77, 2 * B + 10]) {
    text = `${text.slice(0, at)}é😀${text.slice(at + 2)}`;
  }
  return text;
}

function expectedRows(text: string, serverLogId: number, fileName: string): BlockRow[] {
  return encodeServerLogBlocks(text).map((block) => ({
    server_log_id: serverLogId,
    file_name: fileName,
    block_index: block.blockIndex,
    char_offset: block.charOffset,
    char_count: block.charCount,
    ascii: block.ascii,
    data: Buffer.from(block.data),
    bloom: Buffer.from(block.bloom),
  }));
}

describe('writeServerLogBlocks', () => {
  const text = mixedLog(2 * B + 4321);
  const ascii = Buffer.byteLength(text, 'utf8') === text.length;
  const charCount = countCodePoints(text);

  it('stores a log read one block per range exactly as encoding it whole', async () => {
    const { tx, batches, markers } = recordingTx();
    const reads: [number, number][] = [];

    const written = await writeServerLogBlocks(
      tx,
      7,
      'server.log',
      charCount,
      (start, length) => {
        reads.push([start, length]);
        return Promise.resolve(sliceCodePoints(text, ascii, start, length));
      },
      1,
    );

    expect(written).toBe(true);
    expect(reads.map(([start]) => start)).toEqual([0, B, 2 * B]);
    expect(batches.flat()).toEqual(expectedRows(text, 7, 'server.log'));
    expect(batches.every((batch) => batch.length > 0)).toBe(true);
    expect(markers).toEqual([[7, 'server.log', charCount, 3]]);
  });

  it('writes nothing when the file already has a marker', async () => {
    const { tx, batches, markers } = recordingTx(true);
    const readRange = vi.fn((start: number, length: number) =>
      Promise.resolve(sliceCodePoints(text, ascii, start, length)),
    );

    expect(await writeServerLogBlocks(tx, 7, 'server.log', charCount, readRange)).toBe(false);
    expect(readRange).not.toHaveBeenCalled();
    expect(batches).toEqual([]);
    expect(markers).toEqual([]);
  });
});

describe('writeTextAsBlocks', () => {
  it('stores a non-ASCII log by code points like encoding it whole', async () => {
    const text = mixedLog(B + 999);
    const { tx, batches, markers } = recordingTx();

    expect(await writeTextAsBlocks(tx, '9', 'worker-1.log', text)).toBe(true);
    expect(batches.flat()).toEqual(
      expectedRows(text, 9, 'worker-1.log').map((row) => ({
        ...row,
        server_log_id: '9',
      })),
    );
    expect(markers).toEqual([['9', 'worker-1.log', countCodePoints(text), 2]]);
  });

  it('stores an empty log as a marker with no blocks', async () => {
    const { tx, batches, markers } = recordingTx();

    expect(await writeTextAsBlocks(tx, 3, 'empty.log', '')).toBe(true);
    expect(batches).toEqual([]);
    expect(markers).toEqual([[3, 'empty.log', 0, 0]]);
  });
});

describe('serverLogBlocksEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is on only for SERVER_LOG_BLOCKS=1', () => {
    vi.stubEnv('SERVER_LOG_BLOCKS', '1');
    expect(serverLogBlocksEnabled()).toBe(true);
    vi.stubEnv('SERVER_LOG_BLOCKS', '0');
    expect(serverLogBlocksEnabled()).toBe(false);
    vi.stubEnv('SERVER_LOG_BLOCKS', 'true');
    expect(serverLogBlocksEnabled()).toBe(false);
  });
});
