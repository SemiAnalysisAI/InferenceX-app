/**
 * Run database migrations against the Neon Postgres instance.
 *
 * Always uses the direct (non-pooled) connection — migrations must not go
 * through PgBouncer's transaction pooling mode.
 *
 * Usage:
 *   bun run admin:db:migrate
 */

import path from 'path';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import { runMigrations } from './lib/migration-runner';

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'migrations');

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {}, // suppress "relation already exists" notices
});

async function migrate(): Promise<void> {
  console.log('=== db:migrate ===');
  console.log(
    'This will apply any pending SQL migrations from migrations/ to the database.\n' +
      'Already-applied migrations are skipped.\n',
  );

  if (!hasYesFlag()) {
    const ok = await confirm('Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  await runMigrations(sql, MIGRATIONS_DIR);

  console.log('\n=== db:migrate complete ===');
  console.log('  Invalidate API cache: bun run admin:cache:invalidate');
}

migrate()
  .catch((error) => {
    console.error('db:migrate failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
