import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import {
  getBenchmarkPresence,
  mergeBenchmarkPresence,
  type BenchmarkPresence,
} from './benchmark-presence';

let db: PGlite;
let sql: PgliteSql;

const RECOMPUTED_RUNS = `
  with present as (
    select br.id, true as trace
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0
    union all
    select br.id, false as trace
    from benchmark_results br
    where br.server_log_id is not null
  )
  select trace, min(id)::int as start, count(*)::int as length
  from (
    select trace, id, id - row_number() over (partition by trace order by id) as island
    from present
  ) runs
  group by trace, island
  order by trace, start`;

interface Run {
  trace: boolean;
  start: number;
  length: number;
}

function encode(runs: Run[]): BenchmarkPresence {
  const presence: BenchmarkPresence = { trace: [], log: [] };
  const ends = { trace: 0, log: 0 };
  for (const run of runs) {
    const kind = run.trace ? 'trace' : 'log';
    presence[kind].push(run.start - ends[kind], run.length);
    ends[kind] = run.start + run.length;
  }
  return presence;
}

async function expectMaintained(step: string) {
  const recomputed = await db.query<Run>(RECOMPUTED_RUNS);
  const maintained = await db.query<Run>(
    'select trace, start::int as start, length::int as length from benchmark_presence_runs order by trace, start',
  );
  expect(maintained.rows, step).toEqual(recomputed.rows);
  expect(JSON.stringify(await getBenchmarkPresence(sql)), step).toBe(
    JSON.stringify(encode(recomputed.rows)),
  );
}

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
  await db.exec(`
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
    VALUES (1, 29181694248, 1, 'Run Sweep', 'completed', 'success', '2026-10-01T04:19:00Z', '2026-10-01');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsv4', 'b200', 'vllm', 'fp4', 'none', false, false, 8, 8, 8, 8);
    INSERT INTO server_logs (id, server_log) VALUES (1, 'log');
    -- 1 inline profile, 2 chunked profile, 3 server metrics only (no trace).
    INSERT INTO agentic_trace_replay (id, profile_export_jsonl_gz, profile_export_chunk_count)
    VALUES (1, 'gz', 0), (2, null, 2), (3, null, 0), (4, null, 0);
  `);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe('getBenchmarkPresence', () => {
  it('encodes trace and log presence as gap/length runs of ascending ids', async () => {
    await db.exec(`
      INSERT INTO benchmark_results
        (id, workflow_run_id, config_id, benchmark_type, date, conc, metrics, trace_replay_id, server_log_id)
      VALUES
        (1, 1, 1, 'agentic_traces', '2026-10-01', 1, '{}', null, 1),
        (2, 1, 1, 'agentic_traces', '2026-10-01', 2, '{}', null, 1),
        (3, 1, 1, 'agentic_traces', '2026-10-01', 3, '{}', 1, null),
        (4, 1, 1, 'agentic_traces', '2026-10-01', 4, '{}', 1, null),
        (5, 1, 1, 'agentic_traces', '2026-10-01', 5, '{}', 1, 1),
        (6, 1, 1, 'agentic_traces', '2026-10-01', 6, '{}', null, null),
        (7, 1, 1, 'agentic_traces', '2026-10-01', 7, '{}', 2, null),
        (8, 1, 1, 'agentic_traces', '2026-10-01', 8, '{}', 3, null),
        (9, 1, 1, 'agentic_traces', '2026-10-01', 9, '{}', 3, 1),
        (10, 1, 1, 'agentic_traces', '2026-10-01', 10, '{}', null, 1);
    `);

    await expect(getBenchmarkPresence(sql)).resolves.toEqual({
      trace: [3, 3, 1, 1],
      log: [1, 2, 2, 1, 3, 2],
    });
  });

  it('follows replay rows that move or are replaced under a linked result', async () => {
    await db.exec(`
      INSERT INTO agentic_trace_replay (id, profile_export_jsonl_gz, profile_export_chunk_count)
      VALUES (5, 'gz', 0), (6, null, 0);
      INSERT INTO benchmark_results
        (id, workflow_run_id, config_id, benchmark_type, date, conc, metrics, trace_replay_id)
      VALUES (90, 1, 1, 'agentic_traces', '2026-10-01', 90, '{}', 5);
    `);
    await expectMaintained('linked replay');
    await db.exec(
      'UPDATE agentic_trace_replay SET id = CASE id WHEN 5 THEN 7 ELSE 5 END WHERE id IN (5, 6)',
    );
    await expectMaintained('moved replay id');
    await db.exec(`WITH gone AS (DELETE FROM agentic_trace_replay WHERE id = 5 RETURNING id)
      INSERT INTO agentic_trace_replay (id, profile_export_jsonl_gz) SELECT id, 'gz' FROM gone`);
    await expectMaintained('replaced with a profile');
    await db.exec(`WITH gone AS (DELETE FROM agentic_trace_replay WHERE id = 5 RETURNING id)
      INSERT INTO agentic_trace_replay (id) SELECT id FROM gone`);
    await expectMaintained('replaced without a profile');
    await db.exec(
      'DELETE FROM benchmark_results WHERE id = 90; DELETE FROM agentic_trace_replay WHERE id IN (5, 7);',
    );
    await expectMaintained('removed replays');
  });

  it('keeps the maintained runs equal to a full recompute across every kind of write', async () => {
    let seed = 625_341_585;
    const random = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return Math.floor((seed / 2_147_483_648) * n);
    };
    const pick = <T>(values: readonly T[]) => values[random(values.length)]!;
    const traceIds = ['null', '1', '2', '3', '4'] as const;
    const logIds = ['null', '1'] as const;
    const idList = (count: number) =>
      [...new Set(Array.from({ length: count }, () => 1 + random(60)))].join(', ');

    const writers = [
      () =>
        idList(1 + random(6))
          .split(', ')
          .map(
            (id) => `INSERT INTO benchmark_results
              (id, workflow_run_id, config_id, benchmark_type, date, conc, metrics, trace_replay_id, server_log_id)
              VALUES (${id}, 1, 1, 'agentic_traces', '2026-10-01', ${id}, '{}', ${pick(traceIds)}, ${pick(logIds)})
              ON CONFLICT DO NOTHING;`,
          )
          .join('\n'),
      () => `UPDATE benchmark_results SET trace_replay_id = ${pick(traceIds)}
        WHERE id IN (${idList(1 + random(8))});`,
      () => `UPDATE benchmark_results SET server_log_id = ${pick(logIds)}
        WHERE id IN (${idList(1 + random(8))});`,
      () => `DELETE FROM benchmark_results WHERE id IN (${idList(1 + random(4))});`,
      () =>
        `UPDATE agentic_trace_replay SET ${pick([
          `profile_export_jsonl_gz = ${pick(['null', "'gz'"])}`,
          `profile_export_chunk_count = ${pick(['0', '2'])}`,
        ])} WHERE id = ${1 + random(4)};`,
      () => {
        const target = 1 + random(60);
        return `UPDATE benchmark_results SET id = ${target} WHERE id = ${1 + random(60)}
          AND NOT EXISTS (SELECT 1 FROM benchmark_results WHERE id = ${target});`;
      },
      () => `UPDATE benchmark_results SET metrics = '{"x": ${random(9)}}'
        WHERE id IN (${idList(1 + random(8))});`,
    ];

    for (let step = 0; step < 300; step++) {
      const writes = Array.from({ length: 1 + random(3) }, () => pick(writers)()).join('\n');
      if (step === 150) await db.exec('TRUNCATE benchmark_results CASCADE');
      await db.exec(`BEGIN; ${writes} ${random(10) === 0 ? 'ROLLBACK' : 'COMMIT'};`);
      await expectMaintained(`step ${step}: ${writes}`);
    }
  }, 60_000);
});

function decode(runs: number[]): number[] {
  const ids: number[] = [];
  let end = 0;
  for (let r = 0; r < runs.length; r += 2) {
    const start = end + runs[r]!;
    end = start + runs[r + 1]!;
    for (let id = start; id < end; id++) ids.push(id);
  }
  return ids;
}

describe('mergeBenchmarkPresence', () => {
  it('holds exactly the ids of every part, downstream ids included', () => {
    const downstream = 1_000_000_000_000;
    const merged = mergeBenchmarkPresence([
      encode([
        { trace: false, start: 1, length: 1 },
        { trace: true, start: 3, length: 2 },
        { trace: false, start: 7, length: 3 },
      ]),
      encode([
        { trace: true, start: downstream, length: 2 },
        { trace: false, start: downstream + 5, length: 1 },
      ]),
    ]);
    expect(decode(merged.trace)).toEqual([3, 4, downstream, downstream + 1]);
    expect(decode(merged.log)).toEqual([1, 7, 8, 9, downstream + 5]);
  });

  it('joins spans that touch or overlap into one run', () => {
    const merged = mergeBenchmarkPresence([
      encode([{ trace: false, start: 1, length: 3 }]),
      encode([{ trace: false, start: 3, length: 3 }]),
      encode([{ trace: false, start: 6, length: 1 }]),
    ]);
    expect(merged.log).toEqual([1, 6]);
  });

  it('returns a single database unchanged', () => {
    const only = encode([{ trace: true, start: 4, length: 2 }]);
    expect(mergeBenchmarkPresence([only])).toEqual(only);
  });

  it('takes parts in any order and keeps spans that lie inside others', () => {
    const merged = mergeBenchmarkPresence([
      encode([{ trace: false, start: 20, length: 2 }]),
      encode([{ trace: false, start: 1, length: 9 }]),
      encode([{ trace: false, start: 3, length: 2 }]),
    ]);
    expect(decode(merged.log)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21]);
  });
});
