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

function body(response: Response): Promise<unknown> {
  return new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).json();
}

const dataset = makeCollectiveXDataset();
const summary = buildRunSummary(dataset);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockLoad.mockResolvedValue({ summary, dataset });
});

describe('GET /api/v1/collectivex/runs', () => {
  it('returns 400 for a missing or unknown version', async () => {
    for (const url of ['/api/v1/collectivex/runs', '/api/v1/collectivex/runs?version=abc']) {
      const res = await GET(req(url));
      expect(res.status).toBe(400);
    }
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('lists the snapshot run as a complete discovery result', async () => {
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=86400');
    expect(await body(res)).toEqual({ version: 1, runs: [summary], discovery_complete: true });
  });

  it('returns an empty complete list when the snapshot has another contract version', async () => {
    mockLoad.mockResolvedValue({ summary, dataset: { ...dataset, version: 2 } });
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ version: 1, runs: [], discovery_complete: true });
  });

  it('returns 503 when the deployment has no snapshot', async () => {
    mockLoad.mockResolvedValue(null);
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(503);
  });

  it('returns 500 without leaking details when the snapshot is unreadable', async () => {
    mockLoad.mockRejectedValue(new Error('boom'));
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
