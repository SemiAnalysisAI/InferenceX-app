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
 *   bun run --cwd packages/db db:backfill-gpu-metrics --stats-only --all --dry-run
 *   bun run --cwd packages/db db:backfill-gpu-metrics --stats-only --run 34557177019 --yes
 *
 * --stats-only upgrades outdated digests from DB samples without GitHub access.
 * It includes all retained attempts and dates unless explicitly filtered.
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
import { ingestGpuMetricsArtifact, refreshGpuMetricStats } from './etl/gpu-metrics-ingest.js';
import { readPowerAuditValidations } from './etl/gpu-metrics-artifacts.js';
import { recoveredPowerAudit } from './etl/power-audit-validations.js';
import {
  benchmarkPublicationIdentity,
  stablePowerPointIdentity,
  type PowerPublicationManifest,
} from './etl/power-publication.js';
import {
  readTelemetryReceipt,
  summarizeTelemetryReceipt,
  telemetryArtifactsForAttempt,
  type TelemetryObservation,
  type TelemetryReceipt,
} from './etl/telemetry-receipt.js';
import { retryArtifactOperation } from './lib/artifact-retry.js';
import {
  checkpointBenchmarkRefresh,
  refreshBackfillBenchmarks,
  type BenchmarkAuditUpdate,
} from './lib/backfill-benchmark-refresh.js';
import {
  confirmProceed,
  listBackfillRunArtifacts,
  parseLimitForceFlags,
  runBackfillMain,
} from './lib/backfill-runner.js';
import { findBenchmarkResultIds, readMappedBenchmarkRows } from './lib/benchmark-result-lookup.js';
import { downloadArtifact, fetchRunMeta } from './lib/github-artifacts.js';
import {
  pairGpuMetricsArtifacts,
  findOutdatedGpuMetricSeries,
  collectMissingTelemetryExpectations,
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
  attempt: number | null;
  artifact: string | null;
  receipt: string | null;
  refreshCacheOnly: boolean;
  statsOnly: boolean;
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

function stringFlag(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
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
    attempt: positiveIntFlag('--attempt'),
    artifact: stringFlag('--artifact'),
    receipt: stringFlag('--receipt'),
    refreshCacheOnly: process.argv.includes('--refresh-cache-only'),
    statsOnly: process.argv.includes('--stats-only'),
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
    from workflow_runs wr
    where exists (select 1 from benchmark_results br where br.workflow_run_id = wr.id)
      and (${flags.run}::bigint is null or wr.github_run_id = ${flags.run})
      and (${flags.fromRun}::bigint is null or wr.github_run_id >= ${flags.fromRun})
      and (${flags.run}::bigint is not null or wr.date >= ${since}::date)
      and ((${flags.attempt}::integer is not null and wr.run_attempt = ${flags.attempt}) or
        (${flags.attempt}::integer is null and not exists (
          select 1 from workflow_runs newer where newer.github_run_id = wr.github_run_id
            and newer.run_attempt > wr.run_attempt)))
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
  | {
      kind: 'ingested';
      seriesCount: number;
      samplesInserted: number;
      pointsLinked: number;
      expectationsUnknown: boolean;
      metadataUpdatedBenchmarkResultIds: number[];
    }
  | { kind: 'unmatched' }
  | { kind: 'failed' };

/** Download one gpu_metrics/bmk pair, resolve its points, and persist the series. */
async function processPair(
  run: CandidateRun,
  pair: GpuMetricsArtifactPair,
  tempDir: string,
  observations: Map<string, TelemetryObservation>,
  expectationErrors: NonNullable<TelemetryReceipt['expectationErrors']>,
  uniqueFallbacks: Map<string, number>,
  checkpointMetadata: (updates: BenchmarkAuditUpdate[]) => Promise<void>,
): Promise<PairOutcome> {
  let benchmarkDir: string | null = null;
  let gpuMetricsDir: string | null = null;
  const pointKeys: string[] = [];
  let expectationsUnknown = false;
  try {
    benchmarkDir = await retryArtifactOperation(`downloading ${pair.benchmarks.name}`, () =>
      downloadArtifact(pair.benchmarks, tempDir),
    );
    const mappedRows = readMappedBenchmarkRows(benchmarkDir, (error) => {
      expectationsUnknown = true;
      expectationErrors.push({
        benchmarkArtifact: pair.benchmarks.name,
        artifactNames: [pair.gpuMetrics.name],
        error,
      });
    });
    for (const row of mappedRows) {
      const identity = benchmarkPublicationIdentity(row);
      const key = stablePowerPointIdentity(identity);
      pointKeys.push(key);
      observations.set(key, { identity, artifactNames: [pair.gpuMetrics.name], produced: true });
    }
    const matchedIds: number[] = [];
    const mappedPoints: { ids: number[]; identity: Record<string, unknown> }[] = [];
    for (const row of mappedRows) {
      const ids = await findBenchmarkResultIds(sql, run, [row], (id) =>
        uniqueFallbacks.set(stablePowerPointIdentity(benchmarkPublicationIdentity(row)), id),
      );
      if (ids.length === 0) throw new Error(`${pair.gpuMetrics.name}: no matching benchmark rows`);
      matchedIds.push(...ids);
      if (row.benchmarkType === 'agentic_traces')
        mappedPoints.push({ ids, identity: benchmarkPublicationIdentity(row) });
    }
    const resultIds = [...new Set(matchedIds)];
    if (resultIds.length === 0) {
      if (expectationsUnknown) return { kind: 'failed' };
      console.warn(`  [WARN] ${pair.gpuMetrics.name}: no matching benchmark rows`);
      return { kind: 'unmatched' };
    }
    gpuMetricsDir = await retryArtifactOperation(`downloading ${pair.gpuMetrics.name}`, () =>
      downloadArtifact(pair.gpuMetrics, tempDir),
    );
    const validations = Object.entries(
      readPowerAuditValidations(gpuMetricsDir, pair.gpuMetrics.name),
    )
      .map(([source, validation]) => ({
        powerAudit: recoveredPowerAudit(source, validation),
        conc: (validation.selected_window as Record<string, unknown> | undefined)?.concurrency,
      }))
      .filter((validation) => validation.powerAudit !== null);
    const auditUpdates: BenchmarkAuditUpdate[] = [];
    for (const point of mappedPoints) {
      const candidates = validations.filter(
        (validation) => validation.conc === point.identity.conc,
      );
      if (candidates.length !== 1) continue;
      const powerAudit = candidates[0]!.powerAudit;
      if (powerAudit)
        auditUpdates.push(
          ...point.ids.map((benchmarkResultId) => ({
            benchmarkResultId,
            identity: point.identity,
            powerAudit,
          })),
        );
    }
    await checkpointMetadata(auditUpdates);
    const ingested = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: run.id,
      artifact: { artifactName: pair.gpuMetrics.name, artifactDir: gpuMetricsDir },
      benchmarkResultIds: resultIds,
    });
    if (ingested.seriesIds.length === 0) {
      throw new Error(`${pair.gpuMetrics.name}: no parseable gpu_metrics CSV`);
    }
    return {
      kind: 'ingested',
      seriesCount: ingested.seriesIds.length,
      samplesInserted: ingested.samplesInserted,
      pointsLinked: resultIds.length,
      expectationsUnknown,
      metadataUpdatedBenchmarkResultIds: ingested.metadataUpdatedBenchmarkResultIds,
    };
  } catch (error) {
    if (pointKeys.length === 0)
      expectationErrors.push({
        benchmarkArtifact: pair.benchmarks.name,
        artifactNames: [pair.gpuMetrics.name],
        error: error instanceof Error ? error.message : String(error),
      });
    for (const key of pointKeys) {
      const observation = observations.get(key)!;
      observation.error = error instanceof Error ? error.message : String(error);
    }
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
  if ((flags.attempt !== null || flags.artifact || flags.receipt) && flags.run === null)
    throw new Error('--attempt, --artifact and --receipt require --run');
  if (
    flags.refreshCacheOnly &&
    (!flags.run || !flags.receipt || flags.artifact || flags.all || flags.dryRun)
  )
    throw new Error(
      '--refresh-cache-only requires --run and --receipt, without --all, --artifact or --dry-run',
    );
  if (flags.refreshCacheOnly && !fs.existsSync(flags.receipt!))
    throw new Error('--refresh-cache-only requires an existing receipt');

  if (flags.statsOnly) {
    if (flags.refreshCacheOnly || flags.receipt || force)
      throw new Error(
        '--stats-only cannot be combined with --refresh-cache-only, --receipt or --force',
      );
    const series = await findOutdatedGpuMetricSeries(sql, flags, limit);
    console.log(`${series.length} outdated digest(s); --limit counts series in --stats-only mode`);
    if (flags.dryRun) {
      console.table(series);
      return;
    }
    if (
      series.length === 0 ||
      !(await confirmProceed('Recompute only these stored telemetry digests?'))
    )
      return;
    for (const row of series) {
      try {
        const updated = await refreshGpuMetricStats(sql, Number(row.id));
        console.log(
          `series ${row.id} run ${row.github_run_id} attempt ${row.run_attempt}: ${updated ? 'updated' : 'current'}`,
        );
      } catch (error) {
        process.exitCode = 1;
        console.error(
          `series ${row.id} failed; retry --stats-only --run ${row.github_run_id} --attempt ${row.run_attempt} --artifact ${row.artifact_name} --yes`,
          error,
        );
      }
    }
    return;
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
    if (flags.attempt !== null || flags.artifact || flags.receipt)
      throw new Error(
        `No persisted benchmark target for run ${flags.run} attempt ${flags.attempt ?? 'latest'}`,
      );
    console.log('\n  Nothing to do.');
    return;
  }

  if (flags.dryRun) {
    let pairedRuns = 0;
    let pairs = 0;
    let goneRuns = 0;
    let failedRuns = 0;
    for (const run of runs) {
      try {
        const repository = repositoryFromRunUrl(run.html_url) ?? DEFAULT_REPO;
        const artifacts = await listBackfillRunArtifacts(repository, run.github_run_id);
        if (artifacts === null) {
          goneRuns++;
          console.log(`  run ${run.github_run_id} (${run.date}): gone from GitHub`);
          continue;
        }
        const runPairs = pairGpuMetricsArtifacts(
          telemetryArtifactsForAttempt(
            artifacts,
            fetchRunMeta(repository, String(run.github_run_id)),
            run.run_attempt,
          ),
        ).filter((pair) => !flags.artifact || pair.gpuMetrics.name === flags.artifact);
        if (runPairs.length > 0) pairedRuns++;
        pairs += runPairs.length;
        console.log(`  run ${run.github_run_id} (${run.date}): ${runPairs.length} pair(s)`);
      } catch (error) {
        if (flags.run !== null) throw error;
        failedRuns++;
        console.error(
          `  run ${run.github_run_id} (${run.date}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    console.log(
      `\n=== dry run: ${runs.length} run(s), ${pairedRuns} with pairs, ${pairs} pair(s), ` +
        `${goneRuns} gone from GitHub, ${failedRuns} failed ===`,
    );
    if (failedRuns > 0) process.exitCode = 1;
    return;
  }

  if (
    !(await confirmProceed(
      flags.refreshCacheOnly
        ? 'Only the recorded benchmark metadata cache will be refreshed.'
        : `${runs.length} workflow run(s) will be checked for gpu_metrics.`,
    ))
  ) {
    return;
  }

  let artifactsProcessed = 0;
  let seriesStored = 0;
  let samplesStored = 0;
  let pointsLinked = 0;
  let unmatchedArtifacts = 0;
  let artifactFailures = 0;
  let runFailures = 0;
  let missingRuns = 0;
  let goneRuns = 0;

  for (const [runIndex, run] of runs.entries()) {
    const runId = run.github_run_id;
    const repository = repositoryFromRunUrl(run.html_url) ?? DEFAULT_REPO;
    const runStart = Date.now();
    const receiptPath =
      flags.receipt ?? `power-publication-${runId}-attempt-${run.run_attempt}.json`;
    const manifest: PowerPublicationManifest = fs.existsSync(receiptPath)
      ? JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
      : { version: 1, runId, runAttempt: run.run_attempt, points: [] };
    if (
      manifest.version !== 1 ||
      manifest.runId !== runId ||
      manifest.runAttempt !== run.run_attempt ||
      !Array.isArray(manifest.points) ||
      (manifest.telemetry &&
        (manifest.telemetry.runId !== runId || manifest.telemetry.runAttempt !== run.run_attempt))
    )
      throw new Error('Publication receipt run/attempt does not match the recovery target');
    const saveReceipt = () => {
      fs.mkdirSync(path.dirname(path.resolve(receiptPath)), { recursive: true });
      const temporary = `${receiptPath}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flush: true });
      fs.renameSync(temporary, receiptPath);
    };
    const refresh = async () => {
      try {
        await refreshBackfillBenchmarks(sql, manifest, saveReceipt);
      } catch (error) {
        process.exitCode = 1;
        console.error(
          `  Benchmark metadata refresh failed; retry --refresh-cache-only --run ${runId} --attempt ${run.run_attempt} --receipt ${receiptPath} --yes`,
          error,
        );
      }
    };
    if (flags.refreshCacheOnly) {
      await refresh();
      continue;
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `gpu-metrics-backfill-${runId}-`));
    const checkpointMetadata = async (updates: BenchmarkAuditUpdate[]) => {
      if (updates.length === 0) return;
      const candidates = await sql<{ id: number; offload_mode: string }[]>`
        select br.id, br.offload_mode from benchmark_results br
        where br.workflow_run_id = ${run.id}
          and br.id = any(${sql.array(updates.map((update) => update.benchmarkResultId))}::bigint[])
          and br.benchmark_type = 'agentic_traces' and br.power_audit is null
      `;
      checkpointBenchmarkRefresh(
        manifest,
        candidates.map((row) => Number(row.id)),
        saveReceipt,
        candidates.map((row) => {
          const update = updates.find((entry) => entry.benchmarkResultId === Number(row.id))!;
          return {
            ...update,
            sourceIdentity: update.identity,
            identity: { ...update.identity, offload_mode: row.offload_mode },
          };
        }),
      );
    };
    const observations = new Map<string, TelemetryObservation>();
    const uniqueFallbacks = new Map<string, number>();
    let recoveryError: string | undefined;
    let expectationErrors: TelemetryReceipt['expectationErrors'];
    try {
      const listedArtifacts = await listBackfillRunArtifacts(repository, runId);
      if (listedArtifacts === null) {
        goneRuns++;
        runFailures++;
        recoveryError = `Run ${runId} attempt ${run.run_attempt} is gone from GitHub`;
        console.log(
          `  [${runIndex + 1}/${runs.length}] run ${runId} attempt ${run.run_attempt}: gone from GitHub`,
        );
        continue;
      }
      const artifacts = telemetryArtifactsForAttempt(
        listedArtifacts,
        fetchRunMeta(repository, String(runId)),
        run.run_attempt,
      );
      const allPairs = pairGpuMetricsArtifacts(artifacts);
      const pairs = allPairs.filter(
        (pair) => !flags.artifact || pair.gpuMetrics.name === flags.artifact,
      );
      // Expectations come from benchmark siblings even when no telemetry was
      // uploaded. Counting only the successful pairs would hide missing points.
      const missing = await collectMissingTelemetryExpectations(
        artifacts,
        allPairs,
        flags.artifact,
        async (artifact, onUnmapped) => {
          let directory: string | null = null;
          try {
            directory = await retryArtifactOperation(`downloading ${artifact.name}`, () =>
              downloadArtifact(artifact, tempDir),
            );
            const rows = readMappedBenchmarkRows(directory, onUnmapped);
            for (const row of rows)
              await findBenchmarkResultIds(sql, run, [row], (id) =>
                uniqueFallbacks.set(
                  stablePowerPointIdentity(benchmarkPublicationIdentity(row)),
                  id,
                ),
              );
            return rows;
          } finally {
            if (directory) fs.rmSync(directory, { recursive: true, force: true });
          }
        },
      );
      for (const observation of missing.observations)
        observations.set(stablePowerPointIdentity(observation.identity), observation);
      expectationErrors = missing.errors;
      artifactFailures += new Set(missing.errors.map((error) => error.benchmarkArtifact)).size;
      if (pairs.length === 0) {
        if (flags.artifact) {
          artifactFailures++;
          recoveryError = `No retained telemetry pair for ${flags.artifact}`;
        }
        missingRuns++;
        console.log(
          `  [${runIndex + 1}/${runs.length}] run ${runId} attempt ${run.run_attempt}: no retained gpu_metrics pairs`,
        );
        continue;
      }

      const limiter = new AsyncSemaphore(flags.parallel);
      const outcomes = await Promise.all(
        pairs.map((pair) =>
          limiter.run(() =>
            processPair(
              run,
              pair,
              tempDir,
              observations,
              missing.errors,
              uniqueFallbacks,
              checkpointMetadata,
            ),
          ),
        ),
      );
      let runSeries = 0;
      let runSamples = 0;
      for (const outcome of outcomes) {
        switch (outcome.kind) {
          case 'ingested': {
            artifactsProcessed++;
            if (outcome.expectationsUnknown) artifactFailures++;
            runSeries += outcome.seriesCount;
            runSamples += outcome.samplesInserted;
            pointsLinked += outcome.pointsLinked;
            checkpointBenchmarkRefresh(
              manifest,
              outcome.metadataUpdatedBenchmarkResultIds,
              saveReceipt,
            );
            break;
          }
          case 'unmatched': {
            unmatchedArtifacts++;
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
      recoveryError = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ run ${runId}:`, error);
    } finally {
      manifest.telemetry = await readTelemetryReceipt(
        sql,
        { runId, runAttempt: run.run_attempt },
        [...observations.values()],
        { previous: manifest.telemetry, targeted: Boolean(flags.artifact), uniqueFallbacks },
      );
      if (recoveryError) {
        const priorError = manifest.telemetry.recoveryError;
        const priorScope = manifest.telemetry.recoveryArtifactNames;
        manifest.telemetry.recoveryError = [
          ...new Set([priorError, recoveryError].filter(Boolean).join('\n').split('\n')),
        ].join('\n');
        if (flags.artifact && (!priorError || priorScope))
          manifest.telemetry.recoveryArtifactNames = [
            ...new Set([...(priorScope ?? []), flags.artifact]),
          ];
        else delete manifest.telemetry.recoveryArtifactNames;
      }
      if (expectationErrors) {
        const failedBenchmarks = new Set(expectationErrors.map((error) => error.benchmarkArtifact));
        manifest.telemetry.expectationErrors = [
          ...(manifest.telemetry.expectationErrors ?? []).filter(
            (error) => !failedBenchmarks.has(error.benchmarkArtifact),
          ),
          ...expectationErrors,
        ];
      }
      summarizeTelemetryReceipt(manifest.telemetry);
      saveReceipt();
      if (manifest.benchmarkRefresh && manifest.benchmarkRefresh.status !== 'complete')
        await refresh();
      console.log(`  PowerX ingest receipt: ${receiptPath}`);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log(
    `\n=== backfill complete: ${artifactsProcessed} artifact(s), ${seriesStored} series, ` +
      `${samplesStored} sample(s), ${pointsLinked} point link(s), ` +
      `${unmatchedArtifacts} unmatched artifact(s), ` +
      `${missingRuns} run(s) without pairs, ${goneRuns} run(s) gone from GitHub, ` +
      `${artifactFailures} failed artifact(s), ${runFailures} failed run(s) ===`,
  );
  console.log(
    '  Point telemetry reads use the stored revision; API verification is recorded separately.',
  );
  if (artifactFailures > 0 || runFailures > 0) process.exitCode = 1;
}

runBackfillMain('backfill-gpu-metrics', sql, main);
