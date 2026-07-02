/**
 * Focused regression guards for the two json-provider ⇆ SQL divergences the parity
 * harness (parity.test.ts) surfaced and fixed. These pin the fixed behavior directly
 * against json-provider (no PGlite), so the regressions are caught even in isolation.
 *
 * Both bugs were silent: JSON data mode (DUMP_DIR) diverged from the live-DB SQL path.
 *   1. getServerLog always returned null when server_logs.json stored bigserial ids as
 *      strings (the real dump format) — the lookup Map was keyed by string id but queried
 *      with a Number.
 *   2. getAllBenchmarksForHistory returned an `image` field the SQL history query never
 *      selects — so history rows had an extra property only in JSON mode.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as JsonProviderNs from '../../json-provider.js';

type JsonProvider = typeof JsonProviderNs;

const cfg = {
  id: 1,
  hardware: 'h100',
  framework: 'vllm',
  model: 'm',
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
  num_prefill_gpu: 1,
  num_decode_gpu: 8,
};

let json: JsonProvider;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'infx-drift-'));
  writeFileSync(join(dir, 'configs.json'), JSON.stringify([cfg]));
  // bigserial ids as STRINGS, exactly as postgres.js serializes them in a real dump.
  writeFileSync(
    join(dir, 'workflow_runs.json'),
    JSON.stringify([
      {
        id: '10',
        github_run_id: '100',
        run_attempt: 1,
        name: 'r',
        status: 'completed',
        conclusion: 'success',
        head_sha: 's',
        head_branch: 'main',
        html_url: 'https://github.com/x/runs/100',
        created_at: '2026-06-10T00:00:00.000Z',
        run_started_at: '2026-06-10T00:00:00.000Z',
        date: '2026-06-10T00:00:00.000Z',
      },
    ]),
  );
  writeFileSync(
    join(dir, 'benchmark_results.json'),
    JSON.stringify([
      {
        id: '5000',
        workflow_run_id: '10',
        config_id: 1,
        benchmark_type: 'latency',
        date: '2026-06-10T00:00:00.000Z',
        isl: 1024,
        osl: 1024,
        conc: 1,
        image: 'img:1',
        metrics: { median_tpot: 0.1 },
        workers: null,
        error: null,
        server_log_id: '9001', // string, as in a real dump
      },
    ]),
  );
  // server_logs.id as a STRING — the crux of bug #1.
  writeFileSync(
    join(dir, 'server_logs.json'),
    JSON.stringify([{ id: '9001', server_log: 'the log' }]),
  );

  process.env.DUMP_DIR = dir;
  vi.resetModules();
  json = await import('../../json-provider.js');
});

afterAll(() => {
  delete process.env.DUMP_DIR;
});

describe('json-provider drift regressions', () => {
  it('getServerLog resolves through a string-keyed server_logs dump (bug #1)', () => {
    // Before the fix this returned null because the map was keyed by "9001" but queried by 9001.
    expect(json.getServerLog(5000)).toBe('the log');
  });

  it('getServerLog returns null for an unknown benchmark id', () => {
    expect(json.getServerLog(999999)).toBeNull();
  });

  it('getAllBenchmarksForHistory omits the image field to match the SQL SELECT (bug #2)', () => {
    const rows = json.getAllBenchmarksForHistory('m', 1024, 1024);
    expect(rows).toHaveLength(1);
    expect('image' in rows[0]).toBe(false);
  });
});
