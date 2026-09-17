/**
 * Backfill every .log/.out file from GitHub and the historical GCS backup.
 *
 * The script pairs server_logs_/multinode_server_logs_ artifacts with their
 * bmk[_agentic]_ sibling, maps the raw benchmark rows through the production
 * mapper, and attaches the log bundle to the exact persisted points. Inserts
 * use filename conflicts plus files_complete metadata, so reruns are safe.
 *
 * Usage:
 *   bun run --cwd packages/db db:backfill-server-log-files
 *   bun run --cwd packages/db db:backfill-server-log-files --run 31415828111 --yes
 *   bun run --cwd packages/db db:backfill-server-log-files --all --from-run 26606969606 --yes
 *   bun run --cwd packages/db db:backfill-server-log-files --all --source gcs --dry-run
 *   bun run --cwd packages/db db:backfill-server-log-files --all --source auto --yes
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasNoSslFlag } from './cli-utils.js';
import { insertServerLogFilePaths } from './etl/benchmark-ingest.js';
import { createAdminSql } from './etl/db-utils.js';
import { listServerLogFilePaths, serverLogArtifactRoot } from './etl/server-log-artifacts.js';
import { downloadArtifact, listRunArtifacts } from './lib/github-artifacts.js';
import {
  downloadGcsArtifact,
  listGcsServerLogArtifacts,
  type GcsArtifactMeta,
} from './lib/gcs-artifacts.js';
import { confirmProceed, parseLimitForceFlags, runBackfillMain } from './lib/backfill-runner.js';
import { retryArtifactOperation } from './lib/artifact-retry.js';
import { findBenchmarkResultIds, readMappedBenchmarkRows } from './lib/benchmark-result-lookup.js';
import { repositoryFromRunUrl } from './lib/runtime-metadata-artifacts.js';
import { pairServerLogArtifacts } from './lib/server-log-backfill.js';

const DEFAULT_REPO = 'SemiAnalysisAI/InferenceX';
const RETENTION_DAYS = 90;
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 2, onnotice: () => {} });

interface CandidateRun {
  github_run_id: number;
  run_attempt: number;
  html_url: string | null;
  date: string;
}

type ArtifactSource = 'auto' | 'github' | 'gcs';

interface BackfillFlags {
  all: boolean;
  dryRun: boolean;
  source: ArtifactSource;
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

function parseFromRunFilter(): number | null {
  const index = process.argv.indexOf('--from-run');
  if (index === -1) return null;
  const raw = process.argv[index + 1];
  if (!raw || !/^\d+$/u.test(raw) || Number(raw) <= 0) {
    throw new Error('--from-run requires a positive GitHub Actions run ID');
  }
  return Number(raw);
}

function parseBackfillFlags(): BackfillFlags {
  let source: ArtifactSource = 'auto';
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] !== '--source') continue;
    const value = process.argv[++i];
    if (value !== 'auto' && value !== 'github' && value !== 'gcs') {
      throw new Error('--source requires auto, github, or gcs');
    }
    source = value;
  }
  return {
    all: process.argv.includes('--all'),
    dryRun: process.argv.includes('--dry-run'),
    source,
  };
}

async function resultLogsAreComplete(resultIds: readonly number[]): Promise<boolean> {
  if (resultIds.length === 0) return false;
  const [row] = await sql<{ complete: boolean }[]>`
    select count(*) = ${resultIds.length} as complete
    from benchmark_results br
    join server_logs sl on sl.id = br.server_log_id
    where br.id = any(${sql.array([...resultIds])}::bigint[])
      and sl.files_complete
  `;
  return row?.complete ?? false;
}

function gcsCompressedBytes(pairs: readonly ReturnType<typeof pairServerLogArtifacts>[number][]) {
  return pairs.reduce((total, pair) => total + ((pair.serverLogs as GcsArtifactMeta).size ?? 0), 0);
}

function isWithinGithubRetention(date: string, now = new Date()): boolean {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  return new Date(`${date}T23:59:59Z`) >= cutoff;
}

async function main(): Promise<void> {
  console.log('=== backfill-server-log-files ===');
  const runFilter = parseRunFilter();
  const fromRunFilter = parseFromRunFilter();
  if (runFilter !== null && fromRunFilter !== null) {
    throw new Error('--run and --from-run cannot be combined');
  }
  const flags = parseBackfillFlags();
  const { limit } = parseLimitForceFlags();
  const runs = await sql<CandidateRun[]>`
    select distinct wr.github_run_id, wr.run_attempt, wr.html_url, wr.date::text as date
    from workflow_runs wr
    join benchmark_results br on br.workflow_run_id = wr.id
    where (${runFilter}::bigint is null or wr.github_run_id = ${runFilter})
      and (${fromRunFilter}::bigint is null or wr.github_run_id >= ${fromRunFilter})
      and (
        ${runFilter}::bigint is not null
        or ${flags.all}
        or wr.date >= current_date - ${RETENTION_DAYS}::integer
      )
    order by wr.github_run_id, wr.run_attempt
    ${limit === null ? sql`` : sql`limit ${limit}`}
  `;
  if (runs.length === 0) {
    console.log('  Nothing to do.');
    return;
  }

  let gcsByRun = new Map<number, GcsArtifactMeta[]>();
  if (flags.source !== 'github') {
    process.stdout.write('  Indexing public GCS artifact backup...');
    gcsByRun = await listGcsServerLogArtifacts();
    console.log(` ${gcsByRun.size} run(s) indexed`);
  }

  if (flags.dryRun) {
    let pairedRuns = 0;
    let pairs = 0;
    let compressedBytes = 0;
    let missing = 0;
    for (const run of runs) {
      const runPairs = pairServerLogArtifacts(gcsByRun.get(Number(run.github_run_id)) ?? []);
      if (runPairs.length === 0) missing++;
      else pairedRuns++;
      pairs += runPairs.length;
      compressedBytes += gcsCompressedBytes(runPairs);
    }
    console.log(
      `\n=== dry run: ${runs.length} DB run attempt(s), ${pairedRuns} with GCS pairs, ` +
        `${pairs} pair(s), ${(compressedBytes / 2 ** 30).toFixed(2)} GiB compressed, ` +
        `${missing} without GCS pairs ===`,
    );
    return;
  }

  if (!(await confirmProceed(`${runs.length} workflow run(s) will be checked for log files.`))) {
    return;
  }

  let artifactsProcessed = 0;
  let filesStored = 0;
  let pointsLinked = 0;
  let artifactFailures = 0;
  let runFailures = 0;
  let unmatchedArtifacts = 0;
  let emptyArtifacts = 0;
  let missingRuns = 0;
  let completeSkipped = 0;
  let gcsRuns = 0;
  let githubRuns = 0;
  for (const [runIndex, run] of runs.entries()) {
    const runId = Number(run.github_run_id);
    const repository = repositoryFromRunUrl(run.html_url) ?? DEFAULT_REPO;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `server-log-backfill-${runId}-`));
    try {
      let source: Exclude<ArtifactSource, 'auto'> | null = null;
      let pairs =
        flags.source === 'github' ? [] : pairServerLogArtifacts(gcsByRun.get(runId) ?? []);
      if (pairs.length > 0) {
        source = 'gcs';
        gcsRuns++;
      } else if (
        flags.source !== 'gcs' &&
        (flags.source === 'github' || isWithinGithubRetention(run.date))
      ) {
        const artifacts = await retryArtifactOperation(
          `listing GitHub artifacts for run ${runId}`,
          () => listRunArtifacts(repository, String(runId)),
        );
        pairs = pairServerLogArtifacts(artifacts.filter((artifact) => !artifact.expired));
        if (pairs.length > 0) {
          source = 'github';
          githubRuns++;
        }
      }
      if (!source) {
        missingRuns++;
        console.log(
          `  [${runIndex + 1}/${runs.length}] ${repository} run ${runId} attempt ${run.run_attempt}: no retained log pairs`,
        );
        continue;
      }

      for (const pair of pairs) {
        let benchmarkDir: string | null = null;
        let serverLogDir: string | null = null;
        try {
          benchmarkDir =
            source === 'gcs'
              ? await retryArtifactOperation(`downloading ${pair.benchmarks.name}`, () =>
                  downloadGcsArtifact(pair.benchmarks as GcsArtifactMeta, tempDir),
                )
              : await retryArtifactOperation(`downloading ${pair.benchmarks.name}`, () =>
                  downloadArtifact(pair.benchmarks, tempDir),
                );
          const mappedRows = readMappedBenchmarkRows(benchmarkDir);
          const resultIds = await findBenchmarkResultIds(sql, run, mappedRows, (id) =>
            console.warn(
              `  [WARN] benchmark result ${id} uses a historical offload label; ` +
                `matched uniquely without offload_mode`,
            ),
          );
          if (resultIds.length === 0) {
            unmatchedArtifacts++;
            console.warn(`  [WARN] ${pair.serverLogs.name}: no matching benchmark rows`);
            continue;
          }
          if (await resultLogsAreComplete(resultIds)) {
            completeSkipped++;
            continue;
          }
          serverLogDir =
            source === 'gcs'
              ? await retryArtifactOperation(`downloading ${pair.serverLogs.name}`, () =>
                  downloadGcsArtifact(pair.serverLogs as GcsArtifactMeta, tempDir),
                )
              : await retryArtifactOperation(`downloading ${pair.serverLogs.name}`, () =>
                  downloadArtifact(pair.serverLogs, tempDir),
                );
          const root = serverLogArtifactRoot(serverLogDir, pair.serverLogs.name);
          const logFiles = root ? listServerLogFilePaths(root) : [];
          if (logFiles.length === 0) {
            emptyArtifacts++;
            console.warn(`  [WARN] ${pair.serverLogs.name}: no .log/.out files`);
            continue;
          }
          await insertServerLogFilePaths(sql, resultIds, logFiles);
          artifactsProcessed++;
          filesStored += logFiles.length;
          pointsLinked += resultIds.length;
        } catch (error) {
          artifactFailures++;
          console.error(`  ✗ ${repository} run ${runId} artifact ${pair.serverLogs.name}:`, error);
        } finally {
          if (benchmarkDir) fs.rmSync(benchmarkDir, { recursive: true, force: true });
          if (serverLogDir) fs.rmSync(serverLogDir, { recursive: true, force: true });
        }
      }
      console.log(
        `  [${runIndex + 1}/${runs.length}] ${repository} run ${runId} attempt ${run.run_attempt}: ` +
          `${pairs.length} ${source} pair(s)`,
      );
    } catch (error) {
      runFailures++;
      console.error(`  ✗ ${repository} run ${runId}:`, error);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log(
    `\n=== backfill complete: ${artifactsProcessed} artifact(s), ${filesStored} file(s), ` +
      `${pointsLinked} point link(s), ${completeSkipped} complete artifact(s) skipped, ` +
      `${unmatchedArtifacts} unmatched artifact(s), ${emptyArtifacts} empty artifact(s), ` +
      `${gcsRuns} GCS run(s), ${githubRuns} GitHub run(s), ${missingRuns} unavailable run(s), ` +
      `${artifactFailures} failed artifact(s), ${runFailures} failed run(s) ===`,
  );
  console.log('  Invalidate API cache after the backfill: bun run admin:cache:invalidate');
  if (artifactFailures > 0 || runFailures > 0) process.exitCode = 1;
}

runBackfillMain('backfill-server-log-files', sql, main);
