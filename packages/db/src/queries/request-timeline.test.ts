import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import { gunzipRequestTimeline, gzipRequestTimeline } from '../etl/request-timeline-codec';
import type { DbClient } from '../connection.js';

import * as agenticShared from './agentic-shared';
import {
  REQUEST_TIMELINE_GZ_SLICE_BYTES,
  getRequestTimeline,
  readRequestTimelineGz,
} from './request-timeline';

// Observe the self-heal hand-off while still running the real write-back.
vi.mock('./agentic-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof agenticShared>();
  return { ...actual, writeBackRequestTimeline: vi.fn(actual.writeBackRequestTimeline) };
});

afterEach(() => {
  vi.mocked(agenticShared.writeBackRequestTimeline).mockClear();
  vi.restoreAllMocks();
});

interface SqlCall {
  text: string;
  values: unknown[];
}

function mockSql(queue: unknown[][]): { sql: DbClient; log: SqlCall[] } {
  const responses = [...queue];
  const log: SqlCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    log.push({ text: strings.join('?'), values });
    return Promise.resolve(responses.shift() ?? []);
  }) as unknown as DbClient;
  return { sql, log };
}

/**
 * Serve `substring(request_timeline_gz from $1 for $2)` from `stored` with
 * PostgreSQL's 1-based semantics, recording every requested range. Any other
 * query returns `meta`.
 */
function sliceServingSql(
  stored: Buffer,
  meta?: Record<string, unknown>,
): { sql: DbClient; ranges: [number, number][]; texts: string[] } {
  const ranges: [number, number][] = [];
  const texts: string[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    texts.push(text);
    if (text.includes('substring(request_timeline_gz')) {
      const [from, length] = values as [number, number];
      ranges.push([from, length]);
      return Promise.resolve([{ slice: stored.subarray(from - 1, from - 1 + length) }]);
    }
    return Promise.resolve(meta ? [meta] : []);
  }) as unknown as DbClient;
  return { sql, ranges, texts };
}

const timeline: RequestTimeline = {
  version: REQUEST_TIMELINE_VERSION,
  startNs: 100,
  endNs: 200,
  durationS: 0.0000001,
  requests: [],
};

const gzipTimeline: RequestTimeline = {
  version: REQUEST_TIMELINE_VERSION,
  startNs: 1_700_000_000_000_000_000,
  endNs: 1_700_000_001_400_000_000,
  durationS: 1.4,
  requests: Array.from({ length: 40 }, (_, index) => ({
    cid: `trace-${String(index % 7).padStart(3, '0')}`,
    ri: index % 7,
    ti: Math.floor(index / 7),
    srcTrace: `weka-${index % 7}`,
    wid: String(index % 4),
    ad: index % 3 === 0 ? 1 : 0,
    phase: index < 4 ? 'warmup' : 'profiling',
    credit: index * 1_000_000,
    start: index * 1_000_000 + 200_000,
    ack: index % 5 === 0 ? null : index * 1_000_000 + 800_000,
    end: index * 1_000_000 + 30_000_000,
    ttftMs: index % 5 === 0 ? null : 42.3 + index,
    tpotMs: 18.1,
    isl: 18_000 + index * 37,
    osl: index % 6 === 0 ? null : 400 + index,
    cancelled: index === 39,
  })),
};

const gzipMeta = (gzBytes: number) => ({
  trace_replay_id: 870,
  has_blob: true,
  gz_bytes: gzBytes,
  timeline_version: REQUEST_TIMELINE_VERSION,
});

/** The stored bytes with one byte in the middle of the deflate stream flipped. */
function corruptedCopy(stored: Buffer): Buffer {
  const corrupted = Buffer.from(stored);
  const middle = Math.floor(corrupted.length / 2);
  corrupted.writeUInt8(corrupted.readUInt8(middle) ^ 255, middle);
  return corrupted;
}

describe('readRequestTimelineGz', () => {
  it('reassembles a value split across slice boundaries with 1-based offsets', async () => {
    const stored = await gzipRequestTimeline(gzipTimeline);
    const { sql, ranges } = sliceServingSql(stored);

    const gz = await readRequestTimelineGz(sql, 870, stored.length, 64);

    expect(gz.equals(stored)).toBe(true);
    expect(ranges).toEqual(
      Array.from({ length: Math.ceil(stored.length / 64) }, (_, index) => [index * 64 + 1, 64]),
    );
    expect(gunzipRequestTimeline(gz)).toEqual(gzipTimeline);
  });

  it('never requests more than 16 MiB per query for a multi-slice value', async () => {
    const stored = Buffer.alloc(2 * REQUEST_TIMELINE_GZ_SLICE_BYTES + 123);
    for (let index = 0; index < stored.length; index += 4096) stored[index] = index % 251;
    const { sql, ranges } = sliceServingSql(stored);

    const gz = await readRequestTimelineGz(sql, 870, stored.length);

    expect(ranges).toEqual([
      [1, REQUEST_TIMELINE_GZ_SLICE_BYTES],
      [REQUEST_TIMELINE_GZ_SLICE_BYTES + 1, REQUEST_TIMELINE_GZ_SLICE_BYTES],
      [2 * REQUEST_TIMELINE_GZ_SLICE_BYTES + 1, REQUEST_TIMELINE_GZ_SLICE_BYTES],
    ]);
    expect(gz.equals(stored)).toBe(true);
  });

  it('rejects when the stored value shrinks between slices', async () => {
    const { sql } = sliceServingSql(Buffer.alloc(60, 7));

    await expect(readRequestTimelineGz(sql, 870, 100, 40)).rejects.toThrow(
      'ended after 60 of 100 bytes',
    );
  });

  it('rejects when the stored value grows between slices', async () => {
    const { sql } = sliceServingSql(Buffer.alloc(100, 7));

    await expect(readRequestTimelineGz(sql, 870, 90, 40)).rejects.toThrow('grew past 90 bytes');
  });
});

describe('getRequestTimeline', () => {
  it('prefers the gzip timeline and never reads the legacy JSONB or the raw profile blob', async () => {
    const stored = await gzipRequestTimeline(gzipTimeline);
    const { sql, texts } = sliceServingSql(stored, gzipMeta(stored.length));

    await expect(getRequestTimeline(sql, 422991)).resolves.toEqual(gzipTimeline);
    expect(texts.slice(1).every((text) => text.includes('substring(request_timeline_gz'))).toBe(
      true,
    );
  });

  it('fails decode on a same-length corrupted slice and logs the trace id', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stored = await gzipRequestTimeline(gzipTimeline);
    const corrupted = corruptedCopy(stored);
    const { sql } = sliceServingSql(corrupted, gzipMeta(corrupted.length));

    // Every byte arrives, so the length checks pass and only decoding can tell.
    await expect(readRequestTimelineGz(sql, 870, corrupted.length, 64)).resolves.toHaveLength(
      stored.length,
    );
    await expect(getRequestTimeline(sql, 422991)).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toContain('trace_replay_id=870');
  });

  it('logs and returns null for a gzip timeline without a requests array', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stored = gzipSync('{"version":6,"startNs":1}');
    const { sql } = sliceServingSql(stored, gzipMeta(stored.length));

    await expect(getRequestTimeline(sql, 422991)).resolves.toBeNull();
    expect(error.mock.calls[0]![0]).toContain(
      'trace_replay_id=870: request timeline has no requests array',
    );
  });

  it('reads a current legacy JSONB timeline through bounded text chunks without the profile blob', async () => {
    const encoded = JSON.stringify(timeline);
    const { sql, log } = mockSql([
      [{ ...gzipMeta(0), gz_bytes: null }],
      [{ chunk: encoded, chunk_chars: encoded.length }],
    ]);

    await expect(getRequestTimeline(sql, 422991)).resolves.toEqual(timeline);
    expect(log).toHaveLength(2);
    expect(log[0]!.text).not.toContain('pg_column_size');
    expect(log[1]!.text).toContain('substr(text');
    expect(log[1]!.text).not.toContain('profile_export_jsonl_gz as blob');
  });

  it('does not fetch a blob when neither a current timeline nor a blob exists', async () => {
    const { sql, log } = mockSql([
      [{ trace_replay_id: 870, has_blob: false, gz_bytes: null, timeline_version: null }],
    ]);

    await expect(getRequestTimeline(sql, 422991)).resolves.toBeNull();
    expect(log).toHaveLength(1);
  });

  it('recomputes a stale timeline from the blob and hands it to the gzip write-back', async () => {
    const blob = gzipSync(
      Buffer.from(
        JSON.stringify({
          metadata: {
            conversation_id: 'c1',
            turn_index: 0,
            worker_id: 'w0',
            benchmark_phase: 'profiling',
            credit_issued_ns: 1000,
            request_start_ns: 1100,
            request_end_ns: 2000,
          },
          metrics: {
            time_to_first_token: { value: 50 },
            input_sequence_length: { value: 128 },
            output_sequence_length: { value: 16 },
          },
        }),
      ),
    );
    const staleHeader = {
      ...gzipMeta(512),
      timeline_version: REQUEST_TIMELINE_VERSION - 1,
    };
    const { sql, log } = mockSql([
      [staleHeader],
      [{ parts: 0, inline_size: blob.length }],
      [{ data: blob }],
      [{ parts: 0, inline_size: blob.length }],
      [{ data: blob }],
    ]);

    const result = await getRequestTimeline(sql, 422991);

    expect(result?.version).toBe(REQUEST_TIMELINE_VERSION);
    expect(result?.requests).toHaveLength(1);
    // A stale gzip copy is never sliced; the blob is read instead. The
    // PostgreSQL test in request-timeline-db.test.ts checks what is stored.
    expect(log[1]!.text).toContain('profile_export_chunk_count as parts');
    expect(agenticShared.writeBackRequestTimeline).toHaveBeenCalledWith(sql, 870, result);
  });

  it('does not write back when the blob is missing (never persists a null timeline)', async () => {
    const staleHeader = {
      ...gzipMeta(0),
      gz_bytes: null,
      timeline_version: REQUEST_TIMELINE_VERSION - 1,
    };
    const { sql, log } = mockSql([[staleHeader], [{ blob: null }]]);

    await expect(getRequestTimeline(sql, 422991)).resolves.toBeNull();
    expect(agenticShared.writeBackRequestTimeline).not.toHaveBeenCalled();
    // Meta read and blob read only.
    expect(log).toHaveLength(2);
  });
});
