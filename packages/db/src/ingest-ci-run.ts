/**
 * Ingest a single CI workflow run's artifacts into the Postgres database.
 *
 * Two modes:
 *   --download <run-url-or-id> [repo]  Download artifacts from GitHub then ingest
 *   (no flag)                          Read from INGEST_ARTIFACTS_PATH (CI mode)
 *
 * Usage:
 *   pnpm admin:db:ingest:run https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123
 *   pnpm admin:db:ingest:run 123
 *   pnpm admin:db:ingest:run 123 SemiAnalysisAI/InferenceX
 *   pnpm admin:db:ingest:ci   (reads INGEST_* env vars, used by CI workflow)
 *
 * Environment variables:
 *   DATABASE_WRITE_URL     — Postgres connection string (direct, non-pooled)
 *   GITHUB_TOKEN           — GitHub PAT for fetching run metadata
 *   INGEST_RUN_ID          — (CI mode) Workflow run ID
 *   INGEST_ARTIFACTS_PATH  — (CI mode) Local path to pre-downloaded artifacts
 *   INGEST_REPO            — (CI mode) Source repo slug (owner/name)
 *   reused-ingest-metadata/reuse_source_run.json overrides reused rows to the
 *     original source sweep run, so public links point at the real benchmark run.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { GPU_KEYS } from '@semianalysisai/inferencex-constants';

import { hasNoSslFlag } from './cli-utils';
import {
  dedupeArtifactsByLogicalName,
  downloadArtifact,
  fetchRunAttempt,
  listRunArtifacts,
} from './lib/github-artifacts';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils';
import { isRunAttemptPurged } from './etl/run-overrides';
import { createSkipTracker } from './etl/skip-tracker';
import { createConfigCache } from './etl/config-cache';
import { createWorkflowRunServices } from './etl/workflow-run';
import {
  flattenReusedIngestArtifactBundle,
  readReusedIngestMetadata,
} from './etl/reused-ingest-metadata';
import { mapBenchmarkRow } from './etl/benchmark-mapper';
import {
  bulkIngestBenchmarkRows,
  bulkIngestRunStats,
  bulkUpsertAvailability,
  insertServerLog,
} from './etl/benchmark-ingest';
import { insertTraceReplay } from './etl/trace-replay-ingest';
import { discoverTraceReplayArtifacts } from './etl/trace-artifact-discovery';
import { datasetSlugFromBenchmarkRow } from './etl/dataset-provenance';
import { mapAggEvalRow, mapEvalRow } from './etl/eval-mapper';
import { ingestEvalRow } from './etl/eval-ingest';
import { mapEvalSamples } from './etl/eval-samples-mapper';
import { bulkIngestEvalSamples } from './etl/eval-samples-ingest';
import {
  type ChangelogEntry,
  parseChangelogEntries,
  ingestChangelogEntries,
  hasEvalsOnlyFlag,
} from './etl/changelog-ingest';

// ── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_REPO = 'SemiAnalysisAI/InferenceX';
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
  // --download <run-url-or-id> [repo]
  // Filter out '--' injected by pnpm arg passthrough
  const args = process.argv.slice(3).filter((a) => a !== '--');
  const input = args[0];
  if (!input) {
    console.error('Usage: pnpm admin:db:ingest:run <run-url-or-id> [repo]');
    process.exit(1);
  }

  const match = input.match(/\/runs\/(?<runId>\d+)/u);
  const parsedId = match ? match[1] : /^\d+$/u.test(input) ? input : null;
  if (!parsedId) {
    console.error(`Could not parse run ID from: ${input}`);
    process.exit(1);
  }

  runIdStr = parsedId;
  REPO = args[1] ?? DEFAULT_REPO;

  // Download artifacts
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
  artifactsDir = tempDir;

  console.log('=== ingest-run (download mode) ===');
  console.log(`  Run ID: ${runIdStr}`);
  console.log(`  Repo:   ${REPO}`);
  console.log(`\n--- Downloading artifacts to ${artifactsDir} ---`);

  // Retried configs produce artifacts on multiple runners — keep only the
  // most recent per logical name (see RUNNER_SUFFIX_RE in github-artifacts)
  // so a failed attempt's empty metrics can't overwrite the good one via
  // ON CONFLICT DO UPDATE.
  const byLogical = dedupeArtifactsByLogicalName(listRunArtifacts(REPO, runIdStr));

  for (const artifact of byLogical.values()) {
    console.log(`  ${artifact.name}`);
    downloadArtifact(artifact, artifactsDir);
  }

  console.log(`\n  Downloaded ${byLogical.size} artifact(s)`);

  runAttemptNum = fetchRunAttempt(REPO, runIdStr);
} else {
  // CI mode — read from env vars
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
if (isRunAttemptPurged(runIdNum, runAttemptNum)) {
  console.log(`  Run ${runIdStr} attempt ${runAttemptNum} is purged via run-overrides — skipping.`);
  process.exit(0);
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 5,
  idle_timeout: 60,
});

/** Key aggregate artifacts produced by the benchmark CI. */
const ARTIFACT_NAMES = {
  benchmarks: 'results_bmk',
  runStats: 'run-stats',
  evals: 'eval_results_all',
  changelog: 'changelog-metadata',
} as const;

/**
 * Strip the `bmk_` and/or `agentic_` prefixes from an artifact directory name
 * so the bare suffix becomes a shared key between `bmk_agentic_<suffix>` and
 * its sibling `agentic_<suffix>` artifact.
 */
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

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const tracker = createSkipTracker();
  const configCache = createConfigCache(sql);
  const { getOrCreateConfig, preloadConfigs } = configCache;
  const { fetchGithubRun, getOrCreateWorkflowRun } = createWorkflowRunServices(sql, GITHUB_TOKEN);

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

  await preloadConfigs();
  console.log(`  ${configCache.size} configs preloaded`);

  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`Artifacts directory does not exist: ${artifactsDir}`);
  }

  const date = workflowGhInfo?.createdAt
    ? workflowGhInfo.createdAt.split('T')[0]
    : new Date().toISOString().split('T')[0];

  const workflowRunId = await getOrCreateWorkflowRun({
    githubRunId: runId,
    runAttempt: runAttemptNum,
    name: workflowGhInfo?.name || `CI Run ${runIdStr}`,
    date,
    // Reused rows are attributed to the source PR sweep so public links open
    // the real benchmark run; head branch/SHA therefore remain the PR values.
    headBranch: workflowGhInfo?.headBranch,
    headSha: workflowGhInfo?.headSha,
    htmlUrl: reusedIngestMetadata?.sourceRunUrl,
    createdAt: workflowGhInfo?.createdAt || triggerGhInfo?.createdAt || new Date().toISOString(),
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
  const datasetSlugs = new Set<string>();
  // Dataset slugs referenced by this run's agentic rows but absent from the
  // `datasets` table — timeline→dataset deep links 404 until they're ingested.
  const missingDatasets = new Set<string>();

  // ── Check for evals-only flag in changelog ────────────────────────────
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
    // Prefer the workflow's display name ("e2e Test - B300 DSv4 AgentX vLLM 1h
    // + 10m warmup") — it describes the sweep; the head commit message usually
    // describes an unrelated code change.
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
        },
      ],
    });
    console.log(
      `  No changelog metadata artifact found; using fallback changelog: ${fallbackDescription}`,
    );
  }
  const evalsOnly = hasEvalsOnlyFlag(parsedChangelogs);
  if (evalsOnly) {
    console.log('\n  ⚠ evals-only run detected — skipping benchmark and stats ingest');
  }

  // ── Ingest benchmark results ──────────────────────────────────────────

  console.log('\n--- Benchmark Results ---');
  if (evalsOnly) {
    console.log('  Skipped (evals-only run)');
  } else {
    const bmkDir = path.join(artifactsDir, ARTIFACT_NAMES.benchmarks);
    const bmkFiles = findJsonFiles(bmkDir);

    const allBmkDirs = fs.existsSync(artifactsDir)
      ? fs
          .readdirSync(artifactsDir)
          .filter((d) => d.startsWith('bmk_') || d.startsWith('results_'))
          .map((d) => path.join(artifactsDir, d))
          .filter((d) => fs.statSync(d).isDirectory())
      : [];

    const serverLogPaths = new Map<string, string>();
    if (fs.existsSync(artifactsDir)) {
      for (const d of fs.readdirSync(artifactsDir)) {
        if (!d.startsWith('server_logs_')) continue;
        // feat-agentx-v1.0 harness nests the log under `results/server.log`;
        // older runs keep it at the artifact root. Check both.
        const logPath = [
          path.join(artifactsDir, d, 'server.log'),
          path.join(artifactsDir, d, 'results', 'server.log'),
        ].find((p) => fs.existsSync(p));
        if (!logPath) continue;
        const configKey = d.replace(/^server_logs_/u, '');
        serverLogPaths.set(configKey, logPath);
      }
    }
    if (serverLogPaths.size > 0) {
      console.log(`  Found ${serverLogPaths.size} server log artifact(s)`);
    }

    // Sibling aiperf artifacts: each `bmk_agentic_<suffix>` is paired with an
    // `agentic_<suffix>` dir holding `profile_export.jsonl` and
    // `server_metrics_export.csv`. The harness emits these under either a
    // `trace_replay/` subdir (older layout) or `aiperf_artifacts/` (current).
    // Older non-aiperf agentic runs don't ship this sibling. Key on the bare
    // suffix so both names map to the same Map entry.
    const traceReplayPaths = discoverTraceReplayArtifacts(artifactsDir);
    if (traceReplayPaths.size > 0) {
      console.log(`  Found ${traceReplayPaths.size} trace_replay sibling artifact(s)`);
    }

    const allBmkFiles = [...bmkFiles, ...allBmkDirs.flatMap((d) => findJsonFiles(d))];
    console.log(`  Found ${allBmkFiles.length} benchmark JSON file(s)`);

    for (const [fileIndex, file] of allBmkFiles.entries()) {
      const fileStart = Date.now();
      const relativeFile = path.relative(artifactsDir, file);
      console.log(
        `  [${fileIndex + 1}/${allBmkFiles.length}] ${relativeFile} (${formatBytes(fileSize(file))})`,
      );
      const data = readJson(file);
      if (!data) {
        console.log(`    skipped unreadable JSON (${elapsed(fileStart)})`);
        continue;
      }

      const rawRows: Record<string, any>[] = Array.isArray(data)
        ? data
        : [data as Record<string, any>];
      console.log(`    raw rows: ${rawRows.length}`);

      for (const rawRow of rawRows) {
        if (!rawRow || typeof rawRow !== 'object') continue;
        const datasetSlug = datasetSlugFromBenchmarkRow(rawRow);
        if (datasetSlug) datasetSlugs.add(datasetSlug);
      }

      const rows = rawRows
        .filter((r) => typeof r === 'object' && r !== null)
        .map((r) => mapBenchmarkRow(r, tracker))
        .filter((r): r is NonNullable<typeof r> => r !== null);

      console.log(`    mapped rows: ${rows.length}`);
      if (rows.length === 0) {
        console.log(`    skipped; no mappable rows (${elapsed(fileStart)})`);
        continue;
      }

      const toInsert = [];
      for (const row of rows) {
        try {
          const configId = await getOrCreateConfig(row.config);
          toInsert.push({ ...row, configId });
        } catch (error: any) {
          tracker.recordDbError(`config for ${path.basename(file)}`, error);
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

          // Build availability only after successful insert
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

          const parentDir = path.basename(path.dirname(file));
          if (parentDir.startsWith('bmk_') && insertedIds.length > 0) {
            // Single-turn artifacts are `bmk_<key>` paired with
            // `server_logs_<key>`. Agentic artifacts are `bmk_agentic_<key>`
            // but the server log is still `server_logs_<key>` (no `agentic_`
            // prefix), so fall back to the fully-stripped suffix — otherwise
            // agentic rows never get their server log (and KV-pool size) linked.
            const configKey = parentDir.replace(/^bmk_/u, '');
            const logPath =
              serverLogPaths.get(configKey) ??
              serverLogPaths.get(stripBmkAndAgenticPrefix(parentDir));
            if (logPath) {
              try {
                const serverLogStart = Date.now();
                console.log(
                  `    server_log ${path.basename(logPath)} (${formatBytes(fileSize(logPath))})`,
                );
                const serverLog = fs.readFileSync(logPath, 'utf8').replaceAll('\u0000', '');
                await insertServerLog(sql, insertedIds, serverLog);
                console.log(`    server_log linked (${elapsed(serverLogStart)})`);
              } catch (error: any) {
                tracker.recordDbError(`server_log for ${configKey}`, error);
              }
            }
          }

          // Trace-replay sibling lookup for agentic points only. The aiperf
          // harness emits `agentic_<suffix>/trace_replay/...` next to the
          // `bmk_agentic_<suffix>` artifact we just ingested.
          if (parentDir.startsWith('bmk_agentic_') && insertedIds.length > 0) {
            const suffix = stripBmkAndAgenticPrefix(parentDir);
            const concMatch = path.basename(file).match(/_conc(?<conc>\d+)\.json$/u);
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
                await insertTraceReplay(
                  sql,
                  insertedIds,
                  trace.profileJsonl,
                  trace.serverMetricsCsv,
                  trace.serverMetricsJson,
                  {
                    metricsContext: {
                      framework: toInsert[0]?.config.framework,
                      disagg: toInsert[0]?.config.disagg,
                    },
                    progressLabel: suffix,
                  },
                );
                totalTraceReplayLinked += insertedIds.length;
                console.log(`    trace_replay ${suffix}: done (${elapsed(traceStart)})`);
              } catch (error: any) {
                tracker.recordDbError(`trace_replay for ${suffix}`, error);
              }
            } else {
              console.log(`    trace_replay ${suffix}: missing sibling artifact`);
              tracker.skips.traceReplayMissing++;
            }
          }
        } catch (error: any) {
          tracker.recordDbError(path.basename(file), error);
        }
      }
      console.log(`    finished ${relativeFile} (${elapsed(fileStart)})`);
    }
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
        tracker.recordDbError('availability', error);
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

  // ── Ingest run stats ──────────────────────────────────────────────────

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
        statsRows.push({ hardware: hwKey, nSuccess: stats.n_success, total: stats.total });
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
        tracker.recordDbError('run_stats', error);
      }
    }
    console.log(`  Run stats: +${totalNewStats} new, ${totalDupStats} dup`);
  }

  // ── Ingest eval results ───────────────────────────────────────────────
  //
  // Two artifact shapes contribute to `eval_results`:
  //   1. `eval_results_all/agg_eval_all.json` — flat aggregate rows for every
  //      config (no per-sample data).
  //   2. `eval_*` per-config dirs — `meta_env.json` + `results_*.json` +
  //      `samples_<task>_*.jsonl`. These carry the prompt/response detail
  //      that drives the eval-samples drawer.
  //
  // Both flow into the same `eval_results` rows via the unique key
  // `(workflow_run_id, config_id, task, isl, osl, conc)`. Whichever runs
  // first inserts; the second hits the conflict path and just refreshes
  // `metrics`. Samples then attach to the resolved row id.

  console.log('\n--- Eval Results ---');
  const evalDir = path.join(artifactsDir, ARTIFACT_NAMES.evals);
  const evalFiles = findJsonFiles(evalDir);

  for (const file of evalFiles) {
    const data = readJson(file);
    if (!Array.isArray(data)) continue;

    for (const row of data) {
      if (typeof row !== 'object' || row === null) continue;
      const mapped = mapAggEvalRow(row as Record<string, any>, tracker);
      if (!mapped) continue;

      try {
        const { outcome } = await ingestEvalRow(
          sql,
          getOrCreateConfig,
          mapped,
          workflowRunId,
          date,
        );
        if (outcome === 'new') totalEvals++;
      } catch (error: any) {
        tracker.recordDbError('eval row', error);
      }
    }
  }
  console.log(`  Eval results (agg): +${totalEvals} new`);

  // Per-config eval dirs (`eval_*`) — same on-disk shape as the eval ZIPs
  // handled by `ingest-gcs-backup.ts`, but already unzipped. Each dir holds
  // one config's meta_env.json, results JSON, and samples JSONL.
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

    const evalParamsList = mapEvalRow(meta, results, tracker);
    if (evalParamsList.length === 0) continue;

    // Map each task name → samples jsonl text. lm-eval names them
    // `samples_<task>_<timestamp>.jsonl` (one file per task).
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
        const { id: evalResultId } = await ingestEvalRow(
          sql,
          getOrCreateConfig,
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
        tracker.recordDbError(`samples for ${path.basename(dir)}`, error);
      }
    }
  }
  if (perConfigEvalDirs.length > 0) {
    console.log(`  Eval samples: +${totalSamples} new across ${totalSampleFiles} file(s)`);
  }

  // ── Ingest changelog (already parsed above for evals-only check) ─────

  console.log('\n--- Changelog ---');
  for (const { baseRef, headRef, entries } of parsedChangelogs) {
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
      tracker.recordDbError('changelog', error);
    }
  }
  console.log(`  Changelog: ${totalChangelogs} written`);

  // ── Summary ───────────────────────────────────────────────────────────

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
  console.log(`\n  DB totals:`);
  console.log(`    configs           ${configCount.n}`);
  console.log(`    benchmark_results ${resultCount.n}`);
  console.log(`    run_stats         ${statsCount.n}`);
  console.log(`    eval_results      ${evalCount.n}`);
  console.log(`    eval_samples      ${sampleCount.n}`);
  console.log(`    changelog_entries ${changelogCount.n}`);

  const { skips, unmappedModels, unmappedHws, unmappedPrecisions } = tracker;
  const totalSkips =
    skips.badZip +
    skips.unmappedModel +
    skips.unmappedHw +
    skips.noIslOsl +
    skips.failedRun +
    skips.dbError;
  if (totalSkips > 0) {
    console.log(`\n  Skipped: ${totalSkips} rows`);
    const skipLines: [string, number][] = [
      ['no isl/osl (old format)', skips.noIslOsl],
      ['failed run (0 successful)', skips.failedRun],
      ['unmapped model', skips.unmappedModel],
      ['unmapped hw', skips.unmappedHw],
      ['bad/empty zip', skips.badZip],
      ['DB errors', skips.dbError],
    ].filter(([, n]) => (n as number) > 0) as [string, number][];
    const pad = Math.max(...skipLines.map(([label]) => label.length));
    for (const [label, n] of skipLines) {
      console.log(`    ${label.padEnd(pad)}: ${n}`);
    }
  }

  if (unmappedModels.size > 0) {
    console.log(`\n  Unmapped model values (add to MODEL_TO_KEY to ingest):`);
    [...unmappedModels].slice(0, 20).forEach((v) => console.log(`    ${v}`));
    if (unmappedModels.size > 20) console.log(`    ... and ${unmappedModels.size - 20} more`);
  }

  if (unmappedHws.size > 0) {
    console.log(`\n  Unmapped hw values (add to hwToGpuKey to ingest):`);
    [...unmappedHws].slice(0, 20).forEach((v) => console.log(`    ${v}`));
  }

  if (unmappedPrecisions.size > 0) {
    console.log(`\n  Unmapped precision values (add to PRECISION_KEYS to ingest):`);
    [...unmappedPrecisions].forEach((v) => console.log(`    ${v}`));
  }

  // Write unmapped entities to file so CI workflow can send Slack notifications
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
  console.log('  Invalidate API cache: pnpm admin:cache:invalidate');
}

main()
  .catch((error) => {
    console.error('ingest-ci-run failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
    return sql.end();
  });
