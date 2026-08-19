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
    // Header first, then the requests are pulled in slices — the header query
    // must never select the timeline document itself.
    const { sql, calls } = mockSql([
      [
        {
          trace_replay_id: 870,
          has_blob: true,
          timeline_version: REQUEST_TIMELINE_VERSION,
          start_ns: 100,
          end_ns: 200,
          duration_s: 0.0000001,
          request_count: 0,
        },
      ],
    ]);

    await expect(getRequestTimeline(sql, 422991)).resolves.toEqual(timeline);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('profile_export_jsonl_gz as blob');
    expect(calls[0]).not.toMatch(/atr\.request_timeline\s*$/m);
  });

  it('pages a long timeline instead of selecting the whole document', async () => {
    // 3 requests over a chunk size of 2 would be two round trips; the mock
    // stands in for that paging so we assert the slicing contract, not the size.
    const record = {
      cid: 'c',
      ti: 0,
      wid: 'w',
      ad: 0,
      phase: 'profiling',
      credit: 0,
      start: 1,
      ack: 2,
      end: 3,
      ttftMs: 1,
      tpotMs: 2,
      isl: 10,
      osl: 20,
      cancelled: false,
    };
    const { sql, calls } = mockSql([
      [
        {
          trace_replay_id: 870,
          has_blob: true,
          timeline_version: REQUEST_TIMELINE_VERSION,
          start_ns: 100,
          end_ns: 200,
          duration_s: 0.0000001,
          request_count: 2,
        },
      ],
      [{ requests: [record, { ...record, ti: 1 }] }],
    ]);

    const result = await getRequestTimeline(sql, 422991);
    expect(result?.requests).toHaveLength(2);
    expect(result?.startNs).toBe(100);
    // One header read plus one slice read, and the slice is bounded.
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('jsonb_array_elements');
    expect(calls[1]).toContain('with ordinality');
  });

  it('does not fetch a blob when neither a current timeline nor a blob exists', async () => {
    const { sql, calls } = mockSql([
      [
        {
          trace_replay_id: 870,
          has_blob: false,
          timeline_version: null,
          start_ns: null,
          end_ns: null,
          duration_s: null,
          request_count: null,
        },
      ],
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
    const staleHeader = {
      trace_replay_id: 870,
      has_blob: true,
      timeline_version: REQUEST_TIMELINE_VERSION - 1,
      start_ns: 100,
      end_ns: 200,
      duration_s: 0.0000001,
      request_count: 0,
    };
    const { sql, calls } = mockSql([[staleHeader], [{ blob }]]);

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
    const staleHeader = {
      trace_replay_id: 870,
      has_blob: true,
      timeline_version: REQUEST_TIMELINE_VERSION - 1,
      start_ns: 100,
      end_ns: 200,
      duration_s: 0.0000001,
      request_count: 0,
    };
    const { sql, calls } = mockSql([[staleHeader], [{ blob: null }]]);

    await expect(getRequestTimeline(sql, 422991)).resolves.toBeNull();
    // meta read + blob read only — no write-back for a null recompute.
    expect(calls).toHaveLength(2);
  });
});
