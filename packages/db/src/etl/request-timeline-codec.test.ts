import { gunzipSync, gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, type RequestTimeline } from './compute-request-timeline';
import {
  gunzipRequestTimeline,
  gzipRequestTimeline,
  gzipRequestTimelineParts,
  scanRequestTimelineGz,
  scanRequestTimelineText,
  type ScannedRequest,
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

const CHART_FIELDS: ReadonlySet<string> = new Set([
  'cid',
  'phase',
  'start',
  'end',
  'ttftMs',
  'tpotMs',
  'isl',
  'osl',
  'cancelled',
]);

/** Scan `gz` with a given in-memory ceiling and keep only `fields` of each request. */
async function scanned(gz: Buffer, maxInMemoryBytes: number) {
  const requests: ScannedRequest[] = [];
  const header = await scanRequestTimelineGz(
    gz,
    CHART_FIELDS,
    (request) => {
      requests.push(
        Object.fromEntries(Object.entries(request).filter(([key]) => CHART_FIELDS.has(key))),
      );
    },
    maxInMemoryBytes,
  );
  return { header, requests };
}

async function* textChunks(text: string, size: number): AsyncGenerator<string> {
  for (let offset = 0; offset < text.length; offset += size)
    yield text.slice(offset, offset + size);
}

describe('scanRequestTimelineGz', () => {
  it('streams a timeline above the in-memory ceiling into the same fields as JSON.parse', async () => {
    const timeline = largeTimeline(3_000);
    const gz = await gzipRequestTimeline(timeline);
    const { requests, ...header } = timeline;
    const expected = requests.map((request) =>
      Object.fromEntries(Object.entries(request).filter(([key]) => CHART_FIELDS.has(key))),
    );

    const inMemory = await scanned(gz, 64 * 1024 * 1024);
    // A 1 KiB ceiling forces the gunzip + token stream for this ~1.3 MB document.
    const streamed = await scanned(gz, 1024);

    expect(inMemory).toEqual({ header, requests: expected });
    expect(streamed).toEqual({ header, requests: expected });
    // Exact doubles such as startNs survive the token path unchanged.
    expect(streamed.header.startNs).toBe(timeline.startNs);
  });

  it('rejects corrupt gzip on the streaming path', async () => {
    const gz = await gzipRequestTimeline(largeTimeline(500));
    const corrupted = Buffer.from(gz);
    const middle = Math.floor(corrupted.length / 2);
    corrupted.writeUInt8(corrupted.readUInt8(middle) ^ 255, middle);

    await expect(scanned(corrupted, 1024)).rejects.toThrow();
    await expect(scanned(corrupted, 64 * 1024 * 1024)).rejects.toThrow();
  });
});

describe('scanRequestTimelineText', () => {
  it('reads PostgreSQL-style JSONB text split at arbitrary points', async () => {
    // jsonb::text orders keys by length and puts spaces after separators.
    const text =
      '{"endNs": 2000, "startNs": 1000, "version": 6, "requests": [' +
      '{"ad": 0, "cid": "trace-018", "end": 900, "isl": 128, "osl": null, "ttftMs": 42.5, "cancelled": false},' +
      '{"ad": 1, "cid": "trace-018", "end": 1900, "isl": null, "osl": 16, "nested": {"isl": 7}, "cancelled": true}' +
      '], "durationS": 0.000001}';
    const requests: ScannedRequest[] = [];

    const header = await scanRequestTimelineText(
      textChunks(text, 7),
      new Set(['isl', 'osl', 'cancelled']),
      (request) => {
        requests.push(request);
      },
    );

    expect(header).toEqual({ endNs: 2000, startNs: 1000, version: 6, durationS: 0.000001 });
    expect(requests).toEqual([
      { isl: 128, osl: null, cancelled: false },
      { isl: null, osl: 16, cancelled: true },
    ]);
  });

  it.each([
    ['a document without requests', '{"version":6}', 'has no requests array'],
    ['a non-object request', '{"version":6,"requests":[1]}', 'not an object'],
    ['an array request', '{"version":6,"requests":[[]]}', 'not an object'],
    ['truncated JSON', '{"version":6,"requests":[{"isl":1}', 'Parser cannot parse input'],
  ])('rejects %s', async (_label, text, message) => {
    await expect(
      scanRequestTimelineText(textChunks(text, 5), new Set(['isl']), () => {}),
    ).rejects.toThrow(message);
  });
});
