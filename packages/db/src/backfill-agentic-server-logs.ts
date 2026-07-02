/**
 * Backfill server logs (and the derived KV-cache pool size) for AGENTIC
 * benchmark points.
 *
 * Agentic runs upload their vLLM server log as a `server_logs_<key>` artifact,
 * but the ingest path historically failed to link it to agentic rows (the
 * `bmk_agentic_<key>` → `server_logs_<key>` key mismatch, now fixed in
 * ingest-ci-run). As a result the agentic server log text was never stored, so
 * `kv_cache_pool_tokens` cannot be derived from the DB — we must re-fetch the
 * artifacts from GitHub.
 *
 * For each agentic workflow run this:
 *   1. lists the run's artifacts and keeps only `server_logs_*` + `bmk_agentic_*`
 *      (dedup by logical name, mirroring ingest's runner-suffix collapse),
 *   2. downloads + unzips just those (small — skips the multi-MB trace dirs),
 *   3. maps each `bmk_agentic_<key>` JSON → config → benchmark_results rows via
 *      the same mapBenchmarkRow/config-cache logic ingest uses,
 *   4. calls insertServerLog(), which stores+links the log AND derives
 *      `kv_cache_pool_tokens` into benchmark_results.metrics.
 *
 * Idempotent: insertServerLog only links rows whose server_log_id is null.
 *
 * Usage:
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-agentic-server-logs
 *     [--limit N]   only process the first N workflow runs
 *     [--yes]       skip the confirmation prompt
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasNoSslFlag } from './cli-utils';
import { insertServerLog } from './etl/benchmark-ingest';
import { mapBenchmarkRow } from './etl/benchmark-mapper';
import { createConfigCache } from './etl/config-cache';
import { createAdminSql } from './etl/db-utils';
import { createSkipTracker } from './etl/skip-tracker';
import { confirmProceed, parseLimitForceFlags, runBackfillMain } from './lib/backfill-runner';
import {
  RUNNER_SUFFIX_RE,
  dedupeArtifactsByLogicalName,
  downloadArtifact,
  listRunArtifacts,
  type ArtifactMeta,
} from './lib/github-artifacts';

const REPO = 'SemiAnalysisAI/InferenceX';

const flags = parseLimitForceFlags();
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

/**
 * List the run's `server_logs_*` / `bmk_agentic_*` artifacts, deduped by
 * runner-suffix-stripped logical name (matches ingest's collapse).
 */
function listArtifacts(githubRunId: string): Map<string, ArtifactMeta> {
  return dedupeArtifactsByLogicalName(
    listRunArtifacts(REPO, githubRunId).filter(
      (a) => a.name.startsWith('server_logs_') || a.name.startsWith('bmk_agentic_'),
    ),
  );
}

/** Logical key shared by a server_logs_/bmk_agentic_ artifact pair. */
function logicalKey(name: string): string {
  return name
    .replace(/^server_logs_/u, '')
    .replace(/^bmk_agentic_/u, '')
    .replace(RUNNER_SUFFIX_RE, '');
}

/**
 * Read up to `maxBytes` of a (possibly huge) server log as UTF-8, stripping NUL
 * bytes. vLLM's "GPU KV cache size" startup lines are near the top, so a head
 * read is enough to derive the KV pool — and it caps storage for the rare
 * multi-hundred-MB logs that exceed V8's ~512 MB string limit.
 */
const stripNul = (s: string): string => s.replaceAll(String.fromCodePoint(0), '');

function readServerLogCapped(p: string, maxBytes = 64 * 1024 * 1024): string {
  if (fs.statSync(p).size <= maxBytes) return stripNul(fs.readFileSync(p, 'utf8'));
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    return stripNul(buf.subarray(0, n).toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

function findJsonFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

async function main(): Promise<void> {
  console.log('=== backfill-agentic-server-logs ===');
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  // Agentic workflow runs that still have unlinked server logs.
  const runs = await sql<{ github_run_id: string; workflow_run_id: number }[]>`
    select distinct wr.github_run_id::text as github_run_id, wr.id as workflow_run_id
    from benchmark_results br
    join workflow_runs wr on wr.id = br.workflow_run_id
    where br.benchmark_type = 'agentic_traces'
      and br.server_log_id is null
    order by wr.id
    ${flags.limit ? sql`limit ${flags.limit}` : sql``}
  `;

  if (runs.length === 0) {
    console.log('\n  Nothing to do — all agentic rows already have a server log.');
    return;
  }
  if (!(await confirmProceed(`${runs.length} agentic workflow run(s) to process.`))) return;

  const cache = createConfigCache(sql);
  await cache.preloadConfigs();
  const tracker = createSkipTracker();

  let linkedRows = 0;
  let runsOk = 0;
  let runsFailed = 0;
  const t0 = Date.now();

  for (const { github_run_id: githubRunId, workflow_run_id: wrId } of runs) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kvpool-${githubRunId}-`));
    try {
      const artifacts = listArtifacts(githubRunId);
      // server log path by logical key
      const serverLogByKey = new Map<string, string>();
      const bmkDirs: string[] = [];
      for (const art of artifacts.values()) {
        const dir = downloadArtifact(art, tmp);
        if (art.name.startsWith('server_logs_')) {
          const logPath = path.join(dir, 'server.log');
          if (fs.existsSync(logPath)) serverLogByKey.set(logicalKey(art.name), logPath);
        } else {
          bmkDirs.push(dir);
        }
      }

      let runLinked = 0;
      for (const bmkDir of bmkDirs) {
        const key = logicalKey(path.basename(bmkDir));
        const logPath = serverLogByKey.get(key);
        if (!logPath) continue;
        for (const file of findJsonFiles(bmkDir)) {
          let raw: unknown;
          try {
            raw = JSON.parse(fs.readFileSync(file, 'utf8'));
          } catch {
            continue;
          }
          const rows = Array.isArray(raw) ? raw : [raw];
          for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            const mapped = mapBenchmarkRow(row as Record<string, unknown>, tracker);
            if (!mapped || mapped.benchmarkType !== 'agentic_traces') continue;
            const configId = await cache.getOrCreateConfig(mapped.config);
            const ids = await sql<{ id: number }[]>`
              select id from benchmark_results
              where workflow_run_id = ${wrId}
                and config_id = ${configId}
                and conc = ${mapped.conc}
                and benchmark_type = 'agentic_traces'
                and server_log_id is null
            `;
            if (ids.length === 0) continue;
            const serverLog = readServerLogCapped(logPath);
            await insertServerLog(
              sql,
              ids.map((r) => r.id),
              serverLog,
            );
            runLinked += ids.length;
          }
        }
      }
      linkedRows += runLinked;
      runsOk++;
      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(
        `  ✓ run ${githubRunId}: ${serverLogByKey.size} log(s), linked ${runLinked} row(s) ` +
          `(${runsOk}/${runs.length}, ${elapsed}s total)`,
      );
    } catch (error) {
      runsFailed++;
      console.error(
        `  ✗ run ${githubRunId}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  const totalSec = Math.round((Date.now() - t0) / 1000);
  console.log(
    `\n=== complete: ${linkedRows} row(s) linked across ${runsOk} run(s) ` +
      `(${runsFailed} failed) in ${totalSec}s ===`,
  );
  if (runsFailed > 0) process.exitCode = 1;
}

runBackfillMain('backfill-agentic-server-logs', sql, main);
