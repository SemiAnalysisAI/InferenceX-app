import { parseArgs } from 'node:util';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql, type Sql } from './etl/db-utils';
import {
  CommittedResultsError,
  listResultsCommits,
  loadCommittedRun,
  MAX_COMMITTED_RUN_ID,
  RESULTS_BRANCH,
  RESULTS_DIR,
  resolveResultsCommit,
  type ResultsCommit,
} from './collectivex/committed-results';
import {
  deleteCollectiveXRun,
  pruneCollectiveXRuns,
  upsertCollectiveXRun,
} from './queries/collectivex';

const USAGE =
  'Usage: bun run admin:db:ingest:collectivex ' +
  '[--sha <sha> | --ref <ref> | --backfill [--prune] | --delete-run <run_id>] [--yes] [--no-ssl]';

export type IngestCollectiveXArgs =
  | { mode: 'commit'; ref: string }
  | { mode: 'backfill'; prune: boolean }
  | { mode: 'delete'; runId: string };

/**
 * --sha and --ref name one commit (default: main); --backfill walks every results
 * commit on main, and with --prune then deletes stored runs it did not store;
 * --delete-run removes one stored run.
 */
export function parseIngestArgs(argv: string[]): IngestCollectiveXArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      sha: { type: 'string' },
      ref: { type: 'string' },
      backfill: { type: 'boolean', default: false },
      prune: { type: 'boolean', default: false },
      'delete-run': { type: 'string' },
      yes: { type: 'boolean', short: 'y', default: false },
      'no-ssl': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const deleteRun = values['delete-run'];
  if (values.sha !== undefined && values.ref !== undefined) {
    throw new Error(`--sha and --ref are mutually exclusive\n${USAGE}`);
  }
  if (values.backfill && (values.sha !== undefined || values.ref !== undefined)) {
    throw new Error(`--backfill reads every commit on ${RESULTS_BRANCH}\n${USAGE}`);
  }
  if (values.prune && !values.backfill) {
    throw new Error(
      `--prune needs --backfill: it keeps exactly the runs a backfill stores\n${USAGE}`,
    );
  }
  if (
    deleteRun !== undefined &&
    (values.backfill || values.sha !== undefined || values.ref !== undefined)
  ) {
    throw new Error(`--delete-run takes no other target\n${USAGE}`);
  }
  if (values.sha !== undefined && !/^[0-9a-f]{7,40}$/u.test(values.sha)) {
    throw new Error(`Invalid commit sha: ${values.sha}`);
  }
  if (deleteRun !== undefined) {
    if (!/^[1-9]\d{0,9}$/u.test(deleteRun) || Number(deleteRun) >= MAX_COMMITTED_RUN_ID) {
      throw new Error(`Invalid run id: ${deleteRun}`);
    }
    return { mode: 'delete', runId: deleteRun };
  }
  if (values.backfill) return { mode: 'backfill', prune: values.prune };
  return { mode: 'commit', ref: values.sha ?? values.ref ?? RESULTS_BRANCH };
}

export interface IngestOutcome {
  /** Commits whose run is stored (inserted or replaced). */
  stored: ResultsCommit[];
  /** Commits not stored: no results tree or file at them, or nothing measured. */
  skipped: ResultsCommit[];
  /** The skipped commits GitHub answered 404 for: a prune must not trust this walk. */
  missing: ResultsCommit[];
}

/**
 * Ingest each commit in order. A commit with no measured result (for example one
 * that only changed cases.json) is skipped, never stored as an empty run. With
 * `skipMissing` (the backfill), a commit GitHub answers 404 for is skipped too;
 * any other failure stops the walk before later commits.
 */
export async function ingestCommits(
  sql: Sql,
  commits: readonly ResultsCommit[],
  token: string | undefined,
  { skipMissing = false }: { skipMissing?: boolean } = {},
): Promise<IngestOutcome> {
  const blobCache = new Map<string, Uint8Array>();
  const outcome: IngestOutcome = { stored: [], skipped: [], missing: [] };
  for (const commit of commits) {
    const label = `${commit.sha.slice(0, 12)} (${commit.committedAt})`;
    let loaded: Awaited<ReturnType<typeof loadCommittedRun>>;
    try {
      loaded = await loadCommittedRun(commit, { token, blobCache });
    } catch (error) {
      if (skipMissing && error instanceof CommittedResultsError && error.kind === 'not-found') {
        console.log(`  skipped ${label}: ${error.message}`);
        outcome.skipped.push(commit);
        outcome.missing.push(commit);
        continue;
      }
      throw error;
    }
    const { run, docs } = loaded;
    if (run.summary.measured_cases === 0) {
      console.log(
        `  skipped ${label}: nothing measured (${run.summary.requested_cases} cases requested)`,
      );
      outcome.skipped.push(commit);
      continue;
    }
    const result = await upsertCollectiveXRun(sql, run, docs);
    if (result === 'conflict') {
      throw new Error(`run ${run.run_id} already holds a different commit than ${commit.sha}`);
    }
    console.log(
      `  ${result} run ${run.run_id} @ ${label}: ` +
        `${run.summary.measured_cases}/${run.summary.requested_cases} cases measured, ${docs.length} docs`,
    );
    outcome.stored.push(commit);
  }
  return outcome;
}

function describePlan(args: IngestCollectiveXArgs, commits: readonly ResultsCommit[]): string {
  if (args.mode === 'delete') {
    return `This will delete stored run ${args.runId} and its documents.\n`;
  }
  if (args.mode === 'commit') {
    return (
      `This will store ${RESULTS_DIR} at ${commits[0].sha} (resolved from ${args.ref}) as run ` +
      `${commits[0].runId}, replacing any run already stored for that commit.\n`
    );
  }
  const then = args.prune ? ', then DELETE every stored run it did not store' : '';
  return `This will store ${commits.length} ${RESULTS_DIR} commits from ${RESULTS_BRANCH}, oldest first, replacing any run already stored for the same commit${then}.\n`;
}

async function main(): Promise<void> {
  const args = parseIngestArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN || undefined;
  console.log('=== db:ingest:collectivex ===');

  let commits: ResultsCommit[] = [];
  if (args.mode === 'backfill') {
    commits = await listResultsCommits(RESULTS_BRANCH, { token });
    if (commits.length === 0 && !args.prune) {
      console.log(`No commit on ${RESULTS_BRANCH} touched ${RESULTS_DIR}.`);
      return;
    }
  } else if (args.mode === 'commit') {
    commits = [await resolveResultsCommit(args.ref, { token })];
  }
  console.log(describePlan(args, commits));
  if (!hasYesFlag()) {
    const ok = await confirm('Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  const sql = createAdminSql({
    envVar: 'DATABASE_COLLECTIVEX_WRITE_URL',
    noSsl: hasNoSslFlag(),
    max: 1,
    onnotice: () => {},
  });
  try {
    if (args.mode === 'delete') {
      const removed = await deleteCollectiveXRun(sql, args.runId);
      console.log(
        removed
          ? `  deleted run ${removed.run_id} @ ${removed.source_sha.slice(0, 12)}`
          : `  no stored run ${args.runId}`,
      );
    } else {
      const { stored, skipped, missing } = await ingestCommits(sql, commits, token, {
        skipMissing: args.mode === 'backfill',
      });
      console.log(`  ${stored.length} stored, ${skipped.length} skipped`);
      if (args.mode === 'backfill' && args.prune && missing.length > 0) {
        // A 404 can be a transient GitHub miss; pruning after it would delete a good run.
        throw new Error(
          `not pruning: ${missing.length} commit(s) could not be read ` +
            `(${missing.map((commit) => commit.sha.slice(0, 12)).join(', ')}); rerun the backfill`,
        );
      }
      if (args.mode === 'backfill' && args.prune) {
        const removed = await pruneCollectiveXRuns(
          sql,
          stored.map((commit) => commit.sha),
        );
        for (const run of removed) {
          console.log(`  pruned run ${run.run_id} @ ${run.source_sha.slice(0, 12)}`);
        }
        console.log(`  ${removed.length} pruned`);
      }
    }
  } finally {
    await sql.end();
  }
  console.log('=== db:ingest:collectivex complete ===');
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error('db:ingest:collectivex failed:', error);
    process.exitCode = 1;
  });
}
