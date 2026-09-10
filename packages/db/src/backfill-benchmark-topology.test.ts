import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  conflict: false,
  calls: [] as { text: string; values: unknown[] }[],
  committed: false,
  rolledBack: false,
  readerEnded: false,
  writerEnded: false,
  connections: [] as boolean[],
  refresh: vi.fn(),
}));

vi.mock('./etl/db-utils.js', () => ({
  refreshLatestBenchmarks: state.refresh,
  createAdminSql: ({ readonly = false }: { readonly?: boolean }) => {
    state.connections.push(readonly);
    const sql = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join('?');
        state.calls.push({ text, values });
        if (readonly) return state.rows;
        if (text.includes('insert into configs')) return [{ id: 8 }];
        if (state.conflict) return [];
        return [{ id: '42' }];
      },
      {
        json: (value: unknown) => value,
        begin: async (callback: (tx: unknown) => Promise<void>) => {
          try {
            await callback(sql);
            state.committed = true;
          } catch (error) {
            state.rolledBack = true;
            throw error;
          }
        },
        end: () => {
          if (readonly) state.readerEnded = true;
          else state.writerEnded = true;
        },
      },
    );
    return sql;
  },
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
beforeEach(() => {
  vi.resetModules();
  state.calls = [];
  state.connections = [];
  state.conflict = false;
  state.committed = false;
  state.rolledBack = false;
  state.readerEnded = false;
  state.writerEnded = false;
  state.refresh.mockClear();
  state.rows = [
    {
      id: '42',
      config_id: 7,
      benchmark_type: 'agentic_traces',
      metrics: { total_tput_tps: 800, tput_per_gpu: 100 },
      config: {
        hardware: 'h200',
        framework: 'vllm',
        model: 'qwen3.5',
        precision: 'fp8',
        specMethod: 'none',
        disagg: false,
        isMultinode: false,
        prefillTp: 8,
        prefillEp: 8,
        prefillDpAttn: false,
        prefillNumWorkers: 0,
        decodeTp: 8,
        decodeEp: 8,
        decodeDpAttn: false,
        decodeNumWorkers: 0,
        numPrefillGpu: 64,
        numDecodeGpu: 64,
      },
    },
  ];
  process.argv = ['bun', 'backfill-benchmark-topology.ts'];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

async function run() {
  await import('./backfill-benchmark-topology');
  await vi.waitFor(() => expect(state.readerEnded).toBe(true));
}

describe('topology repair command', () => {
  it('defaults to a read-only plan even with --yes', async () => {
    process.argv.push('--yes');
    await run();
    expect(state.connections).toEqual([true]);
    expect(state.committed).toBe(false);
    expect(state.refresh).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Dry run: no writes.'));
  });

  it('applies only config references with an optimistic guard, then refreshes', async () => {
    process.argv.push('--apply', '--yes');
    await run();
    expect(state.connections).toEqual([true, false]);
    const update = state.calls.find((call) => call.text.includes('update benchmark_results'))!;
    expect(update.text).toMatch(/set config_id = \?/);
    expect(update.text).toMatch(/where id = \? and config_id = \?\s+and metrics = \?/);
    expect(update.values).toEqual([8, '42', 7, { total_tput_tps: 800, tput_per_gpu: 100 }]);
    expect(state.committed).toBe(true);
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(state.writerEnded).toBe(true);
  });

  it('rolls back the plan if a benchmark changed and never refreshes uncommitted data', async () => {
    process.argv.push('--apply', '--yes');
    state.conflict = true;
    await run();
    expect(state.rolledBack).toBe(true);
    expect(state.committed).toBe(false);
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.writerEnded).toBe(true);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('changed since planning'));
  });
});
