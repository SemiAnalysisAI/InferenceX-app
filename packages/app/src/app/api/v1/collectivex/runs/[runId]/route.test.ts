import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockLoad } = vi.hoisted(() => ({ mockLoad: vi.fn() }));

vi.mock('@/lib/collectivex/snapshot', () => ({ loadCollectiveXSnapshot: mockLoad }));

import { NextRequest } from 'next/server';

import * as route from './route';

const dataset = makeCollectiveXDataset();
const runId = dataset.run.run_id;

function get(url: string, id: string) {
  return route.GET(new NextRequest(new URL(url, 'http://localhost')), {
    params: Promise.resolve({ runId: id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockLoad.mockResolvedValue({ summary: buildRunSummary(dataset), dataset });
});

describe('GET /api/v1/collectivex/runs/[runId]', () => {
  it('returns 400 for malformed version or run id', async () => {
    const badRunId = await get(`/x?version=1`, 'abc');
    const badVersion = await get(`/x?version=99`, runId);
    expect(badRunId.status).toBe(400);
    expect(badVersion.status).toBe(400);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('serves the snapshot dataset for its run id', async () => {
    const res = await get(`/x?version=1`, runId);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=86400');
    const body = await new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))).json();
    expect(body).toEqual(dataset);
  });

  it('returns 404 for any other run or contract version', async () => {
    const otherRun = await get(`/x?version=1`, '999');
    expect(otherRun.status).toBe(404);
    mockLoad.mockResolvedValue({
      summary: buildRunSummary(dataset),
      dataset: { ...dataset, version: 2 },
    });
    const otherVersion = await get(`/x?version=1`, runId);
    expect(otherVersion.status).toBe(404);
  });

  it('returns 503 when the deployment has no snapshot', async () => {
    mockLoad.mockResolvedValue(null);
    const res = await get(`/x?version=1`, runId);
    expect(res.status).toBe(503);
  });

  it('returns 500 without leaking details when the snapshot is unreadable', async () => {
    mockLoad.mockRejectedValue(new Error('boom'));
    const res = await get(`/x?version=1`, runId);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('exposes no deletion handler', () => {
    expect(Object.keys(route)).not.toContain('DELETE');
  });
});
