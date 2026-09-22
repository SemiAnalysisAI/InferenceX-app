import {
  chartPoints,
  collectiveXSeriesForRun,
  seriesMatchesSelection,
} from '@/components/collectivex/data';
import { makeCollectiveXDataset } from '@/components/collectivex/test-fixture';
import { Model } from '@/lib/data-mappings';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as collective } from './collectivex/route';
import { GET as images } from './current-inferencex-image/route';

const mocks = vi.hoisted(() => ({
  runs: vi.fn(),
  run: vi.fn(),
  images: vi.fn(),
  releases: vi.fn(),
}));
vi.mock('@/app/api/v1/collectivex/runs/route', () => ({ GET: mocks.runs }));
vi.mock('@/app/api/v1/collectivex/runs/[runId]/route', () => ({ GET: mocks.run }));
vi.mock('@/app/api/v1/latest-images/route', () => ({ GET: mocks.images }));
vi.mock('@/app/api/v1/framework-releases/route', () => ({ GET: mocks.releases }));
vi.mock('@/lib/api-cache', () => ({
  cachedJson: (data: unknown) => Response.json(data),
  cachedQuery: (fn: unknown) => fn,
}));
const request = (view: string, query: string) =>
  new NextRequest(`http://localhost/api/v1/views/${view}?${query}`);
const dataset = makeCollectiveXDataset();
const image = {
  model: 'dsv4',
  hardware: 'b200',
  framework: 'sglang',
  precision: 'fp8',
  spec_method: 'none',
  disagg: false,
  isl: null,
  osl: null,
  benchmark_type: 'agentic_traces',
  image: 'example:v1',
  date: '2026-09-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runs.mockImplementation(() =>
    Response.json({ runs: [dataset.run], discovery_complete: true }),
  );
  mocks.run.mockImplementation(() => Response.json(dataset));
  mocks.images.mockImplementation(() =>
    Response.json([image, { ...image, disagg: true, hardware: 'h200' }]),
  );
  mocks.releases.mockImplementation(() => Response.json({ sglang: 'v2' }));
});

describe('public evidence projections', () => {
  it('projects a nonempty EP selection with the dashboard percentile and axis calculation', async () => {
    const response = await collective(
      request(
        'collectivex',
        'runs=160&epSize=8&phase=decode&modes=normal&precision=fp8&operation=roundtrip&percentile=p95&yAxis=tokens-per-second',
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const series = collectiveXSeriesForRun(dataset.series, '160', 0).filter((item) =>
      seriesMatchesSelection(item, {
        epSize: 8,
        phase: 'decode',
        modes: ['normal'],
        precision: 'fp8',
      }),
    );
    expect(body.ep.points.length).toBeGreaterThan(0);
    expect(body.ep.points).toEqual(chartPoints(series, 'roundtrip', 'p95', 'tokens-per-second'));
    const hidden = await collective(
      request('collectivex', 'runs=160&activeSeries=none&kvSeries=none&swapSeries=none'),
    );
    const hiddenBody = await hidden.json();
    expect(hiddenBody.ep.points).toEqual([]);
    expect(hiddenBody.kv.points).toEqual([]);
    expect(hiddenBody.swap.points).toEqual([]);
  });

  it('filters image deployment, hardware, framework and date assumptions', async () => {
    const response = await images(
      request(
        'current-inferencex-image',
        `model=${Model.DeepSeek_V4_Pro}&hardware=b200&precision=fp8&frameworks=sglang&spec=none&sequence=agentic-traces&asOf=2026-09-19`,
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      hardware: 'b200',
      ageDays: 18,
      sequence: 'agentic-traces',
      outdated: true,
      staleAgentx: true,
    });
    const other = await images(
      request('current-inferencex-image', 'nodeType=disagg&hardware=h200&asOf=2026-09-19'),
    );
    const otherBody = await other.json();
    expect(otherBody.rows).toHaveLength(1);
    expect(otherBody.rows[0].disagg).toBe(true);
  });

  it('rejects malformed evidence selectors', async () => {
    for (const [view, handler, query] of [
      ['collectivex', collective, 'runs=9007199254740992'],
      ['collectivex', collective, 'runs=160&percentile=p10'],
      ['current-inferencex-image', images, 'asOf=2026-02-30'],
      ['current-inferencex-image', images, 'nodeType=private'],
    ] as const) {
      const response = await handler(request(view, query));
      expect(response.status).toBe(400);
    }
  });
});
