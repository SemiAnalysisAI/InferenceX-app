import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DbClient } from '../connection';
import { getAvailabilityData } from './workflow-info';

let db: PGlite;
const sql: DbClient = async (strings, ...values) => {
  const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
  const result = await db.query<Record<string, unknown>>(query, values);
  return result.rows;
};

const LIVE_AVAILABILITY = `
  WITH live AS (
    SELECT DISTINCT br.config_id, br.isl, br.osl, br.benchmark_type, br.date
    FROM benchmark_results br
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE br.error IS NULL
      AND wr.conclusion IS NOT NULL
  )
  SELECT a.model, a.isl, a.osl, a.precision, a.hardware, a.framework, a.spec_method, a.disagg, a.benchmark_type, a.date::text
  FROM availability a
  WHERE EXISTS (
    SELECT 1
    FROM live l
    JOIN configs c ON c.id = l.config_id
    WHERE c.model = a.model
      AND c.hardware = a.hardware
      AND c.framework = a.framework
      AND c.precision = a.precision
      AND l.isl IS NOT DISTINCT FROM a.isl
      AND l.osl IS NOT DISTINCT FROM a.osl
      AND l.benchmark_type = a.benchmark_type
      AND l.date = a.date
  )
  ORDER BY a.date, a.model, a.hardware, a.framework, a.precision, a.benchmark_type, a.isl, a.osl, a.spec_method, a.disagg`;

const MAINTAINED_POINTS =
  'SELECT id, model, curve_scope, snapshot_date::text, snapshot_workflow_run_id FROM latest_benchmark_points ORDER BY id';

async function expectPublishedStateMatchesSources(step: string) {
  const live = await db.query(LIVE_AVAILABILITY);
  expect(await getAvailabilityData(sql), step).toEqual(live.rows);
  const maintained = await db.query(MAINTAINED_POINTS);
  await db.exec('BEGIN');
  await db.query(
    'SELECT refresh_latest_benchmark_points(array(SELECT DISTINCT curve_scope FROM benchmark_curve_run_lines))',
  );
  const recomputed = await db.query(MAINTAINED_POINTS);
  await db.exec('ROLLBACK');
  expect(maintained.rows, step).toEqual(recomputed.rows);
}

async function addRun(id: number, githubId: number, attempt: number, conclusion: string | null) {
  await sql`INSERT INTO workflow_runs
    (id, github_run_id, run_attempt, name, status, conclusion, created_at, run_started_at, date)
    VALUES (${id}, ${githubId}, ${attempt}, 'Run Sweep', 'completed', ${conclusion},
      '2026-01-01'::timestamptz + ${id}::int * interval '1 day', '2026-01-01'::timestamptz + ${id}::int * interval '1 day',
      '2026-01-01'::date + ${id}::int)`;
}

async function addPoint(
  id: number,
  run: number,
  config: number,
  conc: number,
  type = 'single_turn',
  sequence: [number | null, number | null] = [1024, 1024],
) {
  await sql`INSERT INTO benchmark_results
    (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, offload_mode, image, recipe_fingerprint, metrics)
    SELECT ${id}, id, ${config}, ${type}, date, ${sequence[0]}, ${sequence[1]}, ${conc}, 'off',
      'img:1', 'recipe', '{"tput_per_gpu": 1}'::jsonb
    FROM workflow_runs WHERE id = ${run}`;
}

beforeAll(async () => {
  db = await PGlite.create();
  const dir = new URL('../../migrations/', import.meta.url);
  for (const name of readdirSync(dir)
    .filter((filename) => filename.endsWith('.sql'))
    .toSorted())
    await db.exec(readFileSync(new URL(name, dir), 'utf8'));
  await db.exec(`INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'm1', 'h100', 'sglang', 'fp8', 'none', false, 8, 8, 8, 8),
      (2, 'm1', 'h200', 'sglang', 'fp8', 'none', false, 8, 8, 8, 8),
      (3, 'm1', 'h100', 'sglang', 'fp8', 'mtp', false, 8, 8, 8, 8)`);
  await addRun(1, 101, 1, 'success');
  await addRun(2, 102, 1, null);
  await addPoint(1, 1, 1, 1);
  await addPoint(2, 1, 1, 2);
  await addPoint(3, 1, 2, 1);
  await addPoint(4, 1, 1, 4, 'agentic_traces', [null, null]);
  await addPoint(5, 2, 1, 1, 'single_turn', [1024, 8192]);
  await addPoint(6, 2, 3, 1);
  await db.exec(`INSERT INTO availability
      (model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date)
    VALUES ('m1', 1024, 1024, 'fp8', 'h100', 'sglang', 'none', false, 'single_turn', '2026-01-02'),
      ('m1', 1024, 1024, 'fp8', 'h100', 'sglang', 'mtp', false, 'single_turn', '2026-01-02'),
      ('m1', 1024, 1024, 'fp8', 'h200', 'sglang', 'none', false, 'single_turn', '2026-01-02'),
      ('m1', null, null, 'fp8', 'h100', 'sglang', 'none', false, 'agentic_traces', '2026-01-02'),
      ('m1', 1024, 8192, 'fp8', 'h100', 'sglang', 'none', false, 'single_turn', '2026-01-03'),
      ('m1', 1024, 1024, 'fp8', 'h100', 'sglang', 'mtp', false, 'single_turn', '2026-01-03'),
      ('m1', 1024, 1024, 'fp8', 'h100', 'sglang', 'none', false, 'single_turn', '2026-01-04')`);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe('published benchmark state', () => {
  it('stays equal to the live availability query and a full latest recompute after every write', async () => {
    await expectPublishedStateMatchesSources('seeded');
    expect(await getAvailabilityData(sql)).toHaveLength(4);

    const steps: [string, string][] = [
      ['run 2 concludes', `UPDATE workflow_runs SET conclusion = 'success' WHERE id = 2`],
      [
        'a newer attempt of run 1 without results',
        `INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, conclusion, created_at, date)
          VALUES (3, 101, 2, 'Run Sweep', 'success', '2026-01-09', '2026-01-09')`,
      ],
      ['the newer attempt is deleted', 'DELETE FROM workflow_runs WHERE id = 3'],
      ['run 1 becomes append-only', 'UPDATE workflow_runs SET append_only = true WHERE id = 1'],
      ['a point fails', `UPDATE benchmark_results SET error = 'failed' WHERE id = 3`],
      ['the point recovers', 'UPDATE benchmark_results SET error = NULL WHERE id = 3'],
      ['a point changes concurrency', 'UPDATE benchmark_results SET conc = 64 WHERE id = 2'],
      [
        'a point changes recipe',
        `UPDATE benchmark_results SET recipe_fingerprint = 'r2' WHERE id = 1`,
      ],
      ['a point moves date', `UPDATE benchmark_results SET date = '2026-01-04' WHERE id = 1`],
      [
        'an append-only run extends the curve',
        `INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, conclusion, created_at, run_started_at, date, append_only)
          VALUES (4, 104, 1, 'Run Sweep', 'success', '2026-01-05', '2026-01-05', '2026-01-05', true);
        INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, offload_mode, image, recipe_fingerprint, metrics)
          VALUES (7, 4, 1, 'single_turn', '2026-01-05', 1024, 1024, 8, 'off', 'img:1', 'recipe', '{}')`,
      ],
      [
        'its point takes a published concurrency',
        'UPDATE benchmark_results SET conc = 64 WHERE id = 7',
      ],
      [
        'its point changes recipe',
        `UPDATE benchmark_results SET recipe_fingerprint = 'r3' WHERE id = 7`,
      ],
      ['a config changes hardware', `UPDATE configs SET hardware = 'h300' WHERE id = 2`],
      [
        'an availability row is added',
        `INSERT INTO availability (model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date)
          VALUES ('m1', 1024, 1024, 'fp8', 'h300', 'sglang', 'none', false, 'single_turn', '2026-01-02')`,
      ],
      ['an availability row is removed', `DELETE FROM availability WHERE spec_method = 'mtp'`],
      ['availability is truncated', 'TRUNCATE availability'],
      [
        'availability is restored',
        `INSERT INTO availability (model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date)
          VALUES ('m1', 1024, 1024, 'fp8', 'h100', 'sglang', 'none', false, 'single_turn', '2026-01-02'),
            ('m1', null, null, 'fp8', 'h100', 'sglang', 'none', false, 'agentic_traces', '2026-01-02'),
            ('m1', 1024, 8192, 'fp8', 'h100', 'sglang', 'none', false, 'single_turn', '2026-01-03')`,
      ],
      ['a run conclusion clears', 'UPDATE workflow_runs SET conclusion = NULL WHERE id = 1'],
      ['results of run 2 are deleted', 'DELETE FROM benchmark_results WHERE workflow_run_id = 2'],
    ];
    for (const [step, statement] of steps) {
      await db.exec(statement);
      await expectPublishedStateMatchesSources(step);
    }
    expect(await getAvailabilityData(sql)).toEqual([]);
  });

  it('defers the work to commit and drains its queues', async () => {
    await db.exec('BEGIN');
    await addRun(10, 110, 1, 'success');
    await addPoint(10, 10, 1, 1);
    const [queued] = await sql`SELECT
      (SELECT count(*)::int FROM latest_benchmark_dirty_scopes) AS scopes,
      (SELECT count(*)::int FROM latest_benchmark_points WHERE id = 10) AS published`;
    expect(queued).toEqual({ scopes: 1, published: 0 });
    await db.exec('COMMIT');
    const [drained] = await sql`SELECT
      (SELECT count(*)::int FROM latest_benchmark_dirty_scopes) AS scopes,
      (SELECT count(*)::int FROM published_availability_dirty_keys) AS keys,
      (SELECT count(*)::int FROM published_benchmark_pending) AS pending,
      (SELECT count(*)::int FROM latest_benchmark_points WHERE id = 10) AS published`;
    expect(drained).toEqual({ scopes: 0, keys: 0, pending: 0, published: 1 });
  });
});
