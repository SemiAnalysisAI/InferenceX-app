import type postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import {
  TRACE_REPLAY_UPLOAD_CHUNK_BYTES,
  uploadTraceReplayPayloadChunks,
} from './trace-replay-ingest';

interface SqlCall {
  text: string;
  values: unknown[];
}

function mockTransactionSql(): { sql: postgres.TransactionSql; calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve([]);
  }) as unknown as postgres.TransactionSql;
  return { sql, calls };
}

describe('uploadTraceReplayPayloadChunks', () => {
  it('bounds every Bind payload for the measured 90 MiB staging row', async () => {
    // Exact payload sizes from InferenceX run 29181694248, item 8/9.
    const measuredPayloads = [
      ['profile_export_jsonl_gz', Buffer.alloc(22_992_290)],
      ['server_metrics_json_gz', Buffer.alloc(49_891_135)],
      ['request_timeline', Buffer.alloc(22_146_655)],
    ] as const;
    const { sql, calls } = mockTransactionSql();

    let expectedParts = 0;
    for (const [field, payload] of measuredPayloads) {
      const parts = await uploadTraceReplayPayloadChunks(sql, field, payload);
      const expected = Math.ceil(payload.length / TRACE_REPLAY_UPLOAD_CHUNK_BYTES);
      expect(parts).toBe(expected);
      expectedParts += expected;
    }

    expect(calls).toHaveLength(expectedParts);
    expect(calls.every((call) => call.text.includes('trace_replay_upload_parts'))).toBe(true);
    const chunks = calls.flatMap((call) => call.values.filter(Buffer.isBuffer));
    expect(chunks).toHaveLength(expectedParts);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBe(TRACE_REPLAY_UPLOAD_CHUNK_BYTES);
    expect(chunks.reduce((total, chunk) => total + chunk.length, 0)).toBe(
      measuredPayloads.reduce((total, [, payload]) => total + payload.length, 0),
    );
  });

  it('does not issue a query for a missing payload', async () => {
    const { sql, calls } = mockTransactionSql();

    await expect(uploadTraceReplayPayloadChunks(sql, 'chart_series', null)).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });
});
