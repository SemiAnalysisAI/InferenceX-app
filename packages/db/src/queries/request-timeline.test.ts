import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import type { DbClient } from '../connection.js';

import { getRequestTimeline } from './request-timeline';

function mockSql(queue: unknown[][]): { sql: DbClient; calls: string[] } {
  const responses = [...queue];
  const calls: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    calls.push(strings.join('?'));
    return Promise.resolve(responses.shift() ?? []);
  }) as unknown as DbClient;
  return { sql, calls };
}

const timeline: RequestTimeline = {
  version: REQUEST_TIMELINE_VERSION,
  startNs: 100,
  endNs: 200,
  durationS: 0.0000001,
  requests: [],
};

describe('getRequestTimeline', () => {
  it('returns the current precomputed timeline without selecting the raw profile blob', async () => {
    const { sql, calls } = mockSql([
      [{ trace_replay_id: 870, has_blob: true, request_timeline: timeline }],
    ]);

    await expect(getRequestTimeline(sql, 422991)).resolves.toEqual(timeline);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('profile_export_jsonl_gz as blob');
  });

  it('does not fetch a blob when neither a current timeline nor a blob exists', async () => {
    const { sql, calls } = mockSql([
      [{ trace_replay_id: 870, has_blob: false, request_timeline: null }],
    ]);

    await expect(getRequestTimeline(sql, 422991)).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('recomputes from the blob AND writes the fresh timeline back when the stored one is stale', async () => {
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
    const stale = { ...timeline, version: REQUEST_TIMELINE_VERSION - 1 };
    const { sql, calls } = mockSql([
      [{ trace_replay_id: 870, has_blob: true, request_timeline: stale }],
      [{ blob }],
    ]);

    const result = await getRequestTimeline(sql, 422991);

    expect(result?.version).toBe(REQUEST_TIMELINE_VERSION);
    expect(result?.requests).toHaveLength(1);
    // 3 calls: meta read, blob read, then the fire-and-forget write-back.
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain('profile_export_jsonl_gz as blob');
    expect(calls[2]).toContain('update agentic_trace_replay set request_timeline');
    expect(calls[2]).toContain('::jsonb where id');
  });

  it('does not write back when the blob is missing (never persists a null timeline)', async () => {
    const stale = { ...timeline, version: REQUEST_TIMELINE_VERSION - 1 };
    const { sql, calls } = mockSql([
      [{ trace_replay_id: 870, has_blob: true, request_timeline: stale }],
      [{ blob: null }],
    ]);

    await expect(getRequestTimeline(sql, 422991)).resolves.toBeNull();
    // meta read + blob read only — no write-back for a null recompute.
    expect(calls).toHaveLength(2);
  });
});
