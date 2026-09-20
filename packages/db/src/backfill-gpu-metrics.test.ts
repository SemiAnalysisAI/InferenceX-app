/**
 * Candidate-selection tests for the gpu_metrics backfill CLI.
 *
 * The script owns its `sql` handle and calls `runBackfillMain` at import time,
 * so the seam here is the module boundary: `createAdminSql` is redirected at a
 * PGlite database that has the real migrations applied, `runBackfillMain`
 * captures `main` instead of running it, and `listRunArtifacts` records which
 * runs the CLI actually reached. Every candidate query runs for real; nothing
 * touches GitHub.
 */

import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DbUtilsModule from './etl/db-utils';
import type * as BackfillRunnerModule from './lib/backfill-runner';
import type * as GithubArtifactsModule from './lib/github-artifacts';
import type { ArtifactMeta } from './lib/github-artifacts';

type Sql = postgres.Sql;
let db: PGlite;
let sql: Sql;
let main: () => Promise<void>;
const listedRunIds: string[] = [];
/** GitHub run ids whose artifact listing should 404 (the run was deleted). */
const goneRunIds = new Set<string>();
const originalArgv = process.argv;

vi.mock('./etl/db-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof DbUtilsModule>()),
  createAdminSql: () => sql,
}));

vi.mock('./lib/github-artifacts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof GithubArtifactsModule>();
  return {
    ...actual,
    listRunArtifacts: (repository: string, runId: string): Promise<ArtifactMeta[]> => {
      listedRunIds.push(runId);
      if (goneRunIds.has(runId)) {
        return Promise.reject(new actual.WorkflowRunNotFoundError(repository, runId));
      }
      return Promise.resolve([]);
    },
  };
});

vi.mock('./lib/backfill-runner.js', async (importOriginal) => ({
  ...(await importOriginal<typeof BackfillRunnerModule>()),
  runBackfillMain: (_name: string, _sql: Sql, entry: () => Promise<void>) => {
    main = entry;
  },
}));

function queryClient(database: Pick<PGlite, 'query'>) {
  const client = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    const result = await database.query(query, values);
    return result.rows;
  };
  return Object.assign(client, { json: JSON.stringify, array: (value: unknown) => value });
}

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const FRESH_NO_SERIES = 34000000001;
const FRESH_WITH_SERIES = 34000000002;
const STALE_WITH_SERIES = 34000000003;
const FRESH_NO_BENCHMARKS = 34000000004;

/** Run the CLI in --dry-run and report which GitHub run ids it selected, in order. */
async function selectedRuns(...args: string[]): Promise<number[]> {
  listedRunIds.length = 0;
  process.argv = ['bun', 'src/backfill-gpu-metrics.ts', '--dry-run', ...args];
  await main();
  return listedRunIds.map(Number);
}

beforeAll(async () => {
  db = await PGlite.create();
  for (const name of ['001_initial_schema.sql', '016_gpu_metrics.sql']) {
    await db.exec(fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  sql = queryClient(db) as unknown as Sql;
  await import('./backfill-gpu-metrics');
  expect(typeof main).toBe('function');
}, 20_000);

afterAll(async () => {
  process.argv = originalArgv;
  await db?.close();
});

/**
 * Four runs covering each axis of the candidate filter: fresh/stale relative to
 * GitHub's 90-day artifact retention, with/without an already-stored series, and
 * one run that produced no benchmark rows at all.
 */
beforeEach(async () => {
  listedRunIds.length = 0;
  goneRunIds.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, html_url, created_at, date)
    VALUES (1, ${FRESH_NO_SERIES}, 1, 'Run Sweep', null, now(), '${daysAgo(10)}'),
           (2, ${FRESH_WITH_SERIES}, 1, 'Run Sweep', null, now(), '${daysAgo(10)}'),
           (3, ${STALE_WITH_SERIES}, 1, 'Run Sweep', null, now(), '${daysAgo(100)}'),
           (4, ${FRESH_NO_BENCHMARKS}, 1, 'Run Sweep', null, now(), '${daysAgo(10)}');

    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, 8, 8, 8, 8);

    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, metrics)
    VALUES (10, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 32, '{}'),
           (11, 2, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 32, '{}'),
           (12, 3, 1, 'single_turn', '${daysAgo(100)}', 8192, 1024, 32, '{}');

    INSERT INTO gpu_metric_series (workflow_run_id, artifact_name, config_key, file_name,
      vendor, csv_sha256, sample_count, gpu_count, started_at, ended_at)
    VALUES (2, 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0',
              'dsr1_8k1k_fp4_sglang_conc32_b200-x_0', 'gpu_metrics.csv', 'nvidia', 'sha-2',
              1, 8, now(), now()),
           (3, 'gpu_metrics_dsr1_8k1k_fp4_sglang_conc32_b200-x_0',
              'dsr1_8k1k_fp4_sglang_conc32_b200-x_0', 'gpu_metrics.csv', 'nvidia', 'sha-3',
              1, 8, now(), now());`);
});

describe('candidate selection', () => {
  it('defaults --since to GitHub 90-day artifact retention window', async () => {
    // --force removes the series filter, isolating the date cutoff. The 100-day-old
    // run is unreachable on GitHub, so it must not be queued.
    expect(await selectedRuns('--all', '--force')).toEqual([FRESH_WITH_SERIES, FRESH_NO_SERIES]);
  });

  it('reaches past the retention window when --since is given explicitly', async () => {
    expect(await selectedRuns('--all', '--force', '--since', '2020-01-01')).toEqual([
      FRESH_WITH_SERIES,
      FRESH_NO_SERIES,
      STALE_WITH_SERIES,
    ]);
  });

  it('resume hazard: a run that stored any series is skipped on a rerun without --force', async () => {
    // An interrupted backfill leaves a run with one of its several artifacts
    // stored. Re-invoking --all silently treats that run as finished.
    expect(await selectedRuns('--all')).toEqual([FRESH_NO_SERIES]);
  });

  it('a run GitHub has deleted is reported and skipped, not fatal for the sweep', async () => {
    // GitHub 404s the artifact listing once a run is deleted (or purged past
    // retention). One such run must not abort a months-long --all pass.
    goneRunIds.add(String(FRESH_WITH_SERIES));
    expect(await selectedRuns('--all', '--force')).toEqual([FRESH_WITH_SERIES, FRESH_NO_SERIES]);
    const lines = vi.mocked(console.log).mock.calls.map((call) => call.join(' '));
    expect(lines).toContainEqual(expect.stringContaining(`run ${FRESH_WITH_SERIES}`));
    expect(lines).toContainEqual(expect.stringContaining('gone from GitHub'));
    expect(lines.at(-1)).toContain('1 gone from GitHub');
  });

  it('--run bypasses both the retention cutoff and the already-has-series filter', async () => {
    expect(await selectedRuns('--run', String(STALE_WITH_SERIES))).toEqual([STALE_WITH_SERIES]);
  });

  it('--run still requires the run to have benchmark rows to attach telemetry to', async () => {
    expect(await selectedRuns('--run', String(FRESH_NO_BENCHMARKS))).toEqual([]);
  });

  it('--from-run raises the GitHub run id floor', async () => {
    expect(await selectedRuns('--all', '--force', '--from-run', String(FRESH_WITH_SERIES))).toEqual(
      [FRESH_WITH_SERIES],
    );
  });

  it('--limit truncates the ordered candidate list', async () => {
    expect(await selectedRuns('--all', '--force', '--limit', '1')).toEqual([FRESH_WITH_SERIES]);
  });

  it('accepts --shard-count/--shard-index but does not partition the candidate set', async () => {
    // Unlike the other sharded backfills, this script never applies the shard to
    // its query, so every shard process would download the same artifacts.
    const unsharded = await selectedRuns('--all', '--force');
    for (const shardIndex of ['0', '1', '2', '3']) {
      expect(
        await selectedRuns('--all', '--force', '--shard-count', '4', '--shard-index', shardIndex),
      ).toEqual(unsharded);
    }
  });
});

describe('flag validation', () => {
  it('refuses to run without a run selector', async () => {
    process.argv = ['bun', 'src/backfill-gpu-metrics.ts', '--dry-run'];
    await expect(main()).rejects.toThrow('Pass --run <github run id> or --all');
    expect(listedRunIds).toEqual([]);
  });

  it.each([
    { args: ['--all', '--since', '09/01/2026'], message: '--since requires a YYYY-MM-DD date' },
    { args: ['--all', '--parallel', '0'], message: '--parallel requires a positive integer' },
    { args: ['--run', '0'], message: '--run requires a positive integer' },
  ])('rejects $args', async ({ args, message }) => {
    process.argv = ['bun', 'src/backfill-gpu-metrics.ts', '--dry-run', ...args];
    await expect(main()).rejects.toThrow(message);
    expect(listedRunIds).toEqual([]);
  });
});
