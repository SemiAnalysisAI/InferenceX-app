import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { getAllBenchmarksForHistory, getLatestBenchmarks } from '../queries/benchmarks';
import { ingestSupplementalSnapshots, type SupplementalSnapshot } from './supplemental-benchmarks';

let db: PGlite;
let sql: PgliteSql;

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

const point = (conc: number, overrides: Partial<SupplementalSnapshot['rows'][number]> = {}) => ({
  model: 'dsr1',
  hw: 'jalapeno',
  framework: 'teacup',
  precision: 'fp4',
  tp: 8,
  ep: 1,
  conc,
  isl: 8192,
  osl: 1024,
  metrics: { tput_per_gpu: conc * 10, output_tput_per_gpu: conc, median_intvty: 100 / conc },
  ...overrides,
});

const SOURCE = 'https://example.com/vendor-results';

describe('ingestSupplementalSnapshots', () => {
  it('keeps each snapshot as its own dated run, chip count, and source URL', async () => {
    await ingestSupplementalSnapshots(sql, [
      { github_run_id: -2, name: 'Preview', date: '2026-08-17', rows: [point(1), point(2)] },
      {
        github_run_id: -3,
        name: 'Preview',
        date: '2026-08-22',
        html_url: SOURCE,
        rows: [point(1), point(2), point(4, { tp: 8, num_gpu: 4 })],
      },
    ]);

    const history = await getAllBenchmarksForHistory(sql, 'dsr1', 8192, 1024);
    expect(
      history.map((row) => [row.date, row.conc, row.num_decode_gpu, row.run_url]).toSorted(),
    ).toEqual([
      ['2026-08-17', 1, 8, null],
      ['2026-08-17', 2, 8, null],
      ['2026-08-22', 1, 8, SOURCE],
      ['2026-08-22', 2, 8, SOURCE],
      ['2026-08-22', 4, 4, SOURCE],
    ]);

    const latest = await getLatestBenchmarks(sql, 'dsr1');
    expect(latest.map((row) => [row.date, row.conc]).toSorted()).toEqual([
      ['2026-08-22', 1],
      ['2026-08-22', 2],
      ['2026-08-22', 4],
    ]);
  });

  it('rejects run ids that could collide with GitHub runs', async () => {
    await expect(
      ingestSupplementalSnapshots(sql, [
        { github_run_id: 0, name: 'Preview', date: '2026-08-22', rows: [point(1)] },
      ]),
    ).rejects.toThrow('github_run_id must be negative');
  });
});
