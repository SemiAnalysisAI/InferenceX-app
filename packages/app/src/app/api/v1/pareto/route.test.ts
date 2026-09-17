import { NextRequest } from 'next/server';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { raw } = vi.hoisted(() => ({ raw: vi.fn() }));
vi.mock('../benchmarks/route', () => ({ GET: raw }));
vi.mock('@/lib/api-cache', () => ({
  cachedJson: (data: unknown) =>
    Response.json(data, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=86400' } }),
}));
import { GET } from './route';

const query =
  'model=DeepSeek-R1-0528&rawModel=dsr1&sequence=1k%2F1k&xMetric=x&yMetric=y&xDirection=max&yDirection=max';
const request = (suffix = '') =>
  new NextRequest(`https://example.test/api/v1/pareto?${query}${suffix}`);
beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/pareto', () => {
  it('decodes the raw handler gzip stream before calculating boundaries', async () => {
    const rows = [
      {
        id: 1,
        model: 'dsr1',
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        metrics: { x: 1, y: 2 },
      },
      {
        id: 2,
        model: 'dsr1',
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        metrics: { x: 3, y: 4 },
      },
    ];
    raw.mockResolvedValue(
      new Response(gzipSync(JSON.stringify(rows)), {
        headers: { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' },
      }),
    );
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.frontier[0].observations).toEqual([rows[1]]);
    expect(body.hinterland[0].observations).toEqual([rows[0]]);
  });
  it('returns boundaries over raw rows and preserves source selectors', async () => {
    raw.mockResolvedValue(
      Response.json([
        {
          id: 1,
          model: 'dsr1',
          benchmark_type: 'single_turn',
          isl: 1024,
          osl: 1024,
          metrics: { x: 1, y: 1 },
        },
        {
          id: 2,
          model: 'dsr1',
          benchmark_type: 'single_turn',
          isl: 1024,
          osl: 1024,
          metrics: { x: 2, y: 3 },
        },
      ]),
    );
    const response = await GET(request('&runId=123&exactRun=true'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.frontier[0].observations[0].id).toBe(2);
    expect(body.hinterland[0].observations[0].id).toBe(1);
    expect(body.source_url).toBe(
      '/api/v1/benchmarks?model=DeepSeek-R1-0528&runId=123&exactRun=true',
    );
    expect(raw.mock.calls[0][0].nextUrl.pathname).toBe('/api/v1/benchmarks');
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=86400');
  });
  it('rejects invalid selectors before querying', async () => {
    const response = await GET(request('&i_hinterland=2'));
    expect(response.status).toBe(400);
    expect(raw).not.toHaveBeenCalled();
  });
  it('propagates source failures without returning fake empty boundaries', async () => {
    raw.mockResolvedValue(Response.json({ error: 'Internal server error' }, { status: 500 }));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
  it('catches unexpected source failures', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    raw.mockRejectedValue(new Error('offline'));
    const response = await GET(request());
    expect(response.status).toBe(500);
    log.mockRestore();
  });
});
