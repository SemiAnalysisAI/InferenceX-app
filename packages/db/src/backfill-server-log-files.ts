/**
 * Backfill every .log/.out file from retained GitHub server-log artifacts.
 *
 * The script pairs server_logs_/multinode_server_logs_ artifacts with their
 * bmk[_agentic]_ sibling, maps the raw benchmark rows through the production
 * mapper, and attaches the log bundle to the exact persisted points. Inserts
 * use filename conflicts plus files_complete metadata, so reruns are safe.
 *
 * Usage:
 *   bun run --cwd packages/db db:backfill-server-log-files
 *   bun run --cwd packages/db db:backfill-server-log-files --run 31415828111 --yes
 *   bun run --cwd packages/db db:backfill-server-log-files --limit 5 --yes
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasNoSslFlag } from './cli-utils.js';
import { mapBenchmarkRow, type BenchmarkParams } from './etl/benchmark-mapper.js';
import { insertServerLogFiles } from './etl/benchmark-ingest.js';
import { createAdminSql } from './etl/db-utils.js';
import { readServerLogArtifact } from './etl/server-log-artifacts.js';
import { createSkipTracker } from './etl/skip-tracker.js';
import { downloadArtifact, listRunArtifacts } from './lib/github-artifacts.js';
import { confirmProceed, parseLimitForceFlags, runBackfillMain } from './lib/backfill-runner.js';
import { repositoryFromRunUrl } from './lib/runtime-metadata-artifacts.js';
import { pairServerLogArtifacts } from './lib/server-log-backfill.js';

const DEFAULT_REPO = 'SemiAnalysisAI/InferenceX';
const RETENTION_DAYS = 90;
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 2, onnotice: () => {} });

interface CandidateRun {
  github_run_id: number;
  run_attempt: number;
  html_url: string | null;
}

function parseRunFilter(): number | null {
  const index = process.argv.indexOf('--run');
  if (index === -1) return null;
  const raw = process.argv[index + 1];
  if (!raw || !/^\d+$/u.test(raw) || Number(raw) <= 0) {
    throw new Error('--run requires a positive GitHub Actions run ID');
  }
  return Number(raw);
}

function findJsonFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const pathname = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...findJsonFiles(pathname));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(pathname);
  }
  return files.toSorted();
}

function readMappedRows(root: string): BenchmarkParams[] {
  const tracker = createSkipTracker();
  const rows: BenchmarkParams[] = [];
  for (const file of findJsonFiles(root)) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const rawRows = Array.isArray(parsed) ? parsed : [parsed];
    for (const raw of rawRows) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const mapped = mapBenchmarkRow(raw as Record<string, unknown>, tracker);
      if (mapped) rows.push(mapped);
    }
  }
  return rows;
}

async function findBenchmarkResultIds(
  run: CandidateRun,
  rows: readonly BenchmarkParams[],
): Promise<number[]> {
  const ids = new Set<number>();
  for (const row of rows) {
    const c = row.config;
    const matches = await sql<{ id: number }[]>`
      select br.id
      from benchmark_results br
      join workflow_runs wr on wr.id = br.workflow_run_id
      join configs cfg on cfg.id = br.config_id
      where wr.github_run_id = ${run.github_run_id}
        and wr.run_attempt = ${run.run_attempt}
        and cfg.hardware = ${c.hardware}
        and cfg.framework = ${c.framework}
        and cfg.model = ${c.model}
        and cfg.precision = ${c.precision}
        and cfg.spec_method = ${c.specMethod}
        and cfg.disagg = ${c.disagg}
        and cfg.is_multinode = ${c.isMultinode}
        and cfg.prefill_tp = ${c.prefillTp}
        and cfg.prefill_ep = ${c.prefillEp}
        and cfg.prefill_dp_attention = ${c.prefillDpAttn}
        and cfg.prefill_num_workers = ${c.prefillNumWorkers}
        and cfg.decode_tp = ${c.decodeTp}
        and cfg.decode_ep = ${c.decodeEp}
        and cfg.decode_dp_attention = ${c.decodeDpAttn}
        and cfg.decode_num_workers = ${c.decodeNumWorkers}
        and cfg.num_prefill_gpu = ${c.numPrefillGpu}
        and cfg.num_decode_gpu = ${c.numDecodeGpu}
        and br.benchmark_type = ${row.benchmarkType}
        and br.isl is not distinct from ${row.isl}
        and br.osl is not distinct from ${row.osl}
        and br.conc = ${row.conc}
        and br.offload_mode = ${row.offloadMode}
        and br.recipe_fingerprint is not distinct from ${row.recipeFingerprint}
    `;
    for (const match of matches) ids.add(Number(match.id));
  }
  return [...ids];
}

async function main(): Promise<void> {
  console.log('=== backfill-server-log-files ===');
  const runFilter = parseRunFilter();
  const { limit } = parseLimitForceFlags();
  const runs = await sql<CandidateRun[]>`
    select distinct wr.github_run_id, wr.run_attempt, wr.html_url
    from workflow_runs wr
    join benchmark_results br on br.workflow_run_id = wr.id
    where (${runFilter}::bigint is null or wr.github_run_id = ${runFilter})
      and (${runFilter}::bigint is not null or wr.date >= current_date - ${RETENTION_DAYS}::integer)
    order by wr.github_run_id, wr.run_attempt
    ${limit === null ? sql`` : sql`limit ${limit}`}
  `;
  if (runs.length === 0) {
    console.log('  Nothing to do.');
    return;
  }
  if (!(await confirmProceed(`${runs.length} workflow run(s) will be checked for log files.`))) {
    return;
  }

  let artifactsProcessed = 0;
  let filesStored = 0;
  let pointsLinked = 0;
  let failures = 0;
  for (const [runIndex, run] of runs.entries()) {
    const runId = Number(run.github_run_id);
    const repository = repositoryFromRunUrl(run.html_url) ?? DEFAULT_REPO;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `server-log-backfill-${runId}-`));
    try {
      const pairs = pairServerLogArtifacts(listRunArtifacts(repository, String(runId)));
      for (const pair of pairs) {
        const benchmarkDir = downloadArtifact(pair.benchmarks, tempDir);
        const serverLogDir = downloadArtifact(pair.serverLogs, tempDir);
        const mappedRows = readMappedRows(benchmarkDir);
        const resultIds = await findBenchmarkResultIds(run, mappedRows);
        if (resultIds.length === 0) {
          console.warn(`  [WARN] ${pair.serverLogs.name}: no matching benchmark rows`);
          continue;
        }
        const logFiles = readServerLogArtifact({
          artifactName: pair.serverLogs.name,
          artifactDir: serverLogDir,
        });
        if (logFiles.length === 0) {
          console.warn(`  [WARN] ${pair.serverLogs.name}: no .log/.out files`);
          continue;
        }
        await insertServerLogFiles(sql, resultIds, logFiles);
        artifactsProcessed++;
        filesStored += logFiles.length;
        pointsLinked += resultIds.length;
      }
      console.log(
        `  [${runIndex + 1}/${runs.length}] ${repository} run ${runId}: ${pairs.length} paired artifact(s)`,
      );
    } catch (error) {
      failures++;
      console.error(`  ✗ ${repository} run ${runId}:`, error);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log(
    `\n=== backfill complete: ${artifactsProcessed} artifact(s), ${filesStored} file(s), ` +
      `${pointsLinked} point link(s), ${failures} failed run(s) ===`,
  );
  console.log('  Invalidate API cache after the backfill: bun run admin:cache:invalidate');
  if (failures > 0) process.exitCode = 1;
}

runBackfillMain('backfill-server-log-files', sql, main);
