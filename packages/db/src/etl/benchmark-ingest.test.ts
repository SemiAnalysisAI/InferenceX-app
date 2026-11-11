import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Sql } from './db-utils';
import {
  benchmarkPointIngestKey,
  bulkIngestBenchmarkRows,
  insertServerLogFilePaths,
  insertServerLogFiles,
  type BenchmarkPersistenceInput,
} from './benchmark-ingest';
import * as blockWriter from './server-log-block-writer';

const REDACTION_KEY = Buffer.from('test-key');

const blocksWritten = vi.hoisted((): string[] => []);
vi.mock('./server-log-block-writer', async (importOriginal) => ({
  ...(await importOriginal<typeof blockWriter>()),
  writeTextAsBlocks: vi.fn(async (_tx: unknown, _id: unknown, fileName: string) => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setImmediate(resolve);
    await promise;
    blocksWritten.push(fileName);
    return true;
  }),
}));

const point = (recipeFingerprint: string | null) => ({
  configId: 7,
  benchmarkType: 'single_turn' as const,
  isl: 8192,
  osl: 1024,
  conc: 12,
  offloadMode: 'off',
  recipeFingerprint,
});

describe('benchmarkPointIngestKey', () => {
  it('keeps recipes at the same config and concurrency distinct', () => {
    expect(
      benchmarkPointIngestKey(
        point('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      ),
    ).not.toBe(
      benchmarkPointIngestKey(
        point('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      ),
    );
  });

  it('keeps one stable legacy identity for null fingerprints', () => {
    expect(benchmarkPointIngestKey(point(null))).toBe(benchmarkPointIngestKey(point(null)));
  });
});

function fakeTransactionSql(
  linkedId: number | null,
  storedFileNames: string[] = [],
  conflictingFileNames?: string[],
) {
  const calls: { text: string; values: unknown[] }[] = [];
  const tag = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('');
    calls.push({ text, values });
    if (text.includes('select id, server_log_id')) {
      return Promise.resolve([{ id: 42, server_log_id: linkedId }]);
    }
    if (text.includes('insert into server_logs')) return Promise.resolve([{ id: 99 }]);
    if (text.includes('select file_name from server_log_files')) {
      return Promise.resolve(storedFileNames.map((file_name) => ({ file_name })));
    }
    if (conflictingFileNames && text.includes('insert into server_log_files')) {
      return Promise.resolve(conflictingFileNames.includes(String(values[1])) ? [] : [{ 1: 1 }]);
    }
    return Promise.resolve([]);
  }) as any;
  tag.array = (value: unknown) => value;
  tag.begin = (fn: (tx: typeof tag) => Promise<void>) => fn(tag);
  return { sql: tag as Sql, calls };
}

function captureInsertSql() {
  const calls: { text: string; values: unknown[] }[] = [];
  const tag = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?').replaceAll(/\s+/gu, ' ').trim(), values });
    return Promise.resolve([]);
  }) as any;
  tag.array = (value: unknown) => value;
  return { sql: tag as Sql, calls };
}

describe('bulkIngestBenchmarkRows — power audit provenance lanes', () => {
  const provenancedRow: BenchmarkPersistenceInput = {
    configId: 7,
    benchmarkType: 'single_turn',
    isl: 1024,
    osl: 1024,
    conc: 64,
    offloadMode: 'off',
    image: 'img',
    recipeFingerprint: null,
    metrics: { power_valid: 0 },
    powerInvalidReasons: ['sampling_gap_exceeded'],
    powerAudit: {
      window_start_unix: 1756174800,
      window_end_unix: 1756175400,
      expected_gpu_count: 8,
      observed_gpu_count: 8,
      sample_count: 4800,
      max_sample_gap_s: 1.013,
      producer_sha: null,
      exporter_image_sha256: null,
    },
  };
  const legacyRow: BenchmarkPersistenceInput = {
    configId: 8,
    benchmarkType: 'single_turn',
    isl: 1024,
    osl: 1024,
    conc: 128,
    offloadMode: 'off',
    image: 'img',
    recipeFingerprint: null,
    metrics: { tput_per_gpu: 100 },
  };

  it('names both columns, adds two jsonb lanes, and refreshes both on conflict', async () => {
    const { sql, calls } = captureInsertSql();
    await bulkIngestBenchmarkRows(sql, [provenancedRow, legacyRow], 42, '2026-08-27');

    const { text } = calls[0];
    expect(text).toContain('metrics, workers, power_invalid_reasons, power_audit )');
    expect(text.match(/::jsonb\[\]/gu)).toHaveLength(4);
    expect(text).toContain('power_invalid_reasons = excluded.power_invalid_reasons');
    expect(text).toContain('coalesce(excluded.power_audit, benchmark_results.power_audit)');
  });

  it('serializes present fields and contributes null lanes for absent ones', async () => {
    const { sql, calls } = captureInsertSql();
    await bulkIngestBenchmarkRows(sql, [provenancedRow, legacyRow], 42, '2026-08-27');

    const { values } = calls[0];
    expect(values[10]).toEqual([
      JSON.stringify(provenancedRow.metrics),
      JSON.stringify(legacyRow.metrics),
    ]);
    expect(values[11]).toEqual([null, null]);
    expect(values[12]).toEqual([JSON.stringify(provenancedRow.powerInvalidReasons), null]);
    expect(values[13]).toEqual([JSON.stringify(provenancedRow.powerAudit), null]);
  });
});

describe('insertServerLogFiles', () => {
  const files = [
    { fileName: 'results/benchmark.log', logText: 'benchmark' },
    { fileName: 'results/router.log', logText: 'router' },
    { fileName: 'results/server.log', logText: 'server' },
  ];

  it('stores server.log as primary and every other filename as a child row', async () => {
    const { sql, calls } = fakeTransactionSql(null);
    await insertServerLogFiles(sql, [42], files, REDACTION_KEY);

    const primaryInsert = calls.find((call) => call.text.includes('insert into server_logs'));
    expect(primaryInsert?.values).toEqual(['server', 'results/server.log']);
    const childNames = calls
      .filter((call) => call.text.includes('insert into server_log_files'))
      .map((call) => call.values[1]);
    expect(childNames).toEqual(['results/benchmark.log', 'results/router.log']);
    expect(calls.some((call) => call.text.includes('set server_log_id'))).toBe(true);
  });

  it('idempotently adds missing filenames to an existing linked bundle', async () => {
    const { sql, calls } = fakeTransactionSql(7);
    await insertServerLogFiles(sql, [42], files, REDACTION_KEY);

    expect(calls.filter((call) => call.text.includes('insert into server_logs'))).toHaveLength(0);
    expect(calls.filter((call) => call.text.includes('insert into server_log_files'))).toHaveLength(
      2,
    );
    expect(calls.some((call) => call.text.includes('files_complete = true'))).toBe(true);
  });

  it('skips filenames an existing bundle already stores without reading them', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-log-ingest-test-'));
    const serverPath = path.join(root, 'server.log');
    const routerPath = path.join(root, 'router.log');
    fs.writeFileSync(serverPath, 'server');
    fs.writeFileSync(routerPath, 'router');
    try {
      const { sql, calls } = fakeTransactionSql(7, ['stored.log']);
      await insertServerLogFilePaths(
        sql,
        [42],
        [
          { fileName: 'stored.log', path: path.join(root, 'missing.log') },
          { fileName: 'router.log', path: routerPath },
          { fileName: 'server.log', path: serverPath },
        ],
        REDACTION_KEY,
      );

      const childNames = calls
        .filter((call) => call.text.includes('insert into server_log_files'))
        .map((call) => call.values[1]);
      expect(childNames).toEqual(['router.log']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads archived file paths lazily and removes null bytes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-log-ingest-test-'));
    const serverPath = path.join(root, 'server.log');
    const routerPath = path.join(root, 'router.log');
    fs.writeFileSync(serverPath, 'server\u0000');
    fs.writeFileSync(routerPath, 'router\u0000');
    try {
      const { sql, calls } = fakeTransactionSql(null);
      await insertServerLogFilePaths(
        sql,
        [42],
        [
          { fileName: 'router.log', path: routerPath },
          { fileName: 'server.log', path: serverPath },
        ],
        REDACTION_KEY,
      );

      const primaryInsert = calls.find((call) => call.text.includes('insert into server_logs'));
      expect(primaryInsert?.values).toEqual(['server', 'server.log']);
      const childInsert = calls.find((call) => call.text.includes('insert into server_log_files'));
      expect(childInsert?.values).toEqual([99, 'router.log', 'router']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('caps oversized files before sending them to PostgreSQL', async () => {
    const previous = process.env.SERVER_LOG_MAX_FILE_BYTES;
    process.env.SERVER_LOG_MAX_FILE_BYTES = String(128 * 1024);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const big = 'decode worker line\n'.repeat(50_000);
      const { sql, calls } = fakeTransactionSql(null);
      await insertServerLogFiles(
        sql,
        [42],
        [
          { fileName: 'server.log', logText: 'server' },
          { fileName: 'cn08_decode_w0.out', logText: big },
        ],
        REDACTION_KEY,
      );

      const childInsert = calls.find((call) => call.text.includes('insert into server_log_files'));
      const stored = childInsert?.values[2] as string;
      expect(Buffer.byteLength(stored, 'utf8')).toBeLessThanOrEqual(128 * 1024);
      expect(stored).toContain('[InferenceX ingest truncated this log');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cn08_decode_w0.out: truncated'));
    } finally {
      warn.mockRestore();
      if (previous === undefined) delete process.env.SERVER_LOG_MAX_FILE_BYTES;
      else process.env.SERVER_LOG_MAX_FILE_BYTES = previous;
    }
  });
});

describe('insertServerLogFiles block copies', () => {
  const files = [
    { fileName: 'results/benchmark.log', logText: 'benchmark' },
    { fileName: 'results/router.log', logText: 'router' },
    { fileName: 'results/server.log', logText: 'server' },
  ];

  afterEach(() => {
    blocksWritten.length = 0;
    vi.mocked(blockWriter.writeTextAsBlocks).mockClear();
    vi.unstubAllEnvs();
  });

  it('writes blocks for the new primary and each child row it inserted, before resolving', async () => {
    vi.stubEnv('SERVER_LOG_BLOCKS', '1');
    const { sql } = fakeTransactionSql(null, [], ['results/router.log']);

    await insertServerLogFiles(sql, [42], files, REDACTION_KEY);

    expect(blocksWritten).toEqual(['results/server.log', 'results/benchmark.log']);
    expect(
      vi.mocked(blockWriter.writeTextAsBlocks).mock.calls.map((call) => call.slice(1)),
    ).toEqual([
      [99, 'results/server.log', 'server'],
      [99, 'results/benchmark.log', 'benchmark'],
    ]);
  });

  it('stores and blocks only the redacted text, so both copies match', async () => {
    vi.stubEnv('SERVER_LOG_BLOCKS', '1');
    const { sql, calls } = fakeTransactionSql(null, [], []);
    const server = 'connect http://***REDACTED-f58c3e***:8000/v1\n';
    const router = 'HF_TOKEN=***REDACTED*** peer ***REDACTED-51671e***:9405\n';

    await insertServerLogFiles(
      sql,
      [42],
      [
        { fileName: 'results/server.log', logText: 'connect http://172.29.37.221:8000/v1\n' },
        {
          fileName: 'results/router.log',
          logText: 'HF_TOKEN=hf_abcdefghijklmnopqrstuvwxyzABCDEF12 peer 10.3.10.34:9405\n',
        },
      ],
      REDACTION_KEY,
    );

    const primaryInsert = calls.find((call) => call.text.includes('insert into server_logs'));
    expect(primaryInsert?.values).toEqual([server, 'results/server.log']);
    const childInsert = calls.find((call) => call.text.includes('insert into server_log_files'));
    expect(childInsert?.values).toEqual([99, 'results/router.log', router]);
    expect(
      vi.mocked(blockWriter.writeTextAsBlocks).mock.calls.map((call) => call.slice(1)),
    ).toEqual([
      [99, 'results/server.log', server],
      [99, 'results/router.log', router],
    ]);
  });

  it('writes child blocks into an existing bundle without rewriting its primary', async () => {
    vi.stubEnv('SERVER_LOG_BLOCKS', '1');
    const { sql } = fakeTransactionSql(7, [], []);

    await insertServerLogFiles(sql, [42], files, REDACTION_KEY);

    expect(blocksWritten).toEqual(['results/benchmark.log', 'results/router.log']);
  });

  it('writes no blocks unless SERVER_LOG_BLOCKS=1', async () => {
    const { sql } = fakeTransactionSql(null, [], []);

    await insertServerLogFiles(sql, [42], files, REDACTION_KEY);

    expect(blockWriter.writeTextAsBlocks).not.toHaveBeenCalled();
  });
});
