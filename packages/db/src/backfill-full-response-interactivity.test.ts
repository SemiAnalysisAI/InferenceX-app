import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as { id: number; profile_export_jsonl_gz: Buffer; has_full_response: boolean }[],
  calls: [] as { text: string; values: unknown[] }[],
  updated: [] as number[],
  noOpIds: [] as number[],
  ended: false,
  refresh: vi.fn(),
}));

vi.mock('./etl/db-utils.js', () => ({
  refreshLatestBenchmarks: state.refresh,
  createAdminSql: () =>
    Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join('?');
        state.calls.push({ text, values });
        if (text.includes('select br.id')) {
          return state.rows.filter((row) => !state.updated.includes(row.id));
        }
        if (text.includes('select atr.profile_export_jsonl_gz')) {
          return state.rows.filter((row) => row.id === values[0]);
        }
        if (text.includes('update benchmark_results')) {
          const id = values[3] as number;
          if (state.noOpIds.includes(id)) return [];
          state.updated.push(id);
          return [{ id }];
        }
        throw new Error(`Unexpected SQL: ${text}`);
      },
      {
        json: (value: unknown) => value,
        end: () => {
          state.ended = true;
        },
      },
    ),
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const startNs = 1786577819e9;

function profile(withDates: boolean): Buffer {
  return gzipSync(
    JSON.stringify({
      metadata: {
        benchmark_phase: 'profiling',
        ...(withDates ? { request_start_ns: startNs, request_end_ns: startNs + 10e9 } : {}),
      },
      metrics: { full_response_inter_token_latency: { value: 10, unit: 'ms' } },
    }),
  );
}

beforeEach(() => {
  vi.resetModules();
  state.rows = [1, 2, 3].map((id) => ({
    id,
    profile_export_jsonl_gz: profile(id !== 1),
    has_full_response: true,
  }));
  state.calls = [];
  state.updated = [];
  state.noOpIds = [];
  state.ended = false;
  state.refresh.mockClear();
  process.argv = ['bun', 'backfill-full-response-interactivity.ts', '--yes', '--limit', '1'];
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

async function run() {
  await import('./backfill-full-response-interactivity');
  await vi.waitFor(() => expect(state.ended).toBe(true));
}

describe('full-response backfill batches', () => {
  it('scans past dateless profiles on successive limited runs without writing placeholder dates', async () => {
    await run();
    expect(state.updated).toEqual([2]);
    expect(console.warn).toHaveBeenCalledWith(
      '  id=1: profile has no measurement timestamps, skipping',
    );
    const update = state.calls.find((call) => call.text.includes('update benchmark_results'))!;
    expect(update.values[1]).toEqual({
      measurement_start_unix_seconds: 1786577819,
      measurement_end_unix_seconds: 1786577829,
    });
    expect(
      state.calls.filter((call) => call.text.includes('select atr.')).map((call) => call.values[0]),
    ).toEqual([1, 2]);

    vi.resetModules();
    state.ended = false;
    await run();
    expect(state.updated).toEqual([2, 3]);
    expect(process.exitCode).toBeUndefined();
  });

  it('does not let a concurrent no-op update consume the successful-row limit', async () => {
    state.rows[0]!.profile_export_jsonl_gz = profile(true);
    state.noOpIds = [1];
    await run();
    expect(state.updated).toEqual([2]);
    const update = state.calls.find((call) => call.text.includes('update benchmark_results'))!;
    expect(update.text).toContain('metrics is distinct from');
    expect(update.text).toContain('returning id');
  });

  it.each([false, true])(
    'still backfills dateless ITL when recomputation is needed (force=%s)',
    async (force) => {
      state.rows[0]!.has_full_response = force;
      if (force) process.argv.push('--force');
      await run();
      expect(state.updated).toEqual([1]);
      const update = state.calls.find((call) => call.text.includes('update benchmark_results'))!;
      expect(update.values[2]).toMatchObject({
        median_full_response_itl: 0.01,
        median_intvty: 100,
      });
      expect(update.values[2]).not.toHaveProperty('measurement_start_unix_seconds');
    },
  );

  it('scans past unreadable profiles without erasing stored metrics', async () => {
    state.rows[0]!.profile_export_jsonl_gz = Buffer.from('invalid gzip');
    await run();
    expect(state.updated).toEqual([2]);
    expect(console.warn).toHaveBeenCalledWith(
      '  id=1: profile has no usable request samples, skipping',
    );
  });

  it.each(['0', '-1', '1.5', 'Infinity'])(
    'rejects --limit %s before reading or updating rows',
    async (limit) => {
      process.argv[process.argv.indexOf('--limit') + 1] = limit;
      await run();
      expect(state.calls).toHaveLength(0);
      expect(state.refresh).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    },
  );
});
