import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bulkIngestBenchmarkRows, type BenchmarkPersistenceInput } from './benchmark-ingest';

type Sql = postgres.Sql;
let db: PGlite;
let sql: Sql;

function queryClient(database: Pick<PGlite, 'query'>) {
  const client = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    const result = await database.query(query, values);
    return result.rows;
  };
  return Object.assign(client, { json: JSON.stringify, array: (value: unknown) => value });
}

beforeAll(async () => {
  db = await PGlite.create();
  const dir = new URL('../../migrations/', import.meta.url);
  for (const name of fs.readdirSync(dir).toSorted()) {
    if (name.endsWith('.sql')) await db.exec(fs.readFileSync(new URL(name, dir), 'utf8'));
  }
  sql = queryClient(db) as unknown as Sql;
}, 30_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', '2026-09-11T04:00:00Z', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
      decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
      num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, false, 8, 1, false, 0,
              8, 1, false, 0, 8, 8);`);
});

const AUDIT = {
  source: 'power_validation_a_conc48.json',
  window_start_unix: 1,
  window_end_unix: 2,
};
const LATER = {
  source: 'power_validation_b_conc48.json',
  window_start_unix: 3,
  window_end_unix: 4,
};

function row(overrides: Partial<BenchmarkPersistenceInput> = {}): BenchmarkPersistenceInput {
  return {
    configId: 1,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 48,
    offloadMode: 'off',
    image: 'img',
    recipeFingerprint: 'recipe-a',
    metrics: { power_valid: 1 },
    ...overrides,
  };
}

async function ingest(...rows: BenchmarkPersistenceInput[]) {
  await bulkIngestBenchmarkRows(sql, rows, 1, '2026-09-11');
  const stored = await db.query<{ power_audit: unknown }>(
    'SELECT power_audit FROM benchmark_results ORDER BY id',
  );
  return stored.rows.map((r) => r.power_audit);
}

/**
 * AgentX provenance is derived from the telemetry bundle and attached to the
 * per-job row before insert; no result row carries it. The upsert therefore
 * keeps it when the incoming agentic row has none (aggregate copy, re-ingest)
 * while every other lane stays artifact-authoritative.
 */
describe('bulkIngestBenchmarkRows — power_audit on conflict', () => {
  it('keeps an agentic audit across a copy without one and lets a carried audit replace it', async () => {
    expect(await ingest(row({ powerAudit: AUDIT }))).toEqual([AUDIT]);
    expect(await ingest(row())).toEqual([AUDIT]);
    expect(await ingest(row({ powerAudit: LATER }))).toEqual([LATER]);
  });

  it('still clears a single-turn audit when the fresh artifact carries none', async () => {
    const singleTurn = row({ benchmarkType: 'single_turn', isl: 1024, osl: 1024 });
    expect(await ingest({ ...singleTurn, powerAudit: AUDIT })).toEqual([AUDIT]);
    expect(await ingest(singleTurn)).toEqual([null]);
  });
});
