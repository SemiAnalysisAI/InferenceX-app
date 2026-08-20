import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../connection.js';
import {
  escapePostgresRegexLiteral,
  getServerLogAvailability,
  getServerLogChunk,
  getServerLogFileNames,
  searchServerLogs,
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

describe('searchServerLogs', () => {
  it('escapes regex syntax so searches remain literal', () => {
    expect(escapePostgresRegexLiteral('error[42] + retry?')).toBe(
      String.raw`error\[42\] \+ retry\?`,
    );
  });

  it('maps bounded matches across files and reports truncation', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce([{ file_name: 'results/router.log' }])
      .mockResolvedValueOnce([
        {
          file_name: 'results/router.log',
          match_position: 15,
          before_text: 'INFO router: ',
          match_text: 'Ready',
          after_text: ' for requests',
          char_count: 1024,
          has_more: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          file_name: 'results/router.log',
          match_position: 68,
          before_text: 'worker ',
          match_text: 'ready',
          after_text: '',
          char_count: 1024,
          has_more: true,
        },
      ]);
    const sql = call as unknown as DbClient;

    await expect(searchServerLogs(sql, 42, 'ready', 1)).resolves.toEqual({
      matches: [
        {
          fileName: 'results/router.log',
          offset: 14,
          before: 'INFO router: ',
          match: 'Ready',
          after: ' for requests',
        },
      ],
      truncated: true,
    });
    expect(call.mock.calls[1]?.[0].join('')).toContain('regexp_instr(chunk_text');
    expect(call.mock.calls[1]?.[0].join('')).toContain('substring(sl.server_log');
  });

  it('returns an empty non-truncated result when no file matches', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce([{ file_name: 'results/router.log' }])
      .mockResolvedValueOnce([
        {
          file_name: 'results/router.log',
          match_position: 0,
          before_text: '',
          match_text: '',
          after_text: '',
          char_count: 128,
          has_more: false,
        },
      ]);
    const sql = call as unknown as DbClient;
    await expect(searchServerLogs(sql, 42, 'missing', 50)).resolves.toEqual({
      matches: [],
      truncated: false,
    });
  });

  it('overlaps slices so a match crossing a chunk boundary is not skipped', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce([{ file_name: 'results/router.log' }])
      .mockResolvedValueOnce([
        {
          file_name: 'results/router.log',
          match_position: 0,
          before_text: '',
          match_text: '',
          after_text: '',
          char_count: 100,
          has_more: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          file_name: 'results/router.log',
          match_position: 3,
          before_text: 'x',
          match_text: 'ready',
          after_text: ' now',
          char_count: 20,
          has_more: false,
        },
      ])
      .mockResolvedValueOnce([]);
    const sql = call as unknown as DbClient;

    await expect(searchServerLogs(sql, 42, 'ready', 50)).resolves.toEqual({
      matches: [
        {
          fileName: 'results/router.log',
          offset: 98,
          before: 'x',
          match: 'ready',
          after: ' now',
        },
      ],
      truncated: false,
    });
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
