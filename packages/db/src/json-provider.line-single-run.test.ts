import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { getLatestBenchmarks as GetLatestBenchmarks } from './json-provider.js';

/**
 * A chart line is one config + sequence + offload mode
 * (config_id, benchmark_type, isl, osl, offload_mode) plotted across concurrencies, and it must
 * come from a SINGLE workflow run. getLatestBenchmarks picks the
 * newest run per line (date, then run_started_at, then workflow_run_id) and returns EVERY
 * concurrency that one run measured — never stitching skipped concurrencies from an older run.
 *
 * These fixtures exercise the multi-concurrency cases the as-of test can't (it is single-conc):
 * a partial re-sweep that must truncate the line, per-sequence line independence, and the
 * same-day workflow_run_id tiebreak.
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

let nextResultId = 1000;
const result = (
  runDbId: number,
  configId: number,
  date: string,
  conc: number,
  tpot: number,
  isl = 1024,
  osl = 1024,
  offloadMode = 'off',
) => ({
  id: nextResultId++,
  workflow_run_id: runDbId,
  config_id: configId,
  benchmark_type: 'latency',
  date,
  isl,
  osl,
  conc,
  offload_mode: offloadMode,
  image: null,
  metrics: { median_tpot: tpot },
  error: null,
  server_log_id: null,
});

const OLD = '2026-06-10';
const NEW = '2026-06-14';
let getLatestBenchmarks: typeof GetLatestBenchmarks;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'infx-line-'));
  writeFileSync(join(dir, 'configs.json'), JSON.stringify([cfg(1), cfg(2)]));
  writeFileSync(
    join(dir, 'workflow_runs.json'),
    JSON.stringify([
      run(10, 100, `${OLD}T04:00:00Z`, OLD), // run A: older full sweep
      run(11, 101, `${NEW}T05:00:00Z`, NEW), // run B: newer partial re-sweep
      run(20, 200, `${NEW}T07:00:00Z`, NEW), // run E: same-day, lower run id
      run(21, 201, `${NEW}T07:00:00Z`, NEW), // run F: same-day, SAME timestamp, higher run id
    ]),
  );
  writeFileSync(
    join(dir, 'benchmark_results.json'),
    JSON.stringify([
      // config 1, seq (1024,1024): run A full sweep, run B partial re-sweep.
      result(10, 1, OLD, 1, 0.1),
      result(10, 1, OLD, 8, 0.18),
      result(10, 1, OLD, 64, 0.5),
      result(11, 1, NEW, 1, 0.09),
      result(11, 1, NEW, 8, 0.16),
      // config 1, seq (8192,1024): only run A measured it (run B skipped this sequence).
      result(10, 1, OLD, 1, 0.2, 8192, 1024),
      result(10, 1, OLD, 8, 0.3, 8192, 1024),
      // Offload mode is an independent line dimension. A newer off-mode run must not hide
      // the older on-mode line for the same config and sequence.
      result(10, 1, OLD, 4, 0.25, 4096, 4096, 'on'),
      result(11, 1, NEW, 4, 0.2, 4096, 4096, 'off'),
      // config 2, seq (1024,1024): two same-day runs with identical run_started_at.
      result(20, 2, NEW, 1, 0.5),
      result(20, 2, NEW, 8, 0.6),
      result(20, 2, NEW, 64, 0.7),
      result(21, 2, NEW, 1, 0.4),
      result(21, 2, NEW, 8, 0.45),
    ]),
  );
  process.env.DUMP_DIR = dir;
  const mod = await import('./json-provider.js');
  getLatestBenchmarks = mod.getLatestBenchmarks;
});

afterAll(() => {
  delete process.env.DUMP_DIR;
});

/** Concurrencies + their run urls for one (config sequence) line, sorted by conc. */
function line(
  rows: { isl: number | null; osl: number | null; conc: number; run_url: string | null }[],
  configRunUrlRe: RegExp,
  isl: number,
  osl: number,
) {
  return rows
    .filter((r) => r.isl === isl && r.osl === osl && r.run_url?.match(configRunUrlRe))
    .toSorted((a, b) => a.conc - b.conc)
    .map((r) => ({ conc: r.conc, runUrl: r.run_url }));
}

describe('getLatestBenchmarks — one run per line', () => {
  it('truncates a line to the newest run: a partial re-sweep hides the older run’s extra concs', () => {
    const rows = getLatestBenchmarks('testm', NEW, false);
    // config 1 / seq (1024,1024): run B (101) measured only conc 1 & 8. conc 64 from run A is gone.
    const seq = line(rows, /runs\/(?:100|101)\//u, 1024, 1024);
    expect(seq).toEqual([
      { conc: 1, runUrl: 'https://github.com/x/runs/101/attempts/1' },
      { conc: 8, runUrl: 'https://github.com/x/runs/101/attempts/1' },
    ]);
    expect(seq.some((p) => p.conc === 64)).toBe(false);
  });

  it('keeps a different sequence of the same config on its own winning run', () => {
    const rows = getLatestBenchmarks('testm', NEW, false);
    // seq (8192,1024) was only in run A; run B winning the other sequence must not erase it.
    const seq = line(rows, /runs\/100\//u, 8192, 1024);
    expect(seq).toEqual([
      { conc: 1, runUrl: 'https://github.com/x/runs/100/attempts/1' },
      { conc: 8, runUrl: 'https://github.com/x/runs/100/attempts/1' },
    ]);
  });

  it('selects winning runs independently for each offload mode', () => {
    const rows = getLatestBenchmarks('testm', NEW, false).filter(
      (r) => r.isl === 4096 && r.osl === 4096,
    );

    expect(
      rows
        .map((r) => ({ offloadMode: r.offload_mode, runUrl: r.run_url }))
        .toSorted((a, b) => a.offloadMode.localeCompare(b.offloadMode)),
    ).toEqual([
      { offloadMode: 'off', runUrl: 'https://github.com/x/runs/101/attempts/1' },
      { offloadMode: 'on', runUrl: 'https://github.com/x/runs/100/attempts/1' },
    ]);
  });

  it('breaks a same-day, same-timestamp tie by workflow_run_id (higher id wins the whole line)', () => {
    const rows = getLatestBenchmarks('testm', NEW, false);
    // config 2: run E (200, id 20) and run F (201, id 21) share run_started_at; F wins by id.
    const seq = line(rows, /runs\/(?:200|201)\//u, 1024, 1024);
    expect(seq).toEqual([
      { conc: 1, runUrl: 'https://github.com/x/runs/201/attempts/1' },
      { conc: 8, runUrl: 'https://github.com/x/runs/201/attempts/1' },
    ]);
    // run E's extra conc 64 must not bleed into run F's line.
    expect(seq.some((p) => p.conc === 64)).toBe(false);
  });

  it('as of the older run, shows that run’s full sweep (no truncation by a later run)', () => {
    const rows = getLatestBenchmarks('testm', NEW, false, '100');
    const seq = line(rows, /runs\/100\//u, 1024, 1024);
    expect(seq).toEqual([
      { conc: 1, runUrl: 'https://github.com/x/runs/100/attempts/1' },
      { conc: 8, runUrl: 'https://github.com/x/runs/100/attempts/1' },
      { conc: 64, runUrl: 'https://github.com/x/runs/100/attempts/1' },
    ]);
  });
});
