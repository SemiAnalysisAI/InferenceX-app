import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseLimitForceFlags, runPerIdBackfill } from './backfill-runner.js';

describe('parseLimitForceFlags', () => {
  const originalArgv = process.argv;
  afterEach(() => {
    process.argv = originalArgv;
  });

  it('defaults to no limit and force off', () => {
    process.argv = ['node', 'script.ts'];
    expect(parseLimitForceFlags()).toEqual({ limit: null, force: false });
  });

  it('parses --limit N and --force', () => {
    process.argv = ['node', 'script.ts', '--limit', '25', '--force', '--yes'];
    expect(parseLimitForceFlags()).toEqual({ limit: 25, force: true });
  });
});

describe('runPerIdBackfill', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('processes ids serially and leaves exitCode unset on success', async () => {
    const seen: number[] = [];
    await runPerIdBackfill([1, 2, 3], (id) => {
      seen.push(id);
      return Promise.resolve(id === 2 ? 'skipped' : 'ok');
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(process.exitCode).toBeUndefined();
    // Two ✓ lines (skipped rows do not log) plus the summary line.
    const logged = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logged.filter((l) => l.includes('✓')).length).toBe(2);
    expect(logged.at(-1)).toContain('=== backfill complete: 2 ok, 0 failed');
  });

  it('counts throws as failures and sets exitCode = 1', async () => {
    await runPerIdBackfill([1, 2], (id) =>
      id === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok'),
    );
    expect(process.exitCode).toBe(1);
    const logged = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(logged.at(-1)).toContain('=== backfill complete: 1 ok, 1 failed');
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toContain('✗ id=1: boom');
  });
});
