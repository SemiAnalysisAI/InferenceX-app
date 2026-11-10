import path from 'path';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import { DOWNSTREAM_ID_START } from './lib/downstream-ids';
import { runMigrations } from './lib/migration-runner';
import { reserveDownstreamIds } from './lib/reserve-downstream-ids';

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'migrations');

/** A downstream deployment's database, whose own ids must stay clear of public ids. */
const downstream = process.argv.includes('--downstream');

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function migrate(): Promise<void> {
  console.log('=== db:migrate ===');
  console.log(
    'This will apply any pending SQL migrations from migrations/ to the database.\n' +
      'Already-applied migrations are skipped.\n',
  );
  if (downstream) {
    console.log(
      `--downstream: its own runs, benchmarks, and evals will take ids from ${DOWNSTREAM_ID_START}.\n`,
    );
  }

  if (!hasYesFlag()) {
    const ok = await confirm('Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  await runMigrations(sql, MIGRATIONS_DIR);
  if (downstream) {
    const restarted = await reserveDownstreamIds(sql);
    console.log(
      restarted.length > 0
        ? `  reserved ids from ${DOWNSTREAM_ID_START}: ${restarted.join(', ')}`
        : '  ids already reserved',
    );
  }

  console.log('\n=== db:migrate complete ===');
  console.log('  Invalidate API cache: bun run admin:cache:invalidate');
}

migrate()
  .catch((error) => {
    console.error('db:migrate failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
