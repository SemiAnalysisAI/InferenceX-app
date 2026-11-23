import type { PGlite } from '@electric-sql/pglite';

/** Tables a purge or override may touch. Snapshots of them prove what it left alone. */
export const RUN_TABLES = [
  'configs',
  'workflow_runs',
  'benchmark_results',
  'run_stats',
  'eval_results',
  'eval_samples',
  'changelog_entries',
  'server_logs',
  'agentic_trace_replay',
  'availability',
  'gpu_metric_series',
  'benchmark_result_gpu_metrics',
  'run_datasets',
] as const;

export type RunTable = (typeof RUN_TABLES)[number];
export type Row = Record<string, unknown>;
export type Snapshot = Record<RunTable, Row[]>;

export async function snapshotRunTables(db: PGlite): Promise<Snapshot> {
  const snapshot = {} as Snapshot;
  for (const table of RUN_TABLES) {
    const { rows } = await db.query<{ row: Row }>(
      `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
    );
    snapshot[table] = rows.map((r) => r.row);
  }
  return snapshot;
}

/** `before` with the rows `removed` selects dropped, table by table. */
export function withoutRows(
  before: Snapshot,
  removed: Partial<Record<RunTable, (row: Row) => boolean>>,
): Snapshot {
  const expected = {} as Snapshot;
  for (const table of RUN_TABLES) {
    const drop = removed[table];
    expected[table] = drop ? before[table].filter((row) => !drop(row)) : before[table];
  }
  return expected;
}

/**
 * GitHub run 1000 attempt 1 (workflow_runs.id 1) is the usual target. Its neighbours share what a
 * careless purge could reach through: attempt 2 of the same GitHub run (id 2), GitHub run 10000
 * whose id starts with 1000 and which shares configs, a date, a server log and a trace replay
 * (id 3), and GitHub run 100 on another date (id 4).
 *
 * Availability holds one row per distinct successful benchmark key, as ingest writes it:
 * - c1 sglang 1024/1024 on 2026-09-01, held by runs 1, 2 and 3
 * - c2 vllm 8192/1024 on 2026-09-01, held by run 1 alone (run 3 has only an errored row there)
 * - c3 sglang mtp agentic on 2026-09-01, held by run 1 alone
 * - c1 sglang agentic on 2026-09-01, held by runs 1 and 3
 * - c1 sglang 1024/1024 on 2026-09-02, held by run 4
 */
export const RUN_FIXTURE_SQL = `
TRUNCATE workflow_runs, configs, server_logs, agentic_trace_replay, availability
  RESTART IDENTITY CASCADE;

INSERT INTO configs (id, hardware, framework, model, precision, spec_method, disagg, is_multinode,
  prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
  decode_tp, decode_ep, decode_dp_attention, decode_num_workers, num_prefill_gpu, num_decode_gpu)
VALUES
  (1, 'b200', 'sglang', 'dsr1', 'fp4', 'none', false, false, 8, 1, false, 0, 8, 1, false, 0, 8, 8),
  (2, 'b200', 'vllm',   'dsr1', 'fp4', 'none', false, false, 8, 1, false, 0, 8, 1, false, 0, 8, 8),
  (3, 'b200', 'sglang', 'dsr1', 'fp4', 'mtp',  false, false, 8, 1, false, 0, 8, 1, false, 0, 8, 8);
SELECT setval(pg_get_serial_sequence('configs', 'id'), 3);

INSERT INTO workflow_runs (id, github_run_id, run_attempt, name, created_at, date, conclusion)
VALUES
  (1, 1000,  1, 'target',          '2026-09-01T00:00:00Z', '2026-09-01', 'failure'),
  (2, 1000,  2, 'target retry',    '2026-09-01T01:00:00Z', '2026-09-01', 'failure'),
  (3, 10000, 1, 'prefix neighbour', '2026-09-01T02:00:00Z', '2026-09-01', 'failure'),
  (4, 100,   1, 'other day',       '2026-09-02T00:00:00Z', '2026-09-02', 'failure');
SELECT setval(pg_get_serial_sequence('workflow_runs', 'id'), 4);

INSERT INTO server_logs (id, server_log) VALUES (1, 'only run 1'), (2, 'shared by runs 1 and 3');
INSERT INTO agentic_trace_replay (id) VALUES (1), (2);

INSERT INTO benchmark_results (id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc,
  metrics, offload_mode, recipe_fingerprint, server_log_id, trace_replay_id, error)
VALUES
  (1,  1, 1, 'single_turn',    '2026-09-01', 1024, 1024, 4,  '{"tput_per_gpu": 1}', 'off', NULL,       1,    NULL, NULL),
  (2,  1, 1, 'single_turn',    '2026-09-01', 1024, 1024, 8,  '{"tput_per_gpu": 2}', 'off', NULL,       2,    NULL, NULL),
  (3,  1, 2, 'single_turn',    '2026-09-01', 8192, 1024, 4,  '{"tput_per_gpu": 3}', 'off', NULL,       NULL, NULL, NULL),
  (4,  1, 3, 'agentic_traces', '2026-09-01', NULL, NULL, 16, '{"tput_per_gpu": 4}', 'on',  NULL,       NULL, 1,    NULL),
  (5,  1, 1, 'agentic_traces', '2026-09-01', NULL, NULL, 32, '{"tput_per_gpu": 5}', 'on',  'recipe-a', NULL, 2,    NULL),
  (6,  2, 1, 'single_turn',    '2026-09-01', 1024, 1024, 4,  '{"tput_per_gpu": 6}', 'off', NULL,       NULL, NULL, NULL),
  (7,  3, 1, 'single_turn',    '2026-09-01', 1024, 1024, 4,  '{"tput_per_gpu": 7}', 'off', NULL,       2,    NULL, NULL),
  (8,  3, 1, 'agentic_traces', '2026-09-01', NULL, NULL, 32, '{"tput_per_gpu": 8}', 'on',  'recipe-a', NULL, 2,    NULL),
  (9,  4, 1, 'single_turn',    '2026-09-02', 1024, 1024, 4,  '{"tput_per_gpu": 9}', 'off', NULL,       NULL, NULL, NULL),
  (10, 3, 2, 'single_turn',    '2026-09-01', 8192, 1024, 4,  '{}',                  'off', NULL,       NULL, NULL, 'boom');
SELECT setval(pg_get_serial_sequence('benchmark_results', 'id'), 10);

INSERT INTO availability (model, isl, osl, precision, hardware, framework, spec_method, disagg,
  benchmark_type, date)
SELECT DISTINCT c.model, br.isl, br.osl, c.precision, c.hardware, c.framework, c.spec_method,
  c.disagg, br.benchmark_type, br.date
FROM benchmark_results br JOIN configs c ON c.id = br.config_id
WHERE br.error IS NULL;

INSERT INTO run_stats (id, workflow_run_id, date, hardware, n_success, total)
VALUES (1, 1, '2026-09-01', 'b200', 3, 4), (2, 3, '2026-09-01', 'b200', 4, 4);

INSERT INTO eval_results (id, workflow_run_id, config_id, task, date, metrics)
VALUES (1, 1, 1, 'gsm8k', '2026-09-01', '{"em": 0.9}'), (2, 3, 1, 'gsm8k', '2026-09-01', '{"em": 0.8}');
INSERT INTO eval_samples (id, eval_result_id, doc_id) VALUES (1, 1, 0), (2, 1, 1), (3, 2, 0);

INSERT INTO changelog_entries (id, workflow_run_id, date, base_ref, head_ref, config_keys, description)
VALUES
  (1, 1, '2026-09-01', 'base', 'head', ARRAY['dsr1-fp4-b200-sglang', 'dsr1-fp4-b200-vllm'], 'target change'),
  (2, 3, '2026-09-01', 'base', 'head', ARRAY['dsr1-fp4-b200-sglang'], 'neighbour change');

INSERT INTO gpu_metric_series (id, workflow_run_id, artifact_name, config_key, file_name, vendor,
  csv_sha256, sample_count, gpu_count, started_at, ended_at)
VALUES
  (1, 1, 'gpu_metrics_a', 'a', 'gpu.csv', 'nvidia', 'aa', 10, 8, '2026-09-01T00:00:00Z', '2026-09-01T00:10:00Z'),
  (2, 3, 'gpu_metrics_a', 'a', 'gpu.csv', 'nvidia', 'bb', 20, 8, '2026-09-01T00:00:00Z', '2026-09-01T00:10:00Z');
INSERT INTO benchmark_result_gpu_metrics (benchmark_result_id, series_id) VALUES (1, 1), (2, 1), (7, 2);

INSERT INTO run_datasets (workflow_run_id, dataset_slug) VALUES (1, 'corpus'), (3, 'corpus');
`;

export async function seedRunFixture(db: PGlite): Promise<void> {
  await db.exec(RUN_FIXTURE_SQL);
}
