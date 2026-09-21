import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { DbClient } from '../connection';
import { preflightRequiredPowerCurves } from './required-power-curve';
import { getLatestBenchmarks } from '../queries/benchmarks';
let db: PGlite;
const sql: DbClient = async (strings, ...values) => {
  const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '');
  const result = await db.query<Record<string, unknown>>(query, values);
  return result.rows;
};
const golden = path.resolve(
  import.meta.dirname,
  '../../../../docs/fixtures/powerx-manifest-v2/artifacts',
);
const source = { runId: 123, runAttempt: 1, headSha: 'b'.repeat(40) };
const options = { date: '2026-09-16', runStartedAt: '2026-09-16T00:00:00Z', appendOnly: false };
beforeAll(async () => {
  db = await PGlite.create();
  const dir = new URL('../../migrations/', import.meta.url);
  for (const file of fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    await db.exec(fs.readFileSync(new URL(file, dir), 'utf8'));
}, 20000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, prefill_ep, decode_tp, decode_ep, num_prefill_gpu, num_decode_gpu)
      VALUES (1, 'qwen3.5', 'h100', 'sglang', 'fp8', 'none', false, 1,1,1,1,1,1);
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, date, created_at, run_started_at)
      VALUES (1, 111, 1, 'previous', '2026-09-15', '2026-09-15T00:00:00Z', '2026-09-15T00:00:00Z');`);
});
async function addPoint(conc: number, image = 'example/serving:golden') {
  await sql`INSERT INTO benchmark_results (config_id, workflow_run_id, date, benchmark_type, isl, osl, conc, offload_mode, recipe_fingerprint, image, metrics)
    VALUES (1,1,'2026-09-15','agentic_traces',NULL,NULL,${conc},'off',${'a'.repeat(64)},${image},'{}')`;
}
describe('read-only required-power DB preflight', () => {
  it('rejects partial refresh from base tables before any write, even with a stale latest view', async () => {
    await addPoint(1);
    await addPoint(64);
    const before = await sql`SELECT count(*)::int AS n FROM benchmark_results`;
    await expect(preflightRequiredPowerCurves(sql, golden, source, options)).rejects.toThrow(
      'shrink',
    );
    expect(await sql`SELECT count(*)::int AS n FROM benchmark_results`).toEqual(before);
    expect(await sql`SELECT count(*)::int AS n FROM workflow_runs`).toEqual([{ n: 1 }]);
    const published = await getLatestBenchmarks(sql, 'qwen3.5', '9999-12-31');
    expect(published.map((row) => row.conc)).toEqual([1, 64]);
  });
  it('accepts complete incoming point coverage', async () => {
    await addPoint(1);
    await expect(
      preflightRequiredPowerCurves(sql, golden, source, options),
    ).resolves.toBeUndefined();
    expect(await sql`SELECT count(*)::int AS n FROM workflow_runs`).toEqual([{ n: 1 }]);
  });
  it('inherits same-image append-only state but rejects a changed image', async () => {
    await addPoint(1);
    await addPoint(64);
    await expect(
      preflightRequiredPowerCurves(sql, golden, source, { ...options, appendOnly: true }),
    ).resolves.toBeUndefined();
    await sql`UPDATE benchmark_results SET image='old-image'`;
    await expect(
      preflightRequiredPowerCurves(sql, golden, source, { ...options, appendOnly: true }),
    ).rejects.toThrow('shrink');
  });
  it('detects retry removal from a scope omitted entirely by incoming artifacts', async () => {
    await sql`UPDATE workflow_runs SET github_run_id=123`;
    await sql`UPDATE configs SET hardware='h200'`;
    await addPoint(64);
    await expect(
      preflightRequiredPowerCurves(sql, golden, { ...source, runAttempt: 2 }, options),
    ).rejects.toThrow('shrink');
    expect(await sql`SELECT count(*)::int AS n FROM workflow_runs`).toEqual([{ n: 1 }]);
  });
  it('protects optional fixed workloads outside the power receipt whitelist', async () => {
    await sql`INSERT INTO benchmark_results (config_id,workflow_run_id,date,benchmark_type,isl,osl,conc,offload_mode,recipe_fingerprint,image,metrics)
      VALUES (1,1,'2026-09-15','single_turn',4096,1024,1,'off',${'c'.repeat(64)},'example/serving:golden','{}'),
      (1,1,'2026-09-15','single_turn',4096,1024,8,'off',${'c'.repeat(64)},'example/serving:golden','{}')`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-optional-'));
    try {
      fs.cpSync(golden, dir, { recursive: true });
      fs.mkdirSync(path.join(dir, 'results_optional'));
      const row = JSON.parse(
        fs.readFileSync(path.join(golden, 'bmk_agentic_golden/agg.json'), 'utf8'),
      );
      delete row.scenario_type;
      delete row.users;
      Object.assign(row, { isl: 4096, osl: 1024, recipe_fingerprint: 'c'.repeat(64) });
      fs.writeFileSync(path.join(dir, 'results_optional/extra.json'), JSON.stringify(row));
      await expect(preflightRequiredPowerCurves(sql, dir, source, options)).rejects.toThrow(
        'shrink',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('models mixed dates on same-attempt upserts instead of overlooking a newer snapshot', async () => {
    await sql`UPDATE workflow_runs SET github_run_id=123`;
    await addPoint(1);
    await sql`UPDATE benchmark_results SET date='2026-09-10'`;
    await sql`INSERT INTO workflow_runs (id,github_run_id,run_attempt,name,date,created_at,run_started_at)
      VALUES (2,222,1,'competing','2026-09-12','2026-09-12T00:00:00Z','2026-09-12T00:00:00Z')`;
    await sql`INSERT INTO benchmark_results (config_id,workflow_run_id,date,benchmark_type,isl,osl,conc,offload_mode,recipe_fingerprint,image,metrics)
      VALUES (1,2,'2026-09-12','agentic_traces',NULL,NULL,8,'off',${'a'.repeat(64)},'example/serving:golden','{}')`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'powerx-dates-'));
    try {
      fs.cpSync(golden, dir, { recursive: true });
      fs.mkdirSync(path.join(dir, 'results_optional'));
      const row = JSON.parse(
        fs.readFileSync(path.join(golden, 'bmk_agentic_golden/agg.json'), 'utf8'),
      );
      Object.assign(row, { conc: 4, users: 4 });
      fs.writeFileSync(path.join(dir, 'results_optional/extra.json'), JSON.stringify(row));
      await expect(preflightRequiredPowerCurves(sql, dir, source, options)).rejects.toThrow(
        'shrink',
      );
      const published = await getLatestBenchmarks(sql, 'qwen3.5', '9999-12-31');
      expect(published.map((point) => point.conc)).toEqual([8]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
