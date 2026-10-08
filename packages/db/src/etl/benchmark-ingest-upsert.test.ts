import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { bulkIngestBenchmarkRows, type BenchmarkPersistenceInput } from './benchmark-ingest';

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
