import { describe, expect, it, vi } from 'vitest';

import { getAllBenchmarksForHistory, getBenchmarksForRun, getLatestBenchmarks } from './benchmarks';

interface CapturedQuery {
  text: string;
  values: unknown[];
}

function captureSql() {
  let query: CapturedQuery = { text: '', values: [] };
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    query = {
      text: strings.join('?').replaceAll(/\s+/gu, ' ').trim(),
      values,
    };
    return Promise.resolve([]);
  });
  return {
    sql: sql as unknown as Parameters<typeof getBenchmarksForRun>[0],
    query: () => query,
    calls: () => sql.mock.calls.length,
  };
}

describe('append-only benchmark snapshots', () => {
  it('seeds a run snapshot from only the requested run, then walks older runs', async () => {
    const captured = captureSql();

    await getBenchmarksForRun(captured.sql, 'dsv4', 123456);
    expect(captured.calls()).toBe(1);

    const { text, values } = captured.query();
    expect(text).toContain('WITH RECURSIVE run_lines AS');
    expect(text).toContain('FROM ranked_runs WHERE github_run_id = ? UNION ALL');
    expect(text).not.toContain('seed_runs AS');
    expect(text).not.toContain('r.date <=');
    expect(text).toContain('WHERE current.append_only');
    expect(text).toContain('older.image = current.root_image');
    expect(text).toContain('older.line_spec_method = current.line_spec_method');
    expect(text).toContain('point_c.id = br.config_id');
    expect(text).toContain('br.recipe_fingerprint, br.conc, cr.run_rank');
    expect(text).toContain('br.workflow_run_id, wr.run_started_at::text');
    expect(text).toContain('br.snapshot_date::text AS curve_date');
    expect(text).toContain('snapshot_wr.id = br.snapshot_workflow_run_id');
    expect(values).toEqual([['dsv4'], 123456]);
  });

  it('chooses latest seeds under both the date and as-of-run cutoffs', async () => {
    const captured = captureSql();

    await getLatestBenchmarks(captured.sql, 'dsv4', '2026-08-01', false, '456789');

    const { text, values } = captured.query();
    expect(text).toContain('seed_runs AS ( SELECT DISTINCT ON');
    expect(text).toContain('FROM ranked_runs r WHERE r.date <= ?::date');
    expect(text).toContain('lwr.github_run_id = ?');
    expect(text).toContain('FROM seed_runs UNION ALL');
    expect(text).not.toContain('WHERE run_rank = 1');
    expect(values).toEqual([['dsv4'], '2026-08-01', 456789]);
  });

  it('keeps exact-date seeds independent from the main-chart run cutoff', async () => {
    const captured = captureSql();

    await getLatestBenchmarks(captured.sql, 'dsv4', '2026-08-01', true, '456789');

    const { text, values } = captured.query();
    expect(text).toContain('FROM ranked_runs r WHERE r.date = ?::date');
    expect(text).not.toContain('lwr.github_run_id = ?');
    expect(values).toEqual([['dsv4'], '2026-08-01']);
  });

  it('stamps latest materialized-view rows with a separate logical identity', async () => {
    const captured = captureSql();

    await getLatestBenchmarks(captured.sql, 'dsv4');

    const { text } = captured.query();
    expect(text).toContain('FROM latest_benchmarks lb');
    expect(text).toContain('lb.date::text, lb.workflow_run_id');
    expect(text).toContain('lb.snapshot_date::text AS curve_date');
    expect(text).toContain('lb.recipe_fingerprint,');
    expect(text).toContain('snapshot_wr.id = lb.snapshot_workflow_run_id');
  });

  it('seeds every filtered sequence run as a distinct historical snapshot', async () => {
    const captured = captureSql();

    await getAllBenchmarksForHistory(captured.sql, 'dsv4', 8192, 1024);

    const { text, values } = captured.query();
    expect(text).toContain('AND br.isl = ? AND br.osl = ? AND br.error IS NULL');
    expect(text).toContain('FROM ranked_runs UNION ALL');
    expect(text).not.toContain('WHERE github_run_id = ?');
    expect(text).not.toContain('seed_runs AS');
    expect(text).toContain('cr.snapshot_workflow_run_id, br.config_id');
    expect(text).toContain('br.recipe_fingerprint, br.conc, cr.run_rank');
    expect(text).toContain("br.metrics - '{std_ttft,std_tpot");
    expect(text).toContain('ORDER BY br.snapshot_date, c.id, br.conc');
    expect(values).toEqual([['dsv4'], 8192, 1024]);
  });

  it('filters agentic history by scenario without imposing sequence lengths', async () => {
    const captured = captureSql();

    await getAllBenchmarksForHistory(captured.sql, 'dsv4', null, null, 'agentic_traces');

    const { text, values } = captured.query();
    expect(text).toContain("AND br.benchmark_type = 'agentic_traces' AND br.error IS NULL");
    expect(text).not.toContain('AND br.isl = ?');
    expect(text).toContain('FROM ranked_runs UNION ALL');
    expect(values).toEqual([['dsv4']]);
  });
});

describe('power audit provenance reads (tolerant to a not-yet-applied migration 014)', () => {
  const TOLERANT_BR = [
    "to_jsonb(br) -> 'power_invalid_reasons' AS power_invalid_reasons",
    "to_jsonb(br) -> 'power_audit' AS power_audit",
  ];

  it('selects both columns via to_jsonb on the exact-run path', async () => {
    const captured = captureSql();
    await getBenchmarksForRun(captured.sql, 'dsv4', 123456);
    const { text } = captured.query();
    for (const piece of TOLERANT_BR) expect(text).toContain(piece);
    expect(text).not.toMatch(/\b(?:br|lb)\.power_(?:invalid_reasons|audit)\b/u);
  });

  it('selects both columns via to_jsonb on the dated latest path', async () => {
    const captured = captureSql();
    await getLatestBenchmarks(captured.sql, 'dsv4', '2026-08-01');
    const { text } = captured.query();
    for (const piece of TOLERANT_BR) expect(text).toContain(piece);
    expect(text).not.toMatch(/\b(?:br|lb)\.power_(?:invalid_reasons|audit)\b/u);
  });

  it('selects both columns via to_jsonb on the history path', async () => {
    const captured = captureSql();
    await getAllBenchmarksForHistory(captured.sql, 'dsv4', 8192, 1024);
    const { text } = captured.query();
    for (const piece of TOLERANT_BR) expect(text).toContain(piece);
    expect(text).not.toMatch(/\b(?:br|lb)\.power_(?:invalid_reasons|audit)\b/u);
  });

  it('selects both columns via to_jsonb on the no-date matview path', async () => {
    const captured = captureSql();
    await getLatestBenchmarks(captured.sql, 'dsv4');
    const { text } = captured.query();
    expect(text).toContain("to_jsonb(lb) -> 'power_invalid_reasons' AS power_invalid_reasons");
    expect(text).toContain("to_jsonb(lb) -> 'power_audit' AS power_audit");
    expect(text).not.toMatch(/\b(?:br|lb)\.power_(?:invalid_reasons|audit)\b/u);
  });
});
