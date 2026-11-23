import fs from 'fs';
import path from 'path';

import type { Sql } from '../etl/db-utils';

/**
 * Earlier filenames of migrations renumbered after a database could have applied them, keyed by
 * the current filename. The PR #348 branch (commit 580adfddc) shipped these as 007-009. They
 * landed on main as 008-010 (78e880c3e) with byte-identical contents, so a database that recorded
 * the earlier name has already applied the current file.
 */
export const EARLIER_MIGRATION_NAMES: Readonly<Record<string, string>> = {
  '008_agentic.sql': '007_agentic.sql',
  '009_latest_benchmarks_single_run_per_line.sql': '008_latest_benchmarks_single_run_per_line.sql',
  '010_dataset_request_stats.sql': '009_dataset_request_stats.sql',
};

function migrationFiles(migrationsDir: string): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .toSorted();
}

function isRecorded(recorded: ReadonlySet<string>, file: string): boolean {
  const earlier = EARLIER_MIGRATION_NAMES[file];
  return recorded.has(file) || (earlier !== undefined && recorded.has(earlier));
}

/** Filenames schema_migrations records, or none when the table does not exist. */
export async function recordedMigrations(sql: Sql): Promise<string[]> {
  const [{ exists }] = await sql<{ exists: boolean }[]>`
    select to_regclass('schema_migrations') is not null as exists
  `;
  if (!exists) return [];
  const rows = await sql<{ filename: string }[]>`select filename from schema_migrations`;
  return rows.map((r) => r.filename);
}

/** Files in `migrationsDir` that `recorded` holds under neither their name nor an earlier one. */
export function unrecordedMigrations(recorded: readonly string[], migrationsDir: string): string[] {
  const names = new Set(recorded);
  return migrationFiles(migrationsDir).filter((file) => !isRecorded(names, file));
}

/** Migration files in `migrationsDir` the database has not recorded, in apply order. */
export async function pendingMigrations(sql: Sql, migrationsDir: string): Promise<string[]> {
  return unrecordedMigrations(await recordedMigrations(sql), migrationsDir);
}

/** Recorded filenames that match no file in `migrationsDirs`, current or earlier name. */
export function unknownRecordedMigrations(
  recorded: readonly string[],
  migrationsDirs: readonly string[],
): string[] {
  const known = new Set(migrationsDirs.flatMap(migrationFiles));
  for (const earlier of Object.values(EARLIER_MIGRATION_NAMES)) known.add(earlier);
  return recorded.filter((name) => !known.has(name)).toSorted();
}

/** What an operator should do about pending migrations, as plain text lines. */
export function describePendingMigrations(
  pending: readonly string[],
  unknownRecorded: readonly string[],
): string {
  const lines = [
    `${pending.length} migration file(s) in packages/db/migrations are not recorded in schema_migrations.`,
    ...pending.map((file) => `  ${file}`),
    'An unrecorded file may still be applied, because some migrations were renumbered after',
    'databases ran them. Do not run bun run admin:db:migrate yet, as it applies every listed file.',
    'For each file, check whether its schema is already in the database.',
    "If it is, record it with: insert into schema_migrations (filename) values ('<file>');",
    'Once only missing files remain unrecorded, run bun run admin:db:migrate.',
  ];
  if (unknownRecorded.length > 0) {
    lines.push(
      'schema_migrations also records names no migrations directory holds. One may be an earlier',
      'name of a listed file. Compare it with git history before recording the new name.',
      ...unknownRecorded.map((name) => `  ${name}`),
    );
  }
  return lines.join('\n');
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
    if (isRecorded(applied, file)) {
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
