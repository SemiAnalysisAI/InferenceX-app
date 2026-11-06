import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache/content-blob', () => ({
  contentBlobKeyOf: (namespace: string, inputs: string[]) => `${namespace}|${inputs.join(',')}`,
  contentBlobRedirect: vi.fn(),
  cachedJsonStoringContentBlob: vi.fn((_request: Request, data: unknown) => Response.json(data)),
}));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
vi.mock('@semianalysisai/inferencex-db/queries/request-timeline', () => ({
  getCurrentRequestTimelineSha256s: vi.fn(),
}));
vi.mock('@semianalysisai/inferencex-db/queries/trace-histograms', () => ({
  getTraceHistograms: vi.fn(),
}));

import { getCurrentRequestTimelineSha256s } from '@semianalysisai/inferencex-db/queries/request-timeline';
import { getTraceHistograms } from '@semianalysisai/inferencex-db/queries/trace-histograms';
import { cachedJsonStoringContentBlob, contentBlobRedirect } from '@/lib/cache/content-blob';
import { CACHE_KEY_PREFIX, GET } from './route';

const request = (ids: string) =>
  new NextRequest(`http://localhost/api/v1/trace-histograms?ids=${ids}`, {
    headers: { 'Accept-Encoding': 'gzip' },
  });
const point = (id: number) => ({ id, isl: [id], osl: [id + 1] });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(contentBlobRedirect).mockResolvedValue(null);
});

describe('trace histograms route', () => {
  it('redirects to the blob named by every point and its timeline digest', async () => {
    const redirect = new Response(null, { status: 307 });
    vi.mocked(getCurrentRequestTimelineSha256s).mockResolvedValue(
      new Map([
        [9, 'b'],
        [2, 'a'],
      ]),
    );
    vi.mocked(contentBlobRedirect).mockResolvedValue(redirect);
    expect(await GET(request('9,2'))).toBe(redirect);
    expect(vi.mocked(contentBlobRedirect).mock.calls[0]?.[1]).toBe(`${CACHE_KEY_PREFIX}|2:a,9:b`);
    expect(getTraceHistograms).not.toHaveBeenCalled();
  });

  it('stores a complete response under that key', async () => {
    vi.mocked(getCurrentRequestTimelineSha256s).mockResolvedValue(
      new Map([
        [2, 'a'],
        [9, 'b'],
      ]),
    );
    vi.mocked(getTraceHistograms).mockResolvedValue({ 2: point(2), 9: point(9) });
    const response = await GET(request('2,9,40'));
    expect(await response.json()).toEqual({ 2: point(2), 9: point(9) });
    expect(vi.mocked(cachedJsonStoringContentBlob).mock.calls[0]?.[2]).toBe(
      `${CACHE_KEY_PREFIX}|2:a,9:b`,
    );
  });

  it('does not store a response that omits a readable point', async () => {
    vi.mocked(getCurrentRequestTimelineSha256s).mockResolvedValue(
      new Map([
        [2, 'a'],
        [9, 'b'],
      ]),
    );
    vi.mocked(getTraceHistograms).mockResolvedValue({ 2: point(2) });
    await GET(request('2,9'));
    expect(vi.mocked(cachedJsonStoringContentBlob).mock.calls[0]?.[2]).toBeNull();
  });

  it('computes without a key when a point has no current digest', async () => {
    vi.mocked(getCurrentRequestTimelineSha256s).mockResolvedValue(
      new Map([
        [2, 'a'],
        [9, null],
      ]),
    );
    vi.mocked(getTraceHistograms).mockResolvedValue({ 2: point(2), 9: point(9) });
    await GET(request('2,9'));
    expect(contentBlobRedirect).not.toHaveBeenCalled();
    expect(vi.mocked(cachedJsonStoringContentBlob).mock.calls[0]?.[2]).toBeNull();
  });

  it('keeps the shared ids validation and error contract', async () => {
    const missingIds = await GET(new NextRequest('http://localhost/api/v1/trace-histograms'));
    expect(missingIds.status).toBe(400);
    vi.mocked(getCurrentRequestTimelineSha256s).mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await GET(request('2'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
