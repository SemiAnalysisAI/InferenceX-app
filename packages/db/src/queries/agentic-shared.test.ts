import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../connection.js';

import {
  _resetWriteBackWarned,
  BLOB_CHUNK_BYTES,
  extractProfileSamples,
  streamTraceReplayBlob,
  writeBackTraceReplayJsonb,
} from './agentic-shared';

/**
 * Capture every SQL call: the joined template text plus the bound values, so we
 * can assert the write-back targets the right column and binds the JSONB
 * payload as a `::jsonb`-cast JSON string (driver-agnostic).
 */
function mockSql(reject?: Error): {
  sql: DbClient;
  calls: { text: string; values: unknown[] }[];
} {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return reject ? Promise.reject(reject) : Promise.resolve([]);
  }) as unknown as DbClient;
  return { sql, calls };
}

afterEach(() => {
  _resetWriteBackWarned();
  vi.restoreAllMocks();
});

describe('writeBackTraceReplayJsonb', () => {
  it('issues a fixed-column UPDATE binding the payload as ::jsonb + the id', () => {
    const { sql, calls } = mockSql();
    writeBackTraceReplayJsonb(sql, 'chart_series', 870, { version: 12, foo: 'bar' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toContain('update agentic_trace_replay set chart_series');
    expect(calls[0]!.text).toContain('::jsonb where id');
    // The payload OBJECT is bound directly (not JSON.stringify'd — that would
    // double-encode into a JSONB string), followed by the id. Only the value +
    // id are interpolated; the column name is fully static in the SQL text.
    expect(calls[0]!.values).toEqual([{ version: 12, foo: 'bar' }, 870]);
  });

  it('targets the requested column verbatim (no cross-talk between columns)', () => {
    const cases: ('aggregate_stats' | 'chart_series' | 'request_timeline')[] = [
      'aggregate_stats',
      'chart_series',
      'request_timeline',
    ];
    for (const column of cases) {
      const { sql, calls } = mockSql();
      writeBackTraceReplayJsonb(sql, column, 1, { v: 1 });
      expect(calls[0]!.text).toContain(`update agentic_trace_replay set ${column}`);
    }
  });

  it('no-ops on a null/undefined payload (never overwrites good data with a hole)', () => {
    const { sql, calls } = mockSql();
    writeBackTraceReplayJsonb(sql, 'aggregate_stats', 1, null);
    writeBackTraceReplayJsonb(sql, 'aggregate_stats', 1, undefined);
    expect(calls).toHaveLength(0);
  });

  it('swallows a rejected UPDATE (read-only replica) and warns exactly once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sql } = mockSql(new Error('cannot execute UPDATE in a read-only transaction'));

    // Fire twice; the helper is fire-and-forget so neither call throws.
    expect(() => writeBackTraceReplayJsonb(sql, 'chart_series', 1, { v: 1 })).not.toThrow();
    expect(() => writeBackTraceReplayJsonb(sql, 'chart_series', 2, { v: 1 })).not.toThrow();

    // Let the caught rejections settle.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('could not persist chart_series');
  });
});

/** Serve `substring(col from ? for ?)` reads out of an in-memory buffer. */
function blobSql(blob: Buffer): { sql: DbClient; chunkReads: number[] } {
  const chunkReads: number[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    expect(text).toContain('substring(profile_export_jsonl_gz from');
    const [offset, length] = values as [number, number, number];
    chunkReads.push(offset);
    // SQL substring is 1-based; slice is 0-based.
    const chunk = blob.subarray(offset - 1, offset - 1 + length);
    return Promise.resolve([{ chunk }]);
  }) as unknown as DbClient;
  return { sql, chunkReads };
}

/** One profiling record padded with poorly compressible bytes. */
function paddedRec(isl: number, osl: number): string {
  return JSON.stringify({
    metadata: { benchmark_phase: 'profiling' },
    metrics: {
      request_latency: { value: 1000, unit: 'ms' },
      time_to_first_token: { value: 100, unit: 'ms' },
      input_sequence_length: { value: isl, unit: 'tokens' },
      output_sequence_length: { value: osl, unit: 'tokens' },
      padding: randomBytes(4 * 1024 * 1024).toString('base64'),
    },
  });
}

describe('streamTraceReplayBlob + extractProfileSamples', () => {
  it('reassembles a blob larger than one chunk across multiple substring reads', async () => {
    // Poorly compressible padding pushes the gzip past BLOB_CHUNK_BYTES so the
    // reader must issue several bounded reads and the gunzip stream must
    // reassemble records that straddle chunk boundaries.
    const jsonl = [paddedRec(100, 50), paddedRec(200, 100), paddedRec(300, 25)].join('\n');
    const blob = gzipSync(Buffer.from(jsonl));
    expect(blob.length).toBeGreaterThan(BLOB_CHUNK_BYTES);

    const { sql, chunkReads } = blobSql(blob);
    const samples = await extractProfileSamples(
      streamTraceReplayBlob(sql, 'profile_export_jsonl_gz', 42),
    );

    expect(chunkReads.length).toBeGreaterThan(1);
    expect(chunkReads[0]).toBe(1);
    expect(chunkReads[1]).toBe(1 + BLOB_CHUNK_BYTES);
    expect(samples.isl).toEqual([100, 200, 300]);
    expect(samples.osl).toEqual([50, 100, 25]);
    expect(samples.e2elPerOsl).toEqual([1 / 50, 1 / 100, 1 / 25]);
    expect(samples.pairs).toHaveLength(3);
  });

  it('terminates without reads beyond a short final chunk and skips cancelled records', async () => {
    const lines = [
      JSON.stringify({
        metadata: { benchmark_phase: 'profiling' },
        metrics: {
          input_sequence_length: { value: 10, unit: 'tokens' },
          output_sequence_length: { value: 5, unit: 'tokens' },
        },
      }),
      JSON.stringify({
        metadata: { benchmark_phase: 'profiling', was_cancelled: true },
        metrics: {
          input_sequence_length: { value: 7777, unit: 'tokens' },
          output_sequence_length: { value: 7777, unit: 'tokens' },
        },
      }),
    ];
    const blob = gzipSync(Buffer.from(lines.join('\n')));
    const { sql, chunkReads } = blobSql(blob);
    const samples = await extractProfileSamples(
      streamTraceReplayBlob(sql, 'profile_export_jsonl_gz', 42),
    );
    // Single short chunk — the reader must not issue a second round-trip.
    expect(chunkReads).toEqual([1]);
    expect(samples.pairs).toEqual([{ isl: 10, osl: 5 }]);
    // No latency fields → no ratio samples; cancelled record fully ignored.
    expect(samples.e2elPerOsl).toEqual([]);
  });
});
