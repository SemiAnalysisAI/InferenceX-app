import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { mocked } from '@/test/helpers';

mock.module('@/lib/cache/content-blob', () => ({
  contentBlobKey: (namespace: string, sha256: string) => `${namespace}/${sha256}.json.gz`,
  contentBlobRedirect: vi.fn(),
  cachedJsonStoringContentBlob: vi.fn((_request: Request, data: unknown) => Response.json(data)),
}));
mock.module('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
mock.module('@semianalysisai/inferencex-db/queries/request-timeline', () => ({
  getCurrentRequestTimelineSha256s: vi.fn(),
}));
mock.module('@semianalysisai/inferencex-db/queries/request-chart-data', () => ({
  REQUEST_CHART_DATA_VERSION: 602,
  getRequestChartData: vi.fn(),
}));

import { getRequestChartData } from '@semianalysisai/inferencex-db/queries/request-chart-data';
import { getCurrentRequestTimelineSha256s } from '@semianalysisai/inferencex-db/queries/request-timeline';
import { cachedJsonStoringContentBlob, contentBlobRedirect } from '@/lib/cache/content-blob';
import { GET } from './route';

const request = (query: string) =>
  new NextRequest(`http://localhost/api/v1/request-chart-data${query}`, {
    headers: { 'Accept-Encoding': 'gzip' },
  });
const chart = { version: 602, requests: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocked(contentBlobRedirect).mockResolvedValue(null);
  mocked(getCurrentRequestTimelineSha256s).mockResolvedValue(new Map([[7, 'ab12']]));
});

describe('request chart data route', () => {
  it('redirects to the content blob of the timeline digest without decoding', async () => {
    const redirect = new Response(null, { status: 307 });
    mocked(contentBlobRedirect).mockResolvedValue(redirect);
    expect(await GET(request('?id=7'))).toBe(redirect);
    expect(mocked(contentBlobRedirect).mock.calls[0]?.[1]).toBe(
      'request-chart-data-v602/ab12.json.gz',
    );
    expect(getRequestChartData).not.toHaveBeenCalled();
  });

  it('serves and stores the payload while the blob is missing', async () => {
    mocked(getRequestChartData).mockResolvedValue(chart as never);
    const response = await GET(request('?id=7'));
    expect(await response.json()).toEqual(chart);
    expect(mocked(cachedJsonStoringContentBlob).mock.calls[0]?.[2]).toBe(
      'request-chart-data-v602/ab12.json.gz',
    );
  });

  it('stores nothing for a point without a current digest', async () => {
    mocked(getCurrentRequestTimelineSha256s).mockResolvedValue(new Map([[7, null]]));
    mocked(getRequestChartData).mockResolvedValue(chart as never);
    await GET(request('?id=7'));
    expect(contentBlobRedirect).not.toHaveBeenCalled();
    expect(mocked(cachedJsonStoringContentBlob).mock.calls[0]?.[2]).toBeNull();
  });

  it.each([
    ['?id=0', null, 400],
    ['?id=7', 'missing', 404],
    ['?id=7', 'failing', 500],
  ] as const)('keeps the single-id status contract for %s (%s)', async (query, data, status) => {
    if (data === 'missing') mocked(getRequestChartData).mockResolvedValue(null);
    if (data === 'failing') {
      mocked(getRequestChartData).mockRejectedValue(new Error('boom'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
    }
    const response = await GET(request(query));
    expect(response.status).toBe(status);
  });
});
