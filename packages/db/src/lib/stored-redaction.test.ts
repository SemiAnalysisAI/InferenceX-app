import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import type { TransactionSql } from 'postgres';

import {
  compactStoredServerLogFile,
  SERVER_LOG_FILE_LOCK_SPACE,
  writeTextAsBlocks,
} from '../etl/server-log-block-writer';
import { readServerLogBlocks } from '../server-log-blocks';
import {
  backfillLogRedaction,
  listStoredServerLogFiles,
  redactStoredServerLogFile,
  reportLogRedaction,
  sanitizeRunUrls,
  type StoredServerLogFile,
} from './stored-redaction';
import { migratedPglite, pgliteDriverSql, type PgliteSql } from './test-pglite';

const RAW =
  'peer 198.51.100.7:9100 ready\nremote=[node-a.subnet1.vcn1.oraclevcn.com]:29501 via 10.0.0.21\n';
const REDACTED =
  'peer ***REDACTED***:9100 ready\nremote=[node-a.***REDACTED***]:29501 via 10.0.0.21\n';

let db: PGlite;
let sql: PgliteSql;
const urlMapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-run-url-map-'));
const urlMapFile = path.join(urlMapDir, 'private', 'run-urls.jsonl');

beforeAll(async () => {
  db = await migratedPglite();
  sql = await pgliteDriverSql(db);
}, 20_000);

afterAll(async () => {
  await sql?.end();
  await db?.close();
  fs.rmSync(urlMapDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.exec('TRUNCATE workflow_runs, configs, server_logs RESTART IDENTITY CASCADE');
  fs.rmSync(path.dirname(urlMapFile), { recursive: true, force: true });
});

function redactStored(file: StoredServerLogFile, write: boolean) {
  return sql.begin((tx) => redactStoredServerLogFile(tx, file, write));
}

function redactFile(fileName: string, primary: boolean, write: boolean) {
  return redactStored({ logId: '1', fileName, primary, shadowed: false, repositories: [] }, write);
}

function writeBlocks(logId: number, fileName: string, text: string) {
  return sql.begin((tx) => writeTextAsBlocks(tx, logId, fileName, text));
}

async function decodedBlocks(logId: number, fileName: string, length: number) {
  const blocks = await sql<
    { char_offset: number; char_count: number; ascii: boolean; data: Uint8Array }[]
  >`
    select char_offset, char_count, ascii, data from server_log_blocks
    where server_log_id = ${logId} and file_name = ${fileName}
    order by block_index
  `;
  return readServerLogBlocks(
    blocks.map((block) => ({
      charOffset: block.char_offset,
      charCount: block.char_count,
      ascii: block.ascii,
      data: block.data,
    })),
    0,
    length,
  );
}

/** The server-log file advisory locks `tx` holds. */
function advisoryLocks(tx: TransactionSql) {
  return tx<{ key: string }[]>`
    select objid::text as key from pg_locks
    where locktype = 'advisory' and classid = ${SERVER_LOG_FILE_LOCK_SPACE}::oid
  `;
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
    await writeBlocks(1, 'results/router.log', RAW);
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
    expect(await decodedBlocks(1, 'results/router.log', REDACTED.length)).toBe(REDACTED);
    expect(await sql`select char_count::int, block_count from server_log_block_files`).toEqual([
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
    await writeBlocks(1, 'results/server.log', RAW);

    const files = await listStoredServerLogFiles(sql, undefined);
    expect(files.map(({ fileName, primary, shadowed }) => [fileName, primary, shadowed])).toEqual([
      ['results/server.log', true, false],
      ['results/router.log', false, false],
      ['results/server.log', false, true],
    ]);
    for (const file of files) await redactStored(file, true);

    expect(await decodedBlocks(1, 'results/server.log', REDACTED.length)).toBe(REDACTED);
    expect(
      await sql`select log_text from server_log_files where file_name = 'results/server.log'`,
    ).toEqual([{ log_text: 'child ***REDACTED***\n' }]);
  });

  it('rebuilds blocks that a racing compaction built from the raw text', async () => {
    await sql`update server_log_files set log_text = ${REDACTED}`;

    expect(await redactFile('results/router.log', false, false)).toEqual({
      changed: true,
      blockBacked: true,
    });
    expect(await redactFile('results/router.log', false, true)).toEqual({
      changed: true,
      blockBacked: true,
    });
    expect(await decodedBlocks(1, 'results/router.log', REDACTED.length)).toBe(REDACTED);
    expect(await redactFile('results/router.log', false, true)).toEqual({
      changed: false,
      blockBacked: false,
    });
  });

  it('rebuilds raw blocks under redacted text of the same length', async () => {
    // `100.200.100.20` and `***REDACTED***` are both 14 characters.
    const raw = 'peer 100.200.100.20 up\n';
    const sanitized = 'peer ***REDACTED*** up\n';
    await db.exec('DELETE FROM server_log_block_files; DELETE FROM server_log_blocks;');
    await sql`update server_log_files set log_text = ${sanitized}`;
    await writeBlocks(1, 'results/router.log', raw);

    expect(await redactFile('results/router.log', false, true)).toEqual({
      changed: true,
      blockBacked: true,
    });
    expect(await decodedBlocks(1, 'results/router.log', sanitized.length)).toBe(sanitized);
    expect(await redactFile('results/router.log', false, true)).toEqual({
      changed: false,
      blockBacked: false,
    });
  });

  it('holds the file advisory lock that compaction also takes', async () => {
    const [{ key }] = await sql<{ key: string }[]>`
      select (hashtext('1/results/router.log')::bigint & 4294967295)::text as key
    `;
    const file = {
      logId: '1',
      fileName: 'results/router.log',
      primary: false,
      shadowed: false,
      repositories: [],
    };

    expect(
      await sql.begin(async (tx) => {
        await redactStoredServerLogFile(tx, file, true);
        return advisoryLocks(tx);
      }),
    ).toEqual([{ key }]);
    await db.exec(`DELETE FROM server_log_block_files; DELETE FROM server_log_blocks;`);
    expect(
      await sql.begin(async (tx) => {
        expect(await compactStoredServerLogFile(tx, '1', 'results/router.log', false)).toEqual({
          chars: REDACTED.length,
          written: true,
        });
        return advisoryLocks(tx);
      }),
    ).toEqual([{ key }]);
  });
});

const PRIVATE_URL = 'https://github.com/example-org/private-repo/actions/runs/101';
const PUBLIC_URL = 'https://github.com/example-org/public-repo/actions/runs/102';
const PRIVATE_LOG =
  'clone https://github.com/example-org/private-repo\ncd /_work/private-repo/private-repo\n';
const PRIVATE_CHILD =
  'pip install private-repo-tools\n/_work/private-repo/private-repo/router.py\n';
const PUBLIC_LOG = 'cd /_work/public-repo/public-repo\n';
/** GitHub's API as an unauthenticated caller sees it: only `public-repo` is public. */
const githubVisibility = ((url: string) =>
  Promise.resolve(
    url === 'https://api.github.com/repos/example-org/public-repo'
      ? Response.json({ private: false })
      : new Response(null, { status: 404 }),
  )) as typeof fetch;

afterEach(() => {
  mock.restore();
});

async function stored() {
  return {
    runs: await sql`select github_run_id::int, html_url from workflow_runs order by id`,
    logs: await sql`select server_log from server_logs order by id`,
    files: await sql`select log_text from server_log_files order by server_log_id, file_name`,
  };
}

describe('runs from repositories that are not public', () => {
  beforeEach(async () => {
    spyOn(globalThis, 'fetch').mockImplementation(githubVisibility);
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
    expect(await sanitizeRunUrls(sql, undefined, true, urlMapFile)).toBe(1);

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
            'pip install ***REDACTED***-tools\n/_work/***REDACTED***/***REDACTED***/router.py\n',
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
    expect(await sanitizeRunUrls(sql, undefined, false, urlMapFile)).toBe(1);
    expect(await sanitizeRunUrls(sql, 102, true, urlMapFile)).toBe(0);
    expect(fs.existsSync(urlMapFile)).toBe(false);
    expect(await stored()).toEqual(before);
    expect(before.runs).toEqual([
      { github_run_id: 101, html_url: PRIVATE_URL },
      { github_run_id: 102, html_url: PUBLIC_URL },
    ]);
  });
});

/** Every row of the tables the backfill reads, as JSON, in a stable order. */
async function snapshot() {
  const tables = [
    'workflow_runs',
    'configs',
    'benchmark_results',
    'server_logs',
    'server_log_files',
    'server_log_block_files',
    'server_log_blocks',
  ];
  const rows: Record<string, Record<string, unknown>[]> = {};
  for (const table of tables) {
    const result = await db.query<{ row: Record<string, unknown> }>(
      `select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`,
    );
    rows[table] = result.rows.map((r) => r.row);
  }
  return rows;
}

describe('backfillLogRedaction', () => {
  const PUBLIC_ROUTER = 'router up on 198.51.100.20:8000\n';
  const PRIVATE_SERVER =
    'clone https://github.com/example-org/private-repo\n' +
    'token hf_abcdefghijklmnopqrstuvwxyzABCDEF12 from 203.0.113.5\n';
  const quiet = { log: () => {}, error: () => {}, urlMapFile };

  beforeEach(async () => {
    spyOn(globalThis, 'fetch').mockImplementation(githubVisibility);
    await sql`
      insert into workflow_runs (id, github_run_id, run_attempt, name, created_at, date, html_url)
      values (1, 101, 1, 'Run Sweep', '2026-11-01T00:00:00Z', '2026-11-01', ${PRIVATE_URL}),
        (2, 102, 1, 'Run Sweep', '2026-11-01T00:00:00Z', '2026-11-01', ${PUBLIC_URL}),
        (3, 103, 1, 'Run Sweep', '2026-11-01T00:00:00Z', '2026-11-01', null)
    `;
    await db.exec(`
      insert into configs (id, model, hardware, framework, precision, spec_method, disagg,
        is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      values (1, 'dsv4', 'gb200', 'dynamo-vllm', 'fp4', 'none', true, true, 4, 8, 8, 16)
    `);
    await sql`
      insert into server_logs (server_log, file_name, files_complete)
      values (${PRIVATE_SERVER}, 'results/server.log', true),
        (${RAW}, 'results/server.log', true),
        ('nothing to hide on 10.0.0.4\n', 'results/server.log', true)
    `;
    await sql`
      insert into server_log_files (server_log_id, file_name, log_text)
      values (1, 'results/router.log', ${PRIVATE_CHILD}), (2, 'results/router.log', ${PUBLIC_ROUTER})
    `;
    await writeBlocks(2, 'results/server.log', RAW);
    await writeBlocks(2, 'results/router.log', PUBLIC_ROUTER);
    await db.exec(`
      insert into benchmark_results
        (workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics, server_log_id)
      values
        (1, 1, 'single_turn', '2026-11-01', 1024, 1024, 1, '{"throughput": 198.51}', 1),
        (2, 1, 'single_turn', '2026-11-01', 1024, 1024, 1, '{"host": "198.51.100.7"}', 2),
        (3, 1, 'single_turn', '2026-11-01', 1024, 1024, 1, '{}', 3)
    `);
  });

  it('writes nothing in a dry run', async () => {
    const before = await snapshot();

    expect(
      await backfillLogRedaction(sql, { runId: undefined, write: false, concurrency: 2, ...quiet }),
    ).toEqual({ files: 5, changed: 4, blockBacked: 2, failed: 0, runUrls: 1 });
    expect(await snapshot()).toEqual(before);
  });

  it('sanitizes only log text and private run URLs, and a second run changes nothing', async () => {
    const before = await snapshot();

    expect(
      await backfillLogRedaction(sql, { runId: undefined, write: true, concurrency: 2, ...quiet }),
    ).toEqual({ files: 5, changed: 4, blockBacked: 2, failed: 0, runUrls: 1 });
    const once = await snapshot();
    expect(
      await backfillLogRedaction(sql, { runId: undefined, write: true, concurrency: 2, ...quiet }),
    ).toEqual({ files: 5, changed: 0, blockBacked: 0, failed: 0, runUrls: 0 });
    expect(await snapshot()).toEqual(once);

    // The cleared URL is recorded once, owner-only, before it is cleared.
    expect(fs.readFileSync(urlMapFile, 'utf8')).toBe(
      `${JSON.stringify({ github_run_id: '101', run_attempt: 1, html_url: PRIVATE_URL })}\n`,
    );
    expect(fs.statSync(urlMapFile).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(urlMapFile)).mode & 0o777).toBe(0o700);

    // Rows other than log text are untouched; run URLs change only for the private run.
    expect(once.configs).toEqual(before.configs);
    expect(once.benchmark_results).toEqual(before.benchmark_results);
    expect(once.workflow_runs!.map((run) => ({ ...run, html_url: null }))).toEqual(
      before.workflow_runs!.map((run) => ({ ...run, html_url: null })),
    );
    expect(await stored()).toEqual({
      runs: [
        { github_run_id: 101, html_url: null },
        { github_run_id: 102, html_url: PUBLIC_URL },
        { github_run_id: 103, html_url: null },
      ],
      logs: [
        {
          server_log:
            'clone https://github.com/***REDACTED***\n' +
            'token ***REDACTED*** from ***REDACTED***\n',
        },
        { server_log: REDACTED },
        { server_log: 'nothing to hide on 10.0.0.4\n' },
      ],
      files: [
        {
          log_text:
            'pip install ***REDACTED***-tools\n/_work/***REDACTED***/***REDACTED***/router.py\n',
        },
        { log_text: 'router up on ***REDACTED***:8000\n' },
      ],
    });
    const router = 'router up on ***REDACTED***:8000\n';
    expect(await decodedBlocks(2, 'results/server.log', REDACTED.length)).toBe(REDACTED);
    expect(await decodedBlocks(2, 'results/router.log', router.length)).toBe(router);
  });

  it('scopes to --run-id and leaves other runs alone', async () => {
    const before = await snapshot();

    expect(
      await backfillLogRedaction(sql, { runId: 102, write: true, concurrency: 1, ...quiet }),
    ).toEqual({ files: 2, changed: 2, blockBacked: 2, failed: 0, runUrls: 0 });
    const after = await snapshot();
    expect(after.workflow_runs).toEqual(before.workflow_runs);
    expect(after.server_logs!.filter((log) => log.id !== 2)).toEqual(
      before.server_logs!.filter((log) => log.id !== 2),
    );
  });

  it('keeps repository names and run URLs on a downstream database', async () => {
    const fetchMock = spyOn(globalThis, 'fetch');

    expect(
      await backfillLogRedaction(sql, {
        runId: undefined,
        write: true,
        concurrency: 1,
        downstream: true,
        ...quiet,
      }),
    ).toEqual({ files: 5, changed: 3, blockBacked: 2, failed: 0, runUrls: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.existsSync(urlMapFile)).toBe(false);
    expect(await stored()).toEqual({
      runs: [
        { github_run_id: 101, html_url: PRIVATE_URL },
        { github_run_id: 102, html_url: PUBLIC_URL },
        { github_run_id: 103, html_url: null },
      ],
      logs: [
        {
          server_log:
            'clone https://github.com/example-org/private-repo\n' +
            'token ***REDACTED*** from ***REDACTED***\n',
        },
        { server_log: REDACTED },
        { server_log: 'nothing to hide on 10.0.0.4\n' },
      ],
      files: [{ log_text: PRIVATE_CHILD }, { log_text: 'router up on ***REDACTED***:8000\n' }],
    });
  });

  it('exits 1 when a file fails, also on a downstream database', async () => {
    await db.exec(`
      CREATE FUNCTION refuse_log_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'refused'; END $$;
      CREATE TRIGGER refuse_log_update BEFORE UPDATE ON server_log_files
        FOR EACH ROW EXECUTE FUNCTION refuse_log_update();
    `);
    try {
      const errors: string[] = [];
      const options = {
        runId: undefined,
        write: true,
        concurrency: 1,
        downstream: true,
        ...quiet,
        error: (line: string) => errors.push(line),
      };
      const result = await backfillLogRedaction(sql, options);
      expect(result).toMatchObject({ failed: 1, runUrls: null });
      expect(reportLogRedaction(result, options)).toBe(1);
      expect(errors.at(-1)).toBe('1 file(s) failed; rerun after fixing them');
      expect(reportLogRedaction({ ...result, failed: 0 }, options)).toBe(0);
    } finally {
      await db.exec(`
        DROP TRIGGER refuse_log_update ON server_log_files;
        DROP FUNCTION refuse_log_update();
      `);
    }
  });
});
