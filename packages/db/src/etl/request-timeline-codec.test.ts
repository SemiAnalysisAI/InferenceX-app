import { gunzipSync, gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from './compute-request-timeline';
import {
  gunzipRequestTimeline,
  gzipRequestTimeline,
  gzipRequestTimelineParts,
} from './request-timeline-codec';

/** Enough requests that the JSON text crosses several 1 MiB write batches. */
function largeTimeline(requestCount: number): RequestTimeline {
  return {
    version: REQUEST_TIMELINE_VERSION,
    startNs: 1_700_000_000_000_000_000,
    endNs: 1_700_000_001_400_000_000,
    durationS: 1.4,
    requests: Array.from({ length: requestCount }, (_, index) => ({
      cid: `9c1d4e2a-${String(index % 997).padStart(4, '0')}`,
      ri: index % 997,
      ti: Math.floor(index / 997),
      srcTrace: `cc-traces-weka-062126/${index % 997}`,
      srcOuter: index % 13,
      srcKind: 'weka_main',
      wid: `worker-${index % 64}`,
      ad: index % 4 === 0 ? 1 : 0,
      phase: index < 100 ? 'warmup' : 'profiling',
      credit: index * 2_048,
      start: index * 2_048 + 256,
      ack: index % 9 === 0 ? null : index * 2_048 + 512,
      end: index * 2_048 + 1_024_000,
      ttftMs: index % 9 === 0 ? null : 40 + (index % 1000) / 7,
      tpotMs: 18.125,
      isl: 16_000 + (index % 4096),
      osl: index % 11 === 0 ? null : 300 + (index % 700),
      cancelled: index % 101 === 0,
    })),
  };
}

describe('gzipRequestTimeline', () => {
  it('compresses exactly JSON.stringify(timeline) across write batches', async () => {
    const timeline = largeTimeline(8_000);
    const json = JSON.stringify(timeline);
    expect(json.length).toBeGreaterThan(2 * 1024 * 1024);

    const gz = await gzipRequestTimeline(timeline);

    expect(gunzipSync(gz).toString('utf8')).toBe(json);
    expect(gunzipRequestTimeline(gz)).toEqual(timeline);
  });

  it('encodes a timeline without requests as an empty array', async () => {
    const timeline: RequestTimeline = {
      version: REQUEST_TIMELINE_VERSION,
      startNs: 0,
      endNs: 0,
      durationS: 0,
      requests: [],
    };

    const gz = await gzipRequestTimeline(timeline);

    expect(gunzipSync(gz).toString('utf8')).toBe(
      `{"version":${REQUEST_TIMELINE_VERSION},"startNs":0,"endNs":0,"durationS":0,"requests":[]}`,
    );
  });
});

/** Requests arriving one at a time, like the conversion backfill's range queries. */
async function* incrementalRequests(requests: readonly object[]): AsyncGenerator<object> {
  for (const request of requests) yield request;
}

async function* failingRequests(): AsyncGenerator<object> {
  yield { cid: 'trace-018' };
  throw new Error('legacy slice query failed');
}

describe('gzipRequestTimelineParts', () => {
  it('counts requests from an incremental source and keeps the header fields', async () => {
    const { requests } = largeTimeline(250);
    const header = {
      endNs: 2_000,
      startNs: 1_000,
      version: REQUEST_TIMELINE_VERSION,
      durationS: 1,
    };

    const { gz, requestCount } = await gzipRequestTimelineParts(
      header,
      incrementalRequests(requests),
    );

    expect(requestCount).toBe(250);
    expect(gunzipRequestTimeline(gz)).toEqual({ ...header, requests });
  });

  it('rejects instead of hanging when the request source fails', async () => {
    await expect(gzipRequestTimelineParts({ version: 6 }, failingRequests())).rejects.toThrow(
      'legacy slice query failed',
    );
  });
});

describe('gunzipRequestTimeline', () => {
  it.each([
    ['a JSON array', gzipSync('[]')],
    ['a document without requests', gzipSync('{"version":6}')],
    ['truncated JSON', gzipSync('{"version":6,"requests":[')],
    ['bytes that are not gzip', Buffer.from('{"version":6,"requests":[]}')],
  ])('rejects %s', (_label, gz) => {
    expect(() => gunzipRequestTimeline(gz)).toThrow();
  });
});
