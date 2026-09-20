import type { Sql } from '../etl/db-utils';

/** Read-only readiness evidence for the receipt migration on the selected database. */
export async function verifyMeasurementSchema(sql: Pick<Sql, 'unsafe'>) {
  const tables = await sql.unsafe(`
    select to_regclass('public.schema_migrations')::text as ledger,
           to_regclass('public.measurement_snapshots')::text as snapshots
  `);
  if (!tables[0]?.ledger || !tables[0]?.snapshots) {
    throw new Error('Receipt migration ledger or measurement_snapshots table is missing');
  }

  const migration = '016_measurement_snapshots.sql';
  const applied = await sql.unsafe(
    'select filename from public.schema_migrations where filename = $1',
    [migration],
  );
  if (applied.length !== 1) throw new Error(`Receipt migration is not recorded: ${migration}`);

  const columns = await sql.unsafe(`
    select attname as name, format_type(atttypid, atttypmod) as type, attnotnull as required
    from pg_attribute
    where attrelid = 'public.measurement_snapshots'::regclass and attnum > 0 and not attisdropped
    order by attnum
  `);
  const expected: Record<string, string> = {
    source_repo: 'text',
    source_run_id: 'bigint',
    source_attempt: 'integer',
    receipt_id: 'text',
    bundle_digest: 'text',
    receipt: 'jsonb',
    state: 'text',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
  };
  for (const [name, type] of Object.entries(expected)) {
    if (
      !columns.some((column) => column.name === name && column.type === type && column.required)
    ) {
      throw new Error(`Receipt schema requires a non-null ${type} column: ${name}`);
    }
  }

  const keys = await sql.unsafe(`
    select array_agg(attribute.attname order by key.ordinality) as columns
    from pg_constraint as definition
    cross join lateral unnest(definition.conkey) with ordinality as key(attnum, ordinality)
    join pg_attribute as attribute
      on attribute.attrelid = definition.conrelid and attribute.attnum = key.attnum
    where definition.conrelid = 'public.measurement_snapshots'::regclass and definition.contype = 'p'
    group by definition.oid
  `);
  const primaryKey = ['source_repo', 'source_run_id', 'source_attempt'];
  if (keys.length !== 1 || JSON.stringify(keys[0].columns) !== JSON.stringify(primaryKey)) {
    throw new Error('Receipt schema must uniquely bind source repository, run and attempt');
  }
  return {
    migration,
    table: 'public.measurement_snapshots',
    columns: expected,
    primary_key: primaryKey,
  };
}
