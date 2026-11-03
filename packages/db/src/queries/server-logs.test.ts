import { describe, expect, it, type Mock, vi } from 'vitest';

import type { DbClient } from '../connection.js';
import {
  escapePostgresRegexLiteral,
  getServerLogChunk,
  getServerLogFileNames,
  searchServerLogs,
} from './server-logs.js';
import {
  countCodePoints,
  encodeServerLogBlocks,
  SERVER_LOG_BLOCK_CHARS,
} from '../server-log-blocks';

function withoutBlockStorage(call: Mock): DbClient {
  return ((strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.join('').includes('server_log_block_files')
      ? Promise.resolve([])
      : call(strings, ...values)) as unknown as DbClient;
}

function mockSql(rows: unknown[]) {
  const call = vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) =>
    Promise.resolve(rows),
  );
  return { sql: withoutBlockStorage(call), call };
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

describe('block-backed files', () => {
  const line = 'INFO step 😀 tok/s 🚀\n';
  const text = line.repeat(Math.ceil((2.5 * SERVER_LOG_BLOCK_CHARS) / [...line].length));
  const chars = [...text];
  const blocks = encodeServerLogBlocks(text);
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    if (!strings.join('').includes('server_log_block_files')) return Promise.resolve([]);
    const [offset, length] = values.slice(-3) as number[];
    const end = Math.min(offset + length, chars.length);
    return Promise.resolve(
      blocks
        .filter((b) => b.charOffset < end && b.charOffset + b.charCount > offset)
        .map((b) => ({
          log_id: '7',
          file_name: 'frontend.out',
          file_chars: chars.length,
          char_offset: b.charOffset,
          char_count: b.charCount,
          ascii: b.ascii,
          data: b.data,
        })),
    );
  }) as unknown as DbClient;

  it('reads a chunk across a block boundary in code points', async () => {
    const offset = SERVER_LOG_BLOCK_CHARS - 5;
    await expect(getServerLogChunk(sql, 42, offset, 40, 'frontend.out')).resolves.toEqual({
      fileName: 'frontend.out',
      serverLog: chars.slice(offset, offset + 40).join(''),
      offset,
      nextOffset: offset + 40,
    });
  });

  it('ends at the last code point with no continuation', async () => {
    const offset = chars.length - 10;
    await expect(getServerLogChunk(sql, 42, offset, 64, 'frontend.out')).resolves.toEqual({
      fileName: 'frontend.out',
      serverLog: chars.slice(offset).join(''),
      offset,
      nextOffset: null,
    });
  });
});

describe('searchServerLogs on a block-backed file', () => {
  const chunk = 16 * 1024 * 1024;
  const prefix = '😀Ready ready😀READY x ';
  const tail = 'ready! é READY';
  const straddle = SERVER_LOG_BLOCK_CHARS - 2 - [...prefix].length;
  const filler = `${'x'.repeat(straddle)}zebra${'x'.repeat(chunk - 10 - straddle)}`;
  const text = prefix + filler + tail;
  const blocks = encodeServerLogBlocks(text);
  const total = [...prefix].length + filler.length + [...tail].length;
  const fetched: number[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join('');
    if (query.includes('block_index = any')) {
      const wanted = values[2] as number[];
      fetched.push(...wanted);
      return Promise.resolve(
        blocks
          .filter((b) => wanted.includes(b.blockIndex))
          .map((b) => ({ block_index: b.blockIndex, data: b.data })),
      );
    }
    if (!query.includes('server_log_block_files'))
      return Promise.resolve([{ file_name: 'frontend.out' }]);
    const groups = values[3] as number[];
    const bits = values[5] as number[];
    return Promise.resolve(
      blocks.map((b) => ({
        file_name: 'frontend.out',
        log_id: '7',
        file_chars: total,
        block_index: b.blockIndex,
        char_offset: b.charOffset,
        char_count: b.charCount,
        ascii: b.ascii,
        candidate: groups.every((group) =>
          bits.some(
            (bit, i) => groups[i] === group && ((b.bloom[bit >>> 3] >> (bit & 7)) & 1) === 1,
          ),
        ),
      })),
    );
  }) as unknown as DbClient;

  function sqlLoop(term: string, limit: number) {
    const chars = [...prefix];
    const unit = (point: number) =>
      point <= chars.length
        ? chars.slice(0, point).join('').length
        : prefix.length + point - chars.length;
    const slice = (from: number, to: number) => text.slice(unit(from), unit(to));
    const len = [...term].length;
    const overlap = Math.min(len - 1, 255);
    const matches = [];
    let offset = 0;
    while (matches.length <= limit) {
      const end = Math.min(offset + chunk, total);
      const index = slice(offset, end).toLowerCase().indexOf(term.toLowerCase());
      if (index !== -1) {
        const at = offset + countCodePoints(slice(offset, end).slice(0, index));
        matches.push({
          fileName: 'frontend.out',
          offset: at,
          before: slice(Math.max(offset, at - 120), at),
          match: slice(at, at + len),
          after: slice(at + len, Math.min(at + len + 120, end)),
        });
        offset = at + len;
        continue;
      }
      if (offset + chunk >= total) break;
      offset += end - offset - overlap;
    }
    return { matches: matches.slice(0, limit), truncated: matches.length > limit };
  }

  it('matches the SQL loop, clipping context to each chunk', async () => {
    const expected = sqlLoop('ready', 50);
    expect(expected.matches.length).toBe(5);
    expect(expected.matches[3].before.length).toBeLessThan(120);
    await expect(searchServerLogs(sql, 42, 'ready', 50)).resolves.toEqual(expected);
  });

  it('stops at the limit and reports truncation', async () => {
    await expect(searchServerLogs(sql, 42, 'ready', 2)).resolves.toEqual(sqlLoop('ready', 2));
  });

  it('reads only the blocks whose bloom holds the term', async () => {
    fetched.length = 0;
    const expected = sqlLoop('é ready', 50);
    expect(expected.matches).toHaveLength(1);
    await expect(searchServerLogs(sql, 42, 'é ready', 50)).resolves.toEqual(expected);
    expect(fetched).toEqual([15, 16]);
  });

  it('finds a term across a block boundary', async () => {
    const expected = sqlLoop('zebra', 50);
    expect(expected.matches.map((m) => m.offset)).toEqual([SERVER_LOG_BLOCK_CHARS - 2]);
    await expect(searchServerLogs(sql, 42, 'ZEBRA', 50)).resolves.toEqual(expected);
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
    const sql = withoutBlockStorage(call);

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
    const sql = withoutBlockStorage(call);
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
    const sql = withoutBlockStorage(call);

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
