import { parseArgs } from 'node:util';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import type { DbClient } from './connection';
import { createAdminSql } from './etl/db-utils';
import {
  checkProvenance,
  fetchEntries,
  type ChangelogLinkRow,
  linkRows,
  uncoveredCases,
} from './collectivex/changelog';
import {
  buildUploadedRun,
  readResultsDir,
  RUN_ID_LIMIT,
  type UploadedRun,
  validateResults,
  type ValidatedUpload,
} from './collectivex/results-upload';
import {
  deleteCollectiveXRun,
  getLatestCollectiveXRun,
  getMaxCollectiveXRunId,
  getStoredCollectiveXRun,
  upsertCollectiveXChangelogLinks,
  upsertCollectiveXRun,
} from './queries/collectivex';

export const USAGE =
  'Usage: bun run admin:db:ingest:collectivex ' +
  '(--dir <results-dir> --pr <n>... | --link-run <run_id> --pr <n>... | --delete-run <run_id>) ' +
  '[--yes] [--no-ssl]';

export type IngestCollectiveXArgs =
  | { mode: 'upload'; dir: string; prs: number[] }
  | { mode: 'link'; runId: string; prs: number[] }
  | { mode: 'delete'; runId: string };

function runIdArg(value: string): string {
  if (!/^[1-9]\d{0,9}$/u.test(value) || Number(value) >= RUN_ID_LIMIT) {
    throw new Error(`Invalid run id: ${value}`);
  }
  return value;
}

/**
 * --dir uploads a CollectiveX `results/` directory (cases.json + <sku>/<case_id>.json) as a new
 * run laid over the latest stored one, naming with --pr the merged PRs whose
 * collectivex/perf-changelog.yaml entries it publishes; --link-run links those entries to a run
 * already stored; --delete-run removes one stored run. Exactly one mode is required.
 */
export function parseIngestArgs(argv: string[]): IngestCollectiveXArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string' },
      'delete-run': { type: 'string' },
      'link-run': { type: 'string' },
      pr: { type: 'string', multiple: true },
      yes: { type: 'boolean', short: 'y', default: false },
      'no-ssl': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const deleteRun = values['delete-run'];
  const linkRun = values['link-run'];
  const modes = [values.dir, deleteRun, linkRun].filter((value) => value !== undefined);
  if (modes.length !== 1) {
    throw new Error(`Give exactly one of --dir, --link-run or --delete-run\n${USAGE}`);
  }
  const prs = (values.pr ?? []).map((value) => {
    if (!/^[1-9]\d{0,6}$/u.test(value)) throw new Error(`Invalid PR number: ${value}`);
    return Number(value);
  });
  if (deleteRun !== undefined) {
    if (prs.length > 0) throw new Error('--delete-run takes no --pr');
    return { mode: 'delete', runId: runIdArg(deleteRun) };
  }
  if (prs.length === 0) {
    throw new Error(
      'Name the merged PR(s) whose collectivex/perf-changelog.yaml entries this publishes with ' +
        `--pr <n>\n${USAGE}`,
    );
  }
  if (linkRun !== undefined)
    return { mode: 'link', runId: runIdArg(linkRun), prs: [...new Set(prs)] };
  if (values.dir === '') throw new Error(`--dir needs a path\n${USAGE}`);
  return { mode: 'upload', dir: values.dir!, prs: [...new Set(prs)] };
}

/** Read, validate and merge an upload against what is stored now, without writing. */
export async function planUpload(
  sql: DbClient,
  dir: string,
  now = new Date(),
): Promise<
  UploadedRun & {
    maxStoredRunId: string | null;
    upload: ValidatedUpload;
    latest: Awaited<ReturnType<typeof getLatestCollectiveXRun>>;
  }
> {
  const upload = validateResults(readResultsDir(dir));
  // Read the highest run_id before the merge base. Any upload that commits after this read
  // raises it, so the write's check (max still equals this value) refuses the stale plan; read
  // the other way round, an upload landing between the two reads would pass the check while
  // its cases are missing from this merge.
  const maxStoredRunId = await getMaxCollectiveXRunId(sql);
  const latest = await getLatestCollectiveXRun(sql, upload.version);
  return {
    ...buildUploadedRun(upload, latest, { maxStoredRunId, now }),
    maxStoredRunId,
    upload,
    latest,
  };
}

export function describeUpload({ run, docs, plan }: UploadedRun): string {
  const base = plan.baseRunId === null ? 'nothing stored yet' : `latest run ${plan.baseRunId}`;
  const lines = [
    `This will store run ${run.run_id} (version ${run.version}, source ${run.source_sha}) over ${base}:`,
    `  ${plan.uploaded} uploaded (${plan.replaced} replacing a stored case), ${plan.kept} kept, ${plan.dropped.length} dropped`,
    `  ${run.summary.measured_cases}/${run.summary.requested_cases} cases measured, ${docs.length} docs`,
    ...plan.dropped.map((drop) => `  drop ${drop.sku}/${drop.caseId}: ${drop.reason}`),
  ];
  return `${lines.join('\n')}\n`;
}

/** The CLI runs under Bun, whose built-in YAML parser reads the changelog (the app has no YAML dependency). */
function parseYaml(text: string): unknown {
  const bun = (globalThis as { Bun?: { YAML?: { parse: (source: string) => unknown } } }).Bun;
  if (!bun?.YAML) throw new Error('reading perf-changelog.yaml needs the Bun runtime');
  return bun.YAML.parse(text);
}

export function describeLinks(rows: ChangelogLinkRow[]): string {
  return rows
    .map(
      (row) =>
        `  #${row.pr_number} (${row.date}): ${row.changes.length} selected case(s) changed\n`,
    )
    .join('');
}

/**
 * Purge the dashboard's CollectiveX CDN tag, as the ingest-collectivex workflow does. By
 * default the CDN serves the previous response once while it refreshes. `immediate` drops it
 * outright, so a deleted run is never served again.
 */
export async function invalidateCollectiveXCache({
  immediate = false,
  env = process.env,
  fetchImpl = fetch,
}: {
  immediate?: boolean;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof globalThis.fetch;
} = {}): Promise<boolean> {
  const appUrl = env.APP_URL;
  const secret = env.VERCEL_INVALIDATE_SECRET;
  if (!appUrl || !secret) {
    console.log(
      '  APP_URL / VERCEL_INVALIDATE_SECRET not set: the dashboard picks the new data up when ' +
        'its cache expires, or run the Ingest CollectiveX Results workflow to purge it now.',
    );
    return false;
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
  if (env.VERCEL_PROTECTION_BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] = env.VERCEL_PROTECTION_BYPASS_SECRET;
  }
  const url = `${appUrl.replace(/\/+$/u, '')}/api/v1/invalidate?scope=collectivex${immediate ? '&immediate=true' : ''}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`cache invalidation returned HTTP ${response.status}`);
  }
  console.log('  purged the CollectiveX cache');
  return true;
}

async function main(): Promise<void> {
  const args = parseIngestArgs(process.argv.slice(2));
  console.log('=== db:ingest:collectivex ===');

  const sql = createAdminSql({
    envVar: 'DATABASE_COLLECTIVEX_WRITE_URL',
    noSsl: hasNoSslFlag(),
    max: 1,
    onnotice: () => {},
  });
  let wrote = false;
  let deleted = false;
  try {
    if (args.mode === 'delete') {
      console.log(`This will delete stored run ${args.runId} and its documents.\n`);
      if (!hasYesFlag() && !(await confirm('Continue? (y/N) '))) {
        console.log('Aborted.');
        return;
      }
      const removed = await deleteCollectiveXRun(sql, args.runId);
      console.log(
        removed
          ? `  deleted run ${removed.run_id} @ ${removed.source_sha.slice(0, 12)}`
          : `  no stored run ${args.runId}`,
      );
      wrote = removed !== null;
      deleted = wrote;
    } else if (args.mode === 'link') {
      const run = await getStoredCollectiveXRun(sql as unknown as DbClient, args.runId);
      if (!run) throw new Error(`no stored run ${args.runId}`);
      const previous = run.previous_run_id
        ? await getStoredCollectiveXRun(sql as unknown as DbClient, run.previous_run_id)
        : null;
      const entries = await fetchEntries(args.prs, parseYaml);
      // Runs uploaded before the rule predate it, so a provenance gap is reported, not refused.
      for (const pr of args.prs) {
        await checkProvenance(pr, run.source_sha).catch((error: unknown) =>
          console.warn(`  warning: ${String(error)}`),
        );
      }
      const rows = linkRows(
        entries,
        run.matrix,
        { runId: run.run_id, docs: run.docs },
        previous && {
          runId: previous.run_id,
          docs: previous.docs,
        },
      );
      console.log(`This will link run ${run.run_id} to:\n${describeLinks(rows)}`);
      if (!hasYesFlag() && !(await confirm('Continue? (y/N) '))) return;
      await upsertCollectiveXChangelogLinks(sql, rows);
      wrote = true;
    } else {
      const planned = await planUpload(sql as unknown as DbClient, args.dir);
      const entries = await fetchEntries(args.prs, parseYaml);
      const uncovered = uncoveredCases(entries, planned.upload.matrix, planned.upload.results);
      if (uncovered.length > 0) throw new Error(`no --pr entry selects ${uncovered.join(', ')}`);
      for (const pr of args.prs) await checkProvenance(pr, planned.run.source_sha);
      const links = linkRows(
        entries,
        planned.run.matrix,
        { runId: planned.run.run_id, docs: planned.docs },
        planned.latest && { runId: planned.latest.run_id, docs: planned.latest.docs },
      );
      console.log(describeUpload(planned));
      console.log(describeLinks(links));
      if (planned.run.summary.measured_cases === 0) {
        throw new Error(
          `refusing to store run ${planned.run.run_id}: nothing measured ` +
            `(${planned.run.summary.requested_cases} cases requested)`,
        );
      }
      if (!hasYesFlag() && !(await confirm('Continue? (y/N) '))) {
        console.log('Aborted.');
        return;
      }
      const result = await upsertCollectiveXRun(sql, planned.run, planned.docs, {
        expectedMaxRunId: planned.maxStoredRunId,
      });
      if (result === 'stale') {
        throw new Error('another run was stored while this upload was planned; rerun it');
      }
      if (result === 'conflict') {
        throw new Error(`run ${planned.run.run_id} is already stored with another source`);
      }
      console.log(`  ${result} run ${planned.run.run_id}`);
      wrote = true;
      console.log(
        `  linked ${await upsertCollectiveXChangelogLinks(sql, links)} changelog entries`,
      );
    }
  } finally {
    await sql.end();
  }
  if (wrote) await invalidateCollectiveXCache({ immediate: deleted });
  console.log('=== db:ingest:collectivex complete ===');
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error('db:ingest:collectivex failed:', error);
    process.exitCode = 1;
  });
}
