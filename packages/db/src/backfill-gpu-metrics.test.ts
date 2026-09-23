/**
 * Candidate-selection and real persistence tests for the gpu_metrics backfill CLI.
 *
 * The script owns its `sql` handle and calls `runBackfillMain` at import time,
 * so the seam here is the module boundary: `createAdminSql` is redirected at a
 * PGlite database that has the real migrations applied, `runBackfillMain`
 * captures `main` instead of running it, and `listRunArtifacts` records which
 * runs the CLI actually reached. Downloads copy local fixture directories;
 * mapping, ingest transactions and receipt queries run for real without GitHub.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DbUtilsModule from './etl/db-utils';
import { ingestGpuMetricsArtifact } from './etl/gpu-metrics-ingest';
import {
  benchmarkPublicationIdentity,
  type PowerPublicationManifest,
} from './etl/power-publication';
import {
  readTelemetryReceipt,
  verifyTelemetryApi,
  type TelemetryReceipt,
} from './etl/telemetry-receipt';
import { NonRetryableArtifactError } from './lib/artifact-retry';
import { readMappedBenchmarkRows } from './lib/benchmark-result-lookup';
import type * as BackfillRunnerModule from './lib/backfill-runner';
import type * as GithubArtifactsModule from './lib/github-artifacts';
import type { ArtifactMeta } from './lib/github-artifacts';

type Sql = postgres.Sql;
let db: PGlite;
let sql: Sql;
let main: () => Promise<void>;
const listedRunIds: string[] = [];
const retainedArtifacts = new Map<string, ArtifactMeta[]>();
const artifactSources = new Map<string, string>();
const downloadFailures = new Set<string>();
const downloadedNames: string[] = [];
const roots: string[] = [];
/** GitHub run ids whose artifact listing should 404 (the run was deleted). */
const goneRunIds = new Set<string>();
const latestRunAttempts = new Map<string, number>();
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

vi.mock('./etl/db-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof DbUtilsModule>()),
  createAdminSql: () => sql,
}));

vi.mock('./lib/github-artifacts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof GithubArtifactsModule>();
  return {
    ...actual,
    fetchRunMeta: (_repository: string, runId: string) => ({
      id: Number(runId),
      name: 'Run Sweep',
      path: '.github/workflows/run-sweep.yml',
      run_attempt: latestRunAttempts.get(runId) ?? 1,
      run_started_at: '2026-09-01T00:00:00Z',
      head_sha: 'local-fixture',
      head_branch: 'main',
      status: 'completed',
      conclusion: 'success',
    }),
    downloadArtifact: (artifact: ArtifactMeta, tempDir: string) => {
      downloadedNames.push(artifact.name);
      const source = artifactSources.get(artifact.name);
      if (!source || downloadFailures.has(artifact.name))
        throw new NonRetryableArtifactError(`Fixture download unavailable: ${artifact.name}`);
      const destination = path.join(tempDir, artifact.name);
      fs.cpSync(source, destination, { recursive: true });
      return destination;
    },
    listRunArtifacts: (repository: string, runId: string): Promise<ArtifactMeta[]> => {
      listedRunIds.push(runId);
      if (goneRunIds.has(runId)) {
        return Promise.reject(new actual.WorkflowRunNotFoundError(repository, runId));
      }
      return Promise.resolve(retainedArtifacts.get(runId) ?? []);
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
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of fs.readdirSync(migrations).toSorted())
    if (name.endsWith('.sql')) await db.exec(fs.readFileSync(new URL(name, migrations), 'utf8'));
  sql = Object.assign(queryClient(db), {
    begin: (fn: (tx: Sql) => Promise<unknown>) =>
      db.transaction((tx) => fn(queryClient(tx) as unknown as Sql)),
  }) as unknown as Sql;
  await import('./backfill-gpu-metrics');
  expect(typeof main).toBe('function');
}, 20_000);

afterAll(async () => {
  process.argv = originalArgv;
  await db?.close();
});

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Four runs covering each axis of the candidate filter: fresh/stale relative to
 * GitHub's 90-day artifact retention, with/without an already-stored series, and
 * one run that produced no benchmark rows at all.
 */
beforeEach(async () => {
  listedRunIds.length = 0;
  goneRunIds.clear();
  retainedArtifacts.clear();
  artifactSources.clear();
  downloadFailures.clear();
  downloadedNames.length = 0;
  latestRunAttempts.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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

describe('attempt selection', () => {
  beforeEach(async () => {
    await db.exec(`
      INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
      VALUES (5, ${FRESH_NO_SERIES}, 2, 'Run Sweep', now(), '${daysAgo(10)}');
      INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
        isl, osl, conc, metrics)
      VALUES (13, 5, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 32, '{}');
    `);
    latestRunAttempts.set(String(FRESH_NO_SERIES), 2);
  });

  it('selects only the latest persisted attempt by default', async () => {
    expect(await selectedRuns('--run', String(FRESH_NO_SERIES))).toEqual([FRESH_NO_SERIES]);
  });

  it('selects an explicit matching attempt and does not substitute an absent attempt', async () => {
    expect(await selectedRuns('--run', String(FRESH_NO_SERIES), '--attempt', '2')).toEqual([
      FRESH_NO_SERIES,
    ]);
    await expect(selectedRuns('--run', String(FRESH_NO_SERIES), '--attempt', '3')).rejects.toThrow(
      'No persisted benchmark target',
    );
  });

  it('rejects historical-attempt recovery against the latest GitHub artifact listing', async () => {
    const before = await db.query('select id, workflow_run_id from benchmark_results order by id');
    await expect(selectedRuns('--run', String(FRESH_NO_SERIES), '--attempt', '1')).rejects.toThrow(
      'GitHub attempt 2 differs from target 1; refusing mixed-attempt',
    );
    expect(listedRunIds).toEqual([String(FRESH_NO_SERIES)]);
    const after = await db.query('select id, workflow_run_id from benchmark_results order by id');
    expect(after.rows).toEqual(before.rows);
  });

  it('continues a bulk dry run after one metadata mismatch and reports a failed run', async () => {
    latestRunAttempts.set(String(FRESH_WITH_SERIES), 2);
    expect(await selectedRuns('--all', '--force')).toEqual([FRESH_WITH_SERIES, FRESH_NO_SERIES]);
    expect(process.exitCode).toBe(1);
    const errors = vi.mocked(console.error).mock.calls.map((call) => call.join(' '));
    expect(errors).toContainEqual(expect.stringContaining(`run ${FRESH_WITH_SERIES}`));
    expect(errors).toContainEqual(expect.stringContaining('refusing mixed-attempt'));
    const lines = vi.mocked(console.log).mock.calls.map((call) => call.join(' '));
    expect(lines).toContainEqual(expect.stringContaining(`run ${FRESH_NO_SERIES}`));
    expect(lines.at(-1)).toContain('1 failed');
  });
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
    {
      args: ['--run', String(FRESH_NO_SERIES), '--attempt', '0'],
      message: '--attempt requires a positive integer',
    },
    {
      args: ['--all', '--attempt', '2'],
      message: '--attempt, --artifact and --receipt require --run',
    },
  ])('rejects $args', async ({ args, message }) => {
    process.argv = ['bun', 'src/backfill-gpu-metrics.ts', '--dry-run', ...args];
    await expect(main()).rejects.toThrow(message);
    expect(listedRunIds).toEqual([]);
  });
});

function fixtureArtifact(name: string, files: Record<string, string>): ArtifactMeta {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-telemetry-fixture-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  artifactSources.set(name, root);
  return { name, archive_download_url: `fixture://${name}`, created_at: '2026-09-02T00:00:00Z' };
}

function benchmarkArtifact(suffix: string, concs = [32]): ArtifactMeta {
  return fixtureArtifact(`bmk_${suffix}`, {
    'results.json': JSON.stringify(
      concs.map((conc) => ({
        infmax_model_prefix: 'dsr1',
        hw: 'b200-nv',
        framework: 'sglang',
        precision: 'fp4',
        isl: 8192,
        osl: 1024,
        conc,
        tp: 8,
        ep: 1,
        dp_attention: false,
        tput_per_gpu: 1234.5,
      })),
    ),
  });
}

const TELEMETRY_CSV =
  'timestamp, index, power.draw [W]\n2026/09/02 00:00:00.000, 0, 100 W\n2026/09/02 00:00:01.000, 0, 200 W';
function telemetryArtifact(suffix: string, csv = TELEMETRY_CSV): ArtifactMeta {
  return fixtureArtifact(`gpu_metrics_${suffix}`, { 'gpu_metrics.csv': csv });
}

function receiptFile(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-telemetry-receipt-'));
  roots.push(root);
  return path.join(root, 'power-publication.json');
}

async function recover(receipt: string, artifact?: string, attempt = 1): Promise<TelemetryReceipt> {
  process.exitCode = 0;
  process.argv = [
    'bun',
    'src/backfill-gpu-metrics.ts',
    '--run',
    String(FRESH_NO_SERIES),
    '--attempt',
    String(attempt),
    '--receipt',
    receipt,
    '--parallel',
    '1',
    '--yes',
    ...(artifact ? ['--artifact', artifact] : []),
  ];
  await main();
  return (JSON.parse(fs.readFileSync(receipt, 'utf8')) as PowerPublicationManifest).telemetry!;
}

describe('targeted recovery receipts', () => {
  it.each([true, false])(
    'counts a unique historical offload fallback once with paired=%s',
    async (paired) => {
      await db.exec("UPDATE benchmark_results SET offload_mode = 'on' WHERE id = 10");
      const bmk = benchmarkArtifact('historical');
      const gpu = telemetryArtifact('historical');
      retainedArtifacts.set(String(FRESH_NO_SERIES), paired ? [bmk, gpu] : [bmk]);
      const receiptPath = receiptFile();
      for (let attempt = 0; attempt < 2; attempt++) {
        const receipt = await recover(receiptPath);
        expect(receipt.counts).toMatchObject({ expectedPoints: 1, linkedPoints: paired ? 1 : 0 });
        expect(receipt.points).toHaveLength(1);
        expect(receipt.points[0]).toMatchObject({
          benchmarkResultId: 10,
          identity: { offload_mode: 'on' },
          produced: paired,
          reasons: paired ? [] : ['artifact_missing', 'series_not_stored'],
        });
      }
      const count = await db.query(
        'SELECT count(*)::int AS count FROM benchmark_result_gpu_metrics',
      );
      expect(count.rows).toEqual([{ count: paired ? 1 : 0 }]);
    },
  );

  it('keeps real offload on/off points separate and leaves ambiguous fallback candidates unlinked', async () => {
    await db.exec(`INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, offload_mode, metrics)
      VALUES (14, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 32, 'on', '{}')`);
    const bmk = benchmarkArtifact('offload');
    const file = path.join(artifactSources.get(bmk.name)!, 'results.json');
    const [raw] = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify([raw, { ...raw, offload_mode: 'on' }]));
    const gpu = telemetryArtifact('offload');
    retainedArtifacts.set(String(FRESH_NO_SERIES), [bmk, gpu]);
    const exact = await recover(receiptFile());
    expect(exact.counts).toMatchObject({ expectedPoints: 2, linkedPoints: 2, storedSeries: 1 });
    expect(exact.points.map((p) => p.benchmarkResultId).toSorted()).toEqual([10, 14]);
    expect(exact.points.map((p) => p.identity.offload_mode).toSorted()).toEqual(['off', 'on']);

    await db.exec(
      "TRUNCATE gpu_metric_series CASCADE; UPDATE benchmark_results SET offload_mode = 'dram' WHERE id = 10",
    );
    fs.writeFileSync(file, JSON.stringify([raw]));
    const ambiguous = await recover(receiptFile());
    expect(process.exitCode).toBe(1);
    expect(ambiguous.counts.linkedPoints).toBe(0);
    expect(ambiguous.points.find((p) => p.identity.offload_mode === 'off')).toMatchObject({
      benchmarkResultId: null,
      error: expect.stringContaining('no matching benchmark rows'),
    });
    const links = await db.query('SELECT * FROM benchmark_result_gpu_metrics');
    expect(links.rows).toEqual([]);
  });

  it.each([true, false])(
    'removes only a proven prior offload phantom on paired=%s retry',
    async (paired) => {
      await db.exec(`UPDATE benchmark_results SET offload_mode = 'on' WHERE id = 10;
      INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES (14, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 64, '{}')`);
      const bmk = benchmarkArtifact('historical');
      const gpu = telemetryArtifact('historical');
      const otherBmk = benchmarkArtifact('unrelated', [64]);
      const otherGpu = telemetryArtifact('unrelated');
      retainedArtifacts.set(String(FRESH_NO_SERIES), [bmk, gpu, otherBmk, otherGpu]);
      // Build the old receipt through the real reader without fallback metadata.
      const old = await readTelemetryReceipt(sql, { runId: FRESH_NO_SERIES, runAttempt: 1 }, [
        {
          identity: benchmarkPublicationIdentity(
            readMappedBenchmarkRows(artifactSources.get(bmk.name)!)[0]!,
          ),
          artifactNames: [gpu.name, 'power_audit_historical'],
          produced: false,
        },
      ]);
      expect(old.points).toHaveLength(3);
      const unrelated = point(old, 14);
      unrelated.error = 'unrelated failure';
      unrelated.api = { status: 'readable' };
      unrelated.reasons.push('ingest_failed');
      const receiptPath = receiptFile();
      fs.writeFileSync(
        receiptPath,
        JSON.stringify({
          version: 1,
          runId: FRESH_NO_SERIES,
          runAttempt: 1,
          points: [],
          telemetry: old,
        }),
      );
      retainedArtifacts.set(
        String(FRESH_NO_SERIES),
        paired ? [bmk, gpu, otherBmk, otherGpu] : [bmk, otherBmk, otherGpu],
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        const repaired = await recover(receiptPath, gpu.name);
        expect(repaired.counts.expectedPoints).toBe(2);
        expect(repaired.points.map((p) => p.benchmarkResultId).toSorted()).toEqual([10, 14]);
        expect(point(repaired, 14)).toEqual(unrelated);
        expect(point(repaired, 10)).toMatchObject({
          identity: { offload_mode: 'on' },
          produced: paired,
        });
      }
    },
  );

  it('clears a legacy run recovery error after a full unique-offload repair without retaining its phantom', async () => {
    await db.exec("UPDATE benchmark_results SET offload_mode = 'on' WHERE id = 10");
    const bmk = benchmarkArtifact('historical');
    const gpu = telemetryArtifact('historical');
    retainedArtifacts.set(String(FRESH_NO_SERIES), [bmk, gpu]);
    const old = await readTelemetryReceipt(sql, { runId: FRESH_NO_SERIES, runAttempt: 1 }, [
      {
        identity: benchmarkPublicationIdentity(
          readMappedBenchmarkRows(artifactSources.get(bmk.name)!)[0]!,
        ),
        artifactNames: [gpu.name],
        produced: true,
      },
    ]);
    old.recoveryError = 'previous full-run failure';
    const receiptPath = receiptFile();
    fs.writeFileSync(
      receiptPath,
      JSON.stringify({
        version: 1,
        runId: FRESH_NO_SERIES,
        runAttempt: 1,
        points: [],
        telemetry: old,
      }),
    );
    const repaired = await recover(receiptPath);
    expect(repaired.recoveryError).toBeUndefined();
    expect(repaired.counts.expectedPoints).toBe(1);
    await verifyTelemetryApi(repaired, 'http://local.test', {
      fetch: () =>
        Promise.resolve(
          Response.json({
            benchmarkResultId: 10,
            series: point(repaired, 10).series.map((series) => ({
              ...series,
              data: [{ power: 100 }, { power: 200 }],
            })),
          }),
        ),
    });
    expect(repaired.counts).toMatchObject({ apiReadablePoints: 1, apiCompletePoints: 1 });
  });

  it.each([
    { paired: true, invalid: 'unmapped' },
    { paired: true, invalid: 'non-object' },
    { paired: false, invalid: 'unmapped' },
    { paired: false, invalid: 'non-object' },
  ])(
    'retains unknown expectations for $invalid rows with paired=$paired',
    async ({ paired, invalid }) => {
      const bmk = benchmarkArtifact('point1');
      const gpu = telemetryArtifact('point1');
      retainedArtifacts.set(String(FRESH_NO_SERIES), paired ? [bmk, gpu] : [bmk]);
      const file = path.join(artifactSources.get(bmk.name)!, 'results.json');
      const [valid] = JSON.parse(fs.readFileSync(file, 'utf8'));
      const receiptPath = receiptFile();
      fs.writeFileSync(file, '{broken');
      const broken = await recover(receiptPath);
      expect(broken.counts.expectedPoints).toBeNull();

      fs.writeFileSync(
        file,
        JSON.stringify([
          valid,
          invalid === 'unmapped'
            ? { ...valid, conc: 64, infmax_model_prefix: 'unknown-model' }
            : 42,
          null,
        ]),
      );
      const partial = await recover(receiptPath);
      expect(partial.counts.expectedPoints).toBeNull();
      expect(process.exitCode).toBe(1);
      expect(partial.expectationErrors).toEqual(
        [2, 3].map((row) =>
          expect.objectContaining({
            benchmarkArtifact: bmk.name,
            artifactNames: expect.arrayContaining([gpu.name]),
            error: `Unmappable benchmark row: results.json row ${row}`,
          }),
        ),
      );
      const summary = vi
        .mocked(console.log)
        .mock.calls.map((call) => call.join(' '))
        .findLast((line) => line.startsWith('\n=== backfill complete:'));
      expect(summary).toContain('1 failed artifact(s), 0 failed run(s)');
      expect(point(partial, 10)).toMatchObject({
        produced: paired,
        storage: { status: paired ? 'complete' : 'incomplete' },
      });
      expect(point(partial, 10).error).toBeUndefined();
      expect(partial.counts.apiCompletePoints).toBe(0);

      await db.exec(`INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES (14, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 64, '{}')`);
      fs.writeFileSync(file, JSON.stringify([valid, { ...valid, conc: 64 }]));
      const repaired = await recover(receiptPath);
      expect(process.exitCode).toBe(0);
      expect(repaired.expectationErrors).toEqual([]);
      expect(repaired.counts).toMatchObject({ expectedPoints: 2, storedPoints: paired ? 2 : 0 });
    },
  );

  it.each(['download', 'parse'])(
    'records a paired benchmark %s failure as an unknown expectation',
    async (failure) => {
      const bmk = benchmarkArtifact('point1');
      const gpu = telemetryArtifact('point1');
      retainedArtifacts.set(String(FRESH_NO_SERIES), [bmk, gpu]);
      if (failure === 'download') downloadFailures.add(bmk.name);
      else fs.writeFileSync(path.join(artifactSources.get(bmk.name)!, 'results.json'), '{broken');
      const receipt = await recover(receiptFile(), gpu.name);
      expect(process.exitCode).toBe(1);
      expect(receipt.expectationErrors).toEqual([
        {
          benchmarkArtifact: bmk.name,
          artifactNames: [gpu.name],
          error: expect.any(String),
        },
      ]);
      expect(receipt.counts.expectedPoints).toBeNull();
      expect(receipt.counts.apiCompletePoints).toBe(0);
    },
  );

  it('records a missing GitHub run as failed recovery instead of a successful empty backfill', async () => {
    goneRunIds.add(String(FRESH_NO_SERIES));
    const receipt = await recover(receiptFile(), 'gpu_metrics_point1');
    expect(process.exitCode).toBe(1);
    expect(receipt.recoveryError).toContain('gone from GitHub');
    expect(receipt.recoveryArtifactNames).toEqual(['gpu_metrics_point1']);
    expect(receipt.counts.apiCompletePoints).toBe(0);
  });

  it('keeps unknown expectations when a later full refresh cannot recover the failed sibling', async () => {
    const broken = benchmarkArtifact('unreadable');
    const gpu = telemetryArtifact('unreadable');
    const good = benchmarkArtifact('point1');
    const goodGpu = telemetryArtifact('point1');
    retainedArtifacts.set(String(FRESH_NO_SERIES), [broken, gpu, good, goodGpu]);
    fs.writeFileSync(path.join(artifactSources.get(broken.name)!, 'results.json'), '{broken');
    const receiptPath = receiptFile();
    const failed = await recover(receiptPath);
    expect(failed.counts.expectedPoints).toBeNull();
    retainedArtifacts.set(String(FRESH_NO_SERIES), [good, goodGpu]);
    const refreshed = await recover(receiptPath);
    expect(refreshed.expectationErrors).toEqual(failed.expectationErrors);
    expect(refreshed.counts.expectedPoints).toBeNull();
  });

  it('does not accept readable old data after a corrective artifact contains no parseable telemetry', async () => {
    const bmk = benchmarkArtifact('point1');
    const gpu = telemetryArtifact('point1');
    retainedArtifacts.set(String(FRESH_NO_SERIES), [bmk, gpu]);
    const receiptPath = receiptFile();
    const original = await recover(receiptPath, gpu.name);
    expect(original.counts.storedPoints).toBe(1);
    fs.writeFileSync(path.join(artifactSources.get(gpu.name)!, 'gpu_metrics.csv'), '');
    const failed = await recover(receiptPath, gpu.name);
    expect(process.exitCode).toBe(1);
    expect(failed.points[0]).toMatchObject({
      error: expect.stringContaining('no parseable gpu_metrics CSV'),
      reasons: ['ingest_failed'],
      storage: { status: 'complete' },
    });
    await verifyTelemetryApi(failed, 'http://local.test', {
      fetch: () =>
        Promise.resolve(
          Response.json({
            benchmarkResultId: 10,
            series: original.points[0]!.series.map((series) => ({
              ...series,
              data: [{ power: 100 }, { power: 200 }],
            })),
          }),
        ),
    });
    expect(failed.counts).toMatchObject({
      storedPoints: 1,
      apiReadablePoints: 1,
      apiCompletePoints: 0,
    });
  });

  it('retains both failed targets until each is repaired', async () => {
    await db.exec(`INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES (14, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 64, '{}')`);
    const a = telemetryArtifact('point1');
    const b = telemetryArtifact('point2');
    const artifacts = [benchmarkArtifact('point1'), benchmarkArtifact('point2', [64])];
    retainedArtifacts.set(String(FRESH_NO_SERIES), artifacts);
    const receiptPath = receiptFile();
    await recover(receiptPath, a.name);
    let receipt = await recover(receiptPath, b.name);
    expect(receipt.recoveryArtifactNames).toEqual([a.name, b.name]);
    expect(receipt.recoveryError).toContain(a.name);
    expect(receipt.recoveryError).toContain(b.name);
    artifacts.push(b);
    receipt = await recover(receiptPath, b.name);
    expect(receipt.recoveryArtifactNames).toEqual([a.name]);
    expect(receipt.recoveryError).toContain(a.name);
    artifacts.push(a);
    receipt = await recover(receiptPath, a.name);
    expect(receipt.recoveryArtifactNames).toBeUndefined();
    expect(receipt.recoveryError).toBeUndefined();
  });

  it.each([
    { name: 'fully unmatched', concs: [64] },
    { name: 'partially unmatched', concs: [32, 64] },
  ])(
    'keeps a $name correction failed until its benchmark target is persisted',
    async ({ concs }) => {
      await db.exec(`INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES (15, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 96, '{}')`);
      const bmk = benchmarkArtifact('point1');
      const gpu = telemetryArtifact('point1');
      const unrelated = telemetryArtifact('unrelated');
      retainedArtifacts.set(String(FRESH_NO_SERIES), [
        bmk,
        gpu,
        benchmarkArtifact('unrelated', [96]),
        unrelated,
      ]);
      const receiptPath = receiptFile();
      const original = await recover(receiptPath);
      for (const receiptPoint of original.points) receiptPoint.api = { status: 'readable' };
      const manifest = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      manifest.telemetry = original;
      fs.writeFileSync(receiptPath, JSON.stringify(manifest));
      const storedBefore = await db.query(
        'SELECT * FROM gpu_metric_samples ORDER BY series_id, sampled_at',
      );
      const unrelatedBefore = point(original, 15);

      goneRunIds.add(String(FRESH_NO_SERIES));
      const missing = await recover(receiptPath, gpu.name);
      expect(missing.recoveryArtifactNames).toEqual([gpu.name]);
      expect(missing.counts.apiCompletePoints).toBe(0);
      goneRunIds.clear();
      benchmarkArtifact('point1', concs);
      downloadedNames.length = 0;
      const unmatched = await recover(receiptPath, gpu.name);
      expect(unmatched.recoveryError).toBe(missing.recoveryError);
      expect(unmatched.recoveryArtifactNames).toEqual([gpu.name]);
      expect(process.exitCode).toBe(1);
      expect(downloadedNames).toEqual([bmk.name]);
      expect(
        unmatched.points.find((receiptPoint) => receiptPoint.identity.conc === 64),
      ).toMatchObject({
        produced: true,
        benchmarkResultId: null,
        error: expect.stringContaining('no matching benchmark rows'),
        reasons: expect.arrayContaining(['ingest_failed', 'benchmark_not_stored']),
      });
      expect(unmatched.counts.apiCompletePoints).toBe(0);
      if (concs.includes(32)) {
        expect(point(unmatched, 10)).toMatchObject({
          storage: { status: 'complete' },
          error: expect.stringContaining('no matching benchmark rows'),
          reasons: ['ingest_failed'],
        });
      } else expect(point(unmatched, 10)).toEqual(point(missing, 10));
      expect(point(unmatched, 15)).toEqual(unrelatedBefore);
      expect(
        await db.query('SELECT * FROM gpu_metric_samples ORDER BY series_id, sampled_at'),
      ).toEqual(storedBefore);

      await db.exec(`INSERT INTO benchmark_results
      (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES (14, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 64, '{}')`);
      const repaired = await recover(receiptPath, gpu.name);
      expect(process.exitCode).toBe(0);
      expect(repaired.recoveryError).toBeUndefined();
      expect(repaired.recoveryArtifactNames).toBeUndefined();
      expect(point(repaired, 14)).toMatchObject({
        produced: true,
        storage: { status: 'complete' },
        reasons: [],
      });
      expect(point(repaired, 14).error).toBeUndefined();
      if (concs.includes(32)) {
        expect(point(repaired, 10).reasons).toEqual([]);
        expect(point(repaired, 10).error).toBeUndefined();
      } else expect(point(repaired, 10)).toEqual(point(missing, 10));
      expect(point(repaired, 15)).toEqual(unrelatedBefore);
      expect(
        await db.query('SELECT * FROM gpu_metric_samples ORDER BY series_id, sampled_at'),
      ).toEqual(storedBefore);
    },
  );

  it('rejects an absent explicit target without touching its receipt', async () => {
    const receipt = receiptFile();
    fs.writeFileSync(receipt, '{"preserve":"existing evidence"}');
    await expect(recover(receipt, 'gpu_metrics_point1', 3)).rejects.toThrow(
      'No persisted benchmark target',
    );
    expect(fs.readFileSync(receipt, 'utf8')).toBe('{"preserve":"existing evidence"}');
    expect(downloadedNames).toEqual([]);
  });
});

function point(value: TelemetryReceipt, id: number) {
  return value.points.find((p) => p.benchmarkResultId === id)!;
}

describe('benchmark metadata cache recovery', () => {
  const audit = {
    source: 'power_validation_agentx.json',
    window_start_unix: 10,
    window_end_unix: 20,
  };

  async function pendingReceipt() {
    vi.stubEnv('CACHE_INVALIDATE_URL', 'http://127.0.0.1:3137/api/v1/invalidate');
    vi.stubEnv('CACHE_INVALIDATE_SECRET', 'local-test-secret');
    await sql`UPDATE workflow_runs SET date = current_date WHERE id = 1`;
    await sql`UPDATE benchmark_results SET power_audit = ${JSON.stringify(audit)}::jsonb, date = current_date WHERE id = 10`;
    const file = receiptFile();
    const [identity] =
      await sql`SELECT c.*, br.id, br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode, br.recipe_fingerprint
      FROM benchmark_results br JOIN configs c ON c.id = br.config_id WHERE br.id = 10`;
    const manifest: PowerPublicationManifest = {
      version: 1,
      runId: FRESH_NO_SERIES,
      runAttempt: 1,
      points: [],
      benchmarkRefresh: {
        status: 'pending',
        benchmarkResultIds: [10],
        auditUpdates: [{ benchmarkResultId: 10, identity: identity!, powerAudit: audit }],
        endpoint: 'http://127.0.0.1:3137/api/v1/invalidate',
      },
    };
    fs.writeFileSync(file, JSON.stringify(manifest));
    return file;
  }

  function successfulFetch() {
    return vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_url, init) =>
        Promise.resolve(
          Response.json(
            init?.method === 'POST'
              ? { invalidated: true, blobsDeleted: 1 }
              : [{ id: 10, power_audit: audit }],
          ),
        ),
      );
  }

  it.each([true, false])(
    'checkpoints source evidence before metadata writes with configured=%s',
    async (configured) => {
      vi.stubEnv(
        'CACHE_INVALIDATE_URL',
        configured ? 'http://127.0.0.1:3137/api/v1/invalidate' : '',
      );
      vi.stubEnv('CACHE_INVALIDATE_SECRET', 'local-test-secret');
      await sql`UPDATE benchmark_results SET benchmark_type = 'agentic_traces', isl = NULL, osl = NULL WHERE id = 10`;
      const bmk = benchmarkArtifact('metadata');
      const source = artifactSources.get(bmk.name)!;
      const [raw] = JSON.parse(fs.readFileSync(path.join(source, 'results.json'), 'utf8'));
      fs.writeFileSync(
        path.join(source, 'results.json'),
        JSON.stringify([{ ...raw, scenario_type: 'agentic-coding', users: 32 }]),
      );
      const expectedAudit = {
        source: 'power_validation_metadata_conc32.json',
        window_start_unix: 10,
        window_end_unix: 20,
      };
      const gpu = fixtureArtifact('power_audit_metadata', {
        'LOGS/power/samples.csv':
          'schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w\n1,10,0,host-a,0,GPU-0,100\n1,11,1,host-a,0,GPU-0,200',
        'LOGS/power/manifest.json': JSON.stringify({ producer: 'srt-slurm.dcgm-power' }),
        [expectedAudit.source]: JSON.stringify({
          validation_path: 'LOGS/agentic/conc_32/power_validation.json',
          result_file: 'metadata_conc32.json',
          selected_window: { concurrency: 32, start_time_unix: 10, end_time_unix: 20 },
        }),
      });
      retainedArtifacts.set(String(FRESH_NO_SERIES), [bmk, gpu]);
      const [mapped] = readMappedBenchmarkRows(source);
      const identity = benchmarkPublicationIdentity(mapped!);
      await sql`UPDATE benchmark_results SET offload_mode = ${mapped!.offloadMode} WHERE id = 10`;
      const original = {
        identity,
        metrics: { power_valid: 0, tput_per_gpu: 1234.5 },
        workers: null,
        power_invalid_reasons: ['original'],
        power_audit: null,
        artifact: { path: 'original.json', sha256: 'preserve-original-hash' },
      };
      const unrelated = { ...original, identity: { ...identity, conc: 64 } };
      const file = receiptFile();
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          runId: FRESH_NO_SERIES,
          runAttempt: 1,
          points: [original, unrelated],
        }),
      );
      const request = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((_url, init) =>
          Promise.resolve(
            Response.json(
              init?.method === 'POST'
                ? { invalidated: true, blobsDeleted: 1 }
                : [{ id: 10, power_audit: expectedAudit }],
            ),
          ),
        );
      await recover(file, gpu.name);
      const result: PowerPublicationManifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(result.benchmarkRefresh?.status).toBe(configured ? 'complete' : 'failed');
      expect(result.benchmarkRefresh?.auditUpdates?.[0]?.powerAudit).toEqual(expectedAudit);
      expect(result.points).toEqual([
        { ...original, power_audit: configured ? expectedAudit : null },
        unrelated,
      ]);
      expect(await sql`SELECT power_audit FROM benchmark_results WHERE id = 10`).toEqual([
        { power_audit: configured ? expectedAudit : null },
      ]);
      if (configured) expect(process.exitCode).toBe(0);
      else {
        expect(process.exitCode).toBe(1);
        expect(request).not.toHaveBeenCalled();
        expect(await sql`SELECT * FROM gpu_metric_samples`).toEqual([]);
      }
    },
  );

  it('refreshes a saved target without listing/downloading artifacts or changing telemetry', async () => {
    const file = await pendingReceipt();
    successfulFetch();
    const before = await sql`SELECT * FROM gpu_metric_series ORDER BY id`;
    process.argv = [
      'bun',
      'backfill-gpu-metrics.ts',
      '--refresh-cache-only',
      '--run',
      String(FRESH_NO_SERIES),
      '--attempt',
      '1',
      '--receipt',
      file,
      '--yes',
    ];
    await main();
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).benchmarkRefresh.status).toBe('complete');
    expect(listedRunIds).toEqual([]);
    expect(downloadedNames).toEqual([]);
    expect(await sql`SELECT * FROM gpu_metric_series ORDER BY id`).toEqual(before);
    expect(await sql`SELECT power_audit FROM latest_benchmarks WHERE id = 10`).toEqual([
      { power_audit: audit },
    ]);
  });

  it('retries a failed cache phase on unchanged ingest with zero sample rewrites', async () => {
    const file = await pendingReceipt();
    const bmk = benchmarkArtifact('metadata');
    const gpu = telemetryArtifact('metadata');
    retainedArtifacts.set(String(FRESH_NO_SERIES), [bmk, gpu]);
    const request = successfulFetch();
    request.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await recover(file, gpu.name);
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).benchmarkRefresh).toMatchObject({
      status: 'failed',
      benchmarkResultIds: [10],
      error: 'invalidate cache: HTTP 503',
    });
    const before =
      await sql`SELECT * FROM gpu_metric_samples ORDER BY series_id, sampled_at, gpu_index`;
    await recover(file, gpu.name);
    expect(process.exitCode).toBe(0);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).benchmarkRefresh.status).toBe('complete');
    expect(
      await sql`SELECT * FROM gpu_metric_samples ORDER BY series_id, sampled_at, gpu_index`,
    ).toEqual(before);
    expect(
      vi
        .mocked(console.log)
        .mock.calls.flat()
        .some((line) => String(line).includes('+0 samples')),
    ).toBe(true);
  });

  it('rejects a receipt for another run before any cache request or artifact download', async () => {
    const file = await pendingReceipt();
    const request = successfulFetch();
    process.argv = [
      'bun',
      'backfill-gpu-metrics.ts',
      '--refresh-cache-only',
      '--run',
      String(FRESH_WITH_SERIES),
      '--receipt',
      file,
      '--yes',
    ];
    await expect(main()).rejects.toThrow('receipt run/attempt');
    expect(request).not.toHaveBeenCalled();
    expect(downloadedNames).toEqual([]);
  });
});

describe('real persistence through the recovery CLI', () => {
  it('repairs absent, failed and unlinked points separately without duplicating shared series or crossing attempts', async () => {
    await db.exec(`
      INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
      VALUES (5, ${FRESH_NO_SERIES}, 2, 'Later attempt', now(), '${daysAgo(10)}');
      INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc, metrics)
      VALUES (14, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 64, '{}'),
             (15, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 96, '{}'),
             (16, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 128, '{}'),
             (17, 1, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 160, '{}'),
             (20, 5, 1, 'single_turn', '${daysAgo(10)}', 8192, 1024, 32, '{}');
    `);
    const benchmarks = [
      benchmarkArtifact('absent', [32]),
      benchmarkArtifact('failed', [64]),
      benchmarkArtifact('unlinked', [96]),
      benchmarkArtifact('shared', [128, 160]),
    ];
    const absent = telemetryArtifact('absent');
    const failed = telemetryArtifact('failed', TELEMETRY_CSV.replaceAll(', 0,', ', 999999,'));
    const unlinked = telemetryArtifact('unlinked');
    const shared = telemetryArtifact('shared');
    retainedArtifacts.set(String(FRESH_NO_SERIES), [...benchmarks, failed, unlinked, shared]);
    const persisted = (artifact: ArtifactMeta, ids: number[], workflowRunId = 1) =>
      ingestGpuMetricsArtifact(sql, {
        workflowRunId,
        artifact: { artifactName: artifact.name, artifactDir: artifactSources.get(artifact.name)! },
        benchmarkResultIds: ids,
      });
    await persisted(unlinked, [15]);
    await db.exec('DELETE FROM benchmark_result_gpu_metrics WHERE benchmark_result_id = 15');
    await persisted(shared, [16, 17]);
    await persisted(absent, [20], 5);

    const observations = benchmarks.flatMap((bmk, index) =>
      readMappedBenchmarkRows(artifactSources.get(bmk.name)!).map((row) => ({
        identity: benchmarkPublicationIdentity(row),
        artifactNames: [[absent, failed, unlinked, shared][index]!.name],
        produced: index !== 0,
      })),
    );
    const receiptPath = receiptFile();
    const seed = await readTelemetryReceipt(
      sql,
      { runId: FRESH_NO_SERIES, runAttempt: 1 },
      observations,
      { expectedSource: 'benchmark_artifacts' },
    );
    fs.writeFileSync(
      receiptPath,
      JSON.stringify({
        version: 1,
        runId: FRESH_NO_SERIES,
        runAttempt: 1,
        points: [],
        telemetry: seed,
      } satisfies PowerPublicationManifest),
    );

    // Missing telemetry is discovered from the retained benchmark sibling.
    let receipt = await recover(receiptPath, absent.name);
    expect(process.exitCode).toBe(1);
    expect(receipt.recoveryError).toContain(`No retained telemetry pair for ${absent.name}`);
    expect(receipt.recoveryArtifactNames).toEqual([absent.name]);
    // The failure is a real smallint violation inside the ingest transaction.
    receipt = await recover(receiptPath, failed.name);
    expect(process.exitCode).toBe(1);
    expect(point(receipt, 10).reasons).toContain('artifact_missing');
    expect(point(receipt, 14).reasons).toContain('ingest_failed');
    expect(point(receipt, 14).error).toContain('smallint');
    expect(receipt.recoveryError).toContain(`No retained telemetry pair for ${absent.name}`);
    expect(receipt.recoveryArtifactNames).toEqual([absent.name]);
    expect(point(receipt, 15).reasons).toContain('point_link_missing');
    for (const [id, artifact] of [
      [10, absent],
      [14, failed],
      [15, unlinked],
    ] as const) {
      expect(point(receipt, id).key).toBe(point(seed, id).key);
      expect(point(receipt, id).recovery).toEqual({
        runId: FRESH_NO_SERIES,
        runAttempt: 1,
        artifactNames: expect.arrayContaining([artifact.name]),
      });
    }
    expect(receipt.counts).toMatchObject({
      expectedPoints: 5,
      producedPoints: 4,
      producedArtifacts: 3,
      storedPoints: 3,
      linkedPoints: 2,
      storedSeries: 2,
      storedSamples: 4,
      apiReadablePoints: 0,
      apiCompletePoints: 0,
      apiUnknownPoints: 5,
    });
    expect(receipt.plannedPointCount).toBeNull();

    const storedState = async () => {
      const result = await db.query<{
        series: { artifact_name: string; workflow_run_id: number };
      }>(`
      SELECT to_jsonb(s) AS series,
        (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.gpu_index, x.sampled_at)
          FROM gpu_metric_samples x WHERE x.series_id = s.id) AS samples,
        (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.gpu_index, x.metric)
          FROM gpu_metric_gpu_stats x WHERE x.series_id = s.id) AS stats,
        (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.benchmark_result_id)
          FROM benchmark_result_gpu_metrics l WHERE l.series_id = s.id) AS links
      FROM gpu_metric_series s ORDER BY s.id
    `);
      return result.rows;
    };
    const protectedBefore = await storedState();
    const benchmarksBefore = await db.query('SELECT * FROM benchmark_results ORDER BY id');

    retainedArtifacts.get(String(FRESH_NO_SERIES))!.push(absent);
    fs.writeFileSync(
      path.join(artifactSources.get(failed.name)!, 'gpu_metrics.csv'),
      TELEMETRY_CSV,
    );
    const repairCases = [
      { artifact: absent, id: 10, stored: 4, linked: 3, series: 3, samples: 6 },
      { artifact: failed, id: 14, stored: 5, linked: 4, series: 4, samples: 8 },
      { artifact: unlinked, id: 15, stored: 5, linked: 5, series: 4, samples: 8 },
    ];
    for (const target of repairCases) {
      const previous = receipt;
      downloadedNames.length = 0;
      receipt = await recover(receiptPath, target.artifact.name);
      expect(process.exitCode).toBe(0);
      expect(receipt.recoveryError).toBeUndefined();
      expect(receipt.recoveryArtifactNames).toBeUndefined();
      expect(downloadedNames).toEqual([
        `bmk_${target.artifact.name.slice('gpu_metrics_'.length)}`,
        target.artifact.name,
      ]);
      expect(point(receipt, target.id).reasons).toEqual([]);
      expect(point(receipt, target.id).key).toBe(point(previous, target.id).key);
      expect(receipt.points.filter((p) => p.benchmarkResultId !== target.id)).toEqual(
        previous.points.filter((p) => p.benchmarkResultId !== target.id),
      );
      expect(receipt.counts).toMatchObject({
        expectedPoints: 5,
        producedArtifacts: 4,
        storedPoints: target.stored,
        linkedPoints: target.linked,
        storedSeries: target.series,
        storedSamples: target.samples,
        apiReadablePoints: 0,
        apiCompletePoints: 0,
        apiUnknownPoints: 5,
      });
      const repairedState = await storedState();
      const replay = await recover(receiptPath, target.artifact.name);
      expect(replay.points).toEqual(receipt.points);
      expect(await storedState()).toEqual(repairedState);
    }
    // Shared telemetry counts once; the other attempt and unrelated runs retain exact bytes.
    const finalState = await storedState();
    expect(
      finalState.filter((row) => {
        const series = row.series;
        return series.workflow_run_id !== 1 || series.artifact_name === shared.name;
      }),
    ).toEqual(
      protectedBefore.filter((row) => {
        const series = row.series;
        return series.artifact_name !== unlinked.name;
      }),
    );
    const benchmarksAfter = await db.query('SELECT * FROM benchmark_results ORDER BY id');
    expect(benchmarksAfter.rows).toEqual(benchmarksBefore.rows);
    const otherAttemptLinks = await db.query(
      'SELECT * FROM benchmark_result_gpu_metrics WHERE benchmark_result_id = 20',
    );
    expect(otherAttemptLinks.rows).toHaveLength(1);
  });
});
