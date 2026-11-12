import type { PGlite } from '@electric-sql/pglite';
import type { TransactionSql } from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeTextAsBlocks } from '../etl/server-log-block-writer';
import { readServerLogBlocks } from '../server-log-blocks';
import {
  listStoredServerLogFiles,
  redactStoredServerLogFile,
  sanitizeRunUrls,
  type StoredServerLogFile,
} from './stored-redaction';
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

function redactStored(file: StoredServerLogFile, write: boolean) {
  return sql.begin((tx) => redactStoredServerLogFile(tx as unknown as TransactionSql, file, write));
}

function redactFile(fileName: string, primary: boolean, write: boolean) {
  return redactStored({ logId: '1', fileName, primary, shadowed: false, repositories: [] }, write);
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

  it("keeps the primary's blocks when a child shares its name", async () => {
    const child = 'child 203.0.113.9\n';
    await sql`
      insert into server_log_files (server_log_id, file_name, log_text)
      values (1, 'results/server.log', ${child})
    `;
    await sql.begin((tx) =>
      writeTextAsBlocks(tx as unknown as TransactionSql, 1, 'results/server.log', RAW),
    );

    const files = await listStoredServerLogFiles(sql, undefined);
    expect(files.map(({ fileName, primary, shadowed }) => [fileName, primary, shadowed])).toEqual([
      ['results/server.log', true, false],
      ['results/router.log', false, false],
      ['results/server.log', false, true],
    ]);
    for (const file of files) await redactStored(file, true);

    const blocks = await sql<
      { char_offset: number; char_count: number; ascii: boolean; data: Uint8Array }[]
    >`
      select char_offset, char_count, ascii, data from server_log_blocks
      where server_log_id = 1 and file_name = 'results/server.log'
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
    expect(
      await sql`select log_text from server_log_files where file_name = 'results/server.log'`,
    ).toEqual([{ log_text: 'child ***REDACTED***\n' }]);
  });
});

const PRIVATE_URL = 'https://github.com/example-org/private-repo/actions/runs/101';
const PUBLIC_URL = 'https://github.com/example-org/public-repo/actions/runs/102';
const PRIVATE_LOG =
  'clone https://github.com/example-org/private-repo\ncd /_work/private-repo/private-repo\n';
const PRIVATE_CHILD =
  'pip install private-repo-tools\n/_work/private-repo/private-repo/router.py\n';
const PUBLIC_LOG = 'cd /_work/public-repo/public-repo\n';

async function stored() {
  return {
    runs: await sql`select github_run_id::int, html_url from workflow_runs order by id`,
    logs: await sql`select server_log from server_logs order by id`,
    files: await sql`select log_text from server_log_files`,
  };
}

describe('backfill of runs from repositories that are not public', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url === 'https://api.github.com/repos/example-org/public-repo'
            ? Response.json({ private: false })
            : new Response(null, { status: 404 }),
        ),
      ),
    );
    await db.exec('TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE');
    await sql`
      insert into workflow_runs (id, github_run_id, run_attempt, name, created_at, date, html_url)
      values (1, 101, 1, 'Run Sweep', '2026-11-01T00:00:00Z', '2026-11-01', ${PRIVATE_URL}),
        (2, 102, 1, 'Run Sweep', '2026-11-01T00:00:00Z', '2026-11-01', ${PUBLIC_URL})
    `;
    await db.exec(`
      insert into configs (id, model, hardware, framework, precision, spec_method, disagg,
        is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      values (1, 'dsv4', 'gb200', 'dynamo-vllm', 'fp4', 'none', true, true, 4, 8, 8, 16)
    `);
    await sql`
      insert into server_logs (server_log, file_name, files_complete)
      values (${PRIVATE_LOG}, 'results/server.log', true), (${PUBLIC_LOG}, 'results/server.log', true)
    `;
    await sql`
      insert into server_log_files (server_log_id, file_name, log_text)
      values (1, 'results/router.log', ${PRIVATE_CHILD})
    `;
    await db.exec(`
      insert into benchmark_results
        (workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics, server_log_id)
      values (1, 1, 'single_turn', '2026-11-01', 1024, 1024, 1, '{}', 1),
        (2, 1, 'single_turn', '2026-11-01', 1024, 1024, 1, '{}', 2)
    `);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sanitizes the logs and run URL of a private run and leaves a public run untouched', async () => {
    const files = await listStoredServerLogFiles(sql, undefined);
    expect(files).toEqual([
      {
        logId: '2',
        fileName: 'results/server.log',
        primary: true,
        shadowed: false,
        repositories: [],
      },
      {
        logId: '1',
        fileName: 'results/server.log',
        primary: true,
        shadowed: false,
        repositories: ['example-org/private-repo'],
      },
      {
        logId: '1',
        fileName: 'results/router.log',
        primary: false,
        shadowed: false,
        repositories: ['example-org/private-repo'],
      },
    ]);
    for (const file of files) await redactStored(file, true);
    expect(await sanitizeRunUrls(sql, undefined, true)).toBe(1);

    expect(await stored()).toEqual({
      runs: [
        { github_run_id: 101, html_url: null },
        { github_run_id: 102, html_url: PUBLIC_URL },
      ],
      logs: [
        {
          server_log:
            'clone https://github.com/***REDACTED***\ncd /_work/***REDACTED***/***REDACTED***\n',
        },
        { server_log: PUBLIC_LOG },
      ],
      files: [
        {
          log_text:
            'pip install private-repo-tools\n/_work/***REDACTED***/***REDACTED***/router.py\n',
        },
      ],
    });
  });

  it('writes nothing in a dry run and honors --run-id', async () => {
    expect(await listStoredServerLogFiles(sql, 102)).toEqual([
      {
        logId: '2',
        fileName: 'results/server.log',
        primary: true,
        shadowed: false,
        repositories: [],
      },
    ]);
    const before = await stored();
    const changed = [];
    for (const file of await listStoredServerLogFiles(sql, undefined)) {
      const result = await redactStored(file, false);
      changed.push(result.changed);
    }
    expect(changed).toEqual([false, true, true]);
    expect(await sanitizeRunUrls(sql, undefined, false)).toBe(1);
    expect(await sanitizeRunUrls(sql, 102, true)).toBe(0);
    expect(await stored()).toEqual(before);
    expect(before.runs).toEqual([
      { github_run_id: 101, html_url: PRIVATE_URL },
      { github_run_id: 102, html_url: PUBLIC_URL },
    ]);
  });
});
