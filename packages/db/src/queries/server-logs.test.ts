import { describe, expect, it, type Mock, vi } from 'vitest';

import type { DbClient } from '../connection.js';
import {
  getBoundedServerLog,
  getServerLog,
  getServerLogChunk,
  getServerLogFileNames,
  SERVER_LOG_SEARCH_CHUNK_CHARACTERS,
  searchServerLogs,
  ServerLogSearchTimeoutError,
} from './server-logs.js';
import {
  countCodePoints,
  encodeServerLogBlocks,
  SERVER_LOG_BLOCK_CHARS,
  serverLogGramBit,
} from '../server-log-blocks';
import { termBloomGroups } from './server-log-block-search';

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
  return { sql: call as unknown as DbClient, call };
}

const textRow = (fileName: string, logText: string, textChars: number, hasMore: boolean) => ({
  file_name: fileName,
  file_chars: null,
  char_offset: null,
  char_count: null,
  ascii: null,
  data: null,
  log_text: logText,
  text_chars: textChars,
  has_more: hasMore,
});
function noMatchRow(charCount: number, hasMore: boolean) {
  return {
    file_name: 'results/router.log',
    match_position: 0,
    before_text: '',
    match_text: '',
    after_text: '',
    char_count: charCount,
    has_more: hasMore,
  };
}

describe('getServerLogChunk', () => {
  it('returns a bounded chunk and a continuation offset', async () => {
    const { sql, call } = mockSql([textRow('results/server.log', 'abc', 3, true)]);

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
    const { sql } = mockSql([textRow('router.log', 'abc', 3, false)]);
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
    const { sql, call } = mockSql([textRow('workers/decode.out', 'worker', 6, false)]);
    await expect(getServerLogChunk(sql, 42, 0, 64, 'workers/decode.out')).resolves.toMatchObject({
      fileName: 'workers/decode.out',
      serverLog: 'worker',
    });
    expect(call.mock.calls[0]?.slice(1)).toContain('workers/decode.out');
  });

  it('advances offsets in PostgreSQL characters instead of UTF-16 code units', async () => {
    const { sql } = mockSql([textRow('unicode.log', 'a😀b', 3, true)]);
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
    const query = strings.join('');
    if (query.includes('octet_length')) {
      return Promise.resolve([
        {
          file_name: 'frontend.out',
          bytes: Buffer.byteLength(text),
          block_backed: true,
          log_text: null,
        },
      ]);
    }
    if (!query.includes('server_log_block_files')) return Promise.resolve([]);
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

  it('has no continuation when the chunk ends exactly at the last code point', async () => {
    const offset = chars.length - 10;
    await expect(getServerLogChunk(sql, 42, offset, 10, 'frontend.out')).resolves.toMatchObject({
      serverLog: chars.slice(offset).join(''),
      nextOffset: null,
    });
  });

  it('reads the whole file for a download', async () => {
    await expect(getServerLog(sql, 42, 'frontend.out')).resolves.toBe(text);
  });

  it('returns a block-backed file within the byte cap from its blocks', async () => {
    const bytes = Buffer.byteLength(text);
    await expect(getBoundedServerLog(sql, 42, bytes, 'frontend.out')).resolves.toEqual({
      fileName: 'frontend.out',
      bytes,
      serverLog: text,
    });
  });
});

function blockBackedSql(text: string, fetched: number[] = []): DbClient {
  const blocks = encodeServerLogBlocks(text);
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
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
        file_chars: countCodePoints(text),
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
}

describe('searchServerLogs on a block-backed file', () => {
  const chunk = SERVER_LOG_SEARCH_CHUNK_CHARACTERS;
  const prefix = '😀Ready ready😀READY x ';
  const tail = 'ready! é READY';
  const straddle = SERVER_LOG_BLOCK_CHARS - 2 - [...prefix].length;
  const filler = `${'x'.repeat(straddle)}zebra${'x'.repeat(chunk - 10 - straddle)}`;
  const text = prefix + filler + tail;
  const total = [...prefix].length + filler.length + [...tail].length;
  const fetched: number[] = [];
  const sql = blockBackedSql(text, fetched);

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
    return {
      matches: matches.slice(0, limit),
      truncated: matches.length > limit,
      incomplete: false,
    };
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
    expect(fetched).toEqual([3, 4]);
  });

  it('finds a term across a block boundary', async () => {
    const expected = sqlLoop('zebra', 50);
    expect(expected.matches.map((m) => m.offset)).toEqual([SERVER_LOG_BLOCK_CHARS - 2]);
    await expect(searchServerLogs(sql, 42, 'ZEBRA', 50)).resolves.toEqual(expected);
  });
});

describe('searchServerLogs folds case like PostgreSQL lower()', () => {
  const pad = 'x'.repeat(SERVER_LOG_BLOCK_CHARS);
  const sql = blockBackedSql(`${pad}xİabc ΟΔΟΣ end\n${pad}`);
  const search = async (term: string) => {
    const { matches } = await searchServerLogs(sql, 42, term, 50);
    return matches.map((m) => [m.offset, m.match]);
  };
  const at = SERVER_LOG_BLOCK_CHARS;

  it('keeps offsets aligned after U+0130, which PostgreSQL lowers to one character', async () => {
    await expect(search('abc')).resolves.toEqual([[at + 2, 'abc']]);
  });

  it('matches U+0130 for a plain i, even in a block with no other i', async () => {
    await expect(search('i')).resolves.toEqual([[at + 1, 'İ']]);
    await expect(search('İA')).resolves.toEqual([[at + 1, 'İa']]);
  });

  it('lowers a word-final capital sigma to σ, not ς', async () => {
    await expect(search('οδοσ')).resolves.toEqual([[at + 6, 'ΟΔΟΣ']]);
    await expect(search('ς')).resolves.toEqual([]);
  });
});

describe('termBloomGroups', () => {
  it('adds no bits for ASCII case variants, which the bloom stores folded', () => {
    expect(termBloomGroups('K').bits.sort()).toEqual(
      [serverLogGramBit(107, -1, -1), serverLogGramBit(8490, -1, -1)].sort(),
    );
  });

  it('keeps the raw code point of a letter an older runtime did not lower', () => {
    expect(termBloomGroups('\uA7CB').bits).toContain(serverLogGramBit(42955, -1, -1));
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
      incomplete: false,
    });
    expect(call.mock.calls[1]?.[0].join('')).toContain('strpos(lower(chunk_text), lower(');
    expect(call.mock.calls[1]?.[0].join('')).not.toContain('regexp_instr');
    // The search term is a bound parameter, never a regex pattern.
    expect(call.mock.calls[1]?.slice(1)).toContain('ready');
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
      incomplete: false,
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
      incomplete: false,
    });
  });

  it('stops at the scan budget and reports the search as incomplete', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce([{ file_name: 'results/router.log' }, { file_name: 'b.log' }])
      .mockResolvedValue([noMatchRow(100, true)]);
    const sql = withoutBlockStorage(call);

    await expect(
      searchServerLogs(sql, 42, 'x', 50, { maxScannedCharacters: 250 }),
    ).resolves.toEqual({ matches: [], truncated: false, incomplete: true });
    // One filename query plus slices at offsets 0, 100 and 200; the 300 slice is never read.
    expect(call).toHaveBeenCalledTimes(4);
  });

  it('counts earlier files against the scan budget', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce([{ file_name: 'a.log' }, { file_name: 'b.log' }])
      .mockResolvedValueOnce([noMatchRow(300, false)]);
    const sql = withoutBlockStorage(call);

    await expect(
      searchServerLogs(sql, 42, 'x', 50, { maxScannedCharacters: 300 }),
    ).resolves.toEqual({ matches: [], truncated: false, incomplete: true });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('throws a timeout error once the wall-clock budget is spent', async () => {
    let clock = 0;
    const call = vi
      .fn()
      .mockResolvedValueOnce([{ file_name: 'results/router.log' }])
      .mockImplementation(() => {
        clock += 10;
        return Promise.resolve([noMatchRow(100, true)]);
      });
    const sql = withoutBlockStorage(call);

    await expect(
      searchServerLogs(sql, 42, 'x', 50, { deadlineMs: 25, now: () => clock }),
    ).rejects.toBeInstanceOf(ServerLogSearchTimeoutError);
    expect(call).toHaveBeenCalledTimes(4);
  });
});

describe('getBoundedServerLog', () => {
  it('returns the text when the file fits within the byte cap', async () => {
    const { sql, call } = mockSql([
      { file_name: 'results/server.log', bytes: '5', log_text: 'hello' },
    ]);
    await expect(getBoundedServerLog(sql, 42, 16)).resolves.toEqual({
      fileName: 'results/server.log',
      bytes: 5,
      serverLog: 'hello',
    });
    const query = call.mock.calls[0]?.[0].join('');
    expect(query).toContain('octet_length(sl.server_log)');
    expect(query).toContain(
      'case when s.bytes <= ::bigint and m.char_count is null then s.log_text end',
    );
    expect(call.mock.calls[0]?.slice(1)).toContain(16);
  });

  it('reports the size without the text when the file is over the cap', async () => {
    const { sql } = mockSql([{ file_name: 'router.log', bytes: 951652286, log_text: null }]);
    await expect(getBoundedServerLog(sql, 42, 0, 'router.log')).resolves.toEqual({
      fileName: 'router.log',
      bytes: 951652286,
      serverLog: null,
    });
  });

  it('returns null when the benchmark has no linked log', async () => {
    const { sql } = mockSql([]);
    await expect(getBoundedServerLog(sql, 42, 16)).resolves.toBeNull();
  });
});
