import { hasNoSslFlag, hasYesFlag } from './cli-utils';
import type { DbClient } from './connection';
import { createAdminSql } from './etl/db-utils';
import { OPERATORX_COMPARISON_VERSION } from './operatorx/comparison-cache';
import { backfillOperatorXRunComparisons, getOperatorXBundle } from './queries/operatorx';

const sql = createAdminSql({
  envVar: 'DATABASE_OPERATORX_WRITE_URL',
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function main(): Promise<void> {
  if (!process.argv.includes('--all')) {
    throw new Error('Pass --all to preview every missing/stale projection, and --yes to write.');
  }
  const runs = await sql<{ run_key: string }[]>`
    SELECT r.run_key FROM opx_runs r
    WHERE (SELECT count(*) FROM opx_run_comparisons c
           WHERE c.run_id = r.id AND c.format_version = ${OPERATORX_COMPARISON_VERSION}) < 2
    ORDER BY r.generated_at DESC, r.id DESC
  `;
  console.log(
    `OperatorX comparison format ${OPERATORX_COMPARISON_VERSION}: ${runs.length} runs need backfill.`,
  );
  if (!hasYesFlag()) {
    console.log(
      'Dry run. Pass --yes to populate comparisons; raw runs and revisions are preserved.',
    );
    return;
  }
  let failed = 0;
  for (const { run_key: key } of runs) {
    try {
      const bundle = await getOperatorXBundle(sql as unknown as DbClient, key);
      const written = bundle && (await backfillOperatorXRunComparisons(sql, bundle));
      console.log(`${key}: ${written ? 'backfilled' : 'revision disappeared or changed; skipped'}`);
    } catch (error) {
      failed++;
      console.error(`${key}: backfill failed`, error);
    }
  }
  if (failed) throw new Error(`${failed} OperatorX runs could not be backfilled`);
}

main()
  .catch((error) => {
    console.error('OperatorX comparison backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
