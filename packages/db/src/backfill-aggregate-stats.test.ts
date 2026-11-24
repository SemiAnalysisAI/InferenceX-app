import { gzipSync } from 'node:zlib';

import { describe, expect, it, mock } from 'bun:test';

import * as BackfillRunner from './lib/backfill-runner.js';
import * as TraceProfileStorage from './lib/trace-profile-storage';

const state = {
  sql: mock(),
  main: undefined as (() => Promise<void>) | undefined,
  profile: Buffer.alloc(0),
};

mock.module('./etl/db-utils.js', () => ({ createAdminSql: () => state.sql }));
// Bun rejects imports of exports a module mock omits, so keep the real ones alongside the stub.
mock.module('./lib/trace-profile-storage', () => ({
  ...TraceProfileStorage,
  readTraceProfileChunks: () => [state.profile],
}));
mock.module('./lib/backfill-runner.js', () => ({
  ...BackfillRunner,
  parseLimitForceFlags: () => ({ force: false, limit: null, shardCount: 1, shardIndex: 0 }),
  parseRunIdFlag: () => undefined,
  jsonbParam: (_sql: unknown, value: unknown) => value,
  runBackfillMain: (_name: string, _sql: unknown, main: () => Promise<void>) => {
    state.main = main;
  },
  runCandidateIdBackfill: (_loadIds: unknown, processRow: (id: number) => Promise<unknown>) =>
    processRow(1),
}));

describe('aggregate stats backfill', () => {
  it('recomputes captured TokenSpeed KV when upgrading a version 9 row', async () => {
    const legacy = {
      version: 9,
      isl: null,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
      e2elPerOsl: null,
      sequenceLengths: { isl: null, osl: null },
    };
    const serverBlob = gzipSync(
      JSON.stringify({
        metrics: {
          'tokenspeed:kv_cache_usage_perc': {
            series: [
              {
                timeslices: [
                  { start_ns: 0, end_ns: 1e9, avg: 0.25 },
                  { start_ns: 1e9, end_ns: 2e9, avg: 0.75 },
                ],
              },
            ],
          },
        },
      }),
    );
    state.profile = gzipSync(
      JSON.stringify({
        metrics: { input_sequence_length: 100, output_sequence_length: 50 },
      }),
    );
    state.sql
      .mockResolvedValueOnce([{ aggregate_stats: legacy }])
      .mockResolvedValueOnce([{ size: serverBlob.length }])
      .mockResolvedValueOnce([{ data: serverBlob }])
      .mockResolvedValueOnce([]);

    await import('./backfill-aggregate-stats');
    await state.main!();

    const update = state.sql.mock.calls.find(([strings]) =>
      strings.join('').includes('update agentic_trace_replay'),
    );
    expect(update).toBeDefined();
    expect(update![1]).toMatchObject({
      version: 10,
      isl: { mean: 100 },
      osl: { mean: 50 },
      kvCacheUtil: { mean: 0.5, n: 2 },
      prefixCacheHitRate: null,
    });
  });
});
