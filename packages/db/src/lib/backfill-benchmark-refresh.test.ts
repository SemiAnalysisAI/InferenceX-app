import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import type { Sql } from '../etl/db-utils';
import type { PowerPublicationManifest } from '../etl/power-publication';
import {
  checkpointBenchmarkRefresh,
  refreshBackfillBenchmarks,
} from './backfill-benchmark-refresh';

let db: PGlite;
let sql: Sql;
let manifest: PowerPublicationManifest;
let root: string;
let origin: string;
let failure: 'invalidate' | 'stale' | undefined;
let apiIds: unknown[] | undefined;
const audit = {
  source: 'power_validation.json',
  sample_count: 1,
  window_start_unix: 1788220800,
  window_end_unix: 1788220801,
};
const identity = {
  hardware: 'b200',
  framework: 'sglang',
  model: 'dsr1',
  precision: 'fp4',
  spec_method: 'none',
  disagg: false,
  is_multinode: false,
  prefill_tp: 8,
  prefill_ep: 1,
  prefill_dp_attention: false,
  prefill_num_workers: 0,
  decode_tp: 8,
  decode_ep: 1,
  decode_dp_attention: false,
  decode_num_workers: 0,
  num_prefill_gpu: 8,
  num_decode_gpu: 8,
  benchmark_type: 'single_turn',
  isl: 8192,
  osl: 1024,
  conc: 32,
  offload_mode: 'off',
};
const auditUpdates = [{ benchmarkResultId: 10, identity, powerAudit: audit }];
const requests: { method: string; url: string; auth?: string; audit?: unknown }[] = [];
const save = () => fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(manifest));
const read = (): PowerPublicationManifest =>
  JSON.parse(fs.readFileSync(path.join(root, 'receipt.json'), 'utf8'));
const samples = async () => {
  const result = await db.query('SELECT ctid::text, * FROM gpu_metric_samples');
  return result.rows;
};

// Real HTTP transport around local SQL; this is not a deployed API/Blob acceptance test.
const server = createServer(async (request, response) => {
  try {
    const entry: (typeof requests)[number] = {
      method: request.method!,
      url: request.url!,
      auth: request.headers.authorization,
    };
    requests.push(entry);
    let body: unknown;
    if (entry.method === 'POST' && entry.url === '/api/v1/invalidate') {
      const result = await db.query<{ power_audit: unknown }>(
        'SELECT power_audit FROM latest_benchmarks WHERE id = 10',
      );
      entry.audit = result.rows[0]?.power_audit;
      if (failure === 'invalidate') {
        response.writeHead(503).end();
        return;
      }
      body = { invalidated: true, blobsDeleted: 1 };
    } else if (entry.url.startsWith('/api/v1/benchmarks?')) {
      const result = await db.query<{ id: number; power_audit: unknown }>(
        'SELECT id, power_audit FROM benchmark_results WHERE id = 10',
      );
      body = failure === 'stale' ? [{ id: 10, power_audit: null }] : result.rows;
      if (apiIds) body = apiIds.map((id) => ({ ...result.rows[0], id }));
    } else {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

beforeAll(async () => {
  db = await PGlite.create();
  const migrations = new URL('../../migrations/', import.meta.url);
  for (const name of fs.readdirSync(migrations).toSorted())
    if (name.endsWith('.sql')) await db.exec(fs.readFileSync(new URL(name, migrations), 'utf8'));
  const client = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    const result = await db.query(query, values);
    return result.rows;
  };
  sql = Object.assign(client, { array: (value: unknown) => value }) as unknown as Sql;
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected loopback TCP address');
  origin = `http://127.0.0.1:${address.port}`;
}, 30_000);

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-refresh-'));
  requests.length = 0;
  failure = undefined;
  apiIds = undefined;
  manifest = { version: 1, runId: 123, runAttempt: 2, points: [] };
  vi.stubEnv('CACHE_INVALIDATE_URL', `${origin}/api/v1/invalidate`);
  vi.stubEnv('CACHE_INVALIDATE_SECRET', 'local-secret');
  vi.stubEnv('CACHE_PROTECTION_BYPASS_SECRET', undefined);
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
      VALUES (1, 123, 2, 'Run Sweep', 'completed', 'success', '2026-09-01', '2026-09-01');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, 8, 8, 8, 8);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES (10, 1, 1, 'single_turn', '2026-09-01', 8192, 1024, 32, '{}');
    INSERT INTO gpu_metric_series (id, workflow_run_id, artifact_name, config_key, file_name,
      vendor, csv_sha256, sample_count, gpu_count, started_at, ended_at)
      VALUES (1, 1, 'gpu_metrics_fixture', 'fixture', 'gpu_metrics.csv', 'nvidia', 'fixture', 1, 1, '2026-09-01', '2026-09-01');
    INSERT INTO gpu_metric_samples (series_id, gpu_index, sampled_at, power_w) VALUES (1, 0, '2026-09-01', 351.4);
    REFRESH MATERIALIZED VIEW latest_benchmarks;`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await db?.close();
});

async function updateAudit() {
  await db.query('UPDATE benchmark_results SET power_audit = $1 WHERE id = 10', [audit]);
}

it('resumes the pre-write disk checkpoint and refreshes the materialized view before POST', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  expect(read().benchmarkRefresh).toMatchObject({
    status: 'pending',
    benchmarkResultIds: [10],
    auditUpdates,
  });
  await updateAudit();
  const before = await db.query('SELECT power_audit FROM latest_benchmarks WHERE id = 10');
  expect(before.rows).toEqual([{ power_audit: null }]);
  manifest = read(); // Simulate losing all in-process state after the committed UPDATE.
  await refreshBackfillBenchmarks(sql, manifest, save);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({ method: 'POST', auth: 'Bearer local-secret', audit });
  expect(new URL(requests[1].url, origin).searchParams.get('runId')).toBe('123');
  expect(new URL(requests[1].url, origin).searchParams.get('exactRun')).toBe('true');
  expect(read().benchmarkRefresh?.status).toBe('complete');
});

it.each(['invalidate', 'stale'] as const)(
  'retains %s failure and retries without rewriting samples',
  async (mode) => {
    checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
    await updateAudit();
    const before = await samples();
    failure = mode;
    await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow(
      mode === 'invalidate' ? 'invalidate cache: HTTP 503' : 'power_audit differs',
    );
    expect(read().benchmarkRefresh).toMatchObject({ status: 'failed', benchmarkResultIds: [10] });
    manifest = read();
    failure = undefined;
    await refreshBackfillBenchmarks(sql, manifest, save);
    expect(read().benchmarkRefresh).toMatchObject({ status: 'complete', benchmarkResultIds: [10] });
    expect(read().benchmarkRefresh).not.toHaveProperty('error');
    expect(await samples()).toEqual(before);
  },
);

it('verifies string benchmark IDs returned by native PostgreSQL without rewriting samples', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  await updateAudit();
  const before = await samples();
  apiIds = ['10'];
  manifest = read();
  await refreshBackfillBenchmarks(sql, manifest, save);
  expect(read().benchmarkRefresh).toMatchObject({ status: 'complete', benchmarkResultIds: [10] });
  expect(requests).toHaveLength(2);
  expect(await samples()).toEqual(before);
});

it('rejects duplicate benchmark API IDs after numeric normalization', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  await updateAudit();
  for (const ids of [
    [10, '10'],
    ['10', '10'],
  ]) {
    apiIds = ids;
    await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow(
      'power_audit differs',
    );
    expect(read().benchmarkRefresh).toMatchObject({ status: 'failed', benchmarkResultIds: [10] });
  }
});

it('rejects malformed benchmark API IDs instead of coercing them into matches', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  await updateAudit();
  for (const id of [['10'], {}, null, true, ' 10 ', '010', '10.0', '1e1', '0xa', '10oops']) {
    apiIds = [id];
    await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow(
      'power_audit differs',
    );
    expect(read().benchmarkRefresh).toMatchObject({ status: 'failed', benchmarkResultIds: [10] });
  }
});

it('rejects a receipt for a different host before POST', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  manifest.benchmarkRefresh!.endpoint = `${origin.replace('127.0.0.1', '127.0.0.2')}/api/v1/invalidate`;
  await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow('target differs');
  expect(read().benchmarkRefresh?.status).toBe('failed');
  expect(requests).toEqual([]);
});

it('rejects a stringified audit even though the API fixture would return the same DB value', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  await db.query('UPDATE benchmark_results SET power_audit = $1::jsonb WHERE id = 10', [
    JSON.stringify(JSON.stringify(audit)),
  ]);
  const stored = await db.query('SELECT power_audit FROM benchmark_results WHERE id = 10');
  expect(stored.rows).toEqual([{ power_audit: JSON.stringify(audit) }]);
  await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow(
    'power_audit must be an object with a nonempty source',
  );
  expect(read().benchmarkRefresh?.status).toBe('failed');
  expect(requests).toEqual([]);
});

it('rejects wrong run, attempt, foreign IDs and malformed IDs before POST', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  const original = read();
  for (const change of [
    { runId: 999 },
    { runAttempt: 1 },
    ...[[11], [10, 10], [-1], [1.5]].map((ids) => ({
      benchmarkRefresh: { ...original.benchmarkRefresh!, benchmarkResultIds: ids },
    })),
  ]) {
    manifest = { ...structuredClone(original), ...change };
    await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow(
      /run\/attempt|Invalid benchmarkResultIds/,
    );
    expect(read().benchmarkRefresh?.status).toBe('failed');
  }
  expect(requests).toEqual([]);
});

it('retains a NULL pre-write checkpoint and requires artifact re-ingest without purging', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  manifest = read();
  await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow(/NULL.*re-ingest/);
  expect(read().benchmarkRefresh).toMatchObject({
    status: 'failed',
    benchmarkResultIds: [10],
    auditUpdates,
  });
  expect(requests).toEqual([]);
});

it('retains confirmed refresh responsibility when a later upsert clears the audit to NULL', async () => {
  checkpointBenchmarkRefresh(manifest, [10], save, auditUpdates);
  await updateAudit();
  failure = 'invalidate';
  await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow('HTTP 503');
  const pending = read().benchmarkRefresh!;
  const before = await samples();
  await db.exec('UPDATE benchmark_results SET power_audit = NULL WHERE id = 10');
  manifest = read();
  failure = undefined;
  await expect(refreshBackfillBenchmarks(sql, manifest, save)).rejects.toThrow(/NULL.*re-ingest/);
  expect(read().benchmarkRefresh).toMatchObject({
    status: 'failed',
    benchmarkResultIds: pending.benchmarkResultIds,
    auditUpdates: pending.auditUpdates,
  });
  expect(requests).toHaveLength(1);
  expect(await samples()).toEqual(before);
});
