import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  assignRunIds,
  committedRun,
  validateCommittedResults,
  type ResultsSource,
} from '../collectivex/committed-results';
import { makeRawMatrix, makeRawShard } from '../collectivex/test-fixture';
import { pgliteSql, type PgliteSql } from '../lib/test-pglite';
import {
  collectiveXDatasetFromRow,
  deleteCollectiveXRun,
  getCollectiveXRun,
  getLatestCollectiveXRun,
  listCollectiveXRuns,
  pruneCollectiveXRuns,
  upsertCollectiveXRun,
} from './collectivex';

type Json = Record<string, any>;

const FIRST_SHA = 'a'.repeat(40);
const SECOND_SHA = 'b'.repeat(40);
const FIRST_AT = '2026-10-28T00:00:00Z';
const SECOND_AT = '2026-10-29T00:00:00Z';

const MIGRATIONS = new URL('../../migrations-collectivex/', import.meta.url);

async function applyMigrations(db: PGlite, filter: (name: string) => boolean): Promise<void> {
  for (const name of fs.readdirSync(MIGRATIONS).toSorted()) {
    if (name.endsWith('.sql') && filter(name)) {
      await db.exec(fs.readFileSync(new URL(name, MIGRATIONS), 'utf8'));
    }
  }
}

async function collectiveXDb(): Promise<PgliteSql> {
  const db = await PGlite.create();
  await applyMigrations(db, () => true);
  return pgliteSql(db);
}

function result(sku: string, vendor: 'amd' | 'nvidia'): Json {
  return {
    ...makeRawShard({ sku, vendor }),
    provenance: { source_sha: 'e'.repeat(40), source_dirty: false },
  };
}

// The first committed results cover two AMD pools; cases.json requests every pool.
const mi300x = result('mi300x', 'amd');
const mi325x = result('mi325x', 'amd');
const h200 = result('h200-dgxc', 'nvidia');
const b200 = result('b200-nscale', 'nvidia');
const cases = makeRawMatrix(
  [mi300x, mi325x, h200, b200].map((doc) => ({
    caseId: doc.identity.case_id,
    sku: doc.identity.case_factors.sku,
    case: doc.identity.case_factors.case,
  })),
);

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function source(sha: string, committedAt: string, docs: Json[]): ResultsSource {
  const [{ runId }] = assignRunIds([{ sha, committedAt }]);
  return {
    sha,
    committedAt,
    runId,
    files: new Map([
      ['cases.json', encode(cases)],
      ...docs.map((doc): [string, Uint8Array] => [
        `${doc.identity.case_factors.sku}/${doc.identity.case_id}.json`,
        encode(doc),
      ]),
    ]),
  };
}

let sql: PgliteSql;

beforeEach(async () => {
  sql = await collectiveXDb();
});

describe('CollectiveX runs from committed results in PostgreSQL', () => {
  it('serves a first commit holding only the mi300x and mi325x folders', async () => {
    const first = committedRun(
      validateCommittedResults(source(FIRST_SHA, FIRST_AT, [mi300x, mi325x])),
    );
    await expect(upsertCollectiveXRun(sql, first.run, first.docs)).resolves.toBe('inserted');

    const row = await getLatestCollectiveXRun(sql, 1);
    expect(row).not.toBeNull();
    const dataset = collectiveXDatasetFromRow(row!);
    expect(dataset.run).toMatchObject({
      run_id: first.run.run_id,
      source_sha: FIRST_SHA,
      requested_cases: 4,
      measured_cases: 2,
    });
    expect(dataset.series.map((series) => series.system.sku).toSorted()).toEqual([
      'mi300x',
      'mi325x',
    ]);
    // Pools without a result file stay requested but not run, never an error.
    expect(Object.fromEntries(dataset.coverage.map((item) => [item.sku, item.outcome]))).toEqual({
      mi300x: 'success',
      mi325x: 'success',
      'h200-dgxc': 'pending',
      'b200-nscale': 'pending',
    });
  });

  it('stores a later commit that adds pools as a newer superset run and serves it as latest', async () => {
    const first = committedRun(
      validateCommittedResults(source(FIRST_SHA, FIRST_AT, [mi300x, mi325x])),
    );
    const second = committedRun(
      validateCommittedResults(source(SECOND_SHA, SECOND_AT, [mi300x, mi325x, h200, b200])),
    );
    await upsertCollectiveXRun(sql, first.run, first.docs);
    await expect(upsertCollectiveXRun(sql, second.run, second.docs)).resolves.toBe('inserted');

    expect(Number(second.run.run_id)).toBeGreaterThan(Number(first.run.run_id));
    const latest = await getLatestCollectiveXRun(sql, 1);
    expect(latest?.source_sha).toBe(SECOND_SHA);
    expect(collectiveXDatasetFromRow(latest!).run.measured_cases).toBe(4);

    const runs = await listCollectiveXRuns(sql, 1);
    expect(runs.map((run) => run.run_id)).toEqual([second.run.run_id, first.run.run_id]);
    expect(runs.map((run) => run.measured_cases)).toEqual([4, 2]);

    const earlier = await getCollectiveXRun(sql, 1, first.run.run_id);
    expect(earlier?.docs).toHaveLength(2);
  });

  it('replaces a re-ingested commit in place and refuses a run id held by another commit', async () => {
    const first = committedRun(validateCommittedResults(source(FIRST_SHA, FIRST_AT, [mi300x])));
    await upsertCollectiveXRun(sql, first.run, first.docs);
    const again = committedRun(
      validateCommittedResults(source(FIRST_SHA, FIRST_AT, [mi300x, mi325x])),
    );
    await expect(upsertCollectiveXRun(sql, again.run, again.docs)).resolves.toBe('replaced');
    const row = await getCollectiveXRun(sql, 1, first.run.run_id);
    expect(row?.docs).toHaveLength(2);

    const clash = committedRun(validateCommittedResults(source(SECOND_SHA, FIRST_AT, [h200])));
    await expect(upsertCollectiveXRun(sql, clash.run, clash.docs)).resolves.toBe('conflict');
    const kept = await getCollectiveXRun(sql, 1, first.run.run_id);
    expect(kept?.source_sha).toBe(FIRST_SHA);
    expect(await listCollectiveXRuns(sql, 1)).toHaveLength(1);
  });

  it('never serves a run with nothing measured', async () => {
    const empty = committedRun(validateCommittedResults(source(FIRST_SHA, FIRST_AT, [])));
    expect(empty.run.summary.measured_cases).toBe(0);
    await upsertCollectiveXRun(sql, empty.run, empty.docs);
    expect(await getLatestCollectiveXRun(sql, 1)).toBeNull();
    expect(await getCollectiveXRun(sql, 1, empty.run.run_id)).toBeNull();
    expect(await listCollectiveXRuns(sql, 1)).toEqual([]);
  });

  it('stores each document once when two ingests of one commit overlap', async () => {
    const first = committedRun(
      validateCommittedResults(source(FIRST_SHA, FIRST_AT, [mi300x, mi325x])),
    );
    const results = await Promise.all([
      upsertCollectiveXRun(sql, first.run, first.docs),
      upsertCollectiveXRun(sql, first.run, first.docs),
      upsertCollectiveXRun(sql, first.run, first.docs),
    ]);
    expect(results.toSorted()).toEqual(['inserted', 'replaced', 'replaced']);
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM cx_run_docs`;
    expect(count).toBe(2);
  });

  it('prunes runs outside the kept commits and deletes one named run', async () => {
    const first = committedRun(validateCommittedResults(source(FIRST_SHA, FIRST_AT, [mi300x])));
    const second = committedRun(validateCommittedResults(source(SECOND_SHA, SECOND_AT, [h200])));
    await upsertCollectiveXRun(sql, first.run, first.docs);
    await upsertCollectiveXRun(sql, second.run, second.docs);

    await expect(pruneCollectiveXRuns(sql, [SECOND_SHA])).resolves.toEqual([
      { run_id: first.run.run_id, source_sha: FIRST_SHA },
    ]);
    const kept = await listCollectiveXRuns(sql, 1);
    expect(kept.map((run) => run.run_id)).toEqual([second.run.run_id]);
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM cx_run_docs`;
    expect(count).toBe(1);

    await expect(deleteCollectiveXRun(sql, second.run.run_id)).resolves.toEqual({
      run_id: second.run.run_id,
      source_sha: SECOND_SHA,
    });
    await expect(deleteCollectiveXRun(sql, second.run.run_id)).resolves.toBeNull();
    expect(await getLatestCollectiveXRun(sql, 1)).toBeNull();
  });
});

describe('migration 005', () => {
  it('drops lazy-ingest runs that would outrank committed runs, and forbids new ones', async () => {
    const db = await PGlite.create();
    await applyMigrations(db, (name) => name < '005');
    const legacy = pgliteSql(db);
    const first = committedRun(validateCommittedResults(source(FIRST_SHA, FIRST_AT, [mi300x])));
    await upsertCollectiveXRun(legacy, first.run, first.docs);
    await upsertCollectiveXRun(
      legacy,
      { ...first.run, run_id: '37459990486', source_sha: SECOND_SHA },
      first.docs,
    );
    const before = await getLatestCollectiveXRun(legacy, 1);
    expect(before?.run_id).toBe('37459990486');

    await applyMigrations(db, (name) => name >= '005');
    const after = await getLatestCollectiveXRun(legacy, 1);
    expect(after?.run_id).toBe(first.run.run_id);
    const [{ count }] = await legacy`SELECT count(*)::int AS count FROM cx_run_docs`;
    expect(count).toBe(1);
    await expect(
      upsertCollectiveXRun(
        legacy,
        { ...first.run, run_id: '37459990487', source_sha: SECOND_SHA },
        first.docs,
      ),
    ).rejects.toThrow(/cx_runs_committed_run_id/u);
  });
});
