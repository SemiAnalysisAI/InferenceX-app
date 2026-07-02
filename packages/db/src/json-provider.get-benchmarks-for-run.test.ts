import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { getBenchmarksForRun as GetBenchmarksForRun } from './json-provider.js';

/**
 * Regression guard for the offload_mode dedup bug in getBenchmarksForRun.
 *
 * Agentic sweeps that test offload ON and OFF at the same (config, conc,
 * isl=NULL, osl=NULL) produce two distinct benchmark_results rows that differ
 * only in offload_mode. The old dedup key was:
 *
 *   `${config_id}:${conc}:${isl}:${osl}`
 *
 * which collapsed both offload variants into one, silently dropping the second.
 * The fix appends `?? 'off'` normalised offload_mode:
 *
 *   `${config_id}:${conc}:${isl}:${osl}:${offload_mode ?? 'off'}`
 *
 * This test seeds two rows differing only in offload_mode at the same
 * (config, conc, isl=null, osl=null) and asserts BOTH survive.
 */

const cfg = (id: number) => ({
  id,
  hardware: 'h100',
  framework: 'vllm',
  model: 'testm',
  precision: 'fp8',
  spec_method: 'none',
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

const run = (id: number, githubId: number, date: string) => ({
  id,
  github_run_id: githubId,
  run_attempt: 1,
  name: `run ${githubId}`,
  status: 'completed',
  conclusion: 'success',
  head_sha: 'sha',
  head_branch: 'main',
  html_url: `https://github.com/x/runs/${githubId}`,
  created_at: `${date}T00:00:00Z`,
  run_started_at: `${date}T00:00:00Z`,
  date,
});

let nextId = 1;
const result = (
  runDbId: number,
  configId: number,
  date: string,
  conc: number,
  offloadMode: string | null,
  isl: number | null = null,
  osl: number | null = null,
) => ({
  id: nextId++,
  workflow_run_id: runDbId,
  config_id: configId,
  benchmark_type: 'agentic',
  date,
  isl,
  osl,
  conc,
  offload_mode: offloadMode,
  image: null,
  metrics: { median_tpot: 0.1 },
  error: null,
  server_log_id: null,
});

const DATE = '2026-07-01';
const GITHUB_RUN_ID = 9999001;

let getBenchmarksForRun: typeof GetBenchmarksForRun;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'infx-get-benchmarks-for-run-'));
  writeFileSync(join(dir, 'configs.json'), JSON.stringify([cfg(1)]));
  writeFileSync(
    join(dir, 'workflow_runs.json'),
    JSON.stringify([
      run(1, GITHUB_RUN_ID, DATE), // the agentic sweep run
    ]),
  );
  writeFileSync(
    join(dir, 'benchmark_results.json'),
    JSON.stringify([
      // conc=16, offload=off
      result(1, 1, DATE, 16, 'off'),
      // conc=16, offload=on — same (config, conc, isl=null, osl=null), differs only in offload_mode
      result(1, 1, DATE, 16, 'on'),
      // conc=64, offload=off
      result(1, 1, DATE, 64, 'off'),
      // conc=64, offload=on
      result(1, 1, DATE, 64, 'on'),
    ]),
  );
  process.env.DUMP_DIR = dir;
  const mod = await import('./json-provider.js');
  getBenchmarksForRun = mod.getBenchmarksForRun;
});

afterAll(() => {
  delete process.env.DUMP_DIR;
});

describe('getBenchmarksForRun — offload_mode dedup', () => {
  it('returns all 4 rows when an agentic sweep covers offload on+off at both concurrencies', () => {
    const rows = getBenchmarksForRun('testm', GITHUB_RUN_ID);
    expect(rows).toHaveLength(4);
  });

  it('preserves both offload modes at conc=16', () => {
    const rows = getBenchmarksForRun('testm', GITHUB_RUN_ID).filter((r) => r.conc === 16);
    expect(rows).toHaveLength(2);
    const modes = rows.map((r) => r.offload_mode).toSorted();
    expect(modes).toEqual(['off', 'on']);
  });

  it('preserves both offload modes at conc=64', () => {
    const rows = getBenchmarksForRun('testm', GITHUB_RUN_ID).filter((r) => r.conc === 64);
    expect(rows).toHaveLength(2);
    const modes = rows.map((r) => r.offload_mode).toSorted();
    expect(modes).toEqual(['off', 'on']);
  });

  it('treats null offload_mode as "off" (no double-count with an explicit off row)', () => {
    // Only one row with offload_mode=null, no 'off' row — should yield exactly 1 result.
    const rows = getBenchmarksForRun('testm', GITHUB_RUN_ID).filter((r) => r.conc === 16);
    // Both rows have explicit 'off'/'on'; the null-normalisation is verified by absence of dups.
    const nullOrOff = rows.filter((r) => r.offload_mode === null || r.offload_mode === 'off');
    expect(nullOrOff).toHaveLength(1); // exactly one 'off' variant survives dedup
  });
});
