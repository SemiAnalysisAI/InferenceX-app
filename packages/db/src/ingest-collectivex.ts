import { parseArgs } from 'node:util';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import type { DbClient } from './connection';
import { createAdminSql } from './etl/db-utils';
import {
  buildUploadedRun,
  readResultsDir,
  RUN_ID_LIMIT,
  type UploadedRun,
  validateResults,
} from './collectivex/results-upload';
import {
  deleteCollectiveXRun,
  getLatestCollectiveXRun,
  getMaxCollectiveXRunId,
  upsertCollectiveXRun,
} from './queries/collectivex';

export const USAGE =
  'Usage: bun run admin:db:ingest:collectivex ' +
  '(--dir <results-dir> | --delete-run <run_id>) [--yes] [--no-ssl]';

export type IngestCollectiveXArgs =
  | { mode: 'upload'; dir: string }
  | { mode: 'delete'; runId: string };

/**
 * --dir uploads a CollectiveX `results/` directory (cases.json + <sku>/<case_id>.json) as a new
 * run laid over the latest stored one; --delete-run removes one stored run. Exactly one is required.
 */
export function parseIngestArgs(argv: string[]): IngestCollectiveXArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: 'string' },
      'delete-run': { type: 'string' },
      yes: { type: 'boolean', short: 'y', default: false },
      'no-ssl': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const deleteRun = values['delete-run'];
  if ((values.dir === undefined) === (deleteRun === undefined)) {
    throw new Error(`Give exactly one of --dir or --delete-run\n${USAGE}`);
  }
  if (deleteRun !== undefined) {
    if (!/^[1-9]\d{0,9}$/u.test(deleteRun) || Number(deleteRun) >= RUN_ID_LIMIT) {
      throw new Error(`Invalid run id: ${deleteRun}`);
    }
    return { mode: 'delete', runId: deleteRun };
  }
  if (values.dir === '') throw new Error(`--dir needs a path\n${USAGE}`);
  return { mode: 'upload', dir: values.dir! };
}

/** Read, validate and merge an upload against what is stored now, without writing. */
export async function planUpload(
  sql: DbClient,
  dir: string,
  now = new Date(),
): Promise<UploadedRun & { maxStoredRunId: string | null }> {
  const upload = validateResults(readResultsDir(dir));
  // Read the highest run_id before the merge base. Any upload that commits after this read
  // raises it, so the write's check (max still equals this value) refuses the stale plan; read
  // the other way round, an upload landing between the two reads would pass the check while
  // its cases are missing from this merge.
  const maxStoredRunId = await getMaxCollectiveXRunId(sql);
  const latest = await getLatestCollectiveXRun(sql, upload.version);
  return { ...buildUploadedRun(upload, latest, { maxStoredRunId, now }), maxStoredRunId };
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

/** Purge the dashboard's CollectiveX CDN tag, as the ingest-collectivex workflow does. */
export async function invalidateCollectiveXCache(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof globalThis.fetch = fetch,
): Promise<boolean> {
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
  const url = `${appUrl.replace(/\/+$/u, '')}/api/v1/invalidate?scope=collectivex`;
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
    } else {
      const planned = await planUpload(sql as unknown as DbClient, args.dir);
      console.log(describeUpload(planned));
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
    }
  } finally {
    await sql.end();
  }
  if (wrote) await invalidateCollectiveXCache();
  console.log('=== db:ingest:collectivex complete ===');
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error('db:ingest:collectivex failed:', error);
    process.exitCode = 1;
  });
}
