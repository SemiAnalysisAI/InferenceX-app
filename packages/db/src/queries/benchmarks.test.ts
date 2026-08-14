import { describe, expect, it, vi } from 'vitest';

import { getAllBenchmarksForHistory, getBenchmarksForRun, getLatestBenchmarks } from './benchmarks';

function captureSql() {
  let query = '';
  const sql = vi.fn((strings: TemplateStringsArray) => {
    const text = strings.join('?').replaceAll(/\s+/gu, ' ');
    if (text.includes('SELECT') || text.includes('WITH RECURSIVE')) query = text;
    return Promise.resolve([]);
  });
  return {
    sql: sql as unknown as Parameters<typeof getBenchmarksForRun>[0],
    query: () => query,
  };
}

describe('append-only benchmark snapshots', () => {
  it('walks same-image visual-series runs and preserves producer provenance', async () => {
    const captured = captureSql();

    await getBenchmarksForRun(captured.sql, 'dsv4', 123456);

    const query = captured.query();
    expect(query).toContain('WITH RECURSIVE run_lines AS');
    expect(query).toContain('WHERE current.append_only');
    expect(query).toContain('current.images_complete');
    expect(query).toContain('older.image = current.root_image');
    expect(query).toContain('older.line_spec_method = current.line_spec_method');
    expect(query).toContain('point_c.id = br.config_id');
    expect(query).toContain('br.conc, cr.run_rank');
    expect(query).toContain('br.workflow_run_id, wr.run_started_at::text');
    expect(query).toContain('br.snapshot_date::text AS curve_date');
    expect(query).toContain('snapshot_wr.id = br.snapshot_workflow_run_id');
  });

  it('stamps latest materialized-view rows with a separate logical identity', async () => {
    const captured = captureSql();

    await getLatestBenchmarks(captured.sql, 'dsv4');

    const query = captured.query();
    expect(query).toContain('FROM latest_benchmarks lb');
    expect(query).toContain('lb.date::text, lb.workflow_run_id');
    expect(query).toContain('lb.snapshot_date::text AS curve_date');
    expect(query).toContain('snapshot_wr.id = lb.snapshot_workflow_run_id');
  });

  it('builds every historical run as its own logical snapshot', async () => {
    const captured = captureSql();

    await getAllBenchmarksForHistory(captured.sql, 'dsv4', 8192, 1024);

    const query = captured.query();
    expect(query).toContain('FROM ranked_runs UNION ALL');
    expect(query).toContain('cr.snapshot_workflow_run_id, br.config_id');
    expect(query).toContain('br.snapshot_date::text AS curve_date');
    expect(query).toContain('ORDER BY br.snapshot_date, c.id, br.conc');
  });
});
