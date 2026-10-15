import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockLoad } = vi.hoisted(() => ({ mockLoad: vi.fn() }));

vi.mock('@/lib/collectivex/snapshot', () => ({ loadCollectiveXSnapshot: mockLoad }));

import { NextRequest } from 'next/server';

import { GET } from './route';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

const dataset = makeCollectiveXDataset();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockLoad.mockResolvedValue({ summary: buildRunSummary(dataset), dataset });
});

describe('GET /api/v1/collectivex/latest', () => {
  it('returns 400 for a missing or unknown version', async () => {
    for (const url of ['/api/v1/collectivex/latest', '/api/v1/collectivex/latest?version=99']) {
      const res = await GET(req(url));
      expect(res.status).toBe(400);
    }
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('serves the snapshot dataset with the one-day CDN policy', async () => {
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=86400');
    const body = await new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))).json();
    expect(body).toEqual(dataset);
  });

  it('returns 404 when the snapshot has another contract version', async () => {
    mockLoad.mockResolvedValue({
      summary: buildRunSummary(dataset),
      dataset: { ...dataset, version: 2 },
    });
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 503 when the deployment has no snapshot', async () => {
    mockLoad.mockResolvedValue(null);
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Unavailable' });
  });

  it('returns 500 without leaking details when the snapshot is unreadable', async () => {
    mockLoad.mockRejectedValue(new Error('Unexpected token in /var/task/.collectivex'));
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
