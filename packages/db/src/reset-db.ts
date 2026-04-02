/**
 * Fully reset the database: drop all application tables and schema_migrations.
 * After running this, you must run db:migrate before db:ingest.
 *
 * Usage:
 *   pnpm admin:db:reset
 */

import { TABLE_NAMES } from '@semianalysisai/inferencex-constants';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function reset(): Promise<void> {
  console.log('=== db:reset ===');
  console.log(
    'This will DROP all tables (configs, workflow_runs, benchmark_results,\n' +
      'server_logs, run_stats, eval_results, changelog_entries, availability, schema_migrations).\n' +
      'You must run db:migrate after this before ingesting data.\n',
  );

  if (!hasYesFlag()) {
    const ok = await confirm('Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  console.log('Dropping all tables...\n');

  await sql`DROP MATERIALIZED VIEW IF EXISTS latest_benchmarks`;
  await sql`DROP VIEW IF EXISTS latest_workflow_runs`;
  await sql`DROP TABLE IF EXISTS
    ${sql(TABLE_NAMES.changelogEntries)},
    ${sql(TABLE_NAMES.evalResults)},
    ${sql(TABLE_NAMES.benchmarkResults)},
    ${sql(TABLE_NAMES.serverLogs)},
    ${sql(TABLE_NAMES.runStats)},
    ${sql(TABLE_NAMES.availability)},
    ${sql(TABLE_NAMES.workflowRuns)},
    ${sql(TABLE_NAMES.configs)},
    ${sql(TABLE_NAMES.schemaMigrations)}
  CASCADE`;

  console.log('  All tables dropped.');

  console.log('\n=== db:reset complete ===');
}

reset()
  .catch((err) => {
    console.error('db:reset failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
