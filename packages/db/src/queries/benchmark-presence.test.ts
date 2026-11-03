import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migratedPglite, pgliteSql, type PgliteSql } from '../lib/test-pglite';
import { getBenchmarkPresence } from './benchmark-presence';

let db: PGlite;
let sql: PgliteSql;

beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe('getBenchmarkPresence', () => {
  it('encodes trace and log presence as gap/length runs of ascending ids', async () => {
    await db.exec(`
      INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, status, conclusion, created_at, date)
      VALUES (1, 29181694248, 1, 'Run Sweep', 'completed', 'success', '2026-10-01T04:19:00Z', '2026-10-01');
      INSERT INTO configs (id, model, hardware, framework, precision, spec_method, disagg,
        is_multinode, prefill_tp, decode_tp, num_prefill_gpu, num_decode_gpu)
      VALUES (1, 'dsv4', 'b200', 'vllm', 'fp4', 'none', false, false, 8, 8, 8, 8);
      INSERT INTO server_logs (id, server_log) VALUES (1, 'log');
      -- 1 inline profile, 2 chunked profile, 3 server metrics only (no trace).
      INSERT INTO agentic_trace_replay (id, profile_export_jsonl_gz, profile_export_chunk_count)
      VALUES (1, 'gz', 0), (2, null, 2), (3, null, 0);
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
});
