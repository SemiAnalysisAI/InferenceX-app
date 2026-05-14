import { describe, it, expect } from 'vitest';

import type { ParsedEnv } from './env-parser';
import { upsertBenchmarkEnvironment } from './env-ingest';

/**
 * Behavior tests for the upsert helper.
 *
 * These don't hit a real database — the postgres.js client supports a
 * tagged-template call shape, so a small mock that records the assembled
 * SQL fragment lets us assert the conflict-resolution contract:
 *
 *   - env_json    → unconditional overwrite of every column
 *   - log_parse   → COALESCE: only fills NULL columns, never demotes source
 */

interface RecordedCall {
  sql: string;
  values: unknown[];
}

function makeMockSql() {
  const calls: RecordedCall[] = [];
  // The tag function only needs to accept a strings array + interpolated
  // values and return a thenable; the helper ignores the return value.
  const mockSql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join('?'), values });
    return Promise.resolve([]);
  }) as unknown as Parameters<typeof upsertBenchmarkEnvironment>[0];
  return { mockSql, calls };
}

const fullEnvJson: ParsedEnv = {
  source: 'env_json',
  frameworkVersion: '1.3.0rc11',
  frameworkSha: 'e136d70cdc6101007017c05d57fb4cec5d6ed98f',
  torchVersion: '2.5.1+cu124',
  pythonVersion: '3.12.7',
  cudaVersion: '12.4',
  rocmVersion: null,
  driverVersion: '560.35.03',
  gpuSku: 'NVIDIA H100 80GB HBM3',
  extra: { nccl_version: '2.21.5' },
};

const logParseOnly: ParsedEnv = {
  source: 'log_parse',
  frameworkVersion: '1.3.0rc11',
  frameworkSha: null,
  torchVersion: '2.11.0a0+eb65b36914',
  pythonVersion: '3.12',
  cudaVersion: null,
  rocmVersion: null,
  driverVersion: null,
  gpuSku: null,
  extra: {},
};

describe('upsertBenchmarkEnvironment', () => {
  it('issues an unconditional overwrite for env_json', async () => {
    const { mockSql, calls } = makeMockSql();
    await upsertBenchmarkEnvironment(mockSql, 42, 7, 'nvcr.io/foo:1', fullEnvJson);
    expect(calls).toHaveLength(1);
    const { sql } = calls[0];
    // env_json branch overwrites without COALESCE
    expect(sql).not.toMatch(/coalesce/iu);
    expect(sql).toMatch(/source\s*=\s*'env_json'/u);
    expect(sql).toMatch(/on conflict \(workflow_run_id, config_id\) do update set/iu);
  });

  it('uses COALESCE on update for log_parse so it never clobbers env_json', async () => {
    const { mockSql, calls } = makeMockSql();
    await upsertBenchmarkEnvironment(mockSql, 42, 7, null, logParseOnly);
    expect(calls).toHaveLength(1);
    const { sql } = calls[0];
    expect(sql).toMatch(
      /coalesce\(benchmark_environments\.framework_version,\s*excluded\.framework_version\)/iu,
    );
    expect(sql).toMatch(
      /coalesce\(benchmark_environments\.driver_version,\s*excluded\.driver_version\)/iu,
    );
    expect(sql).toMatch(/coalesce\(benchmark_environments\.gpu_sku,\s*excluded\.gpu_sku\)/iu);
    // log_parse must NOT update the `source` column on conflict — that
    // would demote an existing env_json row.
    expect(sql).not.toMatch(/source\s*=\s*'log_parse'/u);
  });

  it('binds all parsed fields as parameterized values', async () => {
    const { mockSql, calls } = makeMockSql();
    await upsertBenchmarkEnvironment(mockSql, 42, 7, 'img:tag', fullEnvJson);
    const vals = calls[0].values;
    // Spot-check a representative subset of parameters
    expect(vals).toContain(42);
    expect(vals).toContain(7);
    expect(vals).toContain('img:tag');
    expect(vals).toContain('1.3.0rc11');
    expect(vals).toContain('NVIDIA H100 80GB HBM3');
    expect(vals).toContain(JSON.stringify({ nccl_version: '2.21.5' }));
  });

  it('serializes empty extra to {} for log_parse', async () => {
    const { mockSql, calls } = makeMockSql();
    await upsertBenchmarkEnvironment(mockSql, 42, 7, null, logParseOnly);
    expect(calls[0].values).toContain('{}');
  });
});
