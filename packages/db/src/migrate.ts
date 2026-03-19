/**
 * Run database migrations against the Neon Postgres instance.
 *
 * Always uses the direct (non-pooled) connection — migrations must not go
 * through PgBouncer's transaction pooling mode.
 *
 * Usage:
 *   pnpm admin:db:migrate
 */

import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

import { confirm, hasYesFlag } from './cli-utils';

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'migrations');

if (!process.env.DATABASE_WRITE_URL) {
  console.error('DATABASE_WRITE_URL is required');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_WRITE_URL, {
  ssl: 'require',
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

  // Create migrations tracking table if it doesn't exist
  await sql`
    create table if not exists schema_migrations (
      filename   text        primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = new Set(
    (await sql<{ filename: string }[]>`select filename from schema_migrations`).map(
      (r) => r.filename,
    ),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    console.log(`  apply ${file} ...`);
    const sql_text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

    await sql.begin(async (tx) => {
      await tx.unsafe(sql_text);
      await tx.unsafe('insert into schema_migrations (filename) values ($1)', [file]);
    });

    console.log(`  done  ${file}`);
    ran++;
  }

  if (ran === 0) {
    console.log('  all migrations already applied');
  } else {
    console.log(`\n  applied ${ran} migration(s)`);
  }

  console.log('\n=== db:migrate complete ===');
}

migrate()
  .catch((err) => {
    console.error('db:migrate failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
