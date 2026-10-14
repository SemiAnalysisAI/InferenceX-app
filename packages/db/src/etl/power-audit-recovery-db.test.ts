import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { applyAgentxAudits } from './power-audit-recovery';

let db: PGlite;
let sql: PgliteSql;
const RUN = 34557177019;
const SOURCE = 'power_validation_qwen3.5_8k1k_fp8_dynamo-sglang_b200-slurm_0_conc32.json';
const START = 1789194365;

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
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

  it('writes only planned AgentX rows of the run that still lack provenance and reports them', async () => {
    await db.exec(`INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, created_at, date)
        VALUES (2, 1, 1, 'Other run', 'completed', '2026-09-12', '2026-09-12');
      INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
        isl, osl, conc, metrics, power_audit)
        VALUES (12, 1, 1, 'agentic_traces', '2026-09-12', null, null, 1, '{}', null),
               (13, 1, 1, 'agentic_traces', '2026-09-12', null, null, 2, '{}', '{"source":"existing.json"}'),
               (14, 2, 1, 'agentic_traces', '2026-09-12', null, null, 1, '{}', null),
               (15, 1, 1, 'agentic_traces', '2026-09-12', null, null, 4, '{}', null);`);
    const before = await stored();
    // Only 12 qualifies: 10 is single-turn, 13 has provenance, 14 is another run's, 15 is unplanned.
    const written = await applyAgentxAudits(sql, {
      workflowRunId: 1,
      writes: [10, 12, 13, 14].map((benchmarkResultId) => ({
        benchmarkResultId,
        powerAudit: audit,
      })),
    });
    expect(written).toEqual([12]);
    expect(await stored()).toEqual(before.map(([id, value]) => [id, id === 12 ? audit : value]));
  });
});
