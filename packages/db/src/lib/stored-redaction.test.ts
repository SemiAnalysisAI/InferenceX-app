import type { PGlite } from '@electric-sql/pglite';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { writeTextAsBlocks } from '../etl/server-log-block-writer';
import { readServerLogBlocks } from '../server-log-blocks';
import { redactStoredServerLogFile } from './stored-redaction';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';

const RAW =
  'peer 198.51.100.7:9100 ready\nremote=[node-a.subnet1.vcn1.oraclevcn.com]:29501 via 10.0.0.21\n';
const REDACTED =
  'peer ***REDACTED***:9100 ready\nremote=[node-a.***REDACTED***]:29501 via 10.0.0.21\n';

let db: PGlite;
let sql: PgliteSql;

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('TRUNCATE server_logs RESTART IDENTITY CASCADE');
});

function redactFile(fileName: string, primary: boolean, write: boolean) {
  return sql.begin((tx) =>
    redactStoredServerLogFile(
      tx as unknown as TransactionSql,
      { logId: '1', fileName, primary },
      write,
    ),
  );
}

async function storedLogs() {
  const [log] = await sql<{ server_log: string }[]>`select server_log from server_logs`;
  const [file] = await sql<{ log_text: string }[]>`select log_text from server_log_files`;
  return { primary: log!.server_log, child: file!.log_text };
}

describe('redactStoredServerLogFile', () => {
  beforeEach(async () => {
    await sql`
      insert into server_logs (server_log, file_name, files_complete)
      values (${RAW}, 'results/server.log', true)
    `;
    await sql`
      insert into server_log_files (server_log_id, file_name, log_text)
      values (1, 'results/router.log', ${RAW})
    `;
    await sql.begin((tx) =>
      writeTextAsBlocks(tx as unknown as TransactionSql, 1, 'results/router.log', RAW),
    );
  });

  it('reports a block-backed file in a dry run without writing', async () => {
    expect(await redactFile('results/router.log', false, false)).toEqual({
      changed: true,
      blockBacked: true,
    });
    expect(await storedLogs()).toEqual({ primary: RAW, child: RAW });
  });

  it('rewrites the text and rebuilds blocks that decode to it', async () => {
    expect(await redactFile('results/router.log', false, true)).toEqual({
      changed: true,
      blockBacked: true,
    });
    expect(await redactFile('results/server.log', true, true)).toEqual({
      changed: true,
      blockBacked: false,
    });

    expect(await storedLogs()).toEqual({ primary: REDACTED, child: REDACTED });
    const blocks = await sql<
      { char_offset: number; char_count: number; ascii: boolean; data: Uint8Array }[]
    >`
      select char_offset, char_count, ascii, data from server_log_blocks
      where server_log_id = 1 and file_name = 'results/router.log'
      order by block_index
    `;
    const decoded = readServerLogBlocks(
      blocks.map((block) => ({
        charOffset: block.char_offset,
        charCount: block.char_count,
        ascii: block.ascii,
        data: block.data,
      })),
      0,
      REDACTED.length,
    );
    expect(decoded).toBe(REDACTED);
    expect(await sql`select char_count, block_count from server_log_block_files`).toEqual([
      { char_count: REDACTED.length, block_count: 1 },
    ]);
    expect(await sql`select count(*)::int as n from server_log_blocks`).toEqual([{ n: 1 }]);
  });

  it('finds nothing left to change in sanitized text', async () => {
    await redactFile('results/router.log', false, true);

    expect(await redactFile('results/router.log', false, true)).toEqual({
      changed: false,
      blockBacked: false,
    });
  });
});
