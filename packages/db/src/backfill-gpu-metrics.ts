/**
 * Backfill or repair PowerX telemetry (`gpu_metrics_<suffix>` artifacts, or the
 * `power_audit_<suffix>` bundle of a suffix without one) in the migration-016
 * tables from a run's GitHub artifacts.
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
 *   bun run --cwd packages/db db:backfill-gpu-metrics --all --dry-run
 *   bun run --cwd packages/db db:backfill-gpu-metrics --all --force --limit 20 --yes
 *
 * --all skips runs that already have a stored series unless --force is passed;
 * --run selects its run either way. --force also replaces the stored samples of
 * unchanged series, so a parser fix reaches runs whose artifacts GitHub retains.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { hasNoSslFlag } from './cli-utils.js';
import { AsyncSemaphore } from './etl/async-semaphore.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { ingestGpuMetricsArtifact } from './etl/gpu-metrics-ingest.js';
import { readPowerAuditValidations } from './etl/gpu-metrics-artifacts.js';
import type { RecoveredPowerAudit } from './etl/power-audit-validations.js';
import {
  agentxWindowPlan,
  applyAgentxAudits,
  attachAgentxAudits,
  type AgentxAuditWrite,
} from './etl/power-audit-recovery.js';
import {
  benchmarkPublicationIdentity,
  stablePowerPointIdentity,
  type PowerPublicationManifest,
} from './etl/power-publication.js';
import {
  readTelemetryReceipt,
  telemetryArtifactsForAttempt,
  type TelemetryObservation,
  type TelemetryReceipt,
} from './etl/telemetry-receipt.js';
import { retryArtifactOperation } from './lib/artifact-retry.js';
import {
  confirmProceed,
  listBackfillRunArtifacts,
  runBackfillMain,
} from './lib/backfill-runner.js';
import {
  filterPurgedBenchmarkRows,
  findBenchmarkResultIds,
  readMappedBenchmarkRows,
} from './lib/benchmark-result-lookup.js';
import { downloadArtifact, fetchRunMeta } from './lib/github-artifacts.js';
import {
  pairGpuMetricsArtifacts,
  collectMissingTelemetryExpectations,
  type GpuMetricsArtifactPair,
} from './lib/gpu-metrics-backfill.js';
import { repositoryFromRunUrl } from './lib/runtime-metadata-artifacts.js';

const DEFAULT_REPO = 'SemiAnalysisAI/InferenceX';
const GITHUB_RETENTION_DAYS = 90;
const PAIR_CONCURRENCY = 4;
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
  force: boolean;
  limit: number | null;
  run: number | null;
  attempt: number | null;
  artifact: string | null;
  receipt: string | null;
}

function positiveInt(flag: string, value: string | undefined): number | null {
  if (value === undefined) return null;
  if (!/^\d+$/u.test(value) || Number(value) <= 0) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return Number(value);
}

function nonEmpty(flag: string, value: string | undefined): string | null {
  if (value === '') throw new Error(`${flag} requires a value`);
  return value ?? null;
}

/**
 * Strict, so an unknown flag stops the run before any database work instead of
 * being ignored. `--yes` and `--no-ssl` are read by the shared CLI helpers; they
 * are declared here only so strict parsing accepts them.
 */
function parseFlags(args: string[]): BackfillFlags {
  const { values } = parseArgs({
    args,
    options: {
      all: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      force: { type: 'boolean' },
      limit: { type: 'string' },
      run: { type: 'string' },
      attempt: { type: 'string' },
      artifact: { type: 'string' },
      receipt: { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
      'no-ssl': { type: 'boolean' },
    },
  });
  return {
    all: values.all ?? false,
    dryRun: values['dry-run'] ?? false,
    force: values.force ?? false,
    limit: positiveInt('--limit', values.limit),
    run: positiveInt('--run', values.run),
    attempt: positiveInt('--attempt', values.attempt),
    artifact: nonEmpty('--artifact', values.artifact),
    receipt: nonEmpty('--receipt', values.receipt),
  };
}

async function loadCandidateRuns(flags: BackfillFlags): Promise<CandidateRun[]> {
  const cutoff = new Date(Date.now() - GITHUB_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rows = await sql<CandidateRun[]>`
    select wr.id, wr.github_run_id, wr.run_attempt, wr.html_url, wr.date::text as date,
      (select count(*)::int from gpu_metric_series s where s.workflow_run_id = wr.id) as series_count
    from workflow_runs wr
    where exists (select 1 from benchmark_results br where br.workflow_run_id = wr.id)
      and (${flags.run}::bigint is null or wr.github_run_id = ${flags.run})
      and (${flags.run}::bigint is not null or wr.date >= ${cutoff}::date)
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
    .filter((row) => flags.force || flags.run !== null || row.series_count === 0);
  return flags.limit === null ? candidates : candidates.slice(0, flags.limit);
}

function readReceipt(receiptPath: string, run: CandidateRun): PowerPublicationManifest {
  const runId = run.github_run_id;
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
  return manifest;
}

function writeReceipt(receiptPath: string, manifest: PowerPublicationManifest): void {
  fs.mkdirSync(path.dirname(path.resolve(receiptPath)), { recursive: true });
  const temporary = `${receiptPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flush: true });
  fs.renameSync(temporary, receiptPath);
}

/**
 * The verifier compares the receipt with the database, so a merged CI receipt
 * that expected no audit must expect the one recovered here. Match by stored
 * identity: after the offload fallback, the mapped identity differs from it.
 */
async function expectRecoveredAudits(
  manifest: PowerPublicationManifest,
  audits: readonly AgentxAuditWrite[],
): Promise<void> {
  if (audits.length === 0 || manifest.points.length === 0) return;
  const rows = await sql<Record<string, unknown>[]>`
    select c.*, br.id, br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode,
      br.recipe_fingerprint
    from benchmark_results br join configs c on c.id = br.config_id
    where br.id = any(${sql.array(audits.map((audit) => audit.benchmarkResultId))}::bigint[])
  `;
  for (const row of rows) {
    const identity = stablePowerPointIdentity(row);
    const { powerAudit } = audits.find((audit) => audit.benchmarkResultId === Number(row.id))!;
    for (const point of manifest.points) {
      if (
        (point.power_audit === null || point.power_audit === undefined) &&
        stablePowerPointIdentity(point.identity) === identity
      )
        point.power_audit = powerAudit;
    }
  }
}

type PairOutcome =
  | {
      kind: 'ingested';
      seriesCount: number;
      samplesInserted: number;
      pointsLinked: number;
      expectationsUnknown: boolean;
      audits: AgentxAuditWrite[];
      auditsWritten: number;
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
  replace: boolean,
): Promise<PairOutcome> {
  let benchmarkDir: string | null = null;
  let gpuMetricsDir: string | null = null;
  const pointKeys: string[] = [];
  let expectationsUnknown = false;
  try {
    benchmarkDir = await retryArtifactOperation(`downloading ${pair.benchmarks.name}`, () =>
      downloadArtifact(pair.benchmarks, tempDir),
    );
    const mappedRows = await filterPurgedBenchmarkRows(
      sql,
      run,
      readMappedBenchmarkRows(
        benchmarkDir,
        (error) => {
          expectationsUnknown = true;
          expectationErrors.push({
            benchmarkArtifact: pair.benchmarks.name,
            artifactNames: [pair.gpuMetrics.name],
            error,
          });
        },
        run.github_run_id,
      ),
    );
    for (const row of mappedRows) {
      const identity = benchmarkPublicationIdentity(row);
      const key = stablePowerPointIdentity(identity);
      pointKeys.push(key);
      observations.set(key, { identity, artifactNames: [pair.gpuMetrics.name], produced: true });
    }
    const matchedIds: number[] = [];
    const agenticPoints: {
      id: number;
      benchmarkType: string;
      conc: number;
      powerAudit?: RecoveredPowerAudit;
    }[] = [];
    for (const row of mappedRows) {
      const ids = await findBenchmarkResultIds(sql, run, [row], (id) =>
        uniqueFallbacks.set(stablePowerPointIdentity(benchmarkPublicationIdentity(row)), id),
      );
      if (ids.length === 0) throw new Error(`${pair.gpuMetrics.name}: no matching benchmark rows`);
      matchedIds.push(...ids);
      if (row.benchmarkType === 'agentic_traces') {
        for (const id of ids)
          agenticPoints.push({ id, benchmarkType: row.benchmarkType, conc: row.conc });
      }
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
    // One plan per pair: the bundle's retained windows attached to the single
    // stored point at each concurrency.
    const plan = agentxWindowPlan(readPowerAuditValidations(gpuMetricsDir, pair.gpuMetrics.name));
    const attached = attachAgentxAudits(plan, agenticPoints, (point) => `benchmark ${point.id}`);
    for (const refusal of attached.refused) {
      console.warn(
        `  [WARN] ${pair.gpuMetrics.name}: retained window at concurrency ${refusal.concurrency} ` +
          `covers ${refusal.points.join(', ')}; provenance withheld`,
      );
    }
    const audits: AgentxAuditWrite[] = attached.points.flatMap((point) =>
      point.powerAudit ? [{ benchmarkResultId: point.id, powerAudit: point.powerAudit }] : [],
    );
    const ingested = await ingestGpuMetricsArtifact(sql, {
      workflowRunId: run.id,
      artifact: { artifactName: pair.gpuMetrics.name, artifactDir: gpuMetricsDir },
      benchmarkResultIds: resultIds,
      replace,
    });
    if (ingested.seriesIds.length === 0) {
      throw new Error(`${pair.gpuMetrics.name}: no parseable gpu_metrics CSV`);
    }
    // Provenance is written only after every host series is stored and linked.
    const written = await applyAgentxAudits(sql, { workflowRunId: run.id, writes: audits });
    return {
      kind: 'ingested',
      seriesCount: ingested.seriesIds.length,
      samplesInserted: ingested.samplesInserted,
      pointsLinked: resultIds.length,
      expectationsUnknown,
      audits,
      auditsWritten: written.length,
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
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.all && flags.run === null) {
    throw new Error('Pass --run <github run id> or --all');
  }
  if ((flags.attempt !== null || flags.artifact || flags.receipt) && flags.run === null)
    throw new Error('--attempt, --artifact and --receipt require --run');

  console.log('=== backfill-gpu-metrics ===');
  const runs = await loadCandidateRuns(flags);
  console.log(`  ${runs.length} candidate run(s)`);
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

  if (!(await confirmProceed(`${runs.length} workflow run(s) will be checked for gpu_metrics.`))) {
    return;
  }

  let artifactsProcessed = 0;
  let seriesStored = 0;
  let samplesStored = 0;
  let pointsLinked = 0;
  let auditsWritten = 0;
  let unmatchedArtifacts = 0;
  let artifactFailures = 0;
  let runFailures = 0;
  let missingRuns = 0;
  let goneRuns = 0;

  for (const [runIndex, run] of runs.entries()) {
    const runId = run.github_run_id;
    const repository = repositoryFromRunUrl(run.html_url) ?? DEFAULT_REPO;
    const runStart = Date.now();
    const manifest = flags.receipt === null ? null : readReceipt(flags.receipt, run);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `gpu-metrics-backfill-${runId}-`));
    const observations = new Map<string, TelemetryObservation>();
    const uniqueFallbacks = new Map<string, number>();
    const audits: AgentxAuditWrite[] = [];
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
      // Receipt expectations come from benchmark siblings even when no telemetry
      // was uploaded. Counting only the successful pairs would hide missing points.
      const missing =
        flags.receipt === null
          ? { observations: [], errors: [] }
          : await collectMissingTelemetryExpectations(
              artifacts,
              allPairs,
              flags.artifact,
              async (artifact, onUnmapped) => {
                let directory: string | null = null;
                try {
                  directory = await retryArtifactOperation(`downloading ${artifact.name}`, () =>
                    downloadArtifact(artifact, tempDir),
                  );
                  const rows = await filterPurgedBenchmarkRows(
                    sql,
                    run,
                    readMappedBenchmarkRows(directory, onUnmapped, run.github_run_id),
                  );
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

      const limiter = new AsyncSemaphore(PAIR_CONCURRENCY);
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
              flags.force,
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
            audits.push(...outcome.audits);
            auditsWritten += outcome.auditsWritten;
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
      if (flags.receipt !== null && manifest !== null) {
        await expectRecoveredAudits(manifest, audits);
        manifest.telemetry = await readTelemetryReceipt(
          sql,
          { runId, runAttempt: run.run_attempt },
          [...observations.values()],
          {
            previous: manifest.telemetry,
            targeted: Boolean(flags.artifact),
            uniqueFallbacks,
            recoveryError,
            recoveryArtifactName: flags.artifact,
            expectationErrors,
          },
        );
        writeReceipt(flags.receipt, manifest);
        console.log(`  PowerX ingest receipt: ${flags.receipt}`);
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // latest_benchmarks copies the AgentX audits; refresh even when this run wrote
  // none, so rerunning after an interrupted write still publishes them.
  await refreshLatestBenchmarks(sql);
  console.log(
    `\n=== backfill complete: ${artifactsProcessed} artifact(s), ${seriesStored} series, ` +
      `${samplesStored} sample(s), ${pointsLinked} point link(s), ` +
      `${auditsWritten} AgentX audit(s) written, ${unmatchedArtifacts} unmatched artifact(s), ` +
      `${missingRuns} run(s) without pairs, ${goneRuns} run(s) gone from GitHub, ` +
      `${artifactFailures} failed artifact(s), ${runFailures} failed run(s) ===`,
  );
  console.log(
    '  Refresh the API cache: bun run admin:cache:invalidate <origin> && bun run admin:cache:warmup <origin>',
  );
  if (artifactFailures > 0 || runFailures > 0) process.exitCode = 1;
}

runBackfillMain('backfill-gpu-metrics', sql, main);
