import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../connection.js';
import {
  getServerLogAvailability,
  getServerLogChunk,
  getServerLogFileNames,
} from './server-logs.js';

function mockSql(rows: unknown[]) {
  const sql = vi.fn(() => Promise.resolve(rows)) as unknown as DbClient;
  return { sql, call: sql as unknown as ReturnType<typeof vi.fn> };
}

describe('getServerLogChunk', () => {
  it('returns a bounded chunk and a continuation offset', async () => {
    const { sql, call } = mockSql([
      { file_name: 'results/server.log', log_text: 'abc', char_count: 3, has_more: true },
    ]);

    await expect(getServerLogChunk(sql, 42, 10, 3)).resolves.toEqual({
      fileName: 'results/server.log',
      serverLog: 'abc',
      offset: 10,
      nextOffset: 13,
    });
    expect(call).toHaveBeenCalledOnce();
    expect(call.mock.calls[0]?.slice(1)).toEqual(expect.arrayContaining([42, 11, 3, 14]));
    expect(call.mock.calls[0]?.[0].join('')).toContain('from ::integer');
    expect(call.mock.calls[0]?.[0].join('')).toContain('for ::integer');
    expect(call.mock.calls[0]?.[0].join('')).not.toContain('sl.server_log as log_text');
  });

  it('marks an exact-size final chunk as complete', async () => {
    const { sql } = mockSql([
      { file_name: 'router.log', log_text: 'abc', char_count: 3, has_more: false },
    ]);
    await expect(getServerLogChunk(sql, 42, 0, 3)).resolves.toEqual({
      fileName: 'router.log',
      serverLog: 'abc',
      offset: 0,
      nextOffset: null,
    });
  });

  it('returns null when the benchmark has no linked log', async () => {
    const { sql } = mockSql([]);
    await expect(getServerLogChunk(sql, 42, 0, 3)).resolves.toBeNull();
  });

  it('selects an additional file by its artifact-relative name', async () => {
    const { sql, call } = mockSql([
      { file_name: 'workers/decode.out', log_text: 'worker', char_count: 6, has_more: false },
    ]);
    await expect(getServerLogChunk(sql, 42, 0, 64, 'workers/decode.out')).resolves.toMatchObject({
      fileName: 'workers/decode.out',
      serverLog: 'worker',
    });
    expect(call.mock.calls[0]?.slice(1)).toContain('workers/decode.out');
  });

  it('advances offsets in PostgreSQL characters instead of UTF-16 code units', async () => {
    const { sql } = mockSql([
      { file_name: 'unicode.log', log_text: 'a😀b', char_count: 3, has_more: true },
    ]);
    await expect(getServerLogChunk(sql, 42, 5, 3, 'unicode.log')).resolves.toMatchObject({
      serverLog: 'a😀b',
      nextOffset: 8,
    });
  });
});

describe('getServerLogFileNames', () => {
  it('returns primary and additional filenames in query order', async () => {
    const { sql } = mockSql([
      { file_name: 'results/server.log' },
      { file_name: 'results/benchmark.log' },
      { file_name: 'results/router.log' },
    ]);
    await expect(getServerLogFileNames(sql, 42)).resolves.toEqual([
      'results/server.log',
      'results/benchmark.log',
      'results/router.log',
    ]);
  });
});

describe('getServerLogAvailability', () => {
  it('returns an id-keyed presence map', async () => {
    const { sql } = mockSql([{ id: 9 }, { id: 4 }]);
    await expect(getServerLogAvailability(sql, [4, 9, 12])).resolves.toEqual({
      4: true,
      9: true,
    });
  });

  it('does not query for an empty id set', async () => {
    const { sql, call } = mockSql([]);
    await expect(getServerLogAvailability(sql, [])).resolves.toEqual({});
    expect(call).not.toHaveBeenCalled();
  });
});
