import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { benchmarkCurveScope } from '@semianalysisai/inferencex-constants';
import type { DbClient } from '../connection';
import { getAllBenchmarksForHistory, getBenchmarksForRun, getLatestBenchmarks } from './benchmarks';

let db: PGlite;
let legacyCount: number;
let retainedCount: number;
const sql: DbClient = async (strings, ...values) => {
  const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
  const result = await db.query<Record<string, unknown>>(query, values);
  return result.rows;
};
const ids = (rows: { id: number }[]) => rows.map((r) => Number(r.id)).toSorted((a, b) => a - b);
const currentIds = [2, 3, 4, 5, 6, 7];
async function addRun(
  id: number,
  options: {
    date?: string;
    started?: string;
    append?: boolean;
    status?: string;
    conclusion?: string;
    githubId?: number;
    attempt?: number;
  } = {},
) {
  const date = options.date ?? `2026-09-${String(id).padStart(2, '0')}`;
  await sql`INSERT INTO workflow_runs
    (id, github_run_id, run_attempt, name, status, conclusion, created_at, run_started_at, date, append_only, html_url)
    VALUES (${id}, ${options.githubId ?? id}, ${options.attempt ?? 1}, 'Run Sweep',
      ${options.status ?? 'completed'}, ${options.conclusion ?? 'success'},
      ${date}::timestamptz, ${options.started ?? `${date}T12:00:00Z`}::timestamptz,
      ${date}::date, ${options.append ?? false}, ${`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${options.githubId ?? id}`})`;
}
async function addPoint(
  id: number,
  run: number,
  config: number,
  conc: number,
  options: {
    image?: string | null;
    offload?: string;
    fingerprint?: string;
    error?: string;
    type?: string;
    isl?: number | null;
    osl?: number | null;
  } = {},
) {
  await sql`INSERT INTO benchmark_results
    (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, offload_mode, image, recipe_fingerprint, metrics, error)
    SELECT ${id}, id, ${config}, ${options.type ?? 'agentic_traces'}, date,
      ${options.isl ?? null}, ${options.osl ?? null}, ${conc}, ${options.offload ?? 'on'},
      ${options.image === undefined ? 'trt:rc26' : options.image}, ${options.fingerprint ?? `recipe-${id}`},
      '{"tput_per_gpu":100}'::jsonb, ${options.error ?? null}
    FROM workflow_runs WHERE id = ${run}`;
}
async function seed() {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'glm5.2', 'gb300', 'dynamo-trt', 'fp4', 'mtp', false, 8, 8, 8, 8),
      (2, 'glm5.2', 'gb300', 'dynamo-trt', 'fp4', 'mtp', true, 4, 8, 4, 8),
      (3, 'glm5.2', 'gb300', 'sglang', 'fp4', 'none', false, 8, 8, 8, 8),
      (4, 'glm5.2', 'gb300', 'dynamo-trt', 'fp8', 'none', false, 8, 8, 8, 8);`);
  await addRun(1, { githubId: 33219706372 });
  await addPoint(1, 1, 1, 1, { offload: 'off', image: 'trt:rc22' });
  await addRun(11, { githubId: 34413290524 });
  for (const [i, conc] of [1, 20, 30, 60, 227, 260].entries()) await addPoint(i + 2, 11, 2, conc);
  await db.exec('REFRESH MATERIALIZED VIEW latest_benchmarks');
}
beforeAll(async () => {
  db = await PGlite.create();
  const dir = new URL('../../migrations/', import.meta.url);
  const migrations = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .toSorted();
  for (const name of migrations.filter((filename) => filename < '014_'))
    await db.exec(readFileSync(new URL(name, dir), 'utf8'));
  await seed();
  const legacyRows = await getLatestBenchmarks(sql, 'glm5.2');
  legacyCount = legacyRows.length;
  await db.exec(readFileSync(new URL('014_agentic_curve_snapshots.sql', dir), 'utf8'));
  await db.exec(readFileSync(new URL('015_power_provenance.sql', dir), 'utf8'));
  const retained = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM benchmark_results',
  );
  retainedCount = retained.rows[0].count;
}, 20_000);
beforeEach(seed);
afterAll(async () => {
  await db?.close();
});

describe('AgentX curve snapshots in PostgreSQL', () => {
  it('replaces the old AGG/offload-off point in both latest paths without deleting history', async () => {
    expect(legacyCount).toBe(7);
    expect(retainedCount).toBe(7);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2'))).toEqual(currentIds);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-11'))).toEqual(currentIds);
    expect(ids(await getBenchmarksForRun(sql, 'glm5.2', 34413290524))).toEqual(currentIds);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-01'))).toEqual([1]);
    expect(ids(await getBenchmarksForRun(sql, 'glm5.2', 33219706372))).toEqual([1]);
    expect(
      ids(await getAllBenchmarksForHistory(sql, 'glm5.2', null, null, 'agentic_traces')),
    ).toEqual([1, ...currentIds]);
  });
  it('retains power audits in materialized and dated snapshots without reviving replaced points', async () => {
    await sql`UPDATE benchmark_results SET power_invalid_reasons = '["sampling_gap_exceeded"]'::jsonb,
      power_audit = '{"expected_gpu_count":16}'::jsonb WHERE id IN (1, 2)`;
    await db.exec(
      readFileSync(new URL('../../migrations/015_power_provenance.sql', import.meta.url), 'utf8'),
    );
    for (const rows of [
      await getLatestBenchmarks(sql, 'glm5.2'),
      await getLatestBenchmarks(sql, 'glm5.2', '2026-09-11'),
    ]) {
      expect(ids(rows)).toEqual(currentIds);
      expect(rows.find((row) => Number(row.id) === 2)).toMatchObject({
        power_invalid_reasons: ['sampling_gap_exceeded'],
        power_audit: { expected_gpu_count: 16 },
      });
      expect(rows.find((row) => Number(row.id) === 3)).toMatchObject({
        power_invalid_reasons: null,
        power_audit: null,
      });
    }
    const historicalRows = await getBenchmarksForRun(sql, 'glm5.2', 33219706372);
    expect(historicalRows[0]).toMatchObject({
      id: 1,
      power_invalid_reasons: ['sampling_gap_exceeded'],
      power_audit: { expected_gpu_count: 16 },
    });
  });
  it('uses the same scope in SQL and TypeScript and preserves point attributes', async () => {
    const old = await getBenchmarksForRun(sql, 'glm5.2', 33219706372);
    for (const row of [...old, ...(await getLatestBenchmarks(sql, 'glm5.2'))]) {
      const [result] = await sql`SELECT benchmark_curve_scope(${row.model}, ${row.hardware},
        ${row.framework}, ${row.precision}, ${row.benchmark_type}, ${row.isl}, ${row.osl},
        ${row.spec_method}, ${row.disagg}, ${row.offload_mode}) AS scope`;
      expect(result.scope).toEqual(JSON.parse(benchmarkCurveScope(row)));
    }
    expect(old[0]).toMatchObject({ disagg: false, offload_mode: 'off', prefill_tp: 8 });
    const latestRows = await getLatestBenchmarks(sql, 'glm5.2');
    expect(latestRows[0]).toMatchObject({
      disagg: true,
      offload_mode: 'on',
      prefill_tp: 4,
    });
  });
  it('keeps mixed AGG/disagg and offload points submitted in the same sweep', async () => {
    await addPoint(8, 11, 1, 2, { offload: 'off' });
    await db.exec('REFRESH MATERIALIZED VIEW latest_benchmarks');
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2'))).toEqual([...currentIds, 8]);
  });
  it('reconstructs append-only chains across point properties with producer provenance', async () => {
    await addRun(12, { append: true });
    await addPoint(8, 12, 1, 300, { offload: 'off' });
    await addRun(13, { append: true });
    await addPoint(9, 13, 2, 400);
    await db.exec('REFRESH MATERIALIZED VIEW latest_benchmarks');
    const rows = await getLatestBenchmarks(sql, 'glm5.2');
    expect(ids(rows)).toEqual([...currentIds, 8, 9]);
    expect(rows.every((r) => Number(r.curve_workflow_run_id) === 13)).toBe(true);
    expect(rows.find((r) => Number(r.id) === 2)?.run_url).toContain('/34413290524/attempts/1');
    expect(ids(await getBenchmarksForRun(sql, 'glm5.2', 12))).toEqual([...currentIds, 8]);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-13'))).toEqual(ids(rows));
  });
  it('stops append-only inheritance at an image change or new full snapshot', async () => {
    await addRun(12, { append: true });
    await addPoint(8, 12, 1, 300, { offload: 'off', image: 'trt:rc27' });
    expect(ids(await getBenchmarksForRun(sql, 'glm5.2', 12))).toEqual([8]);
    await addRun(13);
    await addPoint(9, 13, 2, 400, { image: 'trt:rc27' });
    await addRun(14, { append: true });
    await addPoint(10, 14, 2, 500, { image: 'trt:rc27' });
    expect(ids(await getBenchmarksForRun(sql, 'glm5.2', 14))).toEqual([9, 10]);
  });
  it('preserves accepted rows regardless of overall workflow conclusion', async () => {
    await addRun(12, { conclusion: 'failure' });
    await addPoint(8, 12, 1, 1, { offload: 'off' });
    await db.exec('REFRESH MATERIALIZED VIEW latest_benchmarks');
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2'))).toEqual([8]);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-12'))).toEqual([8]);
    expect(
      ids(await getAllBenchmarksForHistory(sql, 'glm5.2', null, null, 'agentic_traces')),
    ).toEqual([1, ...currentIds, 8]);
  });
  it('ignores runs without successful result rows', async () => {
    await addRun(12);
    await addPoint(8, 12, 1, 1, { error: 'benchmark failed' });
    await db.exec('REFRESH MATERIALIZED VIEW latest_benchmarks');
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2'))).toEqual(currentIds);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-12'))).toEqual(currentIds);
    expect(await getBenchmarksForRun(sql, 'glm5.2', 12)).toEqual([]);
  });
  it('uses the latest stored attempt as before', async () => {
    await addRun(12, { githubId: 34413290524, attempt: 2 });
    await addPoint(8, 12, 1, 1, { offload: 'off' });
    await db.exec('REFRESH MATERIALIZED VIEW latest_benchmarks');
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2'))).toEqual([8]);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-12'))).toEqual([8]);
    expect(ids(await getBenchmarksForRun(sql, 'glm5.2', 34413290524))).toEqual([8]);
  });
  it.each([null, 'mixed'])(
    'does not inherit across an incomplete or mixed image: %s',
    async (image) => {
      await addRun(12, { append: true });
      await addPoint(8, 12, 1, 300, { image });
      if (image === 'mixed') await addPoint(9, 12, 2, 400);
      expect(ids(await getBenchmarksForRun(sql, 'glm5.2', 12))).toEqual(
        image === null ? [8] : [8, 9],
      );
    },
  );
  it('keeps recipe variants at the same topology and concurrency', async () => {
    await addRun(12, { append: true });
    await addPoint(8, 12, 2, 1, { fingerprint: 'alternate-recipe' });
    await addPoint(9, 12, 2, 20, { fingerprint: 'recipe-3' });
    expect(ids(await getBenchmarksForRun(sql, 'glm5.2', 12))).toEqual([2, 4, 5, 6, 7, 8, 9]);
  });
  it('preserves unrelated engines, precisions and fixed-sequence variants', async () => {
    await addPoint(8, 1, 3, 1);
    await addPoint(9, 1, 4, 1);
    await addPoint(10, 1, 1, 1, { type: 'single_turn', isl: 1024, osl: 1024, offload: 'off' });
    await addPoint(11, 11, 2, 1, { type: 'single_turn', isl: 1024, osl: 1024 });
    await db.exec('REFRESH MATERIALIZED VIEW latest_benchmarks');
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2'))).toEqual([...currentIds, 8, 9, 10, 11]);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-11'))).toEqual([
      ...currentIds,
      8,
      9,
      10,
      11,
    ]);
  });
  it('respects same-day as-of and exact-date selectors', async () => {
    await addRun(12, { date: '2026-09-11', started: '2026-09-11T18:00:00Z' });
    await addPoint(8, 12, 1, 1, { offload: 'off' });
    expect(
      ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-11', false, '34413290524')),
    ).toEqual(currentIds);
    expect(ids(await getLatestBenchmarks(sql, 'glm5.2', '2026-09-11', true))).toEqual([8]);
  });
});
