import { describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline';
import type { DbClient } from '../connection.js';

import {
  encodeRequestChartData,
  getRequestChartData,
  REQUEST_CHART_DATA_VERSION,
} from './request-chart-data';

function mockSql(queue: unknown[][]): { sql: DbClient; calls: string[] } {
  const responses = [...queue];
  const calls: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    calls.push(strings.join('?'));
    return Promise.resolve(responses.shift() ?? []);
  }) as unknown as DbClient;
  return { sql, calls };
}

describe('request chart data', () => {
  it('dictionary-encodes repeated conversation and phase strings', () => {
    const encoded = encodeRequestChartData(
      { version: REQUEST_TIMELINE_VERSION, startNs: 10, endNs: 30, durationS: 2 },
      [
        {
          cid: 'conversation-a',
          phase: 'profiling',
          start: 1,
          end: 2,
          ttftMs: 3,
          tpotMs: 4,
          isl: 5,
          osl: 6,
          cancelled: false,
        },
        {
          cid: 'conversation-a',
          phase: 'profiling',
          start: 7,
          end: 8,
          ttftMs: null,
          tpotMs: null,
          isl: 9,
          osl: 10,
          cancelled: true,
        },
      ],
    );

    expect(encoded).toMatchObject({
      version: REQUEST_CHART_DATA_VERSION,
      timelineVersion: REQUEST_TIMELINE_VERSION,
      cids: ['conversation-a'],
      phases: ['profiling'],
    });
    expect(encoded.requests).toEqual([
      [0, 0, 1, 2, 3, 4, 5, 6, 0],
      [0, 0, 7, 8, null, null, 9, 10, 1],
    ]);
  });

  it('projects chart-only fields with one JSONB expansion', async () => {
    const { sql, calls } = mockSql([
      [
        {
          trace_replay_id: 7,
          has_blob: true,
          timeline_version: REQUEST_TIMELINE_VERSION,
          start_ns: 10,
          end_ns: 30,
          duration_s: 2,
          requests: [['c', 'profiling', 1, 2, 3, 4, 5, 6, false]],
        },
      ],
    ]);

    const result = await getRequestChartData(sql, 42);

    expect(result?.requests).toEqual([[0, 0, 1, 2, 3, 4, 5, 6, 0]]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('jsonb_array_elements');
    expect(calls[0]).toContain("request->>'ttftMs'");
    expect(calls[0]).not.toContain('profile_export_jsonl_gz as blob');
  });
});
