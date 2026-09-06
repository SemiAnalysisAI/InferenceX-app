import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { Sql } from './db-utils';
import {
  benchmarkPointIngestKey,
  bulkIngestBenchmarkRows,
  insertServerLogFilePaths,
  insertServerLogFiles,
  type BenchmarkPersistenceInput,
} from './benchmark-ingest';

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

function fakeTransactionSql(linkedId: number | null) {
  const calls: { text: string; values: unknown[] }[] = [];
  const tag = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('');
    calls.push({ text, values });
    if (text.includes('select id, server_log_id')) {
      return Promise.resolve([{ id: 42, server_log_id: linkedId }]);
    }
    if (text.includes('insert into server_logs')) return Promise.resolve([{ id: 99 }]);
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
    expect(text).toContain('power_audit = excluded.power_audit');
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
    await insertServerLogFiles(sql, [42], files);

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
    await insertServerLogFiles(sql, [42], files);

    expect(calls.filter((call) => call.text.includes('insert into server_logs'))).toHaveLength(0);
    expect(calls.filter((call) => call.text.includes('insert into server_log_files'))).toHaveLength(
      2,
    );
    expect(calls.some((call) => call.text.includes('files_complete = true'))).toBe(true);
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
      );

      const primaryInsert = calls.find((call) => call.text.includes('insert into server_logs'));
      expect(primaryInsert?.values).toEqual(['server', 'server.log']);
      const childInsert = calls.find((call) => call.text.includes('insert into server_log_files'));
      expect(childInsert?.values).toEqual([99, 'router.log', 'router']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
