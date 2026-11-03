import { gzipSync, gunzipSync } from 'node:zlib';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: vi.fn() }));
vi.mock('@/lib/cache/blob-cache', () => ({
  blobEnabled: () => false,
  blobGet: vi.fn(() => Promise.resolve(null)),
  blobSet: vi.fn(),
}));
vi.mock('@/lib/cache/content-blob', () => ({
  contentBlobKey: (namespace: string, sha256: string) => `${namespace}/${sha256}.json.gz`,
  contentBlobRedirect: vi.fn(),
  copyingToContentBlob: vi.fn(),
}));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: () => ({}),
  FIXTURES_MODE: false,
}));
vi.mock('@semianalysisai/inferencex-db/queries/request-timeline', () => ({
  getStoredRequestTimelineGz: vi.fn(),
  getRequestTimeline: vi.fn(),
}));

import {
  getStoredRequestTimelineGz,
  getRequestTimeline,
} from '@semianalysisai/inferencex-db/queries/request-timeline';
import { contentBlobRedirect, copyingToContentBlob } from '@/lib/cache/content-blob';
import { GET } from './route';

const request = (query: string, acceptEncoding = 'gzip') =>
  new NextRequest(`http://localhost/api/v1/request-timeline${query}`, {
    headers: { 'Accept-Encoding': acceptEncoding },
  });
beforeEach(() => vi.resetAllMocks());

function stored(gz: Buffer, sha256: string | null = null) {
  let pulled = false;
  const chunks = (async function* () {
    pulled = true;
    yield gz;
  })();
  return { value: { sha256, byteLength: gz.length, chunks }, pulled: () => pulled };
}

describe('request timeline route', () => {
  it('serves stored gzip unchanged without materializing the timeline', async () => {
    const gz = gzipSync(
      JSON.stringify({ requests: [{ cid: 'full-record', srcTrace: 'source', ack: null }] }),
    );
    vi.mocked(getStoredRequestTimelineGz).mockResolvedValue(stored(gz).value);
    const response = await GET(request('?id=445162'));
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(gz)).toBe(true);
    expect(getRequestTimeline).not.toHaveBeenCalled();
    expect(contentBlobRedirect).not.toHaveBeenCalled();
  });

  it('decompresses stored gzip for clients that do not accept it', async () => {
    const timeline = { requests: [{ cid: 'full-record', srcTrace: 'source', ack: null }] };
    vi.mocked(getStoredRequestTimelineGz).mockResolvedValue(
      stored(gzipSync(JSON.stringify(timeline))).value,
    );
    const response = await GET(request('?id=445162', 'identity'));
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(await response.json()).toEqual(timeline);
  });

  it('redirects to the content blob of the stored digest without reading the gzip', async () => {
    const point = stored(gzipSync('{}'), 'ab12');
    const redirect = new Response(null, { status: 307 });
    vi.mocked(getStoredRequestTimelineGz).mockResolvedValue(point.value);
    vi.mocked(contentBlobRedirect).mockResolvedValue(redirect);
    const response = await GET(request('?id=445162'));
    expect(response).toBe(redirect);
    expect(vi.mocked(contentBlobRedirect).mock.calls[0]?.[1]).toBe(
      'request-timeline-gz/ab12.json.gz',
    );
    expect(point.pulled()).toBe(false);
    expect(copyingToContentBlob).not.toHaveBeenCalled();
  });

  it('streams through a verified copy while the content blob is missing', async () => {
    const gz = gzipSync('{"requests":[]}');
    const point = stored(gz, 'ab12');
    vi.mocked(getStoredRequestTimelineGz).mockResolvedValue(point.value);
    vi.mocked(contentBlobRedirect).mockResolvedValue(null);
    vi.mocked(copyingToContentBlob).mockImplementation((chunks) => chunks);
    const response = await GET(request('?id=445162'));
    expect(Buffer.from(await response.arrayBuffer()).equals(gz)).toBe(true);
    expect(copyingToContentBlob).toHaveBeenCalledWith(
      point.value.chunks,
      'request-timeline-gz/ab12.json.gz',
      'ab12',
    );
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
