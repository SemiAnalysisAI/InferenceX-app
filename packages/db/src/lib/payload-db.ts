import { getDb, type DbClient } from '../connection.js';
import { DOWNSTREAM_ID_START, isPublicRowId, RESERVED_ID_TABLES } from './downstream-ids.js';

let ownIdsReserved: Promise<void> | undefined;

/**
 * The public database, when this deployment shows public results next to its
 * own (`PUBLIC_DATABASE_READONLY_URL`). Fails until the deployment's own
 * database reserves its ids, since unreserved ids would route to public rows.
 */
export async function getPublicDb(): Promise<DbClient | null> {
  const url = process.env.PUBLIC_DATABASE_READONLY_URL;
  if (!url) return null;
  ownIdsReserved ??= assertOwnIdsReserved().catch((error: unknown) => {
    ownIdsReserved = undefined;
    throw error;
  });
  await ownIdsReserved;
  return getDb({ url });
}

async function assertOwnIdsReserved(): Promise<void> {
  const unreserved = (await getDb()`
    SELECT t.name FROM unnest(${[...RESERVED_ID_TABLES]}::text[]) AS t(name)
    LEFT JOIN pg_sequences s
      ON quote_ident(s.schemaname) || '.' || quote_ident(s.sequencename)
        = pg_get_serial_sequence(t.name, 'id')
    WHERE coalesce(s.start_value, 0) < ${DOWNSTREAM_ID_START}::bigint
  `) as { name: string }[];
  if (unreserved.length > 0) {
    throw new Error(
      `PUBLIC_DATABASE_READONLY_URL is set, but this deployment's database does not reserve ` +
        `its ids (${unreserved.map((row) => row.name).join(', ')}). Run ` +
        '`bun run admin:db:migrate --yes --downstream` on it.',
    );
  }
}

/** Databases this deployment serves, the public one first. */
export async function getReadDbs(): Promise<DbClient[]> {
  const publicDb = await getPublicDb();
  return publicDb ? [publicDb, getDb()] : [getDb()];
}

/** Run one read against every served database, in `getReadDbs` order. */
export async function readEachDb<T>(read: (sql: DbClient) => Promise<T>): Promise<T[]> {
  const dbs = await getReadDbs();
  return Promise.all(dbs.map((sql) => read(sql)));
}

/** The first database's non-null result, public first. */
export async function readFirstFound<T>(read: (sql: DbClient) => Promise<T | null>) {
  for (const sql of await getReadDbs()) {
    const found = await read(sql);
    if (found !== null) return found;
  }
  return null;
}

/** Database holding a benchmark or eval result, by its id. */
export async function getPayloadDb(id: number): Promise<DbClient> {
  return (isPublicRowId(id) && (await getPublicDb())) || getDb();
}

/** Run an id-list read once per database that holds some of `ids`. */
export async function readFromPayloadDbs<T>(
  ids: readonly number[],
  read: (sql: DbClient, ids: number[]) => Promise<T>,
): Promise<T[]> {
  const publicDb = await getPublicDb();
  const publicIds = publicDb ? ids.filter(isPublicRowId) : [];
  const ownIds = publicDb ? ids.filter((id) => !isPublicRowId(id)) : [...ids];
  const reads: Promise<T>[] = [];
  if (publicDb && publicIds.length > 0) reads.push(read(publicDb, publicIds));
  if (ownIds.length > 0) reads.push(read(getDb(), ownIds));
  return Promise.all(reads);
}

/** `readFromPayloadDbs` for reads that return a record keyed by id. */
export async function readRecordFromPayloadDbs<T extends Record<number, unknown>>(
  ids: readonly number[],
  read: (sql: DbClient, ids: number[]) => Promise<T>,
): Promise<T> {
  const parts = await readFromPayloadDbs(ids, read);
  return Object.assign({}, ...parts) as T;
}

/** Database holding a GitHub run: this deployment's when it ingested the run, else the public one. */
export async function getRunDb(githubRunId: number): Promise<DbClient> {
  const publicDb = await getPublicDb();
  if (!publicDb) return getDb();
  const own =
    await getDb()`select 1 from workflow_runs where github_run_id = ${githubRunId} limit 1`;
  return own.length > 0 ? getDb() : publicDb;
}
