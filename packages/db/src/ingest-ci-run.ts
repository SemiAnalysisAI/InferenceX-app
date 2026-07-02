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

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { hasNoSslFlag } from './cli-utils';
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
import { mapAggEvalRow, mapEvalRow } from './etl/eval-mapper';
import { parseChangelogEntries, hasEvalsOnlyFlag } from './etl/changelog-ingest';
import {
  categorizeArtifacts,
  extractStatsRows,
  writeMappedWorkflow,
  type MappedBenchmarkArtifact,
  type MappedEvalRow,
  type ParsedChangelog,
  type StatsRow,
} from './etl/ingest-pipeline';

// ── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_REPO = 'SemiAnalysisAI/InferenceX';
const isDownloadMode = process.argv[2] === '--download';

let artifactsDir: string;
let runIdStr: string;
let runAttemptNum: number;
let REPO: string;
let tempDir: string | null = null;

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

  const artifactListJson = execSync(
    `gh api "repos/${REPO}/actions/runs/${runIdStr}/artifacts" --paginate --jq '.artifacts[]'`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );

  const allArtifacts: { name: string; archive_download_url: string; created_at: string }[] = [];
  for (const line of artifactListJson.trim().split('\n')) {
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      allArtifacts.push(parsed);
    } catch {}
  }

  const byName = new Map<string, (typeof allArtifacts)[0]>();
  for (const a of allArtifacts) {
    const existing = byName.get(a.name);
    if (!existing || a.created_at > existing.created_at) {
      byName.set(a.name, a);
    }
  }

  for (const [name, artifact] of byName) {
    console.log(`  ${name}`);
    const zipPath = path.join(artifactsDir, 'artifact.zip');
    execSync(`gh api "${artifact.archive_download_url}" > "${zipPath}"`, {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const destDir = path.join(artifactsDir, name);
    fs.mkdirSync(destDir, { recursive: true });
    execSync(`unzip -oq "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
    fs.unlinkSync(zipPath);
  }

  console.log(`\n  Downloaded ${byName.size} artifact(s)`);

  // Fetch run attempt from API
  const attemptStr = execSync(
    `gh api "repos/${REPO}/actions/runs/${runIdStr}" --jq '.run_attempt'`,
    { encoding: 'utf8' },
  ).trim();
  runAttemptNum = parseInt(attemptStr || '1', 10);
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

  // ── Map artifacts to typed rows (no DB writes) ────────────────────────
  //
  // The CI run reads a flat, pre-downloaded/unzipped artifact directory. We
  // classify its top-level entries with the shared `categorizeArtifacts`
  // dispatch (the same prefix vocabulary the GCS backup applies to ZIP names),
  // then map each category to typed rows and hand the whole workflow to the
  // shared `writeMappedWorkflow` DB stage.

  const topLevelEntries = fs.existsSync(artifactsDir) ? fs.readdirSync(artifactsDir) : [];
  const cats = categorizeArtifacts(topLevelEntries);

  // Server logs: configKey → server.log path, read lazily at write time.
  const serverLogPaths = new Map<string, string>();
  for (const d of cats.serverLog) {
    const logPath = path.join(artifactsDir, d, 'server.log');
    if (!fs.existsSync(logPath)) continue;
    const configKey = d.replace(/^server_logs_/u, '');
    serverLogPaths.set(configKey, logPath);
  }

  // ── Check for evals-only flag in changelog ────────────────────────────
  const changelogDir = path.join(artifactsDir, ARTIFACT_NAMES.changelog);
  const changelogFiles = findJsonFiles(changelogDir);
  const parsedChangelogs: ParsedChangelog[] = [];
  for (const file of changelogFiles) {
    const data = readJson(file) as Record<string, any> | null;
    if (!data || typeof data !== 'object') continue;
    const baseRef = String(data.base_ref ?? '');
    const headRef = String(data.head_ref ?? '');
    if (!baseRef || !headRef) continue;
    const entries = parseChangelogEntries(data.entries);
    if (entries.length > 0) parsedChangelogs.push({ baseRef, headRef, entries });
  }
  const evalsOnly = hasEvalsOnlyFlag(parsedChangelogs);
  if (evalsOnly) {
    console.log('\n  ⚠ evals-only run detected — skipping benchmark and stats ingest');
  }

  // ── Map benchmark results ─────────────────────────────────────────────

  console.log('\n--- Benchmark Results ---');
  const bmkArtifacts: MappedBenchmarkArtifact[] = [];
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

    if (serverLogPaths.size > 0) {
      console.log(`  Found ${serverLogPaths.size} server log artifact(s)`);
    }

    const allBmkFiles = [...bmkFiles, ...allBmkDirs.flatMap((d) => findJsonFiles(d))];
    console.log(`  Found ${allBmkFiles.length} benchmark JSON file(s)`);

    for (const file of allBmkFiles) {
      const data = readJson(file);
      if (!data) continue;

      const rawRows: Record<string, any>[] = Array.isArray(data)
        ? data
        : [data as Record<string, any>];

      const rows = rawRows
        .filter((r) => typeof r === 'object' && r !== null)
        .map((r) => mapBenchmarkRow(r, tracker))
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length === 0) continue;

      // Match server log by config key (bmk_ subdirs only, matched on the
      // parent dir name — top-level results_bmk files have no matching logs).
      let serverLogRef: string | undefined;
      const parentDir = path.basename(path.dirname(file));
      if (parentDir.startsWith('bmk_')) {
        const configKey = parentDir.replace(/^bmk_/u, '');
        serverLogRef = serverLogPaths.get(configKey);
      }

      bmkArtifacts.push({ label: path.basename(file), rows, serverLogRef });
    }
  }

  // ── Map run stats ─────────────────────────────────────────────────────

  const statsRows: StatsRow[] = [];
  if (!evalsOnly) {
    const statsDir = path.join(artifactsDir, ARTIFACT_NAMES.runStats);
    const statsFiles = findJsonFiles(statsDir);
    for (const file of statsFiles) {
      statsRows.push(...extractStatsRows(readJson(file)));
    }
  }

  // ── Map eval results ──────────────────────────────────────────────────
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

  const evalRows: MappedEvalRow[] = [];

  const evalDir = path.join(artifactsDir, ARTIFACT_NAMES.evals);
  const evalFiles = findJsonFiles(evalDir);
  for (const file of evalFiles) {
    const data = readJson(file);
    if (!Array.isArray(data)) continue;
    for (const row of data) {
      if (typeof row !== 'object' || row === null) continue;
      const mapped = mapAggEvalRow(row as Record<string, any>, tracker);
      if (!mapped) continue;
      evalRows.push({ params: mapped, samplesText: null, source: 'agg' });
    }
  }

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
      evalRows.push({
        params,
        samplesText: samplesByTask.get(params.task) ?? null,
        source: 'perConfig',
      });
    }
  }

  // ── Write everything (shared DB stage) ────────────────────────────────

  const counts = await writeMappedWorkflow(
    {
      sql,
      getOrCreateConfig,
      tracker,
      // Strip null bytes — some logs contain 0x00 which PostgreSQL text columns reject.
      readServerLog: (ref) => {
        try {
          return fs.readFileSync(ref, 'utf8').replaceAll('\u0000', '');
        } catch {
          return null;
        }
      },
    },
    { bmkArtifacts, statsRows, evalRows, changelogs: parsedChangelogs, evalsOnly },
    workflowRunId,
    date,
  );

  const totalNewBmk = counts.newBmk;
  const totalDupBmk = counts.dupBmk;
  const totalNewStats = counts.newStats;
  const totalDupStats = counts.dupStats;
  const totalEvals = counts.aggEvals;
  const totalSamples = counts.evalSamples;
  const totalSampleFiles = counts.evalSampleFiles;
  const totalChangelogs = counts.changelogs;
  // Availability is upserted once per successfully-inserted benchmark row.
  const availUpserted = counts.availUpserted;

  if (!evalsOnly) {
    console.log(`  Benchmarks: +${totalNewBmk} new, ${totalDupBmk} dup`);
    if (availUpserted > 0) {
      console.log(`  Availability: ${availUpserted} row(s) upserted`);
    }
  }

  console.log('\n--- Run Stats ---');
  if (evalsOnly) {
    console.log('  Skipped (evals-only run)');
  } else {
    console.log(`  Run stats: +${totalNewStats} new, ${totalDupStats} dup`);
  }

  console.log('\n--- Eval Results ---');
  console.log(`  Eval results (agg): +${totalEvals} new`);
  if (perConfigEvalDirs.length > 0) {
    console.log(`  Found ${perConfigEvalDirs.length} per-config eval dir(s)`);
    console.log(`  Eval samples: +${totalSamples} new across ${totalSampleFiles} file(s)`);
  }

  console.log('\n--- Changelog ---');
  console.log(`  Changelog: +${totalChangelogs} new`);

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
  console.log(`  Changelog entries: ${totalChangelogs} new`);
  console.log(`\n  DB totals:`);
  console.log(`    configs           ${configCount.n}`);
  console.log(`    benchmark_results ${resultCount.n}`);
  console.log(`    run_stats         ${statsCount.n}`);
  console.log(`    eval_results      ${evalCount.n}`);
  console.log(`    eval_samples      ${sampleCount.n}`);
  console.log(`    changelog_entries ${changelogCount.n}`);

  const { skips, unmappedModels, unmappedHws, unmappedPrecisions } = tracker;
  const totalSkips =
    skips.badZip + skips.unmappedModel + skips.unmappedHw + skips.noIslOsl + skips.dbError;
  if (totalSkips > 0) {
    console.log(`\n  Skipped: ${totalSkips} rows`);
    const skipLines: [string, number][] = [
      ['no isl/osl (old format)', skips.noIslOsl],
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
    (unmappedModels.size > 0 || unmappedHws.size > 0 || unmappedPrecisions.size > 0)
  ) {
    fs.writeFileSync(
      unmappedOutPath,
      JSON.stringify({
        models: [...unmappedModels],
        hardware: [...unmappedHws],
        precisions: [...unmappedPrecisions],
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
