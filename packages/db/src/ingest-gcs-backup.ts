/**
 * Ingest raw GCS backup ZIP artifacts into the Postgres database.
 *
 * Reads the local mirror of gs://inferencemax-gha-backup/:
 *   {gcs_dir}/{date}/{workflow_dir}/artifacts/*.zip
 *
 * ZIP categories processed:
 *   bmk_*                  → single benchmark result dict (new format, 2025-12-17+)
 *   results_*              → compiled result array (old + new formats)
 *   run-stats_*            → reliability stats dict: { hw: { n_success, total } }
 *   run_stats_*            → same, alternate naming convention
 *   eval_results_all_*     → compiled eval aggregate (agg_eval_all.json, flat rows)
 *   eval_*                 → single eval result (meta_env.json + results_*.json)
 *   changelog-metadata_*   → changelog entries (base_ref, head_ref, entries[])
 *   server_logs_*          → server log text (server.log inside ZIP)
 *
 * All inserts are idempotent (ON CONFLICT DO UPDATE/NOTHING), so re-running is safe.
 *
 * Processing is split into two parallel phases:
 *   Phase 1 (CONCURRENCY):    ZIP reading, JSON parsing, row mapping, GitHub API fetches.
 *   Phase 2 (DB_CONCURRENCY): DB writes (config resolution, bulk inserts, server log upserts).
 *
 * Sync GCS bucket first (incremental, skips existing files):
 *   gsutil -m rsync -r gs://inferencemax-gha-backup/ ./gcs/
 *
 * Usage:
 *   pnpm admin:db:ingest:gcs
 */

import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

import { confirm, hasYesFlag } from './cli-utils';
import { PURGED_RUNS } from './etl/run-overrides';
import { createSkipTracker, type Skips } from './etl/skip-tracker';
import { GPU_KEYS, parseIslOsl } from './etl/normalizers';
import { createConfigCache } from './etl/config-cache';
import { createWorkflowRunServices, type GithubRunInfo } from './etl/workflow-run';
import { mapBenchmarkRow, type BenchmarkParams } from './etl/benchmark-mapper';
import {
  bulkIngestBenchmarkRows,
  bulkIngestRunStats,
  bulkUpsertAvailability,
  insertServerLog,
} from './etl/benchmark-ingest';
import { mapEvalRow, mapAggEvalRow, type EvalParams } from './etl/eval-mapper';
import { ingestEvalRow } from './etl/eval-ingest';
import {
  parseChangelogEntries,
  ingestChangelogEntries,
  hasEvalsOnlyFlag,
} from './etl/changelog-ingest';
import { readZipJson, readZipJsonMap, readZipText } from './etl/zip-reader';

const GCS_DIR = path.join(import.meta.dirname, '..', '..', '..', 'gcs');
const CONCURRENCY = 20;
const DB_CONCURRENCY = 10;

if (!process.env.DATABASE_WRITE_URL) {
  console.error('DATABASE_WRITE_URL is required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_WRITE_URL, {
  ssl: 'require',
  max: 20,
  idle_timeout: 60,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type ChangelogEntry = ReturnType<typeof parseChangelogEntries>[number];

interface WorkflowMapResult {
  dateDir: string;
  workflowDir: string;
  githubRunId: number;
  runName: string;
  headBranch: string | undefined;
  headSha: string | undefined;
  createdAt: string;
  ghInfo: GithubRunInfo | null;
  /** Per-ZIP benchmark rows, ready for configId lookup + bulk insert in phase 2. */
  bmkZips: Array<{ zipFile: string; rows: BenchmarkParams[]; serverLogPath?: string }>;
  statsRows: Array<{ hardware: string; nSuccess: number; total: number }>;
  evalRows: EvalParams[];
  changelogs: Array<{ baseRef: string; headRef: string; entries: ChangelogEntry[] }>;
  /** True when the changelog declares evals-only — benchmark/stats data is dropped. */
  evalsOnly: boolean;
  /** Skip counts from mapping phase (dbError is tracked separately in phase 2). */
  localSkips: Omit<Skips, 'dbError'>;
  localUnmappedModels: Set<string>;
  localUnmappedHws: Set<string>;
  /** Pre-formatted [WARN] lines to print at the start of phase 2 for this dir. */
  warnings: string[];
}

interface WriteResult {
  newBmk: number;
  dupBmk: number;
  newStats: number;
  dupStats: number;
  evals: number;
  changelogs: number;
  warnings: string[];
  localSkips: Omit<Skips, 'dbError'>;
  localUnmappedModels: string[];
  localUnmappedHws: string[];
}

// ── Concurrency helper ────────────────────────────────────────────────────────

/**
 * Run `fn` over `items` with at most `concurrency` tasks in-flight at once.
 * Result order matches input order. Per-item errors are caught and returned as
 * `null` (with a logged message) so one bad task doesn't abort the whole run.
 */
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R | null>,
  concurrency: number,
): Promise<(R | null)[]> {
  const results: (R | null)[] = Array.from({ length: items.length }, () => null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch (err: any) {
        console.error(`  [ERROR] mapping task ${i} failed: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ── Phase 1: map a single workflow dir (no DB) ────────────────────────────────

async function mapWorkflowDir(
  dateDir: string,
  workflowDir: string,
  datePath: string,
  fetchGithubRun: (id: number) => Promise<GithubRunInfo | null>,
): Promise<WorkflowMapResult | null> {
  const artifactsPath = path.join(datePath, workflowDir, 'artifacts');
  if (!fs.existsSync(artifactsPath)) return null;

  // ── Resolve workflow run metadata ─────────────────────────────────────────
  let githubRunId: number | null = null;
  let headBranch: string | undefined;
  let headSha: string | undefined;
  let createdAt = `${dateDir}T00:00:00Z`;

  const metaPath = path.join(artifactsPath, 'artifacts_metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (Array.isArray(meta) && meta[0]?.workflow_run?.id) {
        githubRunId = meta[0].workflow_run.id;
        headBranch = meta[0].workflow_run.head_branch ?? undefined;
        headSha = meta[0].workflow_run.head_sha ?? undefined;
        createdAt = meta[0].created_at ?? createdAt;
      }
    } catch {
      /* ignore malformed metadata */
    }
  }
  if (!githubRunId) {
    const match = workflowDir.match(/_(\d{10,})$/);
    if (match) githubRunId = parseInt(match[1], 10);
  }
  if (!githubRunId) {
    console.warn(`  [${dateDir}] no run ID found for: ${workflowDir.slice(0, 60)}`);
    return null;
  }
  if (PURGED_RUNS.has(githubRunId)) {
    console.log(`  [${dateDir}] skipping ignored run ${githubRunId}`);
    return null;
  }

  // ── Classify artifact ZIPs ────────────────────────────────────────────────
  const zipFiles = fs.readdirSync(artifactsPath).filter((f) => f.endsWith('.zip'));
  const bmkZipFiles = zipFiles.filter((f) => f.startsWith('bmk_'));
  const resultZips = zipFiles.filter((f) => f.startsWith('results_'));
  const statsZips = zipFiles.filter(
    (f) => f.startsWith('run-stats_') || f.startsWith('run_stats_'),
  );
  const evalAggZips = zipFiles.filter((f) => f.startsWith('eval_results_all_'));
  const evalZips = zipFiles.filter(
    (f) => f.startsWith('eval_') && !f.startsWith('eval_results_all_'),
  );
  const changelogZips = zipFiles.filter((f) => f.startsWith('changelog-metadata_'));
  const serverLogZips = zipFiles.filter((f) => f.startsWith('server_logs_'));

  if (
    bmkZipFiles.length +
      resultZips.length +
      statsZips.length +
      evalAggZips.length +
      evalZips.length +
      changelogZips.length ===
    0
  )
    return null;

  const islOslFallback = parseIslOsl(workflowDir);
  const runName =
    workflowDir
      .replace(/_\d{10,}$/, '')
      .replace(/_/g, ' ')
      .trim() || `Run ${githubRunId}`;

  // GitHub API fetch — the main reason this runs concurrently
  const ghInfo = await fetchGithubRun(githubRunId);

  // Local skip tracker — mutations stay isolated to this task
  const local = createSkipTracker();
  const warnings: string[] = [];

  // ── Index server log ZIPs (deferred read — too large for memory) ─────────
  // Map configKey → zip file path. Actual text is read lazily in phase 2.
  const serverLogPaths = new Map<string, string>();
  for (const zipFile of serverLogZips) {
    const configKey = zipFile.replace(/^server_logs_/, '').replace(/_\d+_\d+\.zip$/, '');
    serverLogPaths.set(configKey, path.join(artifactsPath, zipFile));
  }

  // ── Map benchmark ZIPs ────────────────────────────────────────────────────
  const bmkZips: WorkflowMapResult['bmkZips'] = [];
  for (const zipFile of [...bmkZipFiles, ...resultZips]) {
    const data = readZipJson(path.join(artifactsPath, zipFile));
    if (!data) {
      local.skips.badZip++;
      warnings.push(`  [WARN] ${dateDir}/${zipFile}: bad/empty zip — skipped`);
      continue;
    }
    const rawRows: Record<string, any>[] = Array.isArray(data)
      ? data
      : [data as Record<string, any>];
    const snap = local.snapshot();
    const rows: BenchmarkParams[] = [];
    for (const row of rawRows) {
      if (typeof row !== 'object' || row === null) {
        local.skips.badZip++;
        continue;
      }
      const mapped = mapBenchmarkRow(row, local, islOslFallback);
      if (mapped) rows.push(mapped);
    }
    const d = local.diff(snap);
    if (d.droppedModel + d.droppedHw + d.droppedIslOsl > 0) {
      const parts: string[] = [];
      if (d.droppedModel)
        parts.push(`unmapped model (${d.newModels.join(', ')}): ${d.droppedModel}`);
      if (d.droppedHw) parts.push(`unmapped hw (${d.newHws.join(', ')}): ${d.droppedHw}`);
      if (d.droppedIslOsl) parts.push(`no isl/osl: ${d.droppedIslOsl}`);
      warnings.push(
        `  [WARN] ${dateDir}/${zipFile}: ${d.droppedModel + d.droppedHw + d.droppedIslOsl} rows dropped — ${parts.join('; ')}`,
      );
    }
    if (rows.length > 0) {
      // Match server log by config key (bmk_ files only — results_ compiled zips have no matching logs)
      let serverLogPath: string | undefined;
      if (zipFile.startsWith('bmk_')) {
        const bmkConfigKey = zipFile.replace(/^bmk_/, '').replace(/_\d+_\d+\.zip$/, '');
        serverLogPath = serverLogPaths.get(bmkConfigKey);
      }
      bmkZips.push({ zipFile, rows, serverLogPath });
    }
  }

  // ── Map run_stats ZIPs ────────────────────────────────────────────────────
  const statsRows: WorkflowMapResult['statsRows'] = [];
  for (const zipFile of statsZips) {
    const data = readZipJson(path.join(artifactsPath, zipFile));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      local.skips.badZip++;
      warnings.push(`  [WARN] ${dateDir}/${zipFile}: bad/empty zip — skipped`);
      continue;
    }
    for (const [hwKey, stats] of Object.entries(data as Record<string, any>)) {
      if (!GPU_KEYS.has(hwKey)) continue;
      if (typeof stats?.n_success !== 'number' || typeof stats?.total !== 'number') continue;
      statsRows.push({ hardware: hwKey, nSuccess: stats.n_success, total: stats.total });
    }
  }

  // ── Map individual eval ZIPs ──────────────────────────────────────────────
  const evalRows: EvalParams[] = [];
  for (const zipFile of evalZips) {
    const files = readZipJsonMap(path.join(artifactsPath, zipFile));
    if (!files) {
      local.skips.badZip++;
      warnings.push(`  [WARN] ${dateDir}/${zipFile}: bad/empty zip — skipped`);
      continue;
    }
    const meta = files.get('meta_env.json') as Record<string, any> | undefined;
    const resultsEntry = [...files.entries()].find(
      ([k]) => k.startsWith('results_') && k.endsWith('.json'),
    );
    if (!meta || !resultsEntry) {
      local.skips.badZip++;
      warnings.push(
        `  [WARN] ${dateDir}/${zipFile}: missing meta_env.json or results_*.json — skipped`,
      );
      continue;
    }
    const results = resultsEntry[1] as Record<string, any> | null;
    if (!results) {
      local.skips.badZip++;
      warnings.push(`  [WARN] ${dateDir}/${zipFile}: results JSON unparsable — skipped`);
      continue;
    }
    const snap = local.snapshot();
    const mapped = mapEvalRow(meta, results, local);
    if (mapped.length === 0) {
      const d = local.diff(snap);
      const parts: string[] = [];
      if (d.droppedModel)
        parts.push(`unmapped model: ${meta.infmax_model_prefix ?? meta.model ?? '?'}`);
      if (d.droppedHw) parts.push(`unmapped hw: ${meta.hw ?? '?'}`);
      warnings.push(
        `  [WARN] ${dateDir}/${zipFile}: eval row dropped — ${parts.join('; ') || 'empty task results'}`,
      );
      continue;
    }
    evalRows.push(...mapped);
  }

  // ── Map compiled eval ZIPs ────────────────────────────────────────────────
  for (const zipFile of evalAggZips) {
    const files = readZipJsonMap(path.join(artifactsPath, zipFile));
    if (!files) {
      local.skips.badZip++;
      warnings.push(`  [WARN] ${dateDir}/${zipFile}: bad/empty zip — skipped`);
      continue;
    }
    const agg = files.get('agg_eval_all.json');
    if (!Array.isArray(agg)) {
      local.skips.badZip++;
      warnings.push(`  [WARN] ${dateDir}/${zipFile}: missing agg_eval_all.json — skipped`);
      continue;
    }
    for (const row of agg) {
      if (typeof row !== 'object' || row === null) continue;
      const snap = local.snapshot();
      const mapped = mapAggEvalRow(row as Record<string, any>, local);
      if (!mapped) {
        const d = local.diff(snap);
        const parts: string[] = [];
        if (d.droppedModel) parts.push(`unmapped model: ${(row as any).model ?? '?'}`);
        if (d.droppedHw) parts.push(`unmapped hw: ${(row as any).hw ?? '?'}`);
        warnings.push(
          `  [WARN] ${dateDir}/${zipFile}: agg eval row dropped — ${parts.join('; ') || 'mapping failed'}`,
        );
        continue;
      }
      evalRows.push(mapped);
    }
  }

  // ── Parse changelog ZIPs ──────────────────────────────────────────────────
  const changelogs: WorkflowMapResult['changelogs'] = [];
  for (const zipFile of changelogZips) {
    const data = readZipJson(path.join(artifactsPath, zipFile)) as Record<string, any> | null;
    if (!data || typeof data !== 'object') {
      local.skips.badZip++;
      warnings.push(`  [WARN] ${dateDir}/${zipFile}: bad/empty zip — skipped`);
      continue;
    }
    const baseRef = String(data.base_ref ?? '');
    const headRef = String(data.head_ref ?? '');
    if (!baseRef || !headRef) continue;
    const entries = parseChangelogEntries(data.entries);
    if (entries.length > 0) changelogs.push({ baseRef, headRef, entries });
  }

  const evalsOnly = hasEvalsOnlyFlag(changelogs);
  if (evalsOnly) {
    console.log(
      `  [${dateDir}] evals-only run ${githubRunId} — skipping ${bmkZips.length} benchmark ZIP(s) and ${statsRows.length} stats row(s)`,
    );
  }

  return {
    dateDir,
    workflowDir,
    githubRunId,
    runName,
    headBranch,
    headSha,
    createdAt,
    ghInfo,
    bmkZips: evalsOnly ? [] : bmkZips,
    statsRows: evalsOnly ? [] : statsRows,
    evalRows,
    changelogs,
    evalsOnly,
    localSkips: {
      badZip: local.skips.badZip,
      unmappedModel: local.skips.unmappedModel,
      unmappedHw: local.skips.unmappedHw,
      noIslOsl: local.skips.noIslOsl,
    },
    localUnmappedModels: new Set(local.unmappedModels),
    localUnmappedHws: new Set(local.unmappedHws),
    warnings,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== db:ingest:gcs ===');
  console.log(
    'This will ingest all GCS backup ZIP artifacts into the database.\n' +
      'Inserts are idempotent (ON CONFLICT), so re-running is safe.\n',
  );
  console.log(`  GCS_DIR:     ${GCS_DIR}`);
  console.log(`  CONCURRENCY: ${CONCURRENCY} (phase1), ${DB_CONCURRENCY} (phase2)\n`);

  if (!hasYesFlag()) {
    const ok = await confirm('Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  if (!fs.existsSync(GCS_DIR)) {
    console.error(`  ERROR: GCS_DIR not found: ${GCS_DIR}`);
    process.exit(1);
  }

  const tracker = createSkipTracker();
  const configCache = createConfigCache(sql);
  const { getOrCreateConfig, preloadConfigs } = configCache;
  const { fetchGithubRun, getOrCreateWorkflowRun } = createWorkflowRunServices(
    sql,
    process.env.GITHUB_TOKEN,
  );

  await preloadConfigs();
  console.log(`  ${configCache.size} configs preloaded`);

  const dateDirs = fs
    .readdirSync(GCS_DIR)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  console.log(`  ${dateDirs.length} date directories  (${dateDirs[0]} → ${dateDirs.at(-1)})`);

  // Build flat task list with a sync FS walk
  type Task = { dateDir: string; workflowDir: string; datePath: string };
  const tasks: Task[] = [];
  for (const dateDir of dateDirs) {
    const datePath = path.join(GCS_DIR, dateDir);
    for (const workflowDir of fs
      .readdirSync(datePath)
      .filter((d) => fs.statSync(path.join(datePath, d)).isDirectory())) {
      tasks.push({ dateDir, workflowDir, datePath });
    }
  }

  // ── Phase 1: parallel ZIP reading + mapping ───────────────────────────────
  process.stdout.write(`\n  Phase 1: mapping ${tasks.length} workflow dirs...`);
  const phase1Start = Date.now();
  const rawResults = await pMap(
    tasks,
    ({ dateDir, workflowDir, datePath }) =>
      mapWorkflowDir(dateDir, workflowDir, datePath, fetchGithubRun),
    CONCURRENCY,
  );
  console.log(` ${Math.round((Date.now() - phase1Start) / 1000)}s`);

  // Group by dateDir, preserving intra-date order from the task list
  const byDate = new Map<string, WorkflowMapResult[]>();
  for (const result of rawResults) {
    if (!result) continue;
    const arr = byDate.get(result.dateDir) ?? [];
    arr.push(result);
    byDate.set(result.dateDir, arr);
  }

  // ── Phase 2: parallel DB writes ───────────────────────────────────────────
  const phase2Start = Date.now();

  let totalNewBmk = 0,
    totalDupBmk = 0;
  let totalNewStats = 0,
    totalDupStats = 0;
  let totalEvals = 0,
    totalChangelogs = 0;

  async function writeWorkflowResult(result: WorkflowMapResult): Promise<WriteResult> {
    const wr: WriteResult = {
      newBmk: 0,
      dupBmk: 0,
      newStats: 0,
      dupStats: 0,
      evals: 0,
      changelogs: 0,
      warnings: result.warnings,
      localSkips: result.localSkips,
      localUnmappedModels: [...result.localUnmappedModels],
      localUnmappedHws: [...result.localUnmappedHws],
    };

    const workflowRunId = await getOrCreateWorkflowRun({
      githubRunId: result.githubRunId,
      name: result.runName,
      date: result.dateDir,
      headBranch: result.headBranch,
      headSha: result.headSha,
      createdAt: result.createdAt,
      ghInfo: result.ghInfo,
    });
    if (workflowRunId === null) return wr;

    const allInserted: Array<BenchmarkParams & { configId: number }> = [];
    for (const { zipFile, rows, serverLogPath } of result.bmkZips) {
      const toInsert: Array<BenchmarkParams & { configId: number }> = [];
      for (const row of rows) {
        try {
          const configId = await getOrCreateConfig(row.config);
          toInsert.push({ ...row, configId });
        } catch (err: any) {
          tracker.recordDbError(`config for ${zipFile}`, err);
        }
      }
      if (toInsert.length > 0) {
        try {
          const { newCount, dupCount, insertedIds } = await bulkIngestBenchmarkRows(
            sql,
            toInsert,
            workflowRunId,
            result.dateDir,
          );
          wr.newBmk += newCount;
          wr.dupBmk += dupCount;

          // Only track as inserted after successful bulk insert
          allInserted.push(...toInsert);

          // Attach server log (read lazily — too large to hold all in memory during phase 1)
          if (serverLogPath && insertedIds.length > 0) {
            const serverLog = readZipText(serverLogPath, 'server.log');
            if (serverLog) {
              // Strip null bytes — some logs contain 0x00 which PostgreSQL text columns reject
              const clean = serverLog.replaceAll('\x00', '');
              await insertServerLog(sql, insertedIds, clean);
            }
          }
        } catch (err: any) {
          tracker.recordDbError(zipFile, err);
        }
      }
    }

    // Upsert availability rows only for successfully resolved configs
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
    for (const r of allInserted) {
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
    if (availRows.length > 0) {
      try {
        await bulkUpsertAvailability(sql, availRows, result.dateDir);
      } catch (err: any) {
        tracker.recordDbError('availability batch', err);
      }
    }

    if (result.statsRows.length > 0) {
      try {
        const { newCount, dupCount } = await bulkIngestRunStats(
          sql,
          result.statsRows,
          workflowRunId,
          result.dateDir,
        );
        wr.newStats += newCount;
        wr.dupStats += dupCount;
      } catch (err: any) {
        tracker.recordDbError('run_stats batch', err);
      }
    }

    for (const p of result.evalRows) {
      try {
        const outcome = await ingestEvalRow(
          sql,
          getOrCreateConfig,
          p,
          workflowRunId,
          result.dateDir,
        );
        if (outcome === 'new') wr.evals++;
      } catch (err: any) {
        tracker.recordDbError('eval row', err);
      }
    }

    for (const { baseRef, headRef, entries } of result.changelogs) {
      try {
        const inserted = await ingestChangelogEntries(
          sql,
          workflowRunId,
          result.dateDir,
          baseRef,
          headRef,
          entries,
        );
        wr.changelogs += inserted;
      } catch (err: any) {
        tracker.recordDbError('changelog', err);
      }
    }

    return wr;
  }

  // Run all workflow dirs in parallel (up to CONCURRENCY at once).
  const allResults = [...byDate.values()].flat();
  let writesDone = 0;
  const writeOutputs = await pMap(
    allResults,
    async (r) => {
      const out = await writeWorkflowResult(r);
      writesDone++;
      process.stdout.write(`\r  Phase 2: writing to DB... ${writesDone}/${allResults.length}`);
      return out;
    },
    DB_CONCURRENCY,
  );

  // Accumulate totals per date, then print one line per date in sorted order.
  type DateTotal = {
    newBmk: number;
    dupBmk: number;
    newStats: number;
    dupStats: number;
    evals: number;
    changelogs: number;
    warnings: string[];
  };
  const dateTotals = new Map<string, DateTotal>();
  for (let i = 0; i < allResults.length; i++) {
    const result = allResults[i];
    const wr = writeOutputs[i];
    if (!wr) continue;

    tracker.skips.badZip += wr.localSkips.badZip;
    tracker.skips.unmappedModel += wr.localSkips.unmappedModel;
    tracker.skips.unmappedHw += wr.localSkips.unmappedHw;
    tracker.skips.noIslOsl += wr.localSkips.noIslOsl;
    for (const m of wr.localUnmappedModels) tracker.unmappedModels.add(m);
    for (const h of wr.localUnmappedHws) tracker.unmappedHws.add(h);

    totalNewBmk += wr.newBmk;
    totalDupBmk += wr.dupBmk;
    totalNewStats += wr.newStats;
    totalDupStats += wr.dupStats;
    totalEvals += wr.evals;
    totalChangelogs += wr.changelogs;

    const acc: DateTotal = dateTotals.get(result.dateDir) ?? {
      newBmk: 0,
      dupBmk: 0,
      newStats: 0,
      dupStats: 0,
      evals: 0,
      changelogs: 0,
      warnings: [],
    };
    acc.newBmk += wr.newBmk;
    acc.dupBmk += wr.dupBmk;
    acc.newStats += wr.newStats;
    acc.dupStats += wr.dupStats;
    acc.evals += wr.evals;
    acc.changelogs += wr.changelogs;
    acc.warnings.push(...wr.warnings);
    dateTotals.set(result.dateDir, acc);
  }

  console.log('\n');
  for (const dateDir of dateDirs) {
    const acc = dateTotals.get(dateDir);
    if (!acc) continue;
    for (const w of acc.warnings) console.warn(w);
    const parts: string[] = [];
    if (acc.newBmk + acc.dupBmk > 0) {
      parts.push(acc.dupBmk > 0 ? `+${acc.newBmk} bmk (${acc.dupBmk} dup)` : `+${acc.newBmk} bmk`);
    }
    if (acc.newStats + acc.dupStats > 0) {
      parts.push(
        acc.dupStats > 0
          ? `+${acc.newStats} stats (${acc.dupStats} dup)`
          : `+${acc.newStats} stats`,
      );
    }
    if (acc.evals > 0) parts.push(`+${acc.evals} eval`);
    if (acc.changelogs > 0) parts.push(`+${acc.changelogs} changelog`);
    if (parts.length > 0) console.log(`  ${dateDir}  ${parts.join('  ')}`);
  }

  console.log(` ${Math.round((Date.now() - phase2Start) / 1000)}s\n`);

  console.log('\n=== Maintenance ===');

  process.stdout.write('  Refreshing latest_benchmarks materialized view...');
  const mvStart = Date.now();
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY latest_benchmarks`;
  console.log(` ${Math.round((Date.now() - mvStart) / 1000)}s done`);

  process.stdout.write('  Vacuuming tables...');
  const vacuumEnd = Date.now();
  await sql.unsafe('VACUUM FULL benchmark_results, run_stats');
  console.log(` ${Math.round((Date.now() - vacuumEnd) / 1000)}s done`);

  // ── Summary ───────────────────────────────────────────────────────────────
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

  const { skips, unmappedModels, unmappedHws } = tracker;
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

  console.log('\n=== db:ingest:gcs complete ===');
}

main()
  .catch((err) => {
    console.error('ingest-gcs-backup failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
