import { gunzipSync, gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { RequestChartDataWire, RequestChartTuple } from '../queries/request-chart-data';
import {
  decodeRequestChartColumns,
  decodeRequestChartSequenceLengths,
  encodeRequestChartColumns,
} from './request-chart-columns';

const roundMs = (value: number): number => Math.round(value * 1_000) / 1_000;

function wireWith(requests: RequestChartTuple[]): RequestChartDataWire {
  return {
    version: 602,
    timelineVersion: 6,
    startNs: 1_761_000_000_123_456_000,
    endNs: 1_761_000_360_987_654_400,
    durationS: 360.864_197_532,
    cids: ['conv-a', 'conv-\u{1F600}', 'lone-\uD800', 'undefined'],
    phases: ['warmup', 'profiling'],
    requests,
  };
}

/** Deterministic values shaped like real timelines: unsorted µs offsets and ms latencies. */
function sampleRequests(count: number): RequestChartTuple[] {
  let seed = 12_345;
  const next = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  return Array.from({ length: count }, (_, index): RequestChartTuple => {
    const start = Math.round(next() * 3.6e9);
    return [
      index % 4,
      index % 7 === 0 ? 0 : 1,
      start,
      start + Math.round(next() * 9e7),
      index % 11 === 0 ? null : roundMs(next() * 120_000),
      index % 13 === 0 ? null : roundMs(next() * 50),
      index % 17 === 0 ? null : Math.round(next() * 200_000),
      index % 19 === 0 ? null : Math.round(next() * 8_000),
      index % 23 === 0 ? 1 : 0,
    ];
  });
}

describe('request chart columns', () => {
  it('round-trips realistic chart data to identical JSON', () => {
    const wire = wireWith(sampleRequests(5_000));
    const decoded = decodeRequestChartColumns(encodeRequestChartColumns(wire));

    expect(JSON.stringify(decoded)).toBe(JSON.stringify(wire));
    expect(decoded).toEqual(wire);
  });

  it('round-trips values that varints cannot hold exactly', () => {
    const wire = wireWith([
      [0, 0, Number.NaN, 2 ** 52 + 2, 0.000_4, 1e-7, 4096.5, Infinity, 0],
      [1, 1, -1_000, -0, 2 ** 51, 12.345, -3, 2 ** 53, 1],
      [3, 0, 7, 8, null, null, null, null, 0],
    ]);

    expect(JSON.stringify(decodeRequestChartColumns(encodeRequestChartColumns(wire)))).toBe(
      JSON.stringify(wire),
    );
  });

  it('round-trips a point without requests', () => {
    const wire = wireWith([]);

    expect(decodeRequestChartColumns(encodeRequestChartColumns(wire))).toEqual(wire);
  });

  it('decodes the finite ISL and OSL values in request order', () => {
    const requests = sampleRequests(500);
    requests[3]![6] = Infinity;
    requests[4]![7] = 512.25;

    const lengths = decodeRequestChartSequenceLengths(
      encodeRequestChartColumns(wireWith(requests)),
    );

    const finite = (column: 6 | 7): number[] =>
      requests.flatMap((request) => {
        const value = request[column];
        return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
      });
    expect(lengths).toEqual({ isl: finite(6), osl: finite(7) });
  });

  it('rejects truncated or foreign bytes', () => {
    const raw = gunzipSync(encodeRequestChartColumns(wireWith(sampleRequests(50))));

    expect(() => decodeRequestChartColumns(gzipSync(raw.subarray(0, -1)))).toThrow('malformed');
    expect(() => decodeRequestChartColumns(gzipSync(Buffer.from('{"requests":[]}')))).toThrow(
      'malformed',
    );
  });
});
