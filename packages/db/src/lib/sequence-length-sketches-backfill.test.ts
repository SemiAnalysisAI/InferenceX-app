import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildTokenLengthSketch,
  mergeTokenLengthSketches,
} from '@semianalysisai/inferencex-constants';

import { encodeSequenceLengthSketches } from '../etl/sequence-length-sketch-codec';
import { SEQUENCE_LENGTH_SKETCHES_VERSION, STATS_VERSION } from '../queries/agentic-shared';
import { getResidentSequenceLengthSketches } from '../queries/resident-sequence-lengths';
import {
  computeSequenceLengthSketches,
  writeSequenceLengthSketches,
} from './sequence-length-sketches-backfill';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';

const CURRENT = {
  isl: buildTokenLengthSketch([0, 12, 4_096, 4_100, 120_000]),
  osl: buildTokenLengthSketch([3, 300]),
};
const STALE = { isl: buildTokenLengthSketch([7]), osl: null };

interface SketchColumns {
  sequence_length_sketches: Uint8Array | null;
  sequence_length_sketches_version: number | null;
}

let db: PGlite;
let sql: PgliteSql;

async function storedColumns(id: number): Promise<SketchColumns> {
  const [row] = (await sql`
    select sequence_length_sketches, sequence_length_sketches_version
    from agentic_trace_replay where id = ${id}
  `) as unknown as SketchColumns[];
  return row!;
}

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
  await db.exec(`
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', 'completed', 'success', '2026-10-01T04:19:00Z', '2026-10-01');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsv4', 'b200', 'vllm', 'fp4', 'none', false, false, 8, 8, 8, 8);
  `);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('TRUNCATE agentic_trace_replay RESTART IDENTITY CASCADE');
  for (const [id, version, sequenceLengths] of [
    [31, STATS_VERSION, CURRENT],
    [32, STATS_VERSION - 1, STALE],
  ] as const) {
    await sql`
      insert into agentic_trace_replay (id, aggregate_stats)
      values (${id}, ${JSON.stringify({ version, sequenceLengths })}::jsonb)
    `;
  }
  await db.exec(`
    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, conc,
      metrics, trace_replay_id)
    VALUES (301, 1, 1, 'agentic_traces', '2026-10-01', 16, '{}', 31),
           (302, 1, 1, 'agentic_traces', '2026-10-01', 32, '{}', 32);
  `);
});

describe('sequence length sketches backfill (PostgreSQL)', () => {
  it('stores sketches that serve the same route result as the JSON', async () => {
    const fromJson = await getResidentSequenceLengthSketches(sql, [301, 302]);

    await expect(computeSequenceLengthSketches(sql, 32)).resolves.toBeNull();
    const stored = await computeSequenceLengthSketches(sql, 31);
    await expect(writeSequenceLengthSketches(sql, 31, stored!)).resolves.toBe(true);

    expect(await storedColumns(31)).toMatchObject({
      sequence_length_sketches_version: SEQUENCE_LENGTH_SKETCHES_VERSION,
    });
    const fromSketches = await getResidentSequenceLengthSketches(sql, [301, 302]);
    expect(JSON.stringify(fromSketches)).toBe(JSON.stringify(fromJson));
    expect(fromSketches.coveredPoints).toBe(1);
  });

  it('serves stored sketches instead of the JSON', async () => {
    const stored = await computeSequenceLengthSketches(sql, 31);
    await writeSequenceLengthSketches(sql, 31, {
      ...stored!,
      sketches: encodeSequenceLengthSketches(STALE)!,
    });

    await expect(getResidentSequenceLengthSketches(sql, [301])).resolves.toEqual({
      isl: mergeTokenLengthSketches([STALE.isl]),
      osl: null,
      coveredPoints: 1,
      requestedPoints: 1,
    });
  });

  it('writes nothing when aggregate_stats changed after it was read', async () => {
    const stored = await computeSequenceLengthSketches(sql, 31);
    await sql`
      update agentic_trace_replay
      set aggregate_stats = jsonb_set(aggregate_stats, '{sequenceLengths,osl}', 'null')
      where id = 31
    `;

    await expect(writeSequenceLengthSketches(sql, 31, stored!)).resolves.toBe(false);
    expect(await storedColumns(31)).toEqual({
      sequence_length_sketches: null,
      sequence_length_sketches_version: null,
    });
  });
});
