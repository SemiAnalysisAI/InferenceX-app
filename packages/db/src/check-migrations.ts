// Fails when the target database has not recorded every packages/db/migrations file. CI runs it
// before any database write, so a schema behind the code aborts the job with nothing written.
import path from 'path';

import { hasNoSslFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import {
  describePendingMigrations,
  recordedMigrations,
  unknownRecordedMigrations,
  unrecordedMigrations,
} from './lib/migration-runner';

const [MIGRATIONS_DIR, ...OTHER_MIGRATION_DIRS] = [
  'migrations',
  'migrations-collectivex',
  'migrations-operatorx',
].map((dir) => path.join(import.meta.dirname, '..', dir));

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function check(): Promise<void> {
  const recorded = await recordedMigrations(sql);
  const pending = unrecordedMigrations(recorded, MIGRATIONS_DIR);
  if (pending.length === 0) {
    console.log('Migrations: all applied');
    return;
  }
  const message = describePendingMigrations(
    pending,
    unknownRecordedMigrations(recorded, [MIGRATIONS_DIR, ...OTHER_MIGRATION_DIRS]),
  );
  console.error(message);
  if (process.env.GITHUB_ACTIONS === 'true') {
    const data = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log(`::error title=Pending database migrations::${data}`);
  }
  process.exitCode = 1;
}

check()
  .catch((error) => {
    console.error('db:check-migrations failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
