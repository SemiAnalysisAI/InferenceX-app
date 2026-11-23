import fs from 'fs';
import path from 'path';

import type { Sql } from '../etl/db-utils';

function migrationFiles(migrationsDir: string): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .toSorted();
}

/**
 * Migration files in `migrationsDir` that schema_migrations does not record, in apply order.
 * A database without schema_migrations has every file pending.
 */
export async function pendingMigrations(sql: Sql, migrationsDir: string): Promise<string[]> {
  const [{ exists }] = await sql<{ exists: boolean }[]>`
    select to_regclass('schema_migrations') is not null as exists
  `;
  const rows = exists
    ? await sql<{ filename: string }[]>`select filename from schema_migrations`
    : [];
  const applied = new Set(rows.map((r) => r.filename));
  return migrationFiles(migrationsDir).filter((file) => !applied.has(file));
}

/** What an operator should do about pending migrations. */
export function describePendingMigrations(pending: readonly string[]): string {
  return [
    `${pending.length} migration file(s) in packages/db/migrations are not recorded in schema_migrations.`,
    ...pending.map((file) => `  ${file}`),
    "If a file's schema is already in the database, record it with",
    "  insert into schema_migrations (filename) values ('<file>');",
    'Then run bun run admin:db:migrate to apply the rest.',
  ].join('\n');
}

export async function runMigrations(sql: Sql, migrationsDir: string): Promise<number> {
  await sql`
    create table if not exists schema_migrations (
      filename   text        primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const migrations = await sql<{ filename: string }[]>`select filename from schema_migrations`;
  const applied = new Set(migrations.map((r) => r.filename));

  let ran = 0;
  for (const file of migrationFiles(migrationsDir)) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    console.log(`  apply ${file} ...`);
    const sql_text = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

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

  return ran;
}
