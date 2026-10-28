import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildUploadedRun, validateResults } from '../collectivex/results-upload';
import { makeRawMatrix, makeRawShard } from '../collectivex/test-fixture';
import { planUpload } from '../ingest-collectivex';
import { pgliteSql, type PgliteSql } from '../lib/test-pglite';
import {
  collectiveXDatasetFromRow,
  deleteCollectiveXRun,
  getCollectiveXRun,
  getLatestCollectiveXRun,
  getMaxCollectiveXRunId,
  listCollectiveXRuns,
  upsertCollectiveXRun,
} from './collectivex';

type Json = Record<string, any>;

const AMD_SHA = 'a'.repeat(40);
const NVIDIA_SHA = 'b'.repeat(40);
const FIRST_AT = new Date('2026-10-28T00:00:00Z');
const SECOND_AT = new Date('2026-10-29T00:00:00Z');

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

function result(sku: string, vendor: 'amd' | 'nvidia', sourceSha: string): Json {
  return {
    ...makeRawShard({ sku, vendor }),
    provenance: { source_sha: sourceSha, source_dirty: false },
  };
}

// The first upload covers two AMD pools; cases.json requests every pool.
const mi300x = result('mi300x', 'amd', AMD_SHA);
const mi325x = result('mi325x', 'amd', AMD_SHA);
const h200 = result('h200-dgxc', 'nvidia', NVIDIA_SHA);
const b200 = result('b200-nscale', 'nvidia', NVIDIA_SHA);
const cases = makeRawMatrix(
  [mi300x, mi325x, h200, b200].map((doc) => ({
    caseId: doc.identity.case_id,
    sku: doc.identity.case_factors.sku,
    case: doc.identity.case_factors.case,
  })),
);

function pathOf(doc: Json): string {
  return `${doc.identity.case_factors.sku}/${doc.identity.case_id}.json`;
}

const tempDirs: string[] = [];

/** A results directory as collectivex/run.sh writes it, under the OS temp dir. */
function resultsDir(docs: Json[], matrix: Json = cases): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-upload-'));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'cases.json'), JSON.stringify(matrix));
  for (const doc of docs) {
    fs.mkdirSync(path.join(dir, doc.identity.case_factors.sku), { recursive: true });
    fs.writeFileSync(path.join(dir, pathOf(doc)), JSON.stringify(doc));
  }
  return dir;
}

/** Plan and store one upload the way the CLI does. */
async function upload(docs: Json[], now: Date) {
  const planned = await planUpload(sql, resultsDir(docs), now);
  const stored = await upsertCollectiveXRun(sql, planned.run, planned.docs, {
    expectedMaxRunId: planned.maxStoredRunId,
  });
  return { ...planned, stored };
}

/** One run built from files alone, for direct upsert tests. */
function runOf(docs: Json[], now: Date, maxStoredRunId: string | null = null) {
  const files = new Map<string, Uint8Array>([
    ['cases.json', new TextEncoder().encode(JSON.stringify(cases))],
    ...docs.map((doc): [string, Uint8Array] => [
      pathOf(doc),
      new TextEncoder().encode(JSON.stringify(doc)),
    ]),
  ]);
  return buildUploadedRun(validateResults({ files }), null, { maxStoredRunId, now });
}

let sql: PgliteSql;

beforeEach(async () => {
  sql = await collectiveXDb();
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('CollectiveX runs from uploaded results in PostgreSQL', () => {
  it('serves a first upload holding only the mi300x and mi325x folders', async () => {
    const first = await upload([mi300x, mi325x], FIRST_AT);
    expect(first.stored).toBe('inserted');
    expect(first.plan).toMatchObject({ baseRunId: null, uploaded: 2, kept: 0 });

    const row = await getLatestCollectiveXRun(sql, 1);
    expect(row).not.toBeNull();
    expect(row?.source_branch).toBeNull();
    const dataset = collectiveXDatasetFromRow(row!);
    expect(dataset.run).toMatchObject({
      run_id: String(FIRST_AT.getTime() / 1000),
      source_sha: AMD_SHA,
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

  it('stores an upload of another pool as a newer superset run and serves it as latest', async () => {
    const first = await upload([mi300x, mi325x], FIRST_AT);
    const second = await upload([h200, b200], SECOND_AT);
    expect(second.stored).toBe('inserted');
    expect(second.plan).toEqual({
      baseRunId: first.run.run_id,
      uploaded: 2,
      replaced: 0,
      kept: 2,
      dropped: [],
    });

    expect(Number(second.run.run_id)).toBeGreaterThan(Number(first.run.run_id));
    const latest = await getLatestCollectiveXRun(sql, 1);
    expect(latest?.run_id).toBe(second.run.run_id);
    expect(latest?.source_sha).toBe(NVIDIA_SHA);
    expect(latest?.docs).toHaveLength(4);
    expect(collectiveXDatasetFromRow(latest!).run.measured_cases).toBe(4);

    const runs = await listCollectiveXRuns(sql, 1);
    expect(runs.map((run) => run.run_id)).toEqual([second.run.run_id, first.run.run_id]);
    expect(runs.map((run) => run.measured_cases)).toEqual([4, 2]);

    const earlier = await getCollectiveXRun(sql, 1, first.run.run_id);
    expect(earlier?.docs).toHaveLength(2);
  });

  it('replaces a stored case with its re-uploaded result', async () => {
    await upload([mi300x, mi325x], FIRST_AT);
    const rerun = { ...result('mi300x', 'amd', NVIDIA_SHA), notes: ['rerun'] };
    const second = await upload([rerun], SECOND_AT);
    expect(second.plan).toMatchObject({ uploaded: 1, replaced: 1, kept: 1 });
    const latest = await getLatestCollectiveXRun(sql, 1);
    expect(latest?.docs).toHaveLength(2);
    expect(latest?.docs).toContainEqual(rerun);
    expect(latest?.docs).not.toContainEqual(mi300x);
  });

  it('runs past a clock behind the newest stored run', async () => {
    const first = await upload([mi300x], SECOND_AT);
    const second = await upload([h200], FIRST_AT);
    expect(Number(second.run.run_id)).toBe(Number(first.run.run_id) + 1);
    const latest = await getLatestCollectiveXRun(sql, 1);
    expect(latest?.run_id).toBe(second.run.run_id);
  });

  it('writes nothing when another run was stored after the upload was planned', async () => {
    const planned = await planUpload(sql, resultsDir([mi300x]), FIRST_AT);
    await upload([h200], SECOND_AT);
    await expect(
      upsertCollectiveXRun(sql, planned.run, planned.docs, {
        expectedMaxRunId: planned.maxStoredRunId,
      }),
    ).resolves.toBe('stale');
    expect(await listCollectiveXRuns(sql, 1)).toHaveLength(1);
  });

  it('refuses a run id held by another source', async () => {
    const first = runOf([mi300x], FIRST_AT);
    await upsertCollectiveXRun(sql, first.run, first.docs);
    const clash = runOf([h200], FIRST_AT);
    await expect(upsertCollectiveXRun(sql, clash.run, clash.docs)).resolves.toBe('conflict');
    const kept = await getCollectiveXRun(sql, 1, first.run.run_id);
    expect(kept?.source_sha).toBe(AMD_SHA);
  });

  it('never serves a run with nothing measured', async () => {
    const unmeasured = result('mi300x', 'amd', AMD_SHA);
    const empty = runOf(
      [{ ...unmeasured, outcome: { status: 'invalid', reasons: ['x'] } }],
      FIRST_AT,
    );
    expect(empty.run.summary.measured_cases).toBe(0);
    await upsertCollectiveXRun(sql, empty.run, empty.docs);
    expect(await getLatestCollectiveXRun(sql, 1)).toBeNull();
    expect(await getCollectiveXRun(sql, 1, empty.run.run_id)).toBeNull();
    expect(await listCollectiveXRuns(sql, 1)).toEqual([]);
  });

  it('stores each document once when two writes of one run overlap', async () => {
    const first = runOf([mi300x, mi325x], FIRST_AT);
    const results = await Promise.all([
      upsertCollectiveXRun(sql, first.run, first.docs),
      upsertCollectiveXRun(sql, first.run, first.docs),
      upsertCollectiveXRun(sql, first.run, first.docs),
    ]);
    expect(results.toSorted()).toEqual(['inserted', 'replaced', 'replaced']);
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM cx_run_docs`;
    expect(count).toBe(2);
  });

  it('deletes one named run, and the next upload merges over the run left', async () => {
    const first = await upload([mi300x], FIRST_AT);
    const second = await upload([h200], SECOND_AT);
    await expect(deleteCollectiveXRun(sql, second.run.run_id)).resolves.toEqual({
      run_id: second.run.run_id,
      source_sha: NVIDIA_SHA,
    });
    await expect(deleteCollectiveXRun(sql, second.run.run_id)).resolves.toBeNull();
    const restored = await getLatestCollectiveXRun(sql, 1);
    expect(restored?.run_id).toBe(first.run.run_id);
    expect(await getMaxCollectiveXRunId(sql)).toBe(first.run.run_id);
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM cx_run_docs`;
    expect(count).toBe(1);

    const third = await upload([b200], SECOND_AT);
    expect(third.plan.baseRunId).toBe(first.run.run_id);
    const merged = await getLatestCollectiveXRun(sql, 1);
    expect(merged?.docs).toHaveLength(2);
  });
});

describe('migration 005', () => {
  it('drops lazy-ingest runs that would outrank uploaded runs, and forbids new ones', async () => {
    const db = await PGlite.create();
    await applyMigrations(db, (name) => name < '005');
    const legacy = pgliteSql(db);
    const first = runOf([mi300x], FIRST_AT);
    await upsertCollectiveXRun(legacy, first.run, first.docs);
    await upsertCollectiveXRun(
      legacy,
      { ...first.run, run_id: '37459990486', source_sha: NVIDIA_SHA },
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
        { ...first.run, run_id: '37459990487', source_sha: NVIDIA_SHA },
        first.docs,
      ),
    ).rejects.toThrow(/cx_runs_committed_run_id/u);
  });
});
