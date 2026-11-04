import { describe, expect, it, vi } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import { encodeRequestChartColumns } from '../etl/request-chart-columns';
import { gzipRequestTimeline } from '../etl/request-timeline-codec';
import type { DbClient } from '../connection.js';

import { REQUEST_CHART_DATA_VERSION } from './request-chart-data';
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
    const { sql, calls } = mockSql([
      [
        {
          benchmark_result_id: 422991,
          trace_replay_id: 870,
          columns_bytes: null,
          columns_inline: null,
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
          columns_bytes: null,
          columns_inline: null,
          gz_bytes: stored.length,
          timeline_version: REQUEST_TIMELINE_VERSION,
          isl: null,
          osl: null,
          has_blob: true,
        },
      ],
      [{ slice: stored.toString('base64') }],
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
          columns_bytes: null,
          columns_inline: null,
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
          columns_bytes: null,
          columns_inline: null,
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
    expect(calls[1]).toContain('profile_export_chunk_count as parts');
  });

  it('yields empty arrays when a timeline has no isl/osl at all', async () => {
    const { sql } = mockSql([
      [
        {
          benchmark_result_id: 3,
          trace_replay_id: 4,
          columns_bytes: null,
          columns_inline: null,
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
          columns_bytes: null,
          columns_inline: null,
          gz_bytes: null,
          timeline_version: REQUEST_TIMELINE_VERSION,
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

  it('decodes only the precomputed ISL and OSL columns when they are current', async () => {
    const columns = encodeRequestChartColumns({
      version: REQUEST_CHART_DATA_VERSION,
      timelineVersion: REQUEST_TIMELINE_VERSION,
      startNs: 0,
      endNs: 1,
      durationS: 1e-9,
      cids: ['c'],
      phases: ['profiling'],
      requests: [
        [0, 0, 1, 2, null, null, 4096, 512, 0],
        [0, 0, 3, 4, 1.5, 0.25, null, 128, 1],
      ],
    });
    const { sql, calls } = mockSql([
      [
        {
          benchmark_result_id: 7,
          trace_replay_id: 8,
          columns_bytes: columns.length,
          columns_inline: columns.toString('base64'),
          gz_bytes: 1_000_000,
          timeline_version: REQUEST_TIMELINE_VERSION,
          isl: null,
          osl: null,
          has_blob: true,
        },
      ],
    ]);

    await expect(getTraceHistograms(sql, [7])).resolves.toEqual({
      7: { id: 7, isl: [4096], osl: [512, 128] },
    });
    expect(calls).toHaveLength(1);
  });

  it('reads up to four points at once', async () => {
    const columns = encodeRequestChartColumns({
      version: REQUEST_CHART_DATA_VERSION,
      timelineVersion: REQUEST_TIMELINE_VERSION,
      startNs: 0,
      endNs: 1,
      durationS: 1e-9,
      cids: ['c'],
      phases: ['profiling'],
      requests: [[0, 0, 1, 2, null, null, 4096, 512, 0]],
    });
    const ids = [11, 12, 13, 14, 15];
    const held: (() => void)[] = [];
    const sql = ((strings: TemplateStringsArray) => {
      if (!strings.join('?').includes('substring(request_chart_data_gz')) {
        return Promise.resolve(
          ids.map((id) => ({
            benchmark_result_id: id,
            trace_replay_id: id,
            columns_bytes: columns.length,
            columns_inline: null,
            gz_bytes: 1_000_000,
            timeline_version: REQUEST_TIMELINE_VERSION,
            isl: null,
            osl: null,
            has_blob: true,
          })),
        );
      }
      const { promise, resolve } = Promise.withResolvers<{ slice: string }[]>();
      held.push(() => resolve([{ slice: columns.toString('base64') }]));
      return promise;
    }) as unknown as DbClient;

    const result = getTraceHistograms(sql, ids);
    await vi.waitFor(() => expect(held).toHaveLength(4));
    for (const release of held.splice(0)) release();
    await vi.waitFor(() => expect(held).toHaveLength(1));
    held[0]!();

    await expect(result).resolves.toEqual(
      Object.fromEntries(ids.map((id) => [id, { id, isl: [4096], osl: [512] }])),
    );
  });
});
