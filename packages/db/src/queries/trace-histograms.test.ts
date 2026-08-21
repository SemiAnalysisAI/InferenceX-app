import { describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION } from '../etl/compute-request-timeline';
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

describe('getTraceHistograms', () => {
  it('builds distributions from the precomputed timeline without selecting the raw blob', async () => {
    // The query unnests isl/osl server-side, so the driver hands back arrays
    // rather than the timeline document. Requests with a null isl contribute
    // to osl only, which is why the two arrays differ in length.
    const { sql, calls } = mockSql([
      [
        {
          benchmark_result_id: 422991,
          trace_replay_id: 870,
          timeline_version: REQUEST_TIMELINE_VERSION,
          isl: [4096],
          osl: [512, 128],
          has_blob: true,
        },
      ],
    ]);

    await expect(getTraceHistograms(sql, [422991])).resolves.toEqual({
      422991: { id: 422991, isl: [4096], osl: [512, 128] },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('profile_export_jsonl_gz as blob');
    // Never ship the whole document — that is what blew the 64 MiB HTTP cap.
    expect(calls[0]).not.toMatch(/atr\.request_timeline\s*,/);
    expect(calls[0]).toContain('jsonb_array_elements');
  });

  it('falls back to the blob when the stored timeline is a stale version', async () => {
    const { sql, calls } = mockSql([
      [
        {
          benchmark_result_id: 1,
          trace_replay_id: 2,
          timeline_version: REQUEST_TIMELINE_VERSION - 1,
          isl: [1],
          osl: [2],
          has_blob: true,
        },
      ],
      [],
    ]);
    await expect(getTraceHistograms(sql, [1])).resolves.toEqual({});
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('profile_export_jsonl_gz as blob');
  });

  it('yields empty arrays when a timeline has no isl/osl at all', async () => {
    // array_agg over zero matching rows returns NULL, not an empty array.
    const { sql } = mockSql([
      [
        {
          benchmark_result_id: 3,
          trace_replay_id: 4,
          timeline_version: REQUEST_TIMELINE_VERSION,
          isl: null,
          osl: null,
          has_blob: false,
        },
      ],
    ]);
    await expect(getTraceHistograms(sql, [3])).resolves.toEqual({
      3: { id: 3, isl: [], osl: [] },
    });
  });

  it('drops non-finite values the driver may hand back as strings', async () => {
    const { sql } = mockSql([
      [
        {
          benchmark_result_id: 5,
          trace_replay_id: 6,
          timeline_version: REQUEST_TIMELINE_VERSION,
          // numeric columns arrive as strings on some drivers.
          isl: ['4096', null, 'NaN'] as unknown as number[],
          osl: ['512'] as unknown as number[],
          has_blob: false,
        },
      ],
    ]);
    await expect(getTraceHistograms(sql, [5])).resolves.toEqual({
      5: { id: 5, isl: [4096], osl: [512] },
    });
  });
});
