import { afterEach, describe, expect, it, vi } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from '../etl/compute-request-timeline';
import { gzipRequestTimeline } from '../etl/request-timeline-codec';
import type { DbClient } from '../connection.js';

import {
  encodeRequestChartData,
  getRequestChartData,
  LEGACY_PROJECTION_MAX_REQUESTS,
  REQUEST_CHART_DATA_VERSION,
} from './request-chart-data';

afterEach(() => {
  vi.restoreAllMocks();
});

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
  startNs: 1_700_000_000_000_000_000,
  endNs: 1_700_000_001_400_000_000,
  durationS: 1.4,
  requests: [
    {
      cid: 'trace-018',
      ri: 0,
      ti: 0,
      srcTrace: 'weka-018',
      wid: '7',
      ad: 0,
      phase: 'warmup',
      credit: 0,
      start: 1_200_000,
      ack: 1_800_000,
      end: 420_000_000,
      ttftMs: 42.345_678,
      tpotMs: 18.1,
      isl: 18_320,
      osl: 410,
      cancelled: false,
    },
    {
      cid: 'trace-018',
      ri: 0,
      ti: 1,
      wid: '7',
      ad: 1,
      phase: 'profiling',
      credit: 500_000_000,
      start: 500_400_000,
      ack: null,
      end: 1_400_000_000,
      ttftMs: null,
      tpotMs: null,
      isl: 19_340,
      osl: null,
      cancelled: true,
    },
  ],
};

const legacyMeta = (legacyRequestCount: number) => ({
  trace_replay_id: 3811,
  has_blob: true,
  gz_bytes: null,
  timeline_version: REQUEST_TIMELINE_VERSION,
  legacy_request_count: legacyRequestCount,
});

const gzipMeta = (gzBytes: number) => ({
  trace_replay_id: 3811,
  has_blob: true,
  gz_bytes: gzBytes,
  timeline_version: REQUEST_TIMELINE_VERSION,
  legacy_request_count: null,
});

describe('request chart data', () => {
  it('dictionary-encodes repeated conversation and phase strings', () => {
    const encoded = encodeRequestChartData(
      { version: REQUEST_TIMELINE_VERSION, startNs: 10, endNs: 30, durationS: 2 },
      [
        {
          cid: 'conversation-a',
          phase: 'profiling',
          start: 1_000,
          end: 2_000,
          ttftMs: 3.123_456,
          tpotMs: 4.654_321,
          isl: 5,
          osl: 6,
          cancelled: false,
        },
        {
          cid: 'conversation-a',
          phase: 'profiling',
          start: 7_000,
          end: 8_000,
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
      [0, 0, 1, 2, 3.123, 4.654, 5, 6, 0],
      [0, 0, 7, 8, null, null, 9, 10, 1],
    ]);
  });

  it('projects a legacy JSONB timeline of up to 250,000 requests in SQL', async () => {
    const { sql, calls } = mockSql([
      [legacyMeta(LEGACY_PROJECTION_MAX_REQUESTS)],
      [
        {
          start_ns: 10,
          end_ns: 30,
          duration_s: 2,
          requests: [['c', 'profiling', 1_000, 2_000, 3, 4, 5, 6, false]],
        },
      ],
    ]);

    const result = await getRequestChartData(sql, 42);

    expect(result?.requests).toEqual([[0, 0, 1, 2, 3, 4, 5, 6, 0]]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("jsonb_array_length(atr.request_timeline->'requests')");
    expect(calls[1]).toContain('jsonb_array_elements');
  });

  it('scans a legacy JSONB timeline above 250,000 requests in Node instead of SQL', async () => {
    const encoded = JSON.stringify(timeline);
    const { sql, calls } = mockSql([
      [legacyMeta(LEGACY_PROJECTION_MAX_REQUESTS + 1)],
      [{ chunk: encoded, chunk_chars: encoded.length }],
    ]);

    const result = await getRequestChartData(sql, 444941);

    expect(result).toEqual(encodeRequestChartData(timeline, timeline.requests));
    expect(calls).toHaveLength(2);
    expect(calls.some((call) => call.includes('jsonb_array_elements'))).toBe(false);
    expect(calls[1]).toContain('substr(text');
  });

  it('decodes a gzip timeline in Node and encodes the same tuples as the legacy path', async () => {
    const stored = await gzipRequestTimeline(timeline);
    const { sql, calls } = mockSql([[gzipMeta(stored.length)], [{ slice: stored }]]);

    const result = await getRequestChartData(sql, 444941);

    expect(result).toEqual(encodeRequestChartData(timeline, timeline.requests));
    expect(result?.requests).toEqual([
      [0, 0, 1_200, 420_000, 42.346, 18.1, 18_320, 410, 0],
      [0, 1, 500_400, 1_400_000, null, null, 19_340, null, 1],
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('substring(request_timeline_gz');
  });

  it('logs and returns null when a same-length corrupted gzip slice fails decode', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stored = await gzipRequestTimeline(timeline);
    const corrupted = Buffer.from(stored);
    const middle = Math.floor(corrupted.length / 2);
    corrupted.writeUInt8(corrupted.readUInt8(middle) ^ 255, middle);
    const { sql } = mockSql([[gzipMeta(corrupted.length)], [{ slice: corrupted }]]);

    await expect(getRequestChartData(sql, 444941)).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toContain('trace_replay_id=3811');
  });

  it('returns null when a legacy timeline is cleared between the metadata read and projection', async () => {
    const { sql } = mockSql([[legacyMeta(2)], []]);

    await expect(getRequestChartData(sql, 42)).resolves.toBeNull();
  });
});
