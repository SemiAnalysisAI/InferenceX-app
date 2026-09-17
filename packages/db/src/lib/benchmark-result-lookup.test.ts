import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { mapBenchmarkRow, type BenchmarkParams } from '../etl/benchmark-mapper';
import { createSkipTracker } from '../etl/skip-tracker';
import { findBenchmarkResultIds, readMappedBenchmarkRows } from './benchmark-result-lookup';

type Sql = postgres.Sql;
let db: PGlite;
let sql: Sql;
const roots: string[] = [];

function queryClient(database: Pick<PGlite, 'query'>) {
  const client = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    const result = await database.query(query, values);
    return result.rows;
  };
  return Object.assign(client, { json: JSON.stringify, array: (value: unknown) => value });
}

const GITHUB_RUN_ID = 34557177019;
const RUN = { github_run_id: GITHUB_RUN_ID, run_attempt: 2 };

/** Raw `bmk_` JSON as the runner emits it for a fixed-sequence sweep. */
function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    infmax_model_prefix: 'dsr1',
    hw: 'b200-nv',
    framework: 'sglang',
    precision: 'fp4',
    isl: 8192,
    osl: 1024,
    conc: 32,
    tp: 8,
    ep: 1,
    dp_attention: false,
    tput_per_gpu: 1234.5,
    ...overrides,
  };
}

function mapped(raw: Record<string, unknown>): BenchmarkParams {
  const row = mapBenchmarkRow(raw, createSkipTracker());
  if (!row) throw new Error('fixture did not map');
  return row;
}

beforeAll(async () => {
  db = await PGlite.create();
  const dir = new URL('../../migrations/', import.meta.url);
  for (const name of fs.readdirSync(dir).toSorted()) {
    if (name.endsWith('.sql')) await db.exec(fs.readFileSync(new URL(name, dir), 'utf8'));
  }
  sql = queryClient(db) as unknown as Sql;
}, 30_000);

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

afterAll(async () => {
  await db?.close();
});

/**
 * Config 1 matches the fixture rows; config 2 differs only in decode_tp. Attempt 1
 * of the same GitHub run holds a point that must never be matched from attempt 2.
 */
beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
    VALUES (1, ${GITHUB_RUN_ID}, 1, 'Run Sweep', '2026-09-11T04:00:00Z', '2026-09-11'),
           (2, ${GITHUB_RUN_ID}, 2, 'Run Sweep', '2026-09-11T06:00:00Z', '2026-09-11');

    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
      decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
      num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, false, 8, 1, false, 0,
              8, 1, false, 0, 8, 8),
           (2, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, false, 8, 1, false, 0,
              4, 1, false, 0, 8, 8),
           (3, 'dsv4', 'b200', 'vllm', 'fp4', 'none', false, false, 1, 1, false, 0,
              1, 1, false, 0, 1, 1);

    INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, offload_mode, metrics)
    VALUES (20, 2, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, 'off', '{}'),
           (21, 2, 1, 'single_turn', '2026-09-11', 8192, 1024, 64, 'off', '{}'),
           (22, 2, 2, 'single_turn', '2026-09-11', 8192, 1024, 32, 'off', '{}'),
           (23, 1, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, 'off', '{}'),
           (24, 2, 3, 'agentic_traces', '2026-09-11', null, null, 72, 'off', '{}');`);
});

describe('findBenchmarkResultIds', () => {
  it('resolves one persisted point per mapped row using the run attempt and config key', async () => {
    const ids = await findBenchmarkResultIds(sql, RUN, [
      mapped(rawRow()),
      mapped(rawRow({ conc: 64 })),
    ]);
    expect(ids.toSorted()).toEqual([20, 21]);
  });

  it('never matches another attempt of the same run or a config with different parallelism', async () => {
    // Point 23 is the same natural key under attempt 1; point 22 is attempt 2 but
    // decode_tp 4. Neither may be linked to the attempt-2 telemetry.
    expect(
      await findBenchmarkResultIds(sql, { ...RUN, run_attempt: 3 }, [mapped(rawRow())]),
    ).toEqual([]);
    expect(await findBenchmarkResultIds(sql, RUN, [mapped(rawRow({ tp: 4 }))])).toEqual([]);
    const attempt1 = await findBenchmarkResultIds(sql, { ...RUN, run_attempt: 1 }, [
      mapped(rawRow()),
    ]);
    expect(attempt1).toEqual([23]);
  });

  it('matches an agentic row whose isl and osl are null', async () => {
    const agentic = mapped({
      infmax_model_prefix: 'dsv4',
      hw: 'b200-nv',
      framework: 'vllm',
      precision: 'fp4',
      scenario_type: 'agentic-coding',
      users: 72,
      tput_per_gpu: 20000,
    });
    expect(agentic.isl).toBeNull();
    expect(await findBenchmarkResultIds(sql, RUN, [agentic])).toEqual([24]);
  });

  it('prefers the offload-exact point and reports no unique fallback', async () => {
    await db.exec(`INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type,
      date, isl, osl, conc, offload_mode, metrics)
      VALUES (25, 2, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, 'on', '{}');`);
    const fallbacks: number[] = [];
    const ids = await findBenchmarkResultIds(sql, RUN, [mapped(rawRow())], (id) =>
      fallbacks.push(id),
    );
    expect(ids).toEqual([20]);
    expect(fallbacks).toEqual([]);
  });

  it('accepts a lone offload-drifted point through the unique fallback', async () => {
    // Historical mapper drift: the only surviving point carries 'on' while the
    // current mapper derives 'off'. Attaching telemetry is still unambiguous.
    await db.exec(`UPDATE benchmark_results SET offload_mode = 'on' WHERE id = 20;`);
    const fallbacks: number[] = [];
    const ids = await findBenchmarkResultIds(sql, RUN, [mapped(rawRow())], (id) =>
      fallbacks.push(id),
    );
    expect(ids).toEqual([20]);
    expect(fallbacks).toEqual([20]);
  });

  it('leaves ambiguous offload-drifted points unlinked', async () => {
    await db.exec(`UPDATE benchmark_results SET offload_mode = 'on' WHERE id = 20;
      INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type,
        date, isl, osl, conc, offload_mode, metrics)
      VALUES (26, 2, 1, 'single_turn', '2026-09-11', 8192, 1024, 32, 'dram', '{}');`);
    const fallbacks: number[] = [];
    const ids = await findBenchmarkResultIds(sql, RUN, [mapped(rawRow())], (id) =>
      fallbacks.push(id),
    );
    expect(ids).toEqual([]);
    expect(fallbacks).toEqual([]);
  });
});

describe('readMappedBenchmarkRows', () => {
  function writeArtifact(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bmk-lookup-'));
    roots.push(root);
    for (const [name, body] of Object.entries(files)) {
      const target = path.join(root, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
    return root;
  }

  it('maps every benchmark JSON under the artifact, accepting arrays and single objects', () => {
    const root = writeArtifact({
      'conc32.json': JSON.stringify(rawRow()),
      'nested/conc64.json': JSON.stringify([rawRow({ conc: 64 }), rawRow({ conc: 128 })]),
    });
    const rows = readMappedBenchmarkRows(root);
    expect(rows.map((row) => row.conc).toSorted((a, b) => a - b)).toEqual([32, 64, 128]);
    expect(rows[0]?.config).toMatchObject({
      model: 'dsr1',
      hardware: 'b200',
      framework: 'sglang',
      precision: 'fp4',
      decodeTp: 8,
    });
  });

  it('drops rows the production mapper rejects and files that are not JSON', () => {
    const root = writeArtifact({
      'conc32.json': JSON.stringify([
        rawRow(),
        rawRow({ hw: 'not-a-gpu' }),
        rawRow({ conc: undefined }),
        'not-an-object',
        null,
      ]),
      'gpu_metrics.csv': 'timestamp, index\n2026/09/11 04:19:41.982, 0\n',
      'README.md': '# ignored',
    });
    const rows = readMappedBenchmarkRows(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ conc: 32, isl: 8192, osl: 1024, offloadMode: 'off' });
  });
});
