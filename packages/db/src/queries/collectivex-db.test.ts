import fs from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  committedRun,
  validateCommittedResults,
  type ResultsSource,
} from '../collectivex/committed-results';
import { makeRawMatrix, makeRawShard } from '../collectivex/test-fixture';
import { pgliteSql, type PgliteSql } from '../lib/test-pglite';
import {
  collectiveXDatasetFromRow,
  getCollectiveXRun,
  getLatestCollectiveXRun,
  listCollectiveXRuns,
  upsertCollectiveXRun,
} from './collectivex';

type Json = Record<string, any>;

const FIRST_SHA = 'a'.repeat(40);
const SECOND_SHA = 'b'.repeat(40);
const FIRST_AT = '2026-10-28T00:00:00Z';
const SECOND_AT = '2026-10-29T00:00:00Z';

async function collectiveXDb(): Promise<PgliteSql> {
  const db = await PGlite.create();
  const dir = new URL('../../migrations-collectivex/', import.meta.url);
  for (const name of fs.readdirSync(dir).toSorted()) {
    if (name.endsWith('.sql')) await db.exec(fs.readFileSync(new URL(name, dir), 'utf8'));
  }
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
  return {
    sha,
    committedAt,
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
});
