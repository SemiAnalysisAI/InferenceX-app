import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbClient } from '../connection';
import { getImageAgeObservations, getLatestImages } from './latest-images';

let db: PGlite;
const sql: DbClient = async (strings, ...values) => {
  const text = strings.reduce((query, part, i) => query + (i ? `$${i}` : '') + part, '');
  const result = await db.query<Record<string, unknown>>(text, values);
  return result.rows;
};

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE TABLE configs (id int, model text, hardware text, framework text, precision text, spec_method text, disagg boolean);
    CREATE TABLE benchmark_results (config_id int, benchmark_type text, isl int, osl int, date date, image text, error text);
    INSERT INTO configs VALUES
      (1, 'qwen3.5', 'b200', 'sglang', 'fp8', 'none', false),
      (2, 'qwen3.5', 'b200', 'sglang', 'fp8', 'none', false),
      (3, 'qwen3.5', 'b200', 'sglang', 'fp8', 'none', true);
    INSERT INTO benchmark_results VALUES
      (1, 'single_turn', 8192, 1024, '2026-06-01', 'v1', null),
      (1, 'single_turn', 8192, 1024, '2026-07-01', 'v1', null),
      (2, 'single_turn', 8192, 1024, '2026-07-01', 'v1', null),
      (1, 'single_turn', 8192, 1024, '2026-07-16', 'v1', null),
      (1, 'single_turn', 8192, 1024, '2026-10-10', 'v2', null),
      (2, 'single_turn', 8192, 1024, '2026-10-10', 'v2', null),
      (1, 'single_turn', 8192, 1024, '2026-10-11', 'v3', 'failed'),
      (1, 'single_turn', 8192, 1024, '2026-10-12', null, null),
      (1, 'single_turn', 8192, 1024, '2026-10-13', 'v2', null),
      (1, 'single_turn', 8192, 1024, '2026-10-14', 'v4', null),
      (3, 'agentic_traces', null, null, '2026-10-12', 'v2', null),
      (1, 'agentic_traces', null, null, '2026-10-12', 'v2', null);
    CREATE VIEW latest_benchmarks AS
      SELECT * FROM benchmark_results WHERE error IS NULL AND date <= '2026-10-13';
  `);
}, 20_000);
afterAll(async () => {
  await db?.close();
});

describe('image history SQL in PostgreSQL', () => {
  it('keeps one old seed and daily observations, including both date boundaries', async () => {
    const rows = await getImageAgeObservations(sql, '2026-10-13');
    expect(
      rows
        .filter((r) => r.benchmark_type === 'single_turn')
        .map((r) => r.date)
        .sort(),
    ).toEqual(['2026-07-01', '2026-07-16', '2026-10-10', '2026-10-13']);
    expect(rows.filter((r) => r.disagg)).toEqual([
      {
        model: 'qwen3.5',
        hardware: 'b200',
        framework: 'sglang',
        precision: 'fp8',
        spec_method: 'none',
        disagg: true,
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        date: '2026-10-12',
      },
    ]);
  });

  it('excludes failed, image-less, and future observations without counting duplicate configs', async () => {
    const rows = await getImageAgeObservations(sql, '2026-10-12');
    expect(
      rows
        .filter((r) => r.benchmark_type === 'single_turn')
        .map((r) => r.date)
        .sort(),
    ).toEqual(['2026-07-01', '2026-07-16', '2026-10-10']);
    expect(rows).toHaveLength(5);
  });

  it('keeps both node types in the current catalog even with identical model, hardware, and framework', async () => {
    const rows = await getLatestImages(sql);
    const agentic = rows.filter((r) => r.benchmark_type === 'agentic_traces');
    expect(agentic).toHaveLength(2);
    expect(agentic.map((r) => r.disagg).sort()).toEqual([false, true]);
  });
});
