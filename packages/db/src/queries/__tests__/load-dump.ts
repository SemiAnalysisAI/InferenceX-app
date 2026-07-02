/**
 * Write the synthetic {@link Dataset} to an on-disk dump directory in the EXACT shape
 * `dump-db.ts` produces, so `json-provider` loads it unchanged.
 *
 * dump-db.ts does `JSON.stringify(row)` of raw postgres.js rows. That driver returns:
 *   - `date` / `timestamptz` columns as JS `Date` → JSON full ISO ("2026-06-14T00:00:00.000Z").
 *   - `bigserial` / `bigint` columns as STRINGS (postgres.js keeps 64-bit ids as strings
 *     to avoid precision loss). json-provider re-coerces those with `Number(...)`.
 * We reproduce both here so the dump is byte-faithful to a real one — json-provider's
 * date-slicing (`toDateString`) and Number() coercions are then exercised for real.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Dataset } from './dataset.js';

/** Render a YYYY-MM-DD calendar day the way postgres.js serializes a `date` column. */
function pgDate(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/** Render an ISO timestamp the way JSON.stringify(Date) would (millis + Z). */
function pgTimestamp(iso: string): string {
  return new Date(iso).toISOString();
}

/** Coerce a bigint id to the string postgres.js emits in a dump. */
const big = String;

export interface DumpHandle {
  dir: string;
}

/**
 * Materialize the dump directory and point DUMP_DIR at it. The caller is responsible
 * for importing json-provider AFTER this (its store is a lazy singleton keyed off
 * DUMP_DIR at first access) and for resetting the module registry between datasets.
 */
export function loadDump(ds: Dataset): DumpHandle {
  const dir = mkdtempSync(join(tmpdir(), 'infx-parity-'));

  const configs = ds.configs.map((c) => ({ ...c }));

  const workflow_runs = ds.workflow_runs.map((r) => ({
    ...r,
    id: big(r.id),
    github_run_id: big(r.github_run_id),
    created_at: pgTimestamp(r.created_at),
    run_started_at: r.run_started_at === null ? null : pgTimestamp(r.run_started_at),
    date: pgDate(r.date),
  }));

  const benchmark_results = ds.benchmark_results.map((b) => ({
    ...b,
    id: big(b.id),
    workflow_run_id: big(b.workflow_run_id),
    server_log_id: b.server_log_id === null ? null : big(b.server_log_id),
    date: pgDate(b.date),
  }));

  const run_stats = ds.run_stats.map((r) => ({
    ...r,
    id: big(r.id),
    workflow_run_id: big(r.workflow_run_id),
    date: pgDate(r.date),
  }));

  const eval_results = ds.eval_results.map((e) => ({
    ...e,
    id: big(e.id),
    workflow_run_id: big(e.workflow_run_id),
    date: pgDate(e.date),
  }));

  const availability = ds.availability.map((a) => ({ ...a, date: pgDate(a.date) }));

  const changelog_entries = ds.changelog_entries.map((c) => ({
    ...c,
    id: big(c.id),
    workflow_run_id: big(c.workflow_run_id),
    date: pgDate(c.date),
  }));

  const server_logs = ds.server_logs.map((s) => ({ ...s, id: big(s.id) }));

  const write = (name: string, rows: unknown[]): void => {
    // Mirror dump-db.ts's per-row JSON.stringify newline layout (cosmetic; JSON.parse
    // in json-provider is layout-agnostic, but this keeps the file shape identical).
    const body = rows.map((r) => JSON.stringify(r)).join(',\n');
    writeFileSync(join(dir, `${name}.json`), `[\n${body}\n]\n`);
  };

  write('configs', configs);
  write('workflow_runs', workflow_runs);
  write('benchmark_results', benchmark_results);
  write('run_stats', run_stats);
  write('eval_results', eval_results);
  write('availability', availability);
  write('changelog_entries', changelog_entries);
  write('server_logs', server_logs);

  return { dir };
}
