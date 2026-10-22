import fs from 'fs';
import {
  powerPublicationPoint,
  unmappedPowerResultIssue,
  publicationIdentity,
  benchmarkPublicationIdentity,
  stablePowerPointIdentity,
  type PowerPublicationPoint,
} from './etl/power-publication';
import os from 'os';
import path from 'path';

import { GPU_KEYS } from '@semianalysisai/inferencex-constants';

import { hasNoSslFlag, requireIngestRepo } from './cli-utils';
import {
  assertRequestedRunAttempt,
  dedupeArtifactsByLogicalName,
  downloadArtifact,
  fetchRunAttempt,
  listRunArtifacts,
} from './lib/github-artifacts';
import { pairServerLogArtifacts } from './lib/server-log-backfill';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils';
import {
  applyChangelogBackfills,
  isRunAttemptPurged,
  planBenchmarkPoint,
  validateRunBackfills,
} from './etl/run-overrides';
import { createSkipTracker } from './etl/skip-tracker';
import {
  buildDatabaseWriteReceipt,
  buildPowerPublicationManifest,
  configWriteFailurePublicationError,
} from './etl/ingest-receipts';
import { printIngestSummaryFooter } from './etl/ingest-summary';
import { createConfigCache } from './etl/config-cache';
import { createWorkflowRunServices } from './etl/workflow-run';
import {
  flattenReusedIngestArtifactBundle,
  readReusedIngestMetadata,
} from './etl/reused-ingest-metadata';
import type { BenchmarkParams } from './etl/benchmark-mapper';
import { readBenchmarkArtifacts, type BenchmarkArtifactFile } from './etl/benchmark-artifacts';
import {
  benchmarkPointKey,
  describeRetryCopySelection,
  dropSupersededJobCopies,
  perJobPointKeys,
} from './etl/retry-copies';
import { preflightRequiredPowerCurves } from './etl/required-power-curve';
import {
  assertRequiredPowerPointsRetained,
  verifyRequiredPowerArtifacts,
} from './etl/required-power-publication';
import {
  bulkIngestBenchmarkRows,
  bulkIngestRunStats,
  bulkUpsertAvailability,
  insertServerLogFilePaths,
} from './etl/benchmark-ingest';
import { findUnlinkedTraceReplayIds, persistPreparedTraceReplay } from './etl/trace-replay-ingest';
import {
  resolveTraceReplayWorkerCount,
  TraceReplayWorkerPool,
} from './etl/trace-replay-worker-pool';
import { AsyncSemaphore } from './etl/async-semaphore';
import { withTransientDbRetry } from './etl/db-retry';
import { discoverTraceReplayArtifacts } from './etl/trace-artifact-discovery';
import {
  discoverServerLogArtifacts,
  listServerLogFilePaths,
  serverLogArtifactRoot,
} from './etl/server-log-artifacts';
import {
  discoverGpuMetricsArtifacts,
  expectedTelemetryArtifactNames,
  readPowerAuditValidations,
} from './etl/gpu-metrics-artifacts';
import {
  agentxWindowPlan,
  attachAgentxAudits,
  type AgentxWindowPlan,
} from './etl/power-audit-recovery';
import {
  gpuMetricsArtifactHoldsTelemetry,
  ingestGpuMetricsArtifact,
} from './etl/gpu-metrics-ingest';
import { readTelemetryReceipt, type TelemetryObservation } from './etl/telemetry-receipt';
import { datasetSlugFromBenchmarkRow } from './etl/dataset-provenance';
import { mapAggEvalRow, mapEvalRow } from './etl/eval-mapper';
import { ingestEvalRow } from './etl/eval-ingest';
import { mapEvalSamples } from './etl/eval-samples-mapper';
import { bulkIngestEvalSamples } from './etl/eval-samples-ingest';
import {
  type ChangelogEntry,
  parseChangelogEntries,
  ingestChangelogEntries,
  hasAppendOnlyFlag,
  hasEvalsOnlyFlag,
} from './etl/changelog-ingest';

const powerPublicationPoints = new Map<string, PowerPublicationPoint>();
const powerPublicationErrors: string[] = [];
const powerPublicationWarnings: string[] = [];
const telemetryObservations = new Map<string, TelemetryObservation>();
const telemetryNotCollectedArtifacts = new Set<string>();
let telemetryExpectationsUnknown = false;
let checkTelemetry = false;
const tracker = createSkipTracker();
const isDownloadMode = process.argv[2] === '--download';

let artifactsDir: string;
let runIdStr: string;
let runAttemptNum: number;
let REPO: string;
let tempDir: string | null = null;

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'none';
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(1)} GiB`;
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

function fileSize(pathname: string | null | undefined): number | null {
  if (!pathname) return null;
  try {
    return fs.statSync(pathname).size;
  } catch {
    return null;
  }
}

if (isDownloadMode) {
  const args = process.argv.slice(3).filter((a) => a !== '--');
  const input = args[0];
  if (!input) {
    console.error('Usage: bun run admin:db:ingest:run <run-url-or-id> [repo]');
    process.exit(1);
  }

  const match = input.match(/\/runs\/(?<runId>\d+)/u);
  const parsedId = match ? match[1] : /^\d+$/u.test(input) ? input : null;
  if (!parsedId) {
    console.error(`Could not parse run ID from: ${input}`);
    process.exit(1);
  }

  runIdStr = parsedId;
  REPO =
    args[1] ??
    input.match(/^https:\/\/github\.com\/(?<repo>[^/]+\/[^/]+)\/actions\/runs\/\d+/u)?.[1] ??
    requireIngestRepo();

  runAttemptNum = fetchRunAttempt(REPO, runIdStr);
  assertRequestedRunAttempt(input, runAttemptNum);

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
  artifactsDir = tempDir;

  console.log('=== ingest-run (download mode) ===');
  console.log(`  Run ID: ${runIdStr}`);
  console.log(`  Repo:   ${REPO}`);
  console.log(`\n--- Downloading artifacts to ${artifactsDir} ---`);

  const artifacts = listRunArtifacts(REPO, runIdStr);
  const byLogical = dedupeArtifactsByLogicalName(artifacts);
  for (const [key, artifact] of byLogical) {
    if (
      artifact.name.startsWith('server_logs_') ||
      artifact.name.startsWith('multinode_server_logs_')
    ) {
      byLogical.delete(key);
    }
  }
  const selectedBenchmarkNames = new Set(
    [...byLogical.values()]
      .filter((artifact) => artifact.name.startsWith('bmk_'))
      .map((artifact) => artifact.name),
  );
  for (const pair of pairServerLogArtifacts(artifacts)) {
    if (selectedBenchmarkNames.has(pair.benchmarks.name)) {
      byLogical.set(`server-log:${pair.serverLogs.name}`, pair.serverLogs);
    }
  }

  for (const artifact of byLogical.values()) {
    console.log(`  ${artifact.name}`);
    downloadArtifact(artifact, artifactsDir);
  }

  console.log(`\n  Downloaded ${byLogical.size} artifact(s)`);
  for (const line of describeRetryCopySelection(
    dropSupersededJobCopies(artifactsDir, byLogical.values(), runIdStr),
  )) {
    console.log(line);
  }
} else {
  for (const key of [
    'DATABASE_WRITE_URL',
    'GITHUB_TOKEN',
    'INGEST_RUN_ID',
    'INGEST_ARTIFACTS_PATH',
    'INGEST_REPO',
  ]) {
    if (!process.env[key]) {
      console.error(`${key} is required`);
      process.exit(1);
    }
  }

  runIdStr = process.env.INGEST_RUN_ID!;
  runAttemptNum = parseInt(process.env.INGEST_RUN_ATTEMPT ?? '1', 10);
  artifactsDir = process.env.INGEST_ARTIFACTS_PATH!;
  REPO = process.env.INGEST_REPO!;
}

if (!process.env.DATABASE_WRITE_URL || !process.env.GITHUB_TOKEN) {
  console.error('DATABASE_WRITE_URL and GITHUB_TOKEN are required');
  process.exit(1);
}

const flattenedReusedArtifacts = flattenReusedIngestArtifactBundle(artifactsDir);
const requestedRunIdStr = runIdStr;
const requestedRunAttemptNum = runAttemptNum;
const reusedIngestMetadata = readReusedIngestMetadata(artifactsDir);
if (reusedIngestMetadata) {
  runIdStr = reusedIngestMetadata.sourceRunId;
  runAttemptNum = reusedIngestMetadata.sourceRunAttempt;
}

const runIdNum = parseInt(runIdStr, 10);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 5,
  idle_timeout: 60,
});

const ARTIFACT_NAMES = {
  runStats: 'run-stats',
  evals: 'eval_results_all',
  changelog: 'changelog-metadata',
} as const;

const stripBmkAndAgenticPrefix = (s: string): string =>
  s.replace(/^bmk_/u, '').replace(/^agentic_/u, '');

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error: any) {
    console.warn(`  [WARN] Failed to parse ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

function findJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

async function main(): Promise<void> {
  if (isRunAttemptPurged(runIdNum, runAttemptNum)) {
    console.log(
      `  Run ${runIdStr} attempt ${runAttemptNum} is purged via run-overrides — skipping.`,
    );
    return;
  }

  validateRunBackfills();
  checkTelemetry = true;
  const configCache = createConfigCache(sql);
  const { getOrCreateConfig, preloadConfigs } = configCache;
  const { fetchGithubRun, getOrCreateWorkflowRun } = createWorkflowRunServices(sql, GITHUB_TOKEN, [
    REPO,
  ]);

  const runId = parseInt(runIdStr, 10);
  const ghInfo = await fetchGithubRun(runId);
  const triggerRunIdStr = reusedIngestMetadata?.triggerRunId ?? requestedRunIdStr;
  const triggerRunId = parseInt(triggerRunIdStr, 10);
  const triggerGhInfo = reusedIngestMetadata ? await fetchGithubRun(triggerRunId) : null;
  const workflowGhInfo =
    reusedIngestMetadata && ghInfo && triggerGhInfo
      ? {
          ...ghInfo,
          createdAt: triggerGhInfo.createdAt || ghInfo.createdAt,
          runStartedAt: triggerGhInfo.runStartedAt ?? ghInfo.runStartedAt,
        }
      : ghInfo;

  console.log('\n=== ingest-ci-run ===');
  console.log(`  Run ID:      ${runIdStr}`);
  console.log(`  Attempt:     ${runAttemptNum}`);
  if (flattenedReusedArtifacts.length > 0) {
    console.log(`  Flattened:   ${flattenedReusedArtifacts.toSorted().join(', ')}`);
  }
  if (reusedIngestMetadata) {
    const triggerAttempt =
      reusedIngestMetadata.triggerRunAttempt === undefined
        ? requestedRunAttemptNum
        : reusedIngestMetadata.triggerRunAttempt;
    console.log(`  Reuse Meta:  ${reusedIngestMetadata.metadataPath}`);
    console.log(`  Trigger Run: ${reusedIngestMetadata.triggerRunId ?? requestedRunIdStr}`);
    console.log(`  Trigger Att: ${triggerAttempt}`);
  }
  console.log(`  Artifacts:   ${artifactsDir}`);
  console.log(`  Repo:        ${REPO}`);
  const runUrl = workflowGhInfo?.htmlUrl ?? reusedIngestMetadata?.sourceRunUrl;
  if (runUrl) {
    console.log(`  Run URL:     ${runUrl}/attempts/${runAttemptNum}`);
  }
  if (workflowGhInfo?.pullRequests && workflowGhInfo.pullRequests.length > 0) {
    for (const pr of workflowGhInfo.pullRequests) {
      console.log(`  PR #${pr.number}:      ${pr.htmlUrl}`);
    }
  }

  let benchmarkFilesRead: BenchmarkArtifactFile[] | undefined;
  const benchmarkFiles = () =>
    (benchmarkFilesRead ??= readBenchmarkArtifacts(artifactsDir, {
      runId: runIdStr,
      tracker,
    }));

  const powerSource = {
    runId,
    runAttempt: runAttemptNum,
    headSha: ghInfo?.headSha ?? null,
  };
  const requiredPower = verifyRequiredPowerArtifacts(
    artifactsDir,
    powerSource,
    process.env.INGEST_REQUIRE_POWER === 'true',
    benchmarkFiles,
  );
  if (requiredPower)
    console.log(
      `  Required power: ${requiredPower.points.length} source benchmark points verified`,
    );

  await preloadConfigs();
  console.log(`  ${configCache.size} configs preloaded`);

  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`Artifacts directory does not exist: ${artifactsDir}`);
  }

  const date = workflowGhInfo?.createdAt
    ? workflowGhInfo.createdAt.split('T')[0]
    : new Date().toISOString().split('T')[0];

  const changelogDir = path.join(artifactsDir, ARTIFACT_NAMES.changelog);
  const changelogFiles = findJsonFiles(changelogDir);
  const parsedChangelogs: {
    baseRef: string;
    headRef: string;
    entries: ChangelogEntry[];
  }[] = [];
  for (const file of changelogFiles) {
    const data = readJson(file) as Record<string, any> | null;
    if (!data || typeof data !== 'object') continue;
    const baseRef = String(data.base_ref ?? '');
    const headRef = String(data.head_ref ?? '');
    if (!baseRef || !headRef) continue;
    const entries = parseChangelogEntries(data.entries);
    if (entries.length > 0) parsedChangelogs.push({ baseRef, headRef, entries });
  }
  if (parsedChangelogs.length === 0) {
    const headRef = workflowGhInfo?.headBranch ?? workflowGhInfo?.headSha ?? `run-${runIdStr}`;
    const fallbackDescription =
      workflowGhInfo?.name?.trim() ||
      workflowGhInfo?.headCommitMessage?.trim().split('\n')[0]?.trim() ||
      `GitHub Actions run ${runIdStr}`;

    parsedChangelogs.push({
      baseRef: 'unknown',
      headRef,
      entries: [
        {
          configKeys: [],
          description: fallbackDescription,
          prLink: null,
          evalsOnly: false,
          appendOnly: false,
        },
      ],
    });
    console.log(
      `  No changelog metadata artifact found; using fallback changelog: ${fallbackDescription}`,
    );
  }
  const { changelogs, backfillIds: changelogBackfillIds } = applyChangelogBackfills(
    runIdNum,
    runAttemptNum,
    parsedChangelogs,
  );
  for (const backfillId of changelogBackfillIds) {
    console.log(`  Applied changelog backfill ${backfillId}`);
  }
  const appendOnly = hasAppendOnlyFlag(changelogs);
  const evalsOnly = hasEvalsOnlyFlag(changelogs);
  if (evalsOnly && requiredPower)
    throw new Error('Required power: benchmark scope cannot be published as an evals-only run');

  if (requiredPower)
    await preflightRequiredPowerCurves(sql, requiredPower, benchmarkFiles(), powerSource, {
      date,
      runStartedAt: workflowGhInfo?.runStartedAt ?? null,
      appendOnly,
    });

  const workflowRunId = await getOrCreateWorkflowRun({
    githubRunId: runId,
    runAttempt: runAttemptNum,
    name: workflowGhInfo?.name || `CI Run ${runIdStr}`,
    date,
    headBranch: workflowGhInfo?.headBranch,
    headSha: workflowGhInfo?.headSha,
    htmlUrl: reusedIngestMetadata?.sourceRunUrl,
    createdAt: workflowGhInfo?.createdAt || triggerGhInfo?.createdAt || new Date().toISOString(),
    appendOnly,
    ghInfo: workflowGhInfo,
  });
  if (workflowRunId === null) {
    console.log(
      `  Run ${runId} attempt ${runAttemptNum} is purged via run-overrides — skipping ingest.`,
    );
    return;
  }
  console.log(`  Workflow run DB id: ${workflowRunId}`);

  const availRows: {
    model: string;
    isl: number | null;
    osl: number | null;
    precision: string;
    hardware: string;
    framework: string;
    specMethod: string;
    disagg: boolean;
    benchmarkType: string;
  }[] = [];

  let totalNewBmk = 0,
    totalDupBmk = 0;
  let totalNewStats = 0,
    totalDupStats = 0;
  let totalEvals = 0;
  let totalSamples = 0;
  let totalSampleFiles = 0;
  let totalChangelogs = 0;
  let totalTraceReplayLinked = 0;
  let totalGpuMetricSeries = 0;
  let totalGpuMetricSamples = 0;
  const datasetSlugs = new Set<string>();
  const missingDatasets = new Set<string>();

  if (evalsOnly) {
    console.log('\n  ⚠ evals-only run detected — skipping benchmark and stats ingest');
  }

  console.log('\n--- Benchmark Results ---');
  const retainedPowerPoints: BenchmarkParams[] = [];
  if (evalsOnly) {
    console.log('  Skipped (evals-only run)');
  } else {
    const serverLogArtifacts = discoverServerLogArtifacts(artifactsDir);
    if (serverLogArtifacts.size > 0) {
      console.log(`  Found ${serverLogArtifacts.size} server log artifact(s)`);
    }
    const gpuMetricsArtifacts = discoverGpuMetricsArtifacts(artifactsDir);
    if (gpuMetricsArtifacts.size > 0) {
      console.log(`  Found ${gpuMetricsArtifacts.size} telemetry artifact(s)`);
    }

    const traceReplayPaths = discoverTraceReplayArtifacts(artifactsDir);
    if (traceReplayPaths.size > 0) {
      console.log(`  Found ${traceReplayPaths.size} trace_replay sibling artifact(s)`);
    }
    const traceWorkerCount = resolveTraceReplayWorkerCount();
    const traceWorkerPool = new TraceReplayWorkerPool(traceWorkerCount);
    const traceUploadLimiter = new AsyncSemaphore(Math.min(2, traceWorkerCount));
    const traceTasks: Promise<void>[] = [];
    if (traceReplayPaths.size > 0) {
      console.log(
        `  Trace preparation: ${traceWorkerCount} worker(s) across ${os.availableParallelism()} vCPU(s), ` +
          `${Math.min(2, traceWorkerCount)} concurrent upload(s)`,
      );
    }

    const files = benchmarkFiles();
    const expectedRunArtifacts = [
      ...new Set(
        files.flatMap((file) => {
          const parentDir = path.posix.basename(path.posix.dirname(file.path));
          const artifact =
            gpuMetricsArtifacts.get(parentDir.replace(/^bmk_/u, '')) ??
            gpuMetricsArtifacts.get(stripBmkAndAgenticPrefix(parentDir));
          return artifact ? [artifact.artifactName] : [];
        }),
      ),
    ].sort();
    const seenPointIdentities = new Map<string, string>();
    console.log(`  Found ${files.length} benchmark JSON file(s)`);
    const perJobPoints = perJobPointKeys(files);

    for (const [fileIndex, file] of files.entries()) {
      const fileStart = Date.now();
      const relativeFile = file.path;
      console.log(
        `  [${fileIndex + 1}/${files.length}] ${relativeFile} (${formatBytes(file.bytes)})`,
      );
      if (file.unreadable !== undefined) {
        console.warn(`  [WARN] Failed to parse ${relativeFile}: ${file.unreadable}`);
        telemetryExpectationsUnknown = true;
        powerPublicationErrors.push(`Unreadable benchmark JSON: ${relativeFile}`);
        console.log(`    skipped unreadable JSON (${elapsed(fileStart)})`);
        console.log(`    raw rows: ${file.rows.length + file.nonObjectRows}`);
        continue;
      }
      console.log(`    raw rows: ${file.rows.length + file.nonObjectRows}`);

      for (const { raw } of file.rows) {
        const datasetSlug = datasetSlugFromBenchmarkRow(raw);
        if (datasetSlug) datasetSlugs.add(datasetSlug);
      }

      let fileExpectationsUnknown = file.nonObjectRows > 0;
      const aggregateFile = !file.path.startsWith('bmk_');
      let coveredRows = 0;
      const rows = file.rows.flatMap(({ raw, mapped, failed }) => {
        if (mapped && aggregateFile && perJobPoints.has(benchmarkPointKey(mapped))) {
          coveredRows++;
          return [];
        }
        if (mapped) return [mapped];
        if (!failed) fileExpectationsUnknown = true;
        const issue = unmappedPowerResultIssue(raw, failed, relativeFile);
        if (issue && 'error' in issue) powerPublicationErrors.push(issue.error);
        else if (issue) powerPublicationWarnings.push(issue.warning);
        return [];
      });
      if (fileExpectationsUnknown) telemetryExpectationsUnknown = true;

      console.log(`    mapped rows: ${rows.length}`);
      if (coveredRows > 0) {
        console.log(`    skipped ${coveredRows} row(s) already held by per-job files`);
      }
      if (rows.length === 0) {
        console.log(`    skipped; no mappable rows (${elapsed(fileStart)})`);
        continue;
      }

      const parentDir = path.posix.basename(path.posix.dirname(file.path));
      const configKey = parentDir.replace(/^bmk_/u, '');
      const suffix = stripBmkAndAgenticPrefix(parentDir);
      const gpuMetricsArtifact =
        gpuMetricsArtifacts.get(configKey) ?? gpuMetricsArtifacts.get(suffix);
      let windows: AgentxWindowPlan = new Map();
      if (parentDir.startsWith('bmk_agentic_') && gpuMetricsArtifact) {
        try {
          windows = agentxWindowPlan(
            readPowerAuditValidations(
              gpuMetricsArtifact.artifactDir,
              gpuMetricsArtifact.artifactName,
            ),
          );
        } catch (error) {
          tracker.recordTelemetryError(
            `power audit for ${configKey}`,
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
      const resolved: (BenchmarkParams & { configId: number })[] = [];
      for (const row of rows) {
        let configId: number;
        try {
          configId = await getOrCreateConfig(row.config);
        } catch (error: any) {
          telemetryExpectationsUnknown = true;
          tracker.recordDbError('config', path.posix.basename(file.path), error);
          const publicationError = configWriteFailurePublicationError(row, relativeFile);
          if (publicationError) powerPublicationErrors.push(publicationError);
          continue;
        }
        const plan = planBenchmarkPoint(
          { githubRunId: runIdNum, runAttempt: runAttemptNum },
          { ...row, configId },
          seenPointIdentities,
        );
        if (plan.kind === 'purged') {
          console.log(
            `    skipped purged benchmark point: config ${configId}, ${row.benchmarkType}, ` +
              `isl ${row.isl}, osl ${row.osl}, conc ${row.conc}, offload ${row.offloadMode}, ` +
              `recipe ${row.recipeFingerprint ?? 'legacy'}`,
          );
          continue;
        }
        if (plan.backfillId) {
          console.log(
            `    applied benchmark point backfill ${plan.backfillId}: ` +
              `config ${configId}, conc ${row.conc}`,
          );
        }
        resolved.push(plan.point);
      }
      const attached = attachAgentxAudits(
        windows,
        resolved,
        (point) =>
          `conc ${point.conc}, offload ${point.offloadMode}, recipe ${point.recipeFingerprint ?? 'legacy'}`,
      );
      for (const refusal of attached.refused) {
        tracker.recordTelemetryError(
          `power audit for ${configKey}`,
          new Error(
            `retained window at concurrency ${refusal.concurrency} covers ` +
              `${refusal.points.length} points (${refusal.points.join('; ')}); provenance withheld`,
          ),
        );
      }
      const toInsert = attached.points;
      for (const point of toInsert) {
        const publication = powerPublicationPoint(
          point,
          `https://github.com/${REPO}/actions/runs/${runIdNum}/attempts/${runAttemptNum}`,
          { path: relativeFile, sha256: file.sha256 },
        );
        const identity = benchmarkPublicationIdentity(point);
        const key = stablePowerPointIdentity(identity);
        const sibling = parentDir.startsWith('bmk_');
        if (publication) {
          const id = publicationIdentity(publication.identity);
          if (sibling || !powerPublicationPoints.has(id))
            powerPublicationPoints.set(id, publication);
        }
        if (sibling || !telemetryObservations.has(key)) {
          telemetryObservations.set(key, {
            identity,
            artifactNames: gpuMetricsArtifact
              ? [gpuMetricsArtifact.artifactName]
              : parentDir.startsWith('bmk_')
                ? expectedTelemetryArtifactNames(suffix)
                : [],
            produced: parentDir.startsWith('bmk_') ? Boolean(gpuMetricsArtifact) : null,
          });
        }
      }
      console.log(`    rows with resolved configs: ${toInsert.length}`);

      if (toInsert.length > 0) {
        try {
          const insertStart = Date.now();
          const { newCount, dupCount, insertedIds } = await bulkIngestBenchmarkRows(
            sql,
            toInsert,
            workflowRunId,
            date,
          );
          console.log(
            `    benchmark rows: +${newCount} new, ${dupCount} dup, ` +
              `${insertedIds.length} id(s) (${elapsed(insertStart)})`,
          );
          totalNewBmk += newCount;
          totalDupBmk += dupCount;
          if (requiredPower) retainedPowerPoints.push(...toInsert);

          for (const r of toInsert) {
            availRows.push({
              model: r.config.model,
              isl: r.isl,
              osl: r.osl,
              precision: r.config.precision,
              hardware: r.config.hardware,
              framework: r.config.framework,
              specMethod: r.config.specMethod,
              disagg: r.config.disagg,
              benchmarkType: r.benchmarkType,
            });
          }

          if (parentDir.startsWith('bmk_') && insertedIds.length > 0) {
            const logArtifact =
              serverLogArtifacts.get(configKey) ??
              serverLogArtifacts.get(stripBmkAndAgenticPrefix(parentDir));
            if (logArtifact) {
              try {
                const serverLogStart = Date.now();
                const logRoot = serverLogArtifactRoot(
                  logArtifact.artifactDir,
                  logArtifact.artifactName,
                );
                const logFiles = logRoot ? listServerLogFilePaths(logRoot) : [];
                const totalBytes = logFiles.reduce(
                  (bytes, logFile) => bytes + fs.statSync(logFile.path).size,
                  0,
                );
                console.log(
                  `    server_logs ${logFiles.length} .log/.out file(s) (${formatBytes(totalBytes)})`,
                );
                await withTransientDbRetry(`server_logs for ${configKey}`, () =>
                  insertServerLogFilePaths(sql, insertedIds, logFiles),
                );
                console.log(`    server_logs linked (${elapsed(serverLogStart)})`);
              } catch (error: any) {
                tracker.recordDbError('server_logs', configKey, error);
              }
            }
            if (gpuMetricsArtifact && !gpuMetricsArtifactHoldsTelemetry(gpuMetricsArtifact)) {
              telemetryNotCollectedArtifacts.add(gpuMetricsArtifact.artifactName);
              console.log(
                `    gpu_metrics ${gpuMetricsArtifact.artifactName} held no telemetry; not collected`,
              );
              for (const row of toInsert) {
                const point = telemetryObservations.get(
                  stablePowerPointIdentity(benchmarkPublicationIdentity(row)),
                );
                if (point) point.notCollected = true;
              }
            } else if (gpuMetricsArtifact) {
              try {
                const gpuMetricsStart = Date.now();
                const ingested = await withTransientDbRetry(`gpu_metrics for ${configKey}`, () =>
                  ingestGpuMetricsArtifact(sql, {
                    workflowRunId,
                    artifact: gpuMetricsArtifact,
                    benchmarkResultIds: insertedIds,
                    expectedRunArtifacts,
                    replacePointLinks: true,
                  }),
                );
                if (ingested.seriesIds.length === 0)
                  throw new Error(
                    `No parseable telemetry series in ${gpuMetricsArtifact.artifactName}`,
                  );
                totalGpuMetricSeries += ingested.seriesIds.length;
                totalGpuMetricSamples += ingested.samplesInserted;
                console.log(
                  `    gpu_metrics ${ingested.seriesIds.length} series, ` +
                    `+${ingested.samplesInserted} sample(s), ` +
                    `${ingested.seriesSkipped} unchanged (${elapsed(gpuMetricsStart)})`,
                );
              } catch (error: any) {
                tracker.recordTelemetryError(`gpu_metrics for ${configKey}`, error);
                for (const row of toInsert) {
                  const point = telemetryObservations.get(
                    stablePowerPointIdentity(benchmarkPublicationIdentity(row)),
                  );
                  if (point) point.error = error instanceof Error ? error.message : String(error);
                }
              }
            }
          }

          if (parentDir.startsWith('bmk_agentic_') && insertedIds.length > 0) {
            const concMatch = path.posix.basename(file.path).match(/_conc(?<conc>\d+)\.json$/u);
            const traceSubject = concMatch?.groups?.conc
              ? `${suffix} conc ${concMatch.groups.conc}`
              : suffix;
            const trace =
              (concMatch?.groups?.conc
                ? traceReplayPaths.get(`${suffix}|${concMatch.groups.conc}`)
                : undefined) ?? traceReplayPaths.get(suffix);
            if (trace) {
              try {
                const traceStart = Date.now();
                console.log(
                  `    trace_replay ${suffix}: ` +
                    `profile=${formatBytes(fileSize(trace.profileJsonl))}, ` +
                    `server_csv=${formatBytes(fileSize(trace.serverMetricsCsv))}, ` +
                    `server_json=${formatBytes(fileSize(trace.serverMetricsJson))}`,
                );
                const linkStart = Date.now();
                console.log(
                  `    trace_replay ${suffix}: checking ${insertedIds.length} benchmark row(s) for existing links`,
                );
                const unlinkedIds = await withTransientDbRetry(
                  `trace_replay link check for ${suffix}`,
                  () => findUnlinkedTraceReplayIds(sql, insertedIds),
                );
                console.log(
                  `    trace_replay ${suffix}: found ${unlinkedIds.length} unlinked row(s) (${elapsed(linkStart)})`,
                );
                if (unlinkedIds.length === 0) {
                  console.log(
                    `    trace_replay ${suffix}: skipping blob insert; all benchmark rows already linked`,
                  );
                  console.log(`    trace_replay ${suffix}: done (${elapsed(traceStart)})`);
                } else {
                  console.log(`    trace_replay ${suffix}: queued for worker preparation`);
                  const task = traceWorkerPool
                    .run(
                      {
                        profileExportJsonl: trace.profileJsonl,
                        serverMetricsCsv: trace.serverMetricsCsv,
                        serverMetricsJson: trace.serverMetricsJson,
                        metricsContext: {
                          framework: toInsert[0]?.config.framework,
                          disagg: toInsert[0]?.config.disagg,
                        },
                      },
                      // oxlint-disable-next-line no-loop-func -- each callback closes over this iteration's block-scoped trace metadata
                      async (prepared) => {
                        console.log(
                          `    trace_replay ${suffix}: compressed ` +
                            `profile=${formatBytes(prepared.profileSize)} -> ${formatBytes(prepared.profileGz?.length)}, ` +
                            `server_csv=${formatBytes(prepared.serverMetricsCsvSize)}, ` +
                            `server_json=${formatBytes(prepared.serverMetricsJsonSize)} -> ` +
                            `${formatBytes(prepared.serverMetricsJsonGz?.length)} ` +
                            `(${(prepared.compressionMs / 1000).toFixed(1)}s)`,
                        );
                        console.log(
                          `    trace_replay ${suffix}: computed derived JSON: ` +
                            `chart_windows=${prepared.chartWindows}, ` +
                            `timeline_requests=${prepared.timelineRequests} ` +
                            `(${(prepared.computeMs / 1000).toFixed(1)}s)`,
                        );
                        const linked = await traceUploadLimiter.run(() =>
                          withTransientDbRetry(`trace_replay for ${suffix}`, () =>
                            persistPreparedTraceReplay(sql, unlinkedIds, prepared, {
                              progressLabel: suffix,
                            }),
                          ),
                        );
                        totalTraceReplayLinked += linked;
                        console.log(`    trace_replay ${suffix}: done (${elapsed(traceStart)})`);
                      },
                    )
                    .catch((error: any) => {
                      tracker.recordDbError('trace_replay', traceSubject, error);
                    });
                  traceTasks.push(task);
                }
              } catch (error: any) {
                tracker.recordDbError('trace_replay', traceSubject, error);
              }
            } else {
              console.log(`    trace_replay ${suffix}: missing sibling artifact`);
              tracker.skips.traceReplayMissing++;
            }
          }
        } catch (error: any) {
          tracker.recordDbError('benchmark', path.posix.basename(file.path), error);
        }
      }
      console.log(`    finished ${relativeFile} (${elapsed(fileStart)})`);
    }
    if (traceTasks.length > 0) {
      console.log(`  Waiting for ${traceTasks.length} queued trace replay task(s)`);
      await Promise.all(traceTasks);
    }
    await traceWorkerPool.close();
    if (requiredPower)
      assertRequiredPowerPointsRetained(requiredPower.points, retainedPowerPoints, 'after_insert');
    console.log(`  Benchmarks: +${totalNewBmk} new, ${totalDupBmk} dup`);
    if (totalTraceReplayLinked > 0 || tracker.skips.traceReplayMissing > 0) {
      console.log(
        `  Trace replay: ${totalTraceReplayLinked} rows linked, ${tracker.skips.traceReplayMissing} agentic point(s) missing sibling artifact`,
      );
    }

    if (availRows.length > 0) {
      try {
        await bulkUpsertAvailability(sql, availRows, date);
        console.log(`  Availability: ${availRows.length} row(s) upserted`);
      } catch (error: any) {
        tracker.recordDbError('availability', `${availRows.length} row(s)`, error);
      }
    }

    if (datasetSlugs.size > 1) {
      throw new Error(
        `Conflicting dataset provenance in workflow run ${runId}: ${[...datasetSlugs].toSorted().join(', ')}`,
      );
    }
    const [datasetSlug] = datasetSlugs;
    if (datasetSlug) {
      await sql`
        insert into run_datasets (workflow_run_id, dataset_slug)
        values (${workflowRunId}, ${datasetSlug})
        on conflict (workflow_run_id) do update
        set dataset_slug = excluded.dataset_slug
      `;
      console.log(`  Dataset: linked workflow run to ${datasetSlug}`);
      const [known] = await sql`select 1 as ok from datasets where slug = ${datasetSlug}`;
      if (!known) {
        missingDatasets.add(datasetSlug);
        console.warn(
          `  ⚠ Dataset ${datasetSlug} is not in the datasets table — request-timeline deep links ` +
            `will 404 until it is ingested (packages/db/src/ingest-weka-dataset.ts)`,
        );
      }
    }
  }

  console.log('\n--- Run Stats ---');
  if (evalsOnly) {
    console.log('  Skipped (evals-only run)');
  } else {
    const statsDir = path.join(artifactsDir, ARTIFACT_NAMES.runStats);
    const statsFiles = findJsonFiles(statsDir);

    const statsRows: { hardware: string; nSuccess: number; total: number }[] = [];
    for (const file of statsFiles) {
      const data = readJson(file) as Record<string, any> | null;
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      for (const [hwKey, stats] of Object.entries(data)) {
        if (!GPU_KEYS.has(hwKey)) continue;
        if (typeof stats?.n_success !== 'number' || typeof stats?.total !== 'number') continue;
        statsRows.push({
          hardware: hwKey,
          nSuccess: stats.n_success,
          total: stats.total,
        });
      }
    }

    if (statsRows.length > 0) {
      try {
        const { newCount, dupCount } = await bulkIngestRunStats(
          sql,
          statsRows,
          workflowRunId,
          date,
        );
        totalNewStats = newCount;
        totalDupStats = dupCount;
      } catch (error: any) {
        tracker.recordDbError('run_stats', `${statsRows.length} row(s)`, error);
      }
    }
    console.log(`  Run stats: +${totalNewStats} new, ${totalDupStats} dup`);
  }

  console.log('\n--- Eval Results ---');
  const evalDir = path.join(artifactsDir, ARTIFACT_NAMES.evals);
  const evalFiles = findJsonFiles(evalDir);

  for (const file of evalFiles) {
    const data = readJson(file);
    if (!Array.isArray(data)) continue;

    for (const row of data) {
      if (typeof row !== 'object' || row === null) continue;
      const mapped = mapAggEvalRow(row as Record<string, any>, tracker, runIdStr);
      if (!mapped) continue;

      try {
        const configId = await getOrCreateConfig(mapped.config);
        const { outcome } = await ingestEvalRow(sql, configId, mapped, workflowRunId, date);
        if (outcome === 'new') totalEvals++;
      } catch (error: any) {
        tracker.recordDbError('eval', `${path.basename(file)} ${mapped.task}`, error);
      }
    }
  }
  console.log(`  Eval results (agg): +${totalEvals} new`);

  const perConfigEvalDirs = fs.existsSync(artifactsDir)
    ? fs
        .readdirSync(artifactsDir)
        .filter(
          (d) =>
            d.startsWith('eval_') &&
            !d.startsWith(ARTIFACT_NAMES.evals) &&
            fs.statSync(path.join(artifactsDir, d)).isDirectory(),
        )
        .map((d) => path.join(artifactsDir, d))
    : [];

  if (perConfigEvalDirs.length > 0) {
    console.log(`  Found ${perConfigEvalDirs.length} per-config eval dir(s)`);
  }

  for (const dir of perConfigEvalDirs) {
    const files = fs.readdirSync(dir);
    const metaPath = files.includes('meta_env.json') ? path.join(dir, 'meta_env.json') : null;
    const resultsName = files.find((f) => f.startsWith('results_') && f.endsWith('.json'));
    if (!metaPath || !resultsName) {
      console.warn(`  [WARN] ${path.basename(dir)}: missing meta_env.json or results_*.json`);
      continue;
    }
    const meta = readJson(metaPath) as Record<string, any> | null;
    const results = readJson(path.join(dir, resultsName)) as Record<string, any> | null;
    if (!meta || !results) continue;

    const evalParamsList = mapEvalRow(meta, results, tracker, runIdStr);
    if (evalParamsList.length === 0) continue;

    const samplesByTask = new Map<string, string>();
    for (const f of files) {
      if (!f.startsWith('samples_') || !f.endsWith('.jsonl')) continue;
      const m = f.match(/^samples_(?<task>.+?)_[^_]+\.jsonl$/u);
      const task = m ? m[1].toLowerCase() : null;
      if (!task) continue;
      try {
        samplesByTask.set(task, fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch (error: any) {
        console.warn(`  [WARN] failed to read ${f}: ${error.message}`);
      }
    }

    for (const params of evalParamsList) {
      try {
        const configId = await getOrCreateConfig(params.config);
        const { id: evalResultId } = await ingestEvalRow(
          sql,
          configId,
          params,
          workflowRunId,
          date,
        );

        const samplesText = samplesByTask.get(params.task);
        if (!samplesText) continue;

        const samples = mapEvalSamples(samplesText, tracker);
        if (samples.length === 0) continue;

        const { newCount } = await bulkIngestEvalSamples(sql, evalResultId, samples);
        totalSamples += newCount;
        totalSampleFiles++;
      } catch (error: any) {
        tracker.recordDbError('eval', `${path.basename(dir)} ${params.task}`, error);
      }
    }
  }
  if (perConfigEvalDirs.length > 0) {
    console.log(`  Eval samples: +${totalSamples} new across ${totalSampleFiles} file(s)`);
  }

  console.log('\n--- Changelog ---');
  for (const { baseRef, headRef, entries } of changelogs) {
    try {
      const written = await ingestChangelogEntries(
        sql,
        workflowRunId,
        date,
        baseRef,
        headRef,
        entries,
      );
      totalChangelogs += written;
    } catch (error: any) {
      tracker.recordDbError('changelog', `${baseRef}..${headRef}`, error);
    }
  }
  console.log(`  Changelog: ${totalChangelogs} written`);

  const [configCount] = await sql`select count(*)::int as n from configs`;
  const [resultCount] = await sql`select count(*)::int as n from benchmark_results`;
  const [statsCount] = await sql`select count(*)::int as n from run_stats`;
  const [evalCount] = await sql`select count(*)::int as n from eval_results`;
  const [sampleCount] = await sql`select count(*)::bigint as n from eval_samples`;
  const [changelogCount] = await sql`select count(*)::int as n from changelog_entries`;

  console.log('\n=== Summary ===');
  console.log(
    `  Benchmark results: ${totalNewBmk} new, ${totalDupBmk} duplicate (ON CONFLICT updates)`,
  );
  console.log(
    `  Run stats:         ${totalNewStats} new, ${totalDupStats} duplicate (ON CONFLICT updates)`,
  );
  console.log(`  Eval results:      ${totalEvals} new`);
  console.log(`  Eval samples:      ${totalSamples} new across ${totalSampleFiles} file(s)`);
  console.log(`  Changelog entries: ${totalChangelogs} written`);
  printIngestSummaryFooter(
    {
      configs: configCount.n,
      benchmarkResults: resultCount.n,
      runStats: statsCount.n,
      evalResults: evalCount.n,
      evalSamples: sampleCount.n,
      changelogEntries: changelogCount.n,
    },
    tracker,
    { includeFailedRuns: true, includeUnmappedPrecisions: true },
  );

  const { unmappedModels, unmappedHws, unmappedPrecisions } = tracker;

  const unmappedOutPath = process.env.UNMAPPED_ENTITIES_OUTPUT;
  if (
    unmappedOutPath &&
    (unmappedModels.size > 0 ||
      unmappedHws.size > 0 ||
      unmappedPrecisions.size > 0 ||
      missingDatasets.size > 0)
  ) {
    fs.writeFileSync(
      unmappedOutPath,
      JSON.stringify({
        models: [...unmappedModels],
        hardware: [...unmappedHws],
        precisions: [...unmappedPrecisions],
        datasets: [...missingDatasets],
      }),
    );
  }

  await refreshLatestBenchmarks(sql);

  console.log('\n=== ingest-ci-run complete ===');
  console.log('  Invalidate API cache: bun run admin:cache:invalidate');
}

main()
  .catch((error) => {
    powerPublicationErrors.push(error instanceof Error ? error.message : String(error));
    console.error('ingest-ci-run failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const publicationPath = process.env.POWER_PUBLICATION_MANIFEST;
    const writeReceiptPath = process.env.DATABASE_WRITE_RECEIPT;
    const receiptInput = {
      runId: runIdNum,
      runAttempt: runAttemptNum,
      points: [...powerPublicationPoints.values()],
      publicationErrors: powerPublicationErrors,
      publicationWarnings: powerPublicationWarnings,
      tracker,
      telemetryNotCollectedArtifacts: telemetryNotCollectedArtifacts.size,
    };
    if (writeReceiptPath) {
      fs.writeFileSync(
        writeReceiptPath,
        `${JSON.stringify(buildDatabaseWriteReceipt(receiptInput), null, 2)}\n`,
      );
      console.log(`  Database write receipt: ${writeReceiptPath}`);
    }
    if (publicationPath) {
      const telemetry = checkTelemetry
        ? await readTelemetryReceipt(
            sql,
            { runId: runIdNum, runAttempt: runAttemptNum },
            [...telemetryObservations.values()],
            {
              expectedSource:
                !telemetryExpectationsUnknown && telemetryObservations.size > 0
                  ? 'benchmark_artifacts'
                  : 'unknown',
            },
          )
        : undefined;
      fs.writeFileSync(
        publicationPath,
        `${JSON.stringify(buildPowerPublicationManifest({ ...receiptInput, telemetry }), null, 2)}\n`,
      );
      console.log(`  PowerX ingest receipt: ${publicationPath}`);
    }
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
    return sql.end();
  });
