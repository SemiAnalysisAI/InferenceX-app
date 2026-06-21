import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { getLatestBenchmarks as GetLatestBenchmarks } from './json-provider.js';

/**
 * Integration test for the "as of run" time-travel filter in the JSON provider's
 * getLatestBenchmarks (the in-memory mirror of the SQL date-filtered query).
 *
 * Scenario: one config swept three times on the same day by three separate runs
 * (all attempt 1) plus an older config from a prior date whose run predates the
 * run_started_at column (NULL). Selecting an earlier run must show that run's data
 * and hide later same-day runs, while never dropping the NULL-timestamped history.
 */

const cfg = (id: number, spec_method = 'none') => ({
  id,
  hardware: 'h100',
  framework: 'vllm',
  model: 'testm',
  precision: 'fp8',
  spec_method,
  disagg: false,
  is_multinode: false,
  prefill_tp: 1,
  prefill_ep: 1,
  prefill_dp_attention: false,
  prefill_num_workers: 1,
  decode_tp: 1,
  decode_ep: 1,
  decode_dp_attention: false,
  decode_num_workers: 1,
  num_prefill_gpu: 0,
  num_decode_gpu: 8,
});

const run = (id: number, githubId: number, startedAt: string | null, date: string) => ({
  id,
  github_run_id: githubId,
  run_attempt: 1,
  name: `run ${githubId}`,
  status: 'completed',
  conclusion: 'success',
  head_sha: 'sha',
  head_branch: 'main',
  html_url: `https://github.com/x/runs/${githubId}`,
  created_at: startedAt ?? `${date}T00:00:00Z`,
  run_started_at: startedAt,
  date,
});

const result = (id: number, runDbId: number, configId: number, date: string, tpot: number) => ({
  id,
  workflow_run_id: runDbId,
  config_id: configId,
  benchmark_type: 'latency',
  date,
  isl: 1024,
  osl: 1024,
  conc: 1,
  image: null,
  metrics: { median_tpot: tpot },
  error: null,
  server_log_id: null,
});

const D = '2026-06-14';
let getLatestBenchmarks: typeof GetLatestBenchmarks;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'infx-asof-'));
  writeFileSync(join(dir, 'configs.json'), JSON.stringify([cfg(1), cfg(2, 'mtp')]));
  writeFileSync(
    join(dir, 'workflow_runs.json'),
    JSON.stringify([
      run(10, 100, `${D}T04:00:00Z`, D), // run A (earliest same-day)
      run(11, 101, `${D}T05:00:00Z`, D), // run B
      run(12, 102, `${D}T06:00:00Z`, D), // run C (latest same-day)
      run(9, 99, null, '2026-06-10'), // older run, no run_started_at
    ]),
  );
  writeFileSync(
    join(dir, 'benchmark_results.json'),
    JSON.stringify([
      result(1000, 10, 1, D, 0.1), // config 1 from run A
      result(1001, 11, 1, D, 0.2), // config 1 from run B (re-sweep)
      result(1002, 12, 1, D, 0.3), // config 1 from run C (re-sweep)
      result(1003, 9, 2, '2026-06-10', 0.9), // config 2, prior date, NULL run_started_at
    ]),
  );
  process.env.DUMP_DIR = dir;
  const mod = await import('./json-provider.js');
  getLatestBenchmarks = mod.getLatestBenchmarks;
});

afterAll(() => {
  delete process.env.DUMP_DIR;
});

/** median_tpot of the (single) config-1 row, plus its run url, for terse assertions. */
function config1(
  rows: { config_id?: number; metrics: Record<string, number>; run_url: string | null }[],
) {
  // config_id isn't returned; identify config 1 by the run url set we control.
  const row = rows.find((r) => r.run_url?.match(/runs\/(?:100|101|102)\//u));
  return row ? { tpot: row.metrics.median_tpot, runUrl: row.run_url } : null;
}

describe('getLatestBenchmarks — as-of-run time travel', () => {
  it('without a run id, picks the latest same-day sweep (run C)', () => {
    const rows = getLatestBenchmarks('testm', D, false);
    expect(config1(rows)).toEqual({
      tpot: 0.3,
      runUrl: 'https://github.com/x/runs/102/attempts/1',
    });
    // older NULL-timestamp config still present
    expect(rows.some((r) => r.run_url === 'https://github.com/x/runs/99/attempts/1')).toBe(true);
  });

  it('as of run A (earliest) shows run A data, hiding later same-day runs', () => {
    const rows = getLatestBenchmarks('testm', D, false, '100');
    expect(config1(rows)).toEqual({
      tpot: 0.1,
      runUrl: 'https://github.com/x/runs/100/attempts/1',
    });
  });

  it('as of run B shows run B data (A superseded, C not yet)', () => {
    const rows = getLatestBenchmarks('testm', D, false, '101');
    expect(config1(rows)).toEqual({
      tpot: 0.2,
      runUrl: 'https://github.com/x/runs/101/attempts/1',
    });
  });

  it('as of run C (latest) is identical to no filter', () => {
    const rows = getLatestBenchmarks('testm', D, false, '102');
    expect(config1(rows)).toEqual({
      tpot: 0.3,
      runUrl: 'https://github.com/x/runs/102/attempts/1',
    });
  });

  it('preserves NULL-run_started_at history even when an earlier run is selected', () => {
    const rows = getLatestBenchmarks('testm', D, false, '100');
    expect(rows.some((r) => r.run_url === 'https://github.com/x/runs/99/attempts/1')).toBe(true);
  });

  it('treats an unknown run id as no-op (shows latest)', () => {
    const rows = getLatestBenchmarks('testm', D, false, '999999');
    expect(config1(rows)).toEqual({
      tpot: 0.3,
      runUrl: 'https://github.com/x/runs/102/attempts/1',
    });
  });

  it('does not apply the run filter on the exact path', () => {
    const rows = getLatestBenchmarks('testm', D, true, '100');
    expect(config1(rows)).toEqual({
      tpot: 0.3,
      runUrl: 'https://github.com/x/runs/102/attempts/1',
    });
  });
});
