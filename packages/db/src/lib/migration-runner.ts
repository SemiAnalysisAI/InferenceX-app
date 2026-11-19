import fs from 'fs';
import path from 'path';

import type { Sql } from '../etl/db-utils';

export async function runMigrations(sql: Sql, migrationsDir: string): Promise<number> {
  await sql`
    create table if not exists schema_migrations (
      filename   text        primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const migrations = await sql<{ filename: string }[]>`select filename from schema_migrations`;
  const applied = new Set(migrations.map((r) => r.filename));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .toSorted();

  let ran = 0;
  for (const file of files) {
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
