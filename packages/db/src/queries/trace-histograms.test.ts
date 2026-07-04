import { describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import type { DbClient } from '../connection.js';

import { getTraceHistograms } from './trace-histograms';

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
  startNs: 0,
  endNs: 10,
  durationS: 0.00000001,
  requests: [
    {
      cid: 'session-1',
      ti: 0,
      wid: '0',
      ad: 0,
      phase: 'profiling',
      credit: 0,
      start: 1,
      ack: 2,
      end: 3,
      ttftMs: 1,
      tpotMs: 2,
      isl: 4096,
      osl: 512,
      cancelled: false,
    },
    {
      cid: 'session-1',
      ti: 1,
      wid: '0',
      ad: 0,
      phase: 'profiling',
      credit: 4,
      start: 5,
      ack: 6,
      end: 7,
      ttftMs: 1,
      tpotMs: 2,
      isl: null,
      osl: 128,
      cancelled: false,
    },
  ],
};

describe('getTraceHistograms', () => {
  it('builds distributions from the precomputed timeline without selecting the raw blob', async () => {
    const { sql, calls } = mockSql([
      [
        {
          benchmark_result_id: 422991,
          trace_replay_id: 870,
          request_timeline: timeline,
          has_blob: true,
        },
      ],
    ]);

    await expect(getTraceHistograms(sql, [422991])).resolves.toEqual({
      422991: { id: 422991, isl: [4096], osl: [512, 128] },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('profile_export_jsonl_gz as blob');
  });
});
