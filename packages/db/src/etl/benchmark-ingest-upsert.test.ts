import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { stubEnv, unstubAllEnvs } from '../lib/test-helpers';
import { migratedPglite, pgliteDriverSql, type PgliteSql } from '../lib/test-pglite';
import { getBenchmarkPresence } from '../queries/benchmark-presence';
import {
  bulkIngestBenchmarkRows,
  insertServerLog,
  insertServerLogFiles,
  type BenchmarkPersistenceInput,
} from './benchmark-ingest';

let db: PGlite;
let sql: PgliteSql;

beforeAll(async () => {
  db = await migratedPglite();
  sql = await pgliteDriverSql(db);
}, 30_000);

afterAll(async () => {
  await sql?.end();
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`TRUNCATE workflow_runs, configs RESTART IDENTITY CASCADE;
    INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date)
    VALUES (1, 34557177019, 1, 'Run Sweep', '2026-09-11T04:00:00Z', '2026-09-11');
    INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
      is_multinode, prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
      decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
      num_prefill_gpu, num_decode_gpu)
    VALUES (1, 'dsr1', 'b200', 'sglang', 'fp4', 'none', false, false, 8, 1, false, 0,
              8, 1, false, 0, 8, 8);`);
});

const AUDIT = {
  source: 'power_validation_a_conc48.json',
  window_start_unix: 1,
  window_end_unix: 2,
};
const LATER = {
  source: 'power_validation_b_conc48.json',
  window_start_unix: 3,
  window_end_unix: 4,
};

function row(overrides: Partial<BenchmarkPersistenceInput> = {}): BenchmarkPersistenceInput {
  return {
    configId: 1,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 48,
    offloadMode: 'off',
    image: 'img',
    recipeFingerprint: 'recipe-a',
    metrics: { power_valid: 1 },
    ...overrides,
  };
}

async function ingest(...rows: BenchmarkPersistenceInput[]) {
  await bulkIngestBenchmarkRows(sql, rows, 1, '2026-09-11');
  const stored = await db.query<{ power_audit: unknown }>(
    'SELECT power_audit FROM benchmark_results ORDER BY id',
  );
  return stored.rows.map((r) => r.power_audit);
}

describe('bulkIngestBenchmarkRows — power_audit on conflict', () => {
  it('keeps an agentic audit across a copy without one and lets a carried audit replace it', async () => {
    expect(await ingest(row({ powerAudit: AUDIT }))).toEqual([AUDIT]);
    expect(await ingest(row())).toEqual([AUDIT]);
    expect(await ingest(row({ powerAudit: LATER }))).toEqual([LATER]);
  });

  it('still clears a single-turn audit when the fresh artifact carries none', async () => {
    const singleTurn = row({ benchmarkType: 'single_turn', isl: 1024, osl: 1024 });
    expect(await ingest({ ...singleTurn, powerAudit: AUDIT })).toEqual([AUDIT]);
    expect(await ingest(singleTurn)).toEqual([null]);
  });
});

describe('bulkIngestBenchmarkRows — linked trace metrics', () => {
  it.each([true, false])('preserves only missing trace fields when linked=%s', async (linked) => {
    await ingest(
      row({
        metrics: {
          output_tput_tps: 0,
          median_itl: 0.04,
          p99_itl: 0.08,
          server_gpu_cache_hit_rate: 0.75,
          kv_cache_pool_tokens: 4096,
          obsolete: 9,
        },
      }),
    );
    if (linked)
      await db.exec(`
      INSERT INTO agentic_trace_replay (id) VALUES (1);
      UPDATE benchmark_results SET trace_replay_id=1;
    `);
    for (let replay = 0; replay < 2; replay++) {
      await ingest(row({ metrics: { output_tput_tps: 689, median_itl: 0.02 } }));
      const {
        rows: [stored],
      } = await db.query<{ metrics: Record<string, number>; trace_replay_id: number | null }>(
        'SELECT metrics, trace_replay_id FROM benchmark_results',
      );
      expect(stored?.metrics).toEqual({
        output_tput_tps: 689,
        median_itl: 0.02,
        kv_cache_pool_tokens: 4096,
        ...(linked ? { p99_itl: 0.08, server_gpu_cache_hit_rate: 0.75 } : {}),
      });
      expect(stored?.trace_replay_id).toBe(linked ? 1 : null);
    }
  });

  it('keeps the trace full-response family whole against runner-only stats', async () => {
    await ingest(row({ metrics: { output_tput_tps: 1, median_itl: 0.04, median_intvty: 25 } }));
    // The state persistPreparedTraceReplay leaves: *_itl mirrors *_full_response_itl.
    const traced = {
      median_full_response_itl: 0.05,
      median_full_response_intvty: 20,
      median_itl: 0.05,
      median_intvty: 20,
    };
    await db.exec(`
      INSERT INTO agentic_trace_replay (id) VALUES (2);
      UPDATE benchmark_results SET trace_replay_id=2, metrics = metrics || '${JSON.stringify(traced)}';
    `);
    const stored = async () => {
      const { rows } = await db.query<{ metrics: unknown }>(
        'SELECT metrics FROM benchmark_results',
      );
      return rows[0]?.metrics;
    };

    await ingest(row({ metrics: { output_tput_tps: 689, median_itl: 0.04, median_intvty: 25 } }));
    expect(await stored()).toEqual({ output_tput_tps: 689, ...traced });

    const fresh = {
      output_tput_tps: 700,
      median_full_response_itl: 0.02,
      median_full_response_intvty: 50,
      median_itl: 0.02,
      median_intvty: 50,
    };
    await ingest(row({ metrics: fresh }));
    expect(await stored()).toEqual(fresh);
  });
});

describe('insertServerLog', () => {
  it('publishes log presence for the rows it links', async () => {
    const { insertedIds } = await bulkIngestBenchmarkRows(
      sql,
      [row({ conc: 1 }), row({ conc: 2 }), row({ conc: 4 })],
      1,
      '2026-09-11',
    );
    expect(await getBenchmarkPresence(sql)).toEqual({ trace: [], log: [] });
    await insertServerLog(sql, insertedIds, 'log');
    expect(await getBenchmarkPresence(sql)).toEqual({ trace: [], log: [1, 3] });
  });
});

describe('insertServerLogFiles sanitization', () => {
  afterEach(() => {
    unstubAllEnvs();
  });

  it('stores sanitized text in the primary, child rows and their blocks', async () => {
    await db.exec('TRUNCATE server_logs RESTART IDENTITY CASCADE');
    stubEnv('SERVER_LOG_BLOCKS', '1');
    const { insertedIds } = await bulkIngestBenchmarkRows(sql, [row()], 1, '2026-09-11');
    await insertServerLogFiles(sql, insertedIds, [
      { fileName: 'server.log', logText: 'listening on 198.51.100.7:8000 and 10.0.0.2:8000\n' },
      { fileName: 'router.log', logText: 'HF_TOKEN=hf_abcdefghijklmnopqrstuvwxyzABCDEF12\n' },
    ]);

    const server = 'listening on ***REDACTED***:8000 and 10.0.0.2:8000\n';
    const router = 'HF_TOKEN=***REDACTED***\n';
    expect(await sql`select server_log from server_logs`).toEqual([{ server_log: server }]);
    expect(await sql`select log_text from server_log_files`).toEqual([{ log_text: router }]);
    expect(
      await sql`select file_name, char_count::int from server_log_block_files order by file_name`,
    ).toEqual([
      { file_name: 'router.log', char_count: router.length },
      { file_name: 'server.log', char_count: server.length },
    ]);
  });
});
