import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../connection.js';
import { DOWNSTREAM_ID_START } from './downstream-ids';

const { clients, own } = vi.hoisted(() => {
  const state = { ingestedRuns: new Set<number>(), unreserved: [] as string[] };
  const client = (isOwn: boolean) =>
    ((strings: TemplateStringsArray, value: unknown) => {
      const text = strings.join('?');
      if (text.includes('pg_sequences')) {
        return Promise.resolve(isOwn ? state.unreserved.map((name) => ({ name })) : []);
      }
      return Promise.resolve(
        isOwn && state.ingestedRuns.has(value as number) ? [{ present: 1 }] : [],
      );
    }) as never;
  return { clients: { own: client(true), public: client(false) }, own: state };
});

vi.mock('../connection', () => ({
  getDb: (overrides?: { url?: string }) => (overrides?.url ? clients.public : clients.own),
}));

const ownDb = clients.own as DbClient;
const publicDb = clients.public as DbClient;
const BELOW = DOWNSTREAM_ID_START - 1;
const echo = (sql: DbClient, ids: number[]) => Promise.resolve([sql, ids]);

const load = () => import('./payload-db');

function setPublicDb(set: boolean) {
  vi.stubEnv('PUBLIC_DATABASE_READONLY_URL', set ? 'postgres://public.example/db' : '');
}

beforeEach(() => {
  vi.resetModules();
  own.ingestedRuns.clear();
  own.unreserved = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('database routing', () => {
  it('reads everything from the own database when no public database is set', async () => {
    setPublicDb(false);
    const { getPayloadDb, getReadDbs, readFromPayloadDbs } = await load();
    await expect(getPayloadDb(1)).resolves.toBe(ownDb);
    await expect(getReadDbs()).resolves.toEqual([ownDb]);
    await expect(readFromPayloadDbs([1, DOWNSTREAM_ID_START], echo)).resolves.toEqual([
      [ownDb, [1, DOWNSTREAM_ID_START]],
    ]);
  });

  it('reads public-range ids from the public database and the rest from the own one', async () => {
    setPublicDb(true);
    const { getPayloadDb, getReadDbs, readFromPayloadDbs } = await load();
    await expect(getPayloadDb(BELOW)).resolves.toBe(publicDb);
    await expect(getPayloadDb(DOWNSTREAM_ID_START)).resolves.toBe(ownDb);
    await expect(getReadDbs()).resolves.toEqual([publicDb, ownDb]);
    await expect(readFromPayloadDbs([3, DOWNSTREAM_ID_START + 1, BELOW], echo)).resolves.toEqual([
      [publicDb, [3, BELOW]],
      [ownDb, [DOWNSTREAM_ID_START + 1]],
    ]);
  });

  it('skips a database that holds none of the ids', async () => {
    setPublicDb(true);
    const { readFromPayloadDbs } = await load();
    await expect(readFromPayloadDbs([DOWNSTREAM_ID_START], echo)).resolves.toEqual([
      [ownDb, [DOWNSTREAM_ID_START]],
    ]);
    await expect(readFromPayloadDbs([3], echo)).resolves.toEqual([[publicDb, [3]]]);
  });

  it('merges id-keyed records from both databases', async () => {
    setPublicDb(true);
    const { readRecordFromPayloadDbs } = await load();
    const record = await readRecordFromPayloadDbs([3, DOWNSTREAM_ID_START], (sql, ids) =>
      Promise.resolve(Object.fromEntries(ids.map((id) => [id, sql === ownDb ? 'own' : 'public']))),
    );
    expect(record).toEqual({ 3: 'public', [DOWNSTREAM_ID_START]: 'own' });
  });

  it('reads a run from the own database only when this deployment ingested it', async () => {
    setPublicDb(true);
    own.ingestedRuns.add(777);
    const { getRunDb } = await load();
    await expect(getRunDb(777)).resolves.toBe(ownDb);
    await expect(getRunDb(555)).resolves.toBe(publicDb);
  });

  it('refuses the public database until the own database reserves its ids, then allows it', async () => {
    setPublicDb(true);
    own.unreserved = ['workflow_runs', 'benchmark_results'];
    const { getReadDbs, getPayloadDb } = await load();
    await expect(getReadDbs()).rejects.toThrow(
      /workflow_runs, benchmark_results\).*migrate --yes --downstream/,
    );
    await expect(getPayloadDb(BELOW)).rejects.toThrow(/does not reserve its ids/);
    own.unreserved = [];
    await expect(getReadDbs()).resolves.toEqual([publicDb, ownDb]);
  });
});
