/**
 * Telemetry purge behaviour against a PGlite database with the real migrations
 * applied, so the FK cascades declared in 016_gpu_metrics.sql are the ones under
 * test rather than a hand-written stand-in.
 *
 * The regression these cover: before this change both purge levels relied on
 * `on delete cascade`, so a purge destroyed telemetry with no count anywhere. The
 * point-level case was worse than silent — it left the series stranded, paying
 * storage while the per-point endpoint could never reach it again.
 */

import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  countRunTelemetry,
  deleteRunTelemetry,
  describeTelemetry,
  unlinkPointTelemetry,
} from './telemetry-purge';

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

const count = async (table: string): Promise<number> => {
  const result = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return result.rows[0].n;
};

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of ['001_initial_schema.sql', '016_gpu_metrics.sql']) {
    await db.exec(fs.readFileSync(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
  }
  sql = queryClient(db) as unknown as Sql;
}, 20_000);

afterAll(async () => {
  await db?.close();
});

/**
 * Two runs. Run 1 has two benchmark points sharing one series plus a second
 * series linked to nothing, which is the shape a multinode upload produces. Run 2
 * exists to prove a purge never reaches past the runs it was given.
 */
beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;

    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, html_url, created_at, date)
    VALUES (1, 44000000001, 1, 'Run Sweep', null, now(), '2026-09-01'),
           (2, 44000000002, 1, 'Run Sweep', null, now(), '2026-09-02');

    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsv4', 'b200', 'sglang', 'fp8', 'none', false, 8, 8, 8, 8);

    INSERT INTO benchmark_results (id, workflow_run_id, config_id, date, isl, osl, conc,
      benchmark_type, metrics)
    VALUES (11, 1, 1, '2026-09-01', 8192, 1024, 32, 'single_turn', '{}'::jsonb),
           (12, 1, 1, '2026-09-01', 8192, 1024, 64, 'single_turn', '{}'::jsonb),
           (21, 2, 1, '2026-09-02', 8192, 1024, 32, 'single_turn', '{}'::jsonb);

    INSERT INTO gpu_metric_series (id, workflow_run_id, artifact_name, config_key, file_name,
      vendor, csv_sha256, sample_count, gpu_count, started_at, ended_at)
    VALUES (101, 1, 'gpu_metrics_a', 'a', 'a.csv', 'nvidia', 'sha-a', 1000, 8,
              '2026-09-01T00:00:00Z', '2026-09-01T00:10:00Z'),
           (102, 1, 'gpu_metrics_b', 'b', 'b.csv', 'nvidia', 'sha-b', 2000, 8,
              '2026-09-01T00:00:00Z', '2026-09-01T00:20:00Z'),
           (201, 2, 'gpu_metrics_c', 'c', 'c.csv', 'nvidia', 'sha-c', 4000, 8,
              '2026-09-02T00:00:00Z', '2026-09-02T00:40:00Z');

    INSERT INTO benchmark_result_gpu_metrics (benchmark_result_id, series_id)
    VALUES (11, 101), (12, 101), (21, 201);
  `);
});

describe('countRunTelemetry', () => {
  it('sums the stored sample counts for the targeted runs only', async () => {
    await expect(countRunTelemetry(sql, [1])).resolves.toEqual({ series: 2, samples: 3000 });
    await expect(countRunTelemetry(sql, [2])).resolves.toEqual({ series: 1, samples: 4000 });
    await expect(countRunTelemetry(sql, [1, 2])).resolves.toEqual({ series: 3, samples: 7000 });
  });

  it('reports zero for a run with no telemetry and reads nothing for an empty list', async () => {
    await db.exec('DELETE FROM gpu_metric_series WHERE workflow_run_id = 2');
    await expect(countRunTelemetry(sql, [2])).resolves.toEqual({ series: 0, samples: 0 });
    await expect(countRunTelemetry(sql, [])).resolves.toEqual({ series: 0, samples: 0 });
  });

  it('does not delete anything', async () => {
    await countRunTelemetry(sql, [1, 2]);
    expect(await count('gpu_metric_series')).toBe(3);
  });
});

describe('deleteRunTelemetry', () => {
  it('removes the run series and reports what went', async () => {
    await expect(deleteRunTelemetry(sql, [1])).resolves.toEqual({ series: 2, samples: 3000 });
    expect(await count('gpu_metric_series')).toBe(1);
  });

  it('leaves other runs untouched', async () => {
    await deleteRunTelemetry(sql, [1]);
    await expect(countRunTelemetry(sql, [2])).resolves.toEqual({ series: 1, samples: 4000 });
  });

  it('takes the point links with it, so no link outlives its series', async () => {
    await deleteRunTelemetry(sql, [1]);
    expect(await count('benchmark_result_gpu_metrics')).toBe(1);
  });

  it('is a no-op on an empty list', async () => {
    await expect(deleteRunTelemetry(sql, [])).resolves.toEqual({ series: 0, samples: 0 });
    expect(await count('gpu_metric_series')).toBe(3);
  });
});

describe('unlinkPointTelemetry', () => {
  it('drops only the links for the given points', async () => {
    await expect(unlinkPointTelemetry(sql, [11])).resolves.toBe(1);
    const rows = await db.query<{ benchmark_result_id: number }>(
      'SELECT benchmark_result_id FROM benchmark_result_gpu_metrics ORDER BY benchmark_result_id',
    );
    expect(rows.rows.map((r) => r.benchmark_result_id)).toEqual([12, 21]);
  });

  it('keeps the series, which still belongs to a run that was not purged', async () => {
    await unlinkPointTelemetry(sql, [11, 12]);
    expect(await count('benchmark_result_gpu_metrics')).toBe(1);
    await expect(countRunTelemetry(sql, [1])).resolves.toEqual({ series: 2, samples: 3000 });
  });

  it('returns 0 for points that have no telemetry and for an empty list', async () => {
    await expect(unlinkPointTelemetry(sql, [12, 999])).resolves.toBe(1);
    await expect(unlinkPointTelemetry(sql, [999])).resolves.toBe(0);
    await expect(unlinkPointTelemetry(sql, [])).resolves.toBe(0);
  });
});

describe('describeTelemetry', () => {
  it('groups the sample count so a large loss reads as large', () => {
    expect(describeTelemetry({ series: 23, samples: 207_345 })).toBe(
      '23 gpu_metric_series (207,345 samples)',
    );
  });
});
