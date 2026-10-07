import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyAgentxAudits } from '../etl/power-audit-recovery';

let db: PGlite;
let sql: postgres.Sql;
const RUN = 34557177019;
const SOURCE = 'power_validation_qwen3.5_8k1k_fp8_dynamo-sglang_b200-slurm_0_conc32.json';
const START = 1789194365;

function client(database: Pick<PGlite, 'query'>) {
  return Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
      const result = await database.query<Record<string, unknown>>(query, values);
      return result.rows;
    },
    { json: JSON.stringify, array: (value: unknown) => value },
  );
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(
    fs.readFileSync(new URL('../../migrations/001_initial_schema.sql', import.meta.url), 'utf8'),
  );
  await db.exec('ALTER TABLE benchmark_results ADD COLUMN power_audit jsonb');
  sql = client(db) as unknown as postgres.Sql;
}, 20_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, created_at, date)
      VALUES (1, ${RUN}, 1, 'Run Sweep', 'completed', '2026-09-12', '2026-09-12');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      VALUES (1, 'qwen3.5', 'b200', 'sglang', 'fp8', 'none', false, 1, 1, 1, 1);
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, metrics)
      VALUES (10, 1, 1, 'single_turn', '2026-09-12', 8192, 1024, 32, '{}'),
             (11, 1, 1, 'single_turn', '2026-09-12', 8192, 1024, 64, '{}');`);
});

describe('applyAgentxAudits', () => {
  const audit = { source: SOURCE, window_start_unix: START, window_end_unix: START + 1 };
  const stored = () =>
    db
      .query<{ id: number; power_audit: unknown }>(
        'SELECT id, power_audit FROM benchmark_results ORDER BY id',
      )
      .then((result) => result.rows.map((row) => [Number(row.id), row.power_audit]));

  it.each(['explicit', 'wrong-run', 'single-turn'])(
    'never overwrites provenance or crosses run/type for a %s row',
    async (scenario) => {
      if (scenario !== 'single-turn')
        await db.exec("UPDATE benchmark_results SET benchmark_type = 'agentic_traces'");
      if (scenario === 'explicit')
        await db.exec(
          `UPDATE benchmark_results SET power_audit = '{"source":"existing.json"}' WHERE id = 10`,
        );
      if (scenario === 'wrong-run') {
        await db.exec(`INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, created_at, date)
          VALUES (2, 1, 1, 'Other run', 'completed', '2026-09-12', '2026-09-12');
          UPDATE benchmark_results SET workflow_run_id = 2 WHERE id = 10`);
      }
      const before = await stored();
      const written = await applyAgentxAudits(sql, {
        workflowRunId: 1,
        writes: [{ benchmarkResultId: 10, powerAudit: audit }],
      });
      expect(written).toEqual([]);
      expect(await stored()).toEqual(before);
    },
  );

  it('writes exactly the planned rows that still lack provenance and reports them', async () => {
    await db.exec("UPDATE benchmark_results SET benchmark_type = 'agentic_traces'");
    const written = await applyAgentxAudits(sql, {
      workflowRunId: 1,
      writes: [{ benchmarkResultId: 10, powerAudit: audit }],
    });
    expect(written).toEqual([10]);
    expect(await stored()).toEqual([
      [10, audit],
      [11, null],
    ]);
  });
});
