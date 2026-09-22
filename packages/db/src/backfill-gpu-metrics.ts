/**
 * Backfill PowerX telemetry (`gpu_metrics_<suffix>` artifacts) into the
 * migration-016 tables for runs that were ingested before the CI path
 * digested them.
 *
 * GitHub keeps run artifacts for 90 days and the GCS mirror only covers
 * scheduled/push runs on main, so the reachable history is bounded by GitHub
 * retention; runs GitHub has since deleted are reported and skipped. Each
 * gpu_metrics artifact is paired with its exact `bmk_<suffix>`
 * (or `bmk_agentic_<suffix>`) sibling, the raw rows are mapped through the
 * production mapper, and the series is linked to those persisted points.
 *
 * Usage:
 *   bun run --cwd packages/db db:backfill-gpu-metrics --run 34557177019 --yes
 *   bun run --cwd packages/db db:backfill-gpu-metrics --all --yes
 *   bun run --cwd packages/db db:backfill-gpu-metrics --all --since 2026-08-01 --dry-run
 *   bun run --cwd packages/db db:backfill-gpu-metrics --all --force --limit 20 --yes
 *
 * Runs that already have at least one stored series are skipped unless
 * --force is passed. --parallel N (default 4) bounds concurrent artifact
 * downloads within one run.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasNoSslFlag } from './cli-utils.js';
import { AsyncSemaphore } from './etl/async-semaphore.js';
import { createAdminSql } from './etl/db-utils.js';
import { ingestGpuMetricsArtifact } from './etl/gpu-metrics-ingest.js';
import { retryArtifactOperation } from './lib/artifact-retry.js';
import {
  confirmProceed,
  listBackfillRunArtifacts,
  parseLimitForceFlags,
  runBackfillMain,
} from './lib/backfill-runner.js';
import { findBenchmarkResultIds, readMappedBenchmarkRows } from './lib/benchmark-result-lookup.js';
import { downloadArtifact } from './lib/github-artifacts.js';
import {
  pairGpuMetricsArtifacts,
  type GpuMetricsArtifactPair,
} from './lib/gpu-metrics-backfill.js';
import { repositoryFromRunUrl } from './lib/runtime-metadata-artifacts.js';

const DEFAULT_REPO = 'SemiAnalysisAI/InferenceX';
const GITHUB_RETENTION_DAYS = 90;
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 4, onnotice: () => {} });

interface CandidateRun {
  id: number;
  github_run_id: number;
  run_attempt: number;
  html_url: string | null;
  date: string;
  series_count: number;
}

interface BackfillFlags {
  all: boolean;
  dryRun: boolean;
  run: number | null;
  fromRun: number | null;
  since: string | null;
  parallel: number;
}

function positiveIntFlag(flag: string): number | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const raw = process.argv[index + 1];
  if (!raw || !/^\d+$/u.test(raw) || Number(raw) <= 0) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return Number(raw);
}

function parseFlags(): BackfillFlags {
  const sinceIndex = process.argv.indexOf('--since');
  const since = sinceIndex === -1 ? null : (process.argv[sinceIndex + 1] ?? null);
  if (sinceIndex !== -1 && (!since || !/^\d{4}-\d{2}-\d{2}$/u.test(since))) {
    throw new Error('--since requires a YYYY-MM-DD date');
  }
  return {
    all: process.argv.includes('--all'),
    dryRun: process.argv.includes('--dry-run'),
    run: positiveIntFlag('--run'),
    fromRun: positiveIntFlag('--from-run'),
    since,
    parallel: positiveIntFlag('--parallel') ?? 4,
  };
}

function isWithinGithubRetention(date: string): boolean {
  const ageMs = Date.now() - new Date(date).getTime();
  return ageMs <= GITHUB_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

async function loadCandidateRuns(
  flags: BackfillFlags,
  limit: number | null,
  force: boolean,
): Promise<CandidateRun[]> {
  const cutoff = new Date(Date.now() - GITHUB_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const since = flags.since ?? cutoff;
  const rows = await sql<CandidateRun[]>`
    select wr.id, wr.github_run_id, wr.run_attempt, wr.html_url, wr.date::text as date,
      (select count(*)::int from gpu_metric_series s where s.workflow_run_id = wr.id) as series_count
    from latest_workflow_runs wr
    where exists (select 1 from benchmark_results br where br.workflow_run_id = wr.id)
      and (${flags.run}::bigint is null or wr.github_run_id = ${flags.run})
      and (${flags.fromRun}::bigint is null or wr.github_run_id >= ${flags.fromRun})
      and (${flags.run}::bigint is not null or wr.date >= ${since}::date)
    order by wr.date desc, wr.github_run_id desc
  `;
  const candidates = rows
    .map((row) => ({
      ...row,
      id: Number(row.id),
      github_run_id: Number(row.github_run_id),
      series_count: Number(row.series_count),
    }))
    .filter((row) => force || flags.run !== null || row.series_count === 0);
  return limit === null ? candidates : candidates.slice(0, limit);
}

type PairOutcome =
  | { kind: 'ingested'; seriesCount: number; samplesInserted: number; pointsLinked: number }
  | { kind: 'unmatched' }
  | { kind: 'empty' }
  | { kind: 'failed' };

/** Download one gpu_metrics/bmk pair, resolve its points, and persist the series. */
async function processPair(
  run: CandidateRun,
  pair: GpuMetricsArtifactPair,
  tempDir: string,
): Promise<PairOutcome> {
  let benchmarkDir: string | null = null;
  let gpuMetricsDir: string | null = null;
  try {
    benchmarkDir = await retryArtifactOperation(`downloading ${pair.benchmarks.name}`, () =>
      downloadArtifact(pair.benchmarks, tempDir),
    );
    const mappedRows = readMappedBenchmarkRows(benchmarkDir);
    const resultIds = await findBenchmarkResultIds(sql, run, mappedRows);
    if (resultIds.length === 0) {
      console.warn(`  [WARN] ${pair.gpuMetrics.name}: no matching benchmark rows`);
      return { kind: 'unmatched' };
    }
    gpuMetricsDir = await retryArtifactOperation(`downloading ${pair.gpuMetrics.name}`, () =>
      downloadArtifact(pair.gpuMetrics, tempDir),
    );
    const ingested = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: run.id,
      artifact: { artifactName: pair.gpuMetrics.name, artifactDir: gpuMetricsDir },
      benchmarkResultIds: resultIds,
    });
    if (ingested.seriesIds.length === 0) {
      console.warn(`  [WARN] ${pair.gpuMetrics.name}: no parseable gpu_metrics CSV`);
      return { kind: 'empty' };
    }
    return {
      kind: 'ingested',
      seriesCount: ingested.seriesIds.length,
      samplesInserted: ingested.samplesInserted,
      pointsLinked: resultIds.length,
    };
  } catch (error) {
    console.error(`  ✗ run ${run.github_run_id} artifact ${pair.gpuMetrics.name}:`, error);
    return { kind: 'failed' };
  } finally {
    if (benchmarkDir) fs.rmSync(benchmarkDir, { recursive: true, force: true });
    if (gpuMetricsDir) fs.rmSync(gpuMetricsDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const flags = parseFlags();
  const { limit, force } = parseLimitForceFlags();
  if (!flags.all && flags.run === null) {
    throw new Error('Pass --run <github run id> or --all');
  }

  console.log('=== backfill-gpu-metrics ===');
  const runs = await loadCandidateRuns(flags, limit, force);
  const staleRuns = runs.filter((run) => !isWithinGithubRetention(run.date)).length;
  const staleNote =
    staleRuns > 0
      ? ` (${staleRuns} older than GitHub's ${GITHUB_RETENTION_DAYS}-day retention)`
      : '';
  console.log(`  ${runs.length} candidate run(s)${staleNote}`);
  if (runs.length === 0) {
    console.log('\n  Nothing to do.');
    return;
  }

  if (flags.dryRun) {
    let pairedRuns = 0;
    let pairs = 0;
    let goneRuns = 0;
    for (const run of runs) {
      const repository = repositoryFromRunUrl(run.html_url) ?? DEFAULT_REPO;
      const artifacts = await listBackfillRunArtifacts(repository, run.github_run_id);
      if (artifacts === null) {
        goneRuns++;
        console.log(`  run ${run.github_run_id} (${run.date}): gone from GitHub`);
        continue;
      }
      const runPairs = pairGpuMetricsArtifacts(artifacts);
      if (runPairs.length > 0) pairedRuns++;
      pairs += runPairs.length;
      console.log(`  run ${run.github_run_id} (${run.date}): ${runPairs.length} pair(s)`);
    }
    console.log(
      `\n=== dry run: ${runs.length} run(s), ${pairedRuns} with pairs, ${pairs} pair(s), ` +
        `${goneRuns} gone from GitHub ===`,
    );
    return;
  }

  if (!(await confirmProceed(`${runs.length} workflow run(s) will be checked for gpu_metrics.`))) {
    return;
  }

  let artifactsProcessed = 0;
  let seriesStored = 0;
  let samplesStored = 0;
  let pointsLinked = 0;
  let unmatchedArtifacts = 0;
  let emptyArtifacts = 0;
  let artifactFailures = 0;
  let runFailures = 0;
  let missingRuns = 0;
  let goneRuns = 0;

  for (const [runIndex, run] of runs.entries()) {
    const runId = run.github_run_id;
    const repository = repositoryFromRunUrl(run.html_url) ?? DEFAULT_REPO;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `gpu-metrics-backfill-${runId}-`));
    const runStart = Date.now();
    try {
      const artifacts = await listBackfillRunArtifacts(repository, runId);
      if (artifacts === null) {
        goneRuns++;
        console.log(
          `  [${runIndex + 1}/${runs.length}] run ${runId} attempt ${run.run_attempt}: gone from GitHub`,
        );
        continue;
      }
      const pairs = pairGpuMetricsArtifacts(artifacts);
      if (pairs.length === 0) {
        missingRuns++;
        console.log(
          `  [${runIndex + 1}/${runs.length}] run ${runId} attempt ${run.run_attempt}: no retained gpu_metrics pairs`,
        );
        continue;
      }

      const limiter = new AsyncSemaphore(flags.parallel);
      const outcomes = await Promise.all(
        pairs.map((pair) => limiter.run(() => processPair(run, pair, tempDir))),
      );
      let runSeries = 0;
      let runSamples = 0;
      for (const outcome of outcomes) {
        switch (outcome.kind) {
          case 'ingested': {
            artifactsProcessed++;
            runSeries += outcome.seriesCount;
            runSamples += outcome.samplesInserted;
            pointsLinked += outcome.pointsLinked;
            break;
          }
          case 'unmatched': {
            unmatchedArtifacts++;
            break;
          }
          case 'empty': {
            emptyArtifacts++;
            break;
          }
          case 'failed': {
            artifactFailures++;
            break;
          }
        }
      }
      seriesStored += runSeries;
      samplesStored += runSamples;
      console.log(
        `  [${runIndex + 1}/${runs.length}] run ${runId} attempt ${run.run_attempt} (${run.date}): ` +
          `${pairs.length} pair(s), ${runSeries} series, +${runSamples} samples ` +
          `(${((Date.now() - runStart) / 1000).toFixed(1)}s)`,
      );
    } catch (error) {
      runFailures++;
      console.error(`  ✗ run ${runId}:`, error);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log(
    `\n=== backfill complete: ${artifactsProcessed} artifact(s), ${seriesStored} series, ` +
      `${samplesStored} sample(s), ${pointsLinked} point link(s), ` +
      `${unmatchedArtifacts} unmatched artifact(s), ${emptyArtifacts} empty artifact(s), ` +
      `${missingRuns} run(s) without pairs, ${goneRuns} run(s) gone from GitHub, ` +
      `${artifactFailures} failed artifact(s), ${runFailures} failed run(s) ===`,
  );
  console.log('  Point telemetry reads use the stored revision; no manual cache purge is needed.');
  if (artifactFailures > 0 || runFailures > 0) process.exitCode = 1;
}

runBackfillMain('backfill-gpu-metrics', sql, main);
