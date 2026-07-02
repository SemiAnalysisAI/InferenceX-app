/**
 * SQL ⇆ json-provider PARITY HARNESS.
 *
 * The same synthetic {@link buildDataset} rows flow through BOTH data paths:
 *   - SQL path: real migrations run in embedded Postgres (PGlite), the queries/*.ts
 *     functions execute against it via a postgres.js-compatible adapter.
 *   - JSON path: the identical rows are written to a dump directory in the exact shape
 *     dump-db.ts produces, and json-provider.ts re-implements each query over it.
 * Each query's outputs are normalized (see normalize.ts) and asserted equal — proving
 * the hand-synced JS mirrors track the SQL semantics (the source of truth).
 *
 * Queries covered (json-provider mirror ⇆ queries/*.ts):
 *   getLatestBenchmarks · getBenchmarksForRun · getAllBenchmarksForHistory ·
 *   getAvailabilityData · getReliabilityStats · getAllEvalResults ·
 *   getWorkflowRunsByDate · getChangelogByDate · getDateConfigs · getRunConfigsByDate ·
 *   getServerLog
 * NOT covered (no json-provider mirror exists): getEvalSamples, getLatestImages,
 * submissions.* — see the report / trailing describe for why.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildDataset, D_NEW, D_OLD, MODEL_A, MODEL_B } from './dataset.js';
import { loadDump } from './load-dump.js';
import { loadPglite, type PgliteHandle } from './load-pglite.js';
import { normOrdered, normSet } from './normalize.js';

import * as sqlBench from '../benchmarks.js';
import * as sqlEval from '../evaluations.js';
import * as sqlRel from '../reliability.js';
import * as sqlWf from '../workflow-info.js';
import * as sqlLog from '../server-logs.js';
import type * as JsonProviderNs from '../../json-provider.js';

type JsonProvider = typeof JsonProviderNs;

const ds = buildDataset();
let pg: PgliteHandle;
let json: JsonProvider;

beforeAll(async () => {
  pg = await loadPglite(ds);

  // json-provider caches its store as a module-level singleton keyed off DUMP_DIR at
  // first access, so import a FRESH module instance bound to our dump dir.
  const dump = loadDump(ds);
  process.env.DUMP_DIR = dump.dir;
  vi.resetModules();
  json = await import('../../json-provider.js');
});

afterAll(async () => {
  await pg.close();
  delete process.env.DUMP_DIR;
});

// --- helpers ---------------------------------------------------------------

const rows = (r: unknown): Record<string, unknown>[] => r as Record<string, unknown>[];

/** Assert SQL and JSON return the same SET of rows (order-insensitive). */
async function expectSameSet(
  sqlPromise: Promise<unknown>,
  jsonRows: unknown,
): Promise<Record<string, unknown>[]> {
  const s = normSet(rows(await sqlPromise));
  const j = normSet(rows(jsonRows));
  expect(j).toEqual(s);
  return s;
}

/** Assert SQL and JSON return the same ORDERED list (ORDER BY fully deterministic). */
async function expectSameOrdered(sqlPromise: Promise<unknown>, jsonRows: unknown): Promise<void> {
  const s = normOrdered(rows(await sqlPromise));
  const j = normOrdered(rows(jsonRows));
  expect(j).toEqual(s);
}

// --- getLatestBenchmarks ---------------------------------------------------

describe('getLatestBenchmarks parity', () => {
  it('no date → materialized view path (model A)', async () => {
    const out = await expectSameSet(
      sqlBench.getLatestBenchmarks(pg.sql, MODEL_A),
      json.getLatestBenchmarks(MODEL_A),
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it('as-of date (non-exact) → base-table single-run-per-line path', async () => {
    await expectSameSet(
      sqlBench.getLatestBenchmarks(pg.sql, MODEL_A, D_NEW, false),
      json.getLatestBenchmarks(MODEL_A, D_NEW, false),
    );
  });

  it('exact date path', async () => {
    await expectSameSet(
      sqlBench.getLatestBenchmarks(pg.sql, MODEL_A, D_NEW, true),
      json.getLatestBenchmarks(MODEL_A, D_NEW, true),
    );
    await expectSameSet(
      sqlBench.getLatestBenchmarks(pg.sql, MODEL_A, D_OLD, true),
      json.getLatestBenchmarks(MODEL_A, D_OLD, true),
    );
  });

  it('as-of-run time travel (each same-day rerun) — exercises runFilter fragment', async () => {
    for (const runId of ['100', '101', '200', '201', '999999']) {
      await expectSameSet(
        sqlBench.getLatestBenchmarks(pg.sql, MODEL_A, D_NEW, false, runId),
        json.getLatestBenchmarks(MODEL_A, D_NEW, false, runId),
      );
    }
  });

  it('array of model keys (point-release union)', async () => {
    await expectSameSet(
      sqlBench.getLatestBenchmarks(pg.sql, [MODEL_A, MODEL_B]),
      json.getLatestBenchmarks([MODEL_A, MODEL_B]),
    );
  });

  it('model B (latest attempt wins over superseded attempt)', async () => {
    await expectSameSet(
      sqlBench.getLatestBenchmarks(pg.sql, MODEL_B, D_NEW, false),
      json.getLatestBenchmarks(MODEL_B, D_NEW, false),
    );
  });
});

// --- getBenchmarksForRun ---------------------------------------------------

describe('getBenchmarksForRun parity', () => {
  it.each([100, 101, 200, 201, 300, 400])('run %i', async (runId) => {
    await expectSameSet(
      sqlBench.getBenchmarksForRun(pg.sql, MODEL_A, runId),
      json.getBenchmarksForRun(MODEL_A, runId),
    );
  });

  it('model B run 400 (github id maps to latest attempt only)', async () => {
    await expectSameSet(
      sqlBench.getBenchmarksForRun(pg.sql, MODEL_B, 400),
      json.getBenchmarksForRun(MODEL_B, 400),
    );
  });

  it('unknown run → empty', async () => {
    await expectSameSet(
      sqlBench.getBenchmarksForRun(pg.sql, MODEL_A, 424242),
      json.getBenchmarksForRun(MODEL_A, 424242),
    );
  });
});

// --- getAllBenchmarksForHistory --------------------------------------------

describe('getAllBenchmarksForHistory parity', () => {
  it('seq (1024,1024) model A — every row across runs/dates, metrics stripped', async () => {
    // getAllBenchmarksForHistory returns EVERY successful row (no single-run-per-line
    // dedup), so when two same-day runs measure the same (config, conc, date) there are
    // two rows tied on the SQL ORDER BY (br.date, c.id, br.conc) with NO further tiebreak
    // — order between the tied rows is undefined in BOTH paths. Compare as a SET.
    // This exercises metrics stripping (std_*/mean_*) and multi-run history.
    await expectSameSet(
      sqlBench.getAllBenchmarksForHistory(pg.sql, MODEL_A, 1024, 1024),
      json.getAllBenchmarksForHistory(MODEL_A, 1024, 1024),
    );
  });

  it('seq (1024,1024) model A — c.id tiebreak ordering (single run per config)', async () => {
    // Ordering IS deterministic when restricted to D_OLD, where each (config, conc) has
    // exactly one row: config 1 (conc 1,8,64) then config 3 (conc 1,8), grouped by c.id.
    // This is the case the json-provider `c.id` sort tiebreak fix targets.
    const sql = normOrdered(
      rows(await sqlBench.getAllBenchmarksForHistory(pg.sql, MODEL_A, 1024, 1024)),
    ).filter((r) => r.date === D_OLD);
    const jsonRows = normOrdered(rows(json.getAllBenchmarksForHistory(MODEL_A, 1024, 1024))).filter(
      (r) => r.date === D_OLD,
    );
    expect(jsonRows).toEqual(sql);
    // config 1 (h100) rows come before config 3 (mi355x) — proves the c.id grouping.
    expect(jsonRows.map((r) => `${r.hardware}:${r.conc}`)).toEqual([
      'h100:1',
      'h100:8',
      'h100:64',
      'mi355x:1',
      'mi355x:8',
    ]);
  });

  it('seq (8192,1024) model A', async () => {
    await expectSameSet(
      sqlBench.getAllBenchmarksForHistory(pg.sql, MODEL_A, 8192, 1024),
      json.getAllBenchmarksForHistory(MODEL_A, 8192, 1024),
    );
  });

  it('model B seq (1024,1024)', async () => {
    await expectSameSet(
      sqlBench.getAllBenchmarksForHistory(pg.sql, MODEL_B, 1024, 1024),
      json.getAllBenchmarksForHistory(MODEL_B, 1024, 1024),
    );
  });
});

// --- getAvailabilityData ---------------------------------------------------

describe('getAvailabilityData parity', () => {
  it('EXISTS filter incl. dangling + conclusion-NULL exclusions', async () => {
    const out = await expectSameSet(sqlRel_availability(pg.sql), json.getAvailabilityData());
    // sanity: the dangling 9999/9999 row and the conclusion-NULL-only 256/256 row are gone.
    expect(out.some((r) => r.isl === 9999)).toBe(false);
    expect(out.some((r) => r.isl === 256)).toBe(false);
  });
});

// getAvailabilityData lives in workflow-info.ts
function sqlRel_availability(sql: typeof pg.sql): Promise<unknown> {
  return sqlWf.getAvailabilityData(sql);
}

// --- getReliabilityStats ---------------------------------------------------

describe('getReliabilityStats parity', () => {
  it('joins latest_workflow_runs (superseded-attempt run_stat excluded)', async () => {
    const out = await expectSameSet(sqlRel.getReliabilityStats(pg.sql), json.getReliabilityStats());
    // the run_stat tied to superseded attempt 40 (b200, total 3, n_success 1) is dropped;
    // the latest attempt 41's (b200, 3/3) survives.
    expect(out.some((r) => r.hardware === 'b200' && r.total === 3 && r.n_success === 1)).toBe(
      false,
    );
    expect(out.some((r) => r.hardware === 'b200' && r.total === 3 && r.n_success === 3)).toBe(true);
  });
});

// --- getAllEvalResults -----------------------------------------------------

describe('getAllEvalResults parity', () => {
  it('incl. NULL conc/isl/osl eval, and superseded-attempt eval dropped', async () => {
    const out = await expectSameSet(sqlEval.getAllEvalResults(pg.sql), json.getAllEvalResults());
    expect(
      out.some((r) => r.metrics && (r.metrics as Record<string, number>).em_strict === 0.1),
    ).toBe(false); // superseded eval 703
  });
});

// --- getWorkflowRunsByDate -------------------------------------------------

describe('getWorkflowRunsByDate parity', () => {
  it.each([D_NEW, D_OLD])('date %s (conclusion NOT NULL, ordered by created_at ASC)', async (d) => {
    await expectSameOrdered(sqlWf.getWorkflowRunsByDate(pg.sql, d), json.getWorkflowRunsByDate(d));
  });
});

// --- getChangelogByDate ----------------------------------------------------

describe('getChangelogByDate parity', () => {
  it.each([D_NEW, D_OLD])('date %s (superseded-attempt changelog dropped)', async (d) => {
    await expectSameSet(sqlWf.getChangelogByDate(pg.sql, d), json.getChangelogByDate(d));
  });
});

// --- getDateConfigs / getRunConfigsByDate ----------------------------------

describe('getDateConfigs parity', () => {
  it.each([D_NEW, D_OLD])('date %s', async (d) => {
    await expectSameSet(sqlWf.getDateConfigs(pg.sql, d), json.getDateConfigs(d));
  });
});

describe('getRunConfigsByDate parity', () => {
  it.each([D_NEW, D_OLD])('date %s', async (d) => {
    await expectSameSet(sqlWf.getRunConfigsByDate(pg.sql, d), json.getRunConfigsByDate(d));
  });
});

// --- getServerLog ----------------------------------------------------------

describe('getServerLog parity', () => {
  it('resolves a benchmark_result → server_log', async () => {
    // benchmark 5000 (config1 D_OLD conc1) has server_log_id 9001.
    const brId = ds.benchmark_results.find((b) => b.server_log_id === 9001)!.id;
    const sqlLogText = await sqlLog.getServerLog(pg.sql, brId);
    const jsonLogText = json.getServerLog(brId);
    expect(jsonLogText).toBe(sqlLogText);
    expect(jsonLogText).toBe('server log line 1\nline 2');
  });

  it('returns null for a benchmark without a log', async () => {
    const brId = ds.benchmark_results.find((b) => b.server_log_id === null)!.id;
    expect(json.getServerLog(brId)).toBe(await sqlLog.getServerLog(pg.sql, brId));
  });
});
