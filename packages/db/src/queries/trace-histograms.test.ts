import { describe, expect, it, vi } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import { gzipRequestTimeline } from '../etl/request-timeline-codec';
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
          gz_bytes: null,
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
    // Never ship the whole document. That is what blew the 64 MiB HTTP cap.
    expect(calls[0]).not.toMatch(/atr\.request_timeline\s*,/);
    expect(calls[0]).toContain('jsonb_array_elements');
  });

  it('derives the same arrays from a gzip timeline in Node', async () => {
    const timeline: RequestTimeline = {
      version: REQUEST_TIMELINE_VERSION,
      startNs: 1_700_000_000_000_000_000,
      endNs: 1_700_000_001_400_000_000,
      durationS: 1.4,
      requests: [
        { isl: 4096, osl: 512 },
        { isl: null, osl: 128 },
        { isl: 2048, osl: null },
      ].map((lengths, index) => ({
        cid: 'trace-018',
        ti: index,
        wid: '7',
        ad: 0,
        phase: 'profiling',
        credit: index * 1_000,
        start: index * 1_000,
        ack: null,
        end: index * 1_000 + 500,
        ttftMs: null,
        tpotMs: null,
        cancelled: false,
        ...lengths,
      })),
    };
    const stored = await gzipRequestTimeline(timeline);
    const { sql, calls } = mockSql([
      [
        {
          benchmark_result_id: 444941,
          trace_replay_id: 3811,
          gz_bytes: stored.length,
          timeline_version: REQUEST_TIMELINE_VERSION,
          // The SQL leaves the legacy unnest null for rows with a gzip copy.
          isl: null,
          osl: null,
          has_blob: true,
        },
      ],
      [{ slice: stored }],
    ]);

    await expect(getTraceHistograms(sql, [444941])).resolves.toEqual({
      444941: { id: 444941, isl: [4096, 2048], osl: [512, 128] },
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('substring(request_timeline_gz');
    expect(calls.some((call) => call.includes('profile_export_jsonl_gz as blob'))).toBe(false);
  });

  it('logs and omits a point whose gzip timeline cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sql } = mockSql([
      [
        {
          benchmark_result_id: 444941,
          trace_replay_id: 3811,
          gz_bytes: 4096,
          timeline_version: REQUEST_TIMELINE_VERSION,
          isl: null,
          osl: null,
          has_blob: true,
        },
      ],
      [{ slice: null }],
    ]);

    await expect(getTraceHistograms(sql, [444941])).resolves.toEqual({});
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toContain('trace_replay_id=3811');
    error.mockRestore();
  });

  it('falls back to the blob when the stored timeline is a stale version', async () => {
    const { sql, calls } = mockSql([
      [
        {
          benchmark_result_id: 1,
          trace_replay_id: 2,
          gz_bytes: null,
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
          gz_bytes: null,
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
          gz_bytes: null,
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
