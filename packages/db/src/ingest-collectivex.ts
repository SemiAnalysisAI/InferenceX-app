import { parseArgs } from 'node:util';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import {
  listResultsCommits,
  loadCommittedRun,
  RESULTS_BRANCH,
  RESULTS_DIR,
  resolveResultsCommit,
  type ResultsCommit,
} from './collectivex/committed-results';
import { upsertCollectiveXRun } from './queries/collectivex';
import type { DbClient } from './connection.js';

const USAGE =
  'Usage: bun run admin:db:ingest:collectivex [--sha <sha> | --ref <ref>] [--backfill] [--yes] [--no-ssl]';

export interface IngestCollectiveXArgs {
  ref: string;
  backfill: boolean;
}

/** --sha and --ref name one commit; --backfill walks every results commit on main instead. */
export function parseIngestArgs(argv: string[]): IngestCollectiveXArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      sha: { type: 'string' },
      ref: { type: 'string' },
      backfill: { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      'no-ssl': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.sha !== undefined && values.ref !== undefined) {
    throw new Error(`--sha and --ref are mutually exclusive\n${USAGE}`);
  }
  if (values.backfill && (values.sha !== undefined || values.ref !== undefined)) {
    throw new Error(`--backfill reads every commit on ${RESULTS_BRANCH}\n${USAGE}`);
  }
  if (values.sha !== undefined && !/^[0-9a-f]{7,40}$/u.test(values.sha)) {
    throw new Error(`Invalid commit sha: ${values.sha}`);
  }
  return { ref: values.sha ?? values.ref ?? RESULTS_BRANCH, backfill: values.backfill };
}

/** Ingest each commit in order; one failed commit stops the walk before later ones. */
export async function ingestCommits(
  sql: DbClient,
  commits: readonly ResultsCommit[],
  token: string | undefined,
): Promise<void> {
  const blobCache = new Map<string, Uint8Array>();
  for (const commit of commits) {
    const { run, docs } = await loadCommittedRun(commit, { token, blobCache });
    const result = await upsertCollectiveXRun(sql, run, docs);
    if (result === 'conflict') {
      throw new Error(`run ${run.run_id} already holds a different commit than ${commit.sha}`);
    }
    console.log(
      `  ${result} run ${run.run_id} @ ${commit.sha.slice(0, 12)} (${commit.committedAt}): ` +
        `${run.summary.measured_cases}/${run.summary.requested_cases} cases measured, ${docs.length} docs`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseIngestArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN || undefined;
  console.log('=== db:ingest:collectivex ===');

  const commits = args.backfill
    ? await listResultsCommits(RESULTS_BRANCH, { token })
    : [await resolveResultsCommit(args.ref, { token })];
  if (commits.length === 0) {
    console.log(`No commit on ${RESULTS_BRANCH} touched ${RESULTS_DIR}.`);
    return;
  }
  console.log(
    args.backfill
      ? `This will store ${commits.length} ${RESULTS_DIR} commits from ${RESULTS_BRANCH}, oldest first,`
      : `This will store ${RESULTS_DIR} at ${commits[0].sha} (resolved from ${args.ref}),`,
  );
  console.log('replacing any run already stored for the same commit.\n');
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
    await ingestCommits(
      ((strings: TemplateStringsArray, ...values: unknown[]) =>
        sql(strings, ...(values as never[]))) as DbClient,
      commits,
      token,
    );
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
