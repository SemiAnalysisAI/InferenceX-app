/**
 * Load the synthetic {@link Dataset} into a real embedded Postgres (PGlite) by running
 * the ACTUAL migration SQL files in order, INSERTing the rows, and refreshing the
 * materialized view — exactly as production does. The queries under test then run
 * against this via the {@link makePgliteClient} adapter, so we compare the JS mirrors
 * against Postgres's own semantics rather than a hand-derived expectation.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

import { makePgliteClient } from './pglite-adapter.js';
import type { Dataset } from './dataset.js';
import type { DbClient } from '../../connection.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', '..', 'migrations');

/** Escape a JS value into a Postgres SQL literal for a plain INSERT VALUES list. */
function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    // text[] literal, e.g. ARRAY['a','b']::text[]
    if (v.every((x) => typeof x === 'string')) {
      return v.length === 0
        ? `ARRAY[]::text[]`
        : `ARRAY[${v.map((s) => quote(s as string)).join(',')}]::text[]`;
    }
    // JSONB array
    return `${quote(JSON.stringify(v))}::jsonb`;
  }
  if (typeof v === 'object') return `${quote(JSON.stringify(v))}::jsonb`;
  return quote(String(v));
}

function quote(s: string): string {
  return `'${s.replaceAll("'", "''")}'`;
}

function insertRows(table: string, cols: string[], rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const values = rows.map((r) => `(${cols.map((c) => lit(r[c])).join(',')})`).join(',\n');
  return `INSERT INTO ${table} (${cols.join(',')}) VALUES\n${values};`;
}

export interface PgliteHandle {
  sql: DbClient;
  close: () => Promise<void>;
}

export async function loadPglite(ds: Dataset): Promise<PgliteHandle> {
  const pg = await PGlite.create('memory://');

  // Production Postgres (Neon) runs in UTC; PGlite defaults to the host's local
  // timezone. That matters because several queries render timestamps with
  // `to_char(ts, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`, which formats in the SESSION
  // timezone — under a non-UTC session it would shift the wall-clock time (and even
  // the calendar day) away from what production and the dump (stored UTC) produce.
  // Pin the session to UTC so to_char matches production exactly.
  await pg.exec(`SET timezone = 'UTC';`);

  // 1. Run the real migrations, in filename order (same as migrate.ts).
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .toSorted();
  for (const f of files) {
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
  }

  // 2. Insert the synthetic rows in FK-safe order.
  const configCols = [
    'id',
    'hardware',
    'framework',
    'model',
    'precision',
    'spec_method',
    'disagg',
    'is_multinode',
    'prefill_tp',
    'prefill_ep',
    'prefill_dp_attention',
    'prefill_num_workers',
    'decode_tp',
    'decode_ep',
    'decode_dp_attention',
    'decode_num_workers',
    'num_prefill_gpu',
    'num_decode_gpu',
  ];
  const runCols = [
    'id',
    'github_run_id',
    'run_attempt',
    'name',
    'status',
    'conclusion',
    'head_sha',
    'head_branch',
    'html_url',
    'created_at',
    'run_started_at',
    'date',
  ];
  const brCols = [
    'id',
    'workflow_run_id',
    'config_id',
    'benchmark_type',
    'date',
    'isl',
    'osl',
    'conc',
    'image',
    'metrics',
    'workers',
    'error',
    'server_log_id',
  ];
  const rsCols = ['id', 'workflow_run_id', 'date', 'hardware', 'n_success', 'total'];
  const erCols = [
    'id',
    'workflow_run_id',
    'config_id',
    'task',
    'date',
    'isl',
    'osl',
    'conc',
    'lm_eval_version',
    'metrics',
  ];
  const esCols = [
    'id',
    'eval_result_id',
    'doc_id',
    'prompt',
    'target',
    'response',
    'passed',
    'score',
    'metrics',
    'data',
  ];
  const availCols = [
    'model',
    'isl',
    'osl',
    'precision',
    'hardware',
    'framework',
    'spec_method',
    'disagg',
    'date',
  ];
  const clCols = [
    'id',
    'workflow_run_id',
    'date',
    'base_ref',
    'head_ref',
    'config_keys',
    'description',
    'pr_link',
  ];
  const slCols = ['id', 'server_log'];

  const statements = [
    insertRows('configs', configCols, ds.configs as unknown as Record<string, unknown>[]),
    insertRows('workflow_runs', runCols, ds.workflow_runs as unknown as Record<string, unknown>[]),
    insertRows('server_logs', slCols, ds.server_logs as unknown as Record<string, unknown>[]),
    insertRows(
      'benchmark_results',
      brCols,
      ds.benchmark_results as unknown as Record<string, unknown>[],
    ),
    insertRows('run_stats', rsCols, ds.run_stats as unknown as Record<string, unknown>[]),
    insertRows('eval_results', erCols, ds.eval_results as unknown as Record<string, unknown>[]),
    insertRows('eval_samples', esCols, ds.eval_samples as unknown as Record<string, unknown>[]),
    insertRows('availability', availCols, ds.availability as unknown as Record<string, unknown>[]),
    insertRows(
      'changelog_entries',
      clCols,
      ds.changelog_entries as unknown as Record<string, unknown>[],
    ),
  ].filter(Boolean);

  for (const stmt of statements) {
    await pg.exec(stmt);
  }

  // 3. Fix the sequences (we inserted explicit ids) then refresh the materialized view.
  await pg.exec(`
    SELECT setval(pg_get_serial_sequence('configs','id'), (SELECT MAX(id) FROM configs));
    SELECT setval(pg_get_serial_sequence('workflow_runs','id'), (SELECT MAX(id) FROM workflow_runs));
    SELECT setval(pg_get_serial_sequence('benchmark_results','id'), (SELECT MAX(id) FROM benchmark_results));
    REFRESH MATERIALIZED VIEW latest_benchmarks;
  `);

  return {
    sql: makePgliteClient(pg),
    close: () => pg.close(),
  };
}
