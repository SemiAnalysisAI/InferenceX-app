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
 */

import { execSync } from 'child_process';
import postgres from 'postgres';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { GPU_KEYS } from '@semianalysisai/inferencex-constants';

import { PURGED_RUNS } from './etl/run-overrides';
import { createSkipTracker } from './etl/skip-tracker';
import { createConfigCache } from './etl/config-cache';
import { createWorkflowRunServices } from './etl/workflow-run';
import { mapBenchmarkRow } from './etl/benchmark-mapper';
import {
  bulkIngestBenchmarkRows,
  bulkIngestRunStats,
  bulkUpsertAvailability,
  insertServerLog,
} from './etl/benchmark-ingest';
import { mapAggEvalRow } from './etl/eval-mapper';
import { ingestEvalRow } from './etl/eval-ingest';
import { parseChangelogEntries, ingestChangelogEntries } from './etl/changelog-ingest';

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

  const match = input.match(/\/runs\/(\d+)/);
  const parsedId = match ? match[1] : /^\d+$/.test(input) ? input : null;
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
    `gh api "repos/${REPO}/actions/runs/${runIdStr}/artifacts" --paginate`,
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 },
  );

  const allArtifacts: Array<{ name: string; archive_download_url: string; created_at: string }> =
    [];
  for (const line of artifactListJson.trim().split('\n')) {
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.artifacts) allArtifacts.push(...parsed.artifacts);
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
    { encoding: 'utf-8' },
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

const runIdNum = parseInt(runIdStr, 10);
if (PURGED_RUNS.has(runIdNum)) {
  console.log(`  Run ${runIdStr} is in PURGED_RUNS — skipping.`);
  process.exit(0);
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;

const sql = postgres(process.env.DATABASE_WRITE_URL!, {
  ssl: 'require',
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
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err: any) {
    console.warn(`  [WARN] Failed to parse ${path.basename(filePath)}: ${err.message}`);
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
  console.log('\n=== ingest-ci-run ===');
  console.log(`  Run ID:      ${runIdStr}`);
  console.log(`  Attempt:     ${runAttemptNum}`);
  console.log(`  Artifacts:   ${artifactsDir}`);
  console.log(`  Repo:        ${REPO}`);

  const tracker = createSkipTracker();
  const configCache = createConfigCache(sql);
  const { getOrCreateConfig, preloadConfigs } = configCache;
  const { fetchGithubRun, getOrCreateWorkflowRun } = createWorkflowRunServices(sql, GITHUB_TOKEN);

  await preloadConfigs();
  console.log(`  ${configCache.size} configs preloaded`);

  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`Artifacts directory does not exist: ${artifactsDir}`);
  }

  const runId = parseInt(runIdStr, 10);
  const ghInfo = await fetchGithubRun(runId);
  const date = ghInfo?.createdAt
    ? ghInfo.createdAt.split('T')[0]
    : new Date().toISOString().split('T')[0];

  const workflowRunId = await getOrCreateWorkflowRun({
    githubRunId: runId,
    runAttempt: runAttemptNum,
    name: ghInfo?.name || `CI Run ${runIdStr}`,
    date,
    headBranch: ghInfo?.headBranch,
    headSha: ghInfo?.headSha,
    createdAt: ghInfo?.createdAt || new Date().toISOString(),
    ghInfo,
  });
  if (workflowRunId === null) {
    console.log(`  Run ${runId} is in PURGED_RUNS — skipping ingest.`);
    return;
  }
  console.log(`  Workflow run DB id: ${workflowRunId}`);

  const availRows: Array<{
    model: string;
    isl: number;
    osl: number;
    precision: string;
    hardware: string;
    framework: string;
    specMethod: string;
    disagg: boolean;
  }> = [];

  let totalNewBmk = 0,
    totalDupBmk = 0;
  let totalNewStats = 0,
    totalDupStats = 0;
  let totalEvals = 0;
  let totalChangelogs = 0;

  // ── Ingest benchmark results ──────────────────────────────────────────

  console.log('\n--- Benchmark Results ---');
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
      const logPath = path.join(artifactsDir, d, 'server.log');
      if (!fs.existsSync(logPath)) continue;
      const configKey = d.replace(/^server_logs_/, '');
      serverLogPaths.set(configKey, logPath);
    }
  }
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

    const toInsert = [];
    for (const row of rows) {
      try {
        const configId = await getOrCreateConfig(row.config);
        toInsert.push({ ...row, configId });
      } catch (err: any) {
        tracker.recordDbError(`config for ${path.basename(file)}`, err);
      }
    }

    if (toInsert.length > 0) {
      try {
        const { newCount, dupCount, insertedIds } = await bulkIngestBenchmarkRows(
          sql,
          toInsert,
          workflowRunId,
          date,
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
          });
        }

        const parentDir = path.basename(path.dirname(file));
        if (parentDir.startsWith('bmk_') && insertedIds.length > 0) {
          const configKey = parentDir.replace(/^bmk_/, '');
          const logPath = serverLogPaths.get(configKey);
          if (logPath) {
            try {
              const serverLog = fs.readFileSync(logPath, 'utf-8').replaceAll('\x00', '');
              await insertServerLog(sql, insertedIds, serverLog);
            } catch (err: any) {
              tracker.recordDbError(`server_log for ${configKey}`, err);
            }
          }
        }
      } catch (err: any) {
        tracker.recordDbError(path.basename(file), err);
      }
    }
  }
  console.log(`  Benchmarks: +${totalNewBmk} new, ${totalDupBmk} dup`);

  if (availRows.length > 0) {
    try {
      await bulkUpsertAvailability(sql, availRows, date);
      console.log(`  Availability: ${availRows.length} row(s) upserted`);
    } catch (err: any) {
      tracker.recordDbError('availability', err);
    }
  }

  // ── Ingest run stats ──────────────────────────────────────────────────

  console.log('\n--- Run Stats ---');
  const statsDir = path.join(artifactsDir, ARTIFACT_NAMES.runStats);
  const statsFiles = findJsonFiles(statsDir);

  const statsRows: Array<{ hardware: string; nSuccess: number; total: number }> = [];
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
      const { newCount, dupCount } = await bulkIngestRunStats(sql, statsRows, workflowRunId, date);
      totalNewStats = newCount;
      totalDupStats = dupCount;
    } catch (err: any) {
      tracker.recordDbError('run_stats', err);
    }
  }
  console.log(`  Run stats: +${totalNewStats} new, ${totalDupStats} dup`);

  // ── Ingest eval results ───────────────────────────────────────────────

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
        const outcome = await ingestEvalRow(sql, getOrCreateConfig, mapped, workflowRunId, date);
        if (outcome === 'new') totalEvals++;
      } catch (err: any) {
        tracker.recordDbError('eval row', err);
      }
    }
  }
  console.log(`  Eval results: +${totalEvals} new`);

  // ── Ingest changelog ──────────────────────────────────────────────────

  console.log('\n--- Changelog ---');
  const changelogDir = path.join(artifactsDir, ARTIFACT_NAMES.changelog);
  const changelogFiles = findJsonFiles(changelogDir);

  for (const file of changelogFiles) {
    const data = readJson(file) as Record<string, any> | null;
    if (!data || typeof data !== 'object') continue;
    const baseRef = String(data.base_ref ?? '');
    const headRef = String(data.head_ref ?? '');
    if (!baseRef || !headRef) continue;

    const entries = parseChangelogEntries(data.entries);
    if (entries.length > 0) {
      try {
        const inserted = await ingestChangelogEntries(
          sql,
          workflowRunId,
          date,
          baseRef,
          headRef,
          entries,
        );
        totalChangelogs += inserted;
      } catch (err: any) {
        tracker.recordDbError('changelog', err);
      }
    }
  }
  console.log(`  Changelog: +${totalChangelogs} new`);

  // ── Summary ───────────────────────────────────────────────────────────

  const [configCount] = await sql`select count(*)::int as n from configs`;
  const [resultCount] = await sql`select count(*)::int as n from benchmark_results`;
  const [statsCount] = await sql`select count(*)::int as n from run_stats`;
  const [evalCount] = await sql`select count(*)::int as n from eval_results`;
  const [changelogCount] = await sql`select count(*)::int as n from changelog_entries`;

  console.log('\n=== Summary ===');
  console.log(
    `  Benchmark results: ${totalNewBmk} new, ${totalDupBmk} duplicate (ON CONFLICT updates)`,
  );
  console.log(
    `  Run stats:         ${totalNewStats} new, ${totalDupStats} duplicate (ON CONFLICT updates)`,
  );
  console.log(`  Eval results:      ${totalEvals} new`);
  console.log(`  Changelog entries: ${totalChangelogs} new`);
  console.log(`\n  DB totals:`);
  console.log(`    configs           ${configCount.n}`);
  console.log(`    benchmark_results ${resultCount.n}`);
  console.log(`    run_stats         ${statsCount.n}`);
  console.log(`    eval_results      ${evalCount.n}`);
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

  process.stdout.write('\n  Refreshing latest_benchmarks materialized view...');
  const mvStart = Date.now();
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY latest_benchmarks`;
  console.log(` ${Math.round((Date.now() - mvStart) / 1000)}s`);

  console.log('\n=== ingest-ci-run complete ===');
}

main()
  .catch((err) => {
    console.error('ingest-ci-run failed:', err);
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
