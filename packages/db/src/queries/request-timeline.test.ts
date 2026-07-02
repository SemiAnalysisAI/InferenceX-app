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
});
