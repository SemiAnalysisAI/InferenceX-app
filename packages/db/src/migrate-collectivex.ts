import path from 'path';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import { runMigrations } from './lib/migration-runner';

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'migrations-collectivex');

const sql = createAdminSql({
  envVar: 'DATABASE_COLLECTIVEX_WRITE_URL',
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function migrate(): Promise<void> {
  console.log('=== db:migrate:collectivex ===');
  console.log(
    'This will apply any pending SQL migrations from migrations-collectivex/ to the\n' +
      'CollectiveX database. Already-applied migrations are skipped.\n',
  );

  if (!hasYesFlag()) {
    const ok = await confirm('Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  await runMigrations(sql, MIGRATIONS_DIR);

  console.log('\n=== db:migrate:collectivex complete ===');
}

migrate()
  .catch((error) => {
    console.error('db:migrate:collectivex failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
