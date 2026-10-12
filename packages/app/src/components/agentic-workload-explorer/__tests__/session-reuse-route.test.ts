import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSessionReusePayload,
  sessionReuseWindow,
} from '@semianalysisai/inferencex-db/proxytrace/shared/session-reuse';
const mocks = vi.hoisted(() => ({ read: vi.fn(), vis: [] as string[] | null }));
vi.mock('@/lib/agentic-workload-explorer/api', () => ({
  CDN_CACHE_CONTROL: 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
  withExplorerRoute:
    (handler: (ctx: { req: unknown; vis: string[] | null }) => Promise<Response>) =>
    (req: unknown) =>
      handler({ req, vis: mocks.vis }),
}));
vi.mock('@semianalysisai/inferencex-db/proxytrace/stats', () => ({
  readStatsCache: mocks.read,
  statsCacheKey: (kind: string, vis: string[] | null, tv: number | null) =>
    `${kind}:${vis === null ? 'all' : 'anon'}:${tv ?? 'all'}`,
}));
import { GET } from '@/app/api/v1/agentic-workload-explorer/session-reuse/route';
const request = (query = '') =>
  ({ nextUrl: new URL(`https://test/api/session-reuse${query}`) }) as Parameters<typeof GET>[0];
const payload = buildSessionReusePayload(
  [],
  sessionReuseWindow(new Date('2026-09-21T00:00:00Z')),
  7,
  'anon',
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.vis = [];
  mocks.read.mockResolvedValue({ data: payload, cachedAt: new Date() });
});

describe('cache-only session reuse endpoint', () => {
  it('reports a missing snapshot row as permanently unavailable', async () => {
    mocks.read.mockResolvedValue(null);
    const r = await GET(request('?version=7'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ warming: true });
    expect(r.headers.get('Retry-After')).toBeNull();
  });
  it('reports missing analytics storage without a live-query fallback', async () => {
    mocks.read.mockResolvedValue('missing-table');
    const r = await GET(request());
    expect(await r.json()).toEqual({ setupRequired: true });
  });
  it('serves the snapshot row for the requested scope', async () => {
    mocks.vis = null;
    const r = await GET(request('?version=7&days=1,2,7,28'));
    expect(mocks.read).toHaveBeenCalledWith('session-reuse:all:7');
    const body = await r.json();
    expect(body.cohorts[0].points.map((p: { days: number }) => p.days)).toEqual([1, 2, 7, 28]);
    expect(r.headers.get('Cache-Control')).toContain('s-maxage');
  });
  it('exports CSV from the snapshot row', async () => {
    const r = await GET(request('?format=csv&days=7,14'));
    expect(r.headers.get('Content-Type')).toContain('text/csv');
    expect(r.headers.get('Content-Disposition')).toContain('session-reuse.csv');
    const csv = await r.text();
    expect(csv.split('\r\n')).toHaveLength(10);
  });
  it('rejects invalid thresholds and unsupported model/format filters before reading cache', async () => {
    for (const q of [
      '?days=0',
      '?days=29',
      '?days=1.2',
      '?days=1,',
      '?format=xlsx',
      '?model=test',
    ]) {
      const response = await GET(request(q));
      expect(response.status).toBe(400);
    }
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
