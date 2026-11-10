import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { buildDatasetFromNeutral } from '@semianalysisai/inferencex-db/collectivex/reader';
import {
  makeSwapDoc,
  swapMatrix,
  swapMeta,
} from '@semianalysisai/inferencex-db/collectivex/swap-test-fixture';
import { swapChartPoints, swapRangeBands } from '@/components/collectivex/swap-data';

const dataset = buildDatasetFromNeutral(swapMatrix, [makeSwapDoc()], swapMeta);

vi.mock('@/app/api/v1/collectivex/runs/route', () => ({
  GET: () =>
    Response.json({
      runs: [{ run_id: dataset.run.run_id, measured_cases: 1, requested_cases: 1 }],
      discovery_complete: true,
    }),
}));
vi.mock('@/app/api/v1/collectivex/runs/[runId]/route', () => ({
  GET: () => Response.json(dataset),
}));
vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Imported lazily: the mocks above read `dataset`, which a hoisted static import would precede.
const get = async (query: string) => {
  const { GET } = await import('./route');
  return GET(new NextRequest(new URL(`/api/v1/views/collectivex${query}`, 'http://localhost')));
};

describe('GET /api/v1/views/collectivex swap view', () => {
  it('defaults to the Best by SKU view and returns the dashboard bands', async () => {
    const res = await get('?swapPercentile=p90');
    const body = await res.json();
    expect(body.params).toMatchObject({ swapView: 'best', swapPercentile: 'p90' });
    const points = swapChartPoints([dataset], {
      direction: 'h2d',
      layout: 'contiguous',
      metric: 'bandwidth',
      percentile: 'p90',
    });
    expect(body.swap.points).toHaveLength(points.length);
    expect(body.swap.ranges).toEqual(swapRangeBands(points, 'bandwidth'));
    expect(body.swap.ranges.length).toBeGreaterThan(0);
    // Best and Range by SKU share the same bands; only the plotted value differs.
    const rangeRes = await get('?swapPercentile=p90&swapView=range');
    const range = await rangeRes.json();
    expect(range.params.swapView).toBe('range');
    expect(range.swap.ranges).toEqual(body.swap.ranges);
  });

  it('returns no bands for the series view and rejects an unknown view', async () => {
    const res = await get('?swapView=series');
    const body = await res.json();
    expect(body.params.swapView).toBe('series');
    expect(body.swap.ranges).toEqual([]);
    expect(body.swap.points.length).toBeGreaterThan(0);
    const bad = await get('?swapView=max');
    expect(bad.status).toBe(400);
  });
});
