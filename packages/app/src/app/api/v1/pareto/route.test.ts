import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/benchmarks/benchmarks-endpoint.server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadBenchmarks: load,
}));
vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: unknown) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));
import { GET } from './route';
import { PUBLIC_API_ERRORS } from '@/lib/api/public-api-errors';

const query =
  'model=DeepSeek-R1-0528&rawModel=dsr1&sequence=1k%2F1k&xMetric=x&yMetric=y&xDirection=max&yDirection=max';
const request = (suffix = '') =>
  new NextRequest(`https://example.test/api/v1/pareto?${query}${suffix}`);
beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/pareto', () => {
  it('computes both boundaries from the raw endpoint rows', async () => {
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
    load.mockResolvedValue(rows);
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.frontier[0].observations).toEqual([rows[1]]);
    expect(body.hinterland[0].observations).toEqual([rows[0]]);
  });

  it('forwards only source selectors and returns both boundaries', async () => {
    load.mockResolvedValue([
      {
        id: 1,
        model: 'dsr1',
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        hardware: 'h200_sxm',
        metrics: { x: 1, y: 1 },
      },
      {
        id: 2,
        model: 'dsr1',
        benchmark_type: 'single_turn',
        isl: 1024,
        osl: 1024,
        hardware: 'h200_sxm',
        metrics: { x: 2, y: 3 },
      },
    ]);
    const response = await GET(request('&runId=123&exactRun=true&hardware=h200_sxm'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.frontier[0].observations[0].id).toBe(2);
    expect(body.hinterland[0].observations[0].id).toBe(1);
    expect(body.source_url).toBe(
      '/api/v1/benchmarks?model=DeepSeek-R1-0528&runId=123&exactRun=true',
    );
    expect(load).toHaveBeenCalledExactlyOnceWith({
      dbModelKeys: ['dsr1'],
      date: undefined,
      exact: false,
      runId: '123',
      exactRun: true,
      view: undefined,
      sequence: '',
      powerValid: null,
    });
  });

  it.each(['&i_hinterland=2', '&i_frontier=1'])(
    'rejects chart share param %s before querying',
    async (suffix) => {
      const response = await GET(request(suffix));
      expect(response.status).toBe(400);
      expect(load).not.toHaveBeenCalled();
    },
  );

  it('maps source failures to the public internal error instead of empty boundaries', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    load.mockRejectedValue(new Error('offline'));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: PUBLIC_API_ERRORS.internal });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
