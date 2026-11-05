import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeRequestTimeline } from '../etl/compute-request-timeline';
import {
  fullResponseMetricsFromLines,
  fullResponseMetricsFromProfile,
} from '../etl/full-response-interactivity';
import { migratedPglite, pgliteSql, type PgliteSql } from './test-pglite';
import {
  PROFILE_CHUNK_BYTES,
  readTraceProfileChunks,
  readTraceProfileGz,
  readTraceProfileLines,
  writeTraceProfileChunks,
} from './trace-profile-storage';

let db: PGlite;
let sql: PgliteSql;
beforeAll(async () => {
  db = await migratedPglite();
  sql = pgliteSql(db);
});
afterAll(async () => {
  await db.close();
});

async function newTrace(): Promise<number> {
  const [row] = await sql`insert into agentic_trace_replay default values returning id`;
  return Number(row.id);
}

describe('lossless trace profile storage', () => {
  it('round-trips multiple bounded parts and verifies their source checksum', async () => {
    const source = randomBytes(PROFILE_CHUNK_BYTES * 2 + 101);
    const id = await newTrace();
    await sql.begin((tx) => writeTraceProfileChunks(tx, id, source));
    const restored = await readTraceProfileGz(sql, id);
    expect(restored?.equals(source)).toBe(true);
    const [row] =
      await sql`select profile_export_jsonl_gz, profile_export_chunk_count, profile_export_compressed_size, profile_export_sha256 from agentic_trace_replay where id = ${id}`;
    expect(row).toMatchObject({
      profile_export_jsonl_gz: null,
      profile_export_chunk_count: 3,
      profile_export_sha256: createHash('sha256').update(source).digest('hex'),
    });
    expect(Number(row.profile_export_compressed_size)).toBe(source.length);
  });

  it('reads legacy inline bytes through the same bounded reader', async () => {
    const id = await newTrace();
    const bytes = randomBytes(PROFILE_CHUNK_BYTES + 7);
    await sql`update agentic_trace_replay set profile_export_jsonl_gz = ${bytes} where id = ${id}`;
    const restored = await readTraceProfileGz(sql, id);
    expect(restored?.equals(bytes)).toBe(true);
  });

  it('rejects missing, truncated, and same-size corrupted chunks', async () => {
    const bytes = randomBytes(105);
    const id = await newTrace();
    await writeTraceProfileChunks(sql, id, bytes);
    const corrupted = Buffer.from(bytes);
    corrupted[0] ^= 1;
    await sql`update agentic_trace_profile_chunks set data = ${corrupted} where trace_replay_id = ${id}`;
    await expect(readTraceProfileGz(sql, id)).rejects.toThrow('checksum mismatch');
    await sql`update agentic_trace_profile_chunks set data = ${bytes.subarray(1)} where trace_replay_id = ${id}`;
    await expect(readTraceProfileGz(sql, id)).rejects.toThrow('truncated');
    await sql`delete from agentic_trace_profile_chunks where trace_replay_id = ${id}`;
    await expect(readTraceProfileGz(sql, id)).rejects.toThrow('Missing');
  });

  it('keeps timeline and full-response metric calculations identical for streamed profiles', async () => {
    const profile = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({
        metadata: {
          conversation_id: 'replay-é',
          benchmark_phase: 'profiling',
          credit_issued_ns: i * 1e9,
          request_start_ns: i * 1e9,
          request_end_ns: (i + 1) * 1e9,
        },
        metrics: {
          input_sequence_length: { value: 128 },
          output_sequence_length: { value: 16 },
          time_to_first_token: { value: 20 + i },
          request_latency: { value: 1000 },
        },
      }),
    ).join('\n');
    const gz = gzipSync(profile);
    const id = await newTrace();
    await writeTraceProfileChunks(sql, id, gz);
    expect(await computeRequestTimeline(() => readTraceProfileChunks(sql, id))).toEqual(
      await computeRequestTimeline(gz),
    );
    expect(await fullResponseMetricsFromLines(readTraceProfileLines(sql, id))).toEqual(
      fullResponseMetricsFromProfile(profile),
    );
  });

  it('handles a failed DB stream without an unhandled source error', async () => {
    const data = gzipSync('{}\n');
    async function* failedRead(): AsyncGenerator<Buffer> {
      yield data;
      throw new Error('database disconnected');
    }
    await expect(computeRequestTimeline(failedRead)).resolves.toBeNull();
  });

  it('cascades deletion and rolls back a partial write', async () => {
    const id = await newTrace();
    await expect(
      sql.begin(async (tx) => {
        await writeTraceProfileChunks(tx, id, Buffer.from('profile'));
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await sql`select part from agentic_trace_profile_chunks where trace_replay_id = ${id}`,
    ).toHaveLength(0);
    await writeTraceProfileChunks(sql, id, Buffer.from('profile'));
    await sql`delete from agentic_trace_replay where id = ${id}`;
    expect(
      await sql`select part from agentic_trace_profile_chunks where trace_replay_id = ${id}`,
    ).toHaveLength(0);
  });
});
