import { gzipSync, gunzipSync } from 'node:zlib';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: vi.fn() }));
vi.mock('@/lib/cache/blob-cache', () => ({
  blobGet: vi.fn(() => Promise.resolve(null)),
  blobSet: vi.fn(),
}));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
vi.mock('@semianalysisai/inferencex-db/queries/request-timeline', () => ({
  getStoredRequestTimelineGz: vi.fn(),
  getRequestTimeline: vi.fn(),
}));

import {
  getStoredRequestTimelineGz,
  getRequestTimeline,
} from '@semianalysisai/inferencex-db/queries/request-timeline';
import { GET } from './route';

const request = (query: string, acceptEncoding = 'gzip') =>
  new NextRequest(`http://localhost/api/v1/request-timeline${query}`, {
    headers: { 'Accept-Encoding': acceptEncoding },
  });
beforeEach(() => vi.resetAllMocks());

describe('request timeline route', () => {
  it('serves stored gzip unchanged without materializing the timeline', async () => {
    const gz = gzipSync(
      JSON.stringify({ requests: [{ cid: 'full-record', srcTrace: 'source', ack: null }] }),
    );
    vi.mocked(getStoredRequestTimelineGz).mockResolvedValue(
      (async function* () {
        yield gz;
      })(),
    );
    const response = await GET(request('?id=445162'));
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(gz)).toBe(true);
    expect(getRequestTimeline).not.toHaveBeenCalled();
  });

  it('decompresses stored gzip for clients that do not accept it', async () => {
    const timeline = { requests: [{ cid: 'full-record', srcTrace: 'source', ack: null }] };
    vi.mocked(getStoredRequestTimelineGz).mockResolvedValue(
      (async function* () {
        yield gzipSync(JSON.stringify(timeline));
      })(),
    );
    const response = await GET(request('?id=445162', 'identity'));
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(await response.json()).toEqual(timeline);
  });

  it('preserves the legacy fallback and its missing-point status', async () => {
    vi.mocked(getStoredRequestTimelineGz).mockResolvedValue(null);
    vi.mocked(getRequestTimeline).mockResolvedValue(null);
    const response = await GET(request('?id=123'));
    expect(response.status).toBe(404);
  });

  it('preserves the complete legacy response', async () => {
    const timeline = { version: 1, startNs: 1, endNs: 2, durationS: 1e-9, requests: [] };
    vi.mocked(getStoredRequestTimelineGz).mockResolvedValue(null);
    vi.mocked(getRequestTimeline).mockResolvedValue(timeline);
    const response = await GET(request('?id=123'));
    expect(JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString())).toEqual(
      timeline,
    );
  });

  it.each(['', '?id=0', '?id=-1', '?id=1.5', '?id=9007199254740992'])(
    'rejects invalid ids before database access: %s',
    async (query) => {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(getStoredRequestTimelineGz).not.toHaveBeenCalled();
      expect(getRequestTimeline).not.toHaveBeenCalled();
    },
  );
});
