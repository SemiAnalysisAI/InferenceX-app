import { compareMetrics } from '@/components/video-benchmark/compare';
import { resolveCompareSelection } from '@/components/video-benchmark/compare-url-state';
import { concurrencyPlateau, powerUtilization } from '@/components/video-benchmark/evidence';
import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';
import { metricValue } from '@/components/video-benchmark/metrics';
import { listedVideoCells, plotVideoPoints } from '@/components/video-benchmark/plot';
import { dashboardCells, videoPoints } from '@/components/video-benchmark/points';
import { servingFixture } from '@/components/video-benchmark/serving.fixture';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import {
  metricOptions,
  readVideoDashboardState,
} from '@/components/video-benchmark/video-url-state';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const source = vi.hoisted(() => vi.fn());
vi.mock('@/app/api/video-runs/route', () => ({ GET: source }));

const observation: VideoHistoryObservation = {
  id: 'h200:c1',
  cell: 'c1',
  hardware: 'NVIDIA H200',
  concurrency: 1,
  runtime: 'frozen-runtime',
  workload: '1344x768 · 8s · 24fps · 50 steps · MiniMax-H3',
  workloadKey: 'frozen-workload',
  model: 'MiniMaxAI/MiniMax-H3',
  status: 'complete',
  valid: 20,
  completed: 20,
  scheduled: 20,
  failed: 0,
  samples: 20,
  p50: 100,
  p90: 110,
  clipsGpuHour: 5,
  energyKj: 400,
  participating: 4,
  allocated: 8,
  replicas: 1,
  wallSeconds: 3600,
  durationSeconds: 8,
  frameCount: 192,
  avgPowerW: 2000,
  enforcedLimitW: 2800,
  server: { tp: 2, ulysses: 2, attention: 'auto' },
};

function page(observations: VideoHistoryObservation[], nextPage: number | null): VideoHistoryPage {
  return {
    schemaVersion: 1,
    nextPage,
    entries: [
      {
        id: '123.456',
        runId: '123',
        publishedAt: '2026-09-20T00:00:00Z',
        error: null,
        artifact: {
          id: 456,
          name: 'h3-video-123-1',
          expired: false,
          stored: true,
          size_in_bytes: 1,
        },
        sources: [
          {
            id: '123',
            sha256: 'a'.repeat(64),
            sourceSha: 'b'.repeat(40),
            hardware: 'NVIDIA H200',
            execution: 'complete',
            observedAt: '2026-09-19T00:00:00Z',
            kind: 'observation',
            observations,
            fidelity: null,
            calibration: null,
            releaseQualified: false,
            error: null,
          },
        ],
      },
    ],
  };
}

const pages = [
  page(
    [
      observation,
      {
        ...observation,
        id: 'h200:8g',
        participating: 8,
        p50: 130,
        p90: 140,
        server: { tp: 2, ulysses: 4, attention: 'auto' },
      },
      { ...observation, id: 'h200:c2', cell: 'c2', concurrency: 2, p50: 200, p90: 210 },
      {
        ...observation,
        id: 'smoke:c1',
        hardware: 'NVIDIA B200',
        samples: 3,
        workload: 'short smoke',
        workloadKey: 'short-smoke',
        p90: null,
      },
    ],
    2,
  ),
  page(
    [
      {
        ...observation,
        id: 'h100:c1',
        hardware: 'NVIDIA H100 80GB HBM3',
        p50: 120,
        p90: 130,
        wallSeconds: 4000,
      },
      { ...observation, p50: 999, p90: 999 }, // older re-export must not replace the first
    ],
    null,
  ),
];
const request = (query = '') => new NextRequest(`https://example.test/api/v1/views/video?${query}`);

beforeEach(() => {
  source.mockReset();
  source.mockImplementation((req: NextRequest) => {
    if (req.nextUrl.searchParams.get('format') === 'history')
      return Response.json(pages[Number(req.nextUrl.searchParams.get('page')) - 1]);
    return new Response(null, { status: 204 });
  });
});

describe('published VideoGenX dashboard projection', () => {
  it('defaults to the current dashboard, reads history pages and preserves numerical parity', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    const state = readVideoDashboardState('');
    const { cells } = dashboardCells(videoPoints(pages));
    const options = metricOptions(state);
    expect(body.params.view).toBe('dashboard');
    expect(body.coverage).toEqual({ pagesRead: 2, maxPages: 5, nextPage: null, truncated: false });
    expect(body.plot).toEqual(plotVideoPoints(cells, state, () => '', new Set()));
    expect(body.rows.map((row: { point: { id: string } }) => row.point.id)).toEqual(
      listedVideoCells(cells, state, new Set()).map((p) => p.id),
    );
    expect(
      body.rows.find((row: { point: { id: string } }) => row.point.id === 'h200:c1').metrics,
    ).toMatchObject({
      p50Latency: 100,
      p90Latency: 110,
      videosPerGpuHour: 5,
      dollarsPerVideo: metricValue(
        cells.find((p) => p.id === 'h200:c1')!,
        'dollarsPerVideo',
        options,
      ),
    });
    expect(body.evidence.power).toEqual(powerUtilization(cells));
    expect(body.evidence.plateau).toEqual(concurrencyPlateau(cells));
    expect(body.comparison.cases.status).toBe('not-requested');
    expect(source).toHaveBeenCalledTimes(2);
    expect(
      source.mock.calls.every(([req]) => req.nextUrl.searchParams.get('format') === 'history'),
    ).toBe(true);
  });

  it('shares axis, tier, optimal, API price, compare and hardware-filter semantics with the UI', async () => {
    const query =
      'v_x=p50Latency&v_y=dollarsPerVideo&v_tier=r&v_optimal=0&v_api=0.08&v_hidden=h100&v_base=h200&v_cand=h100&v_case=3';
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    const body = await response.json();
    const state = readVideoDashboardState(query);
    const { cells } = dashboardCells(videoPoints(pages));
    const options = metricOptions(state);
    expect(body.plot).toEqual(plotVideoPoints(cells, state, () => '', new Set(['h100'])));
    expect(body.rows.map((row: { point: { id: string } }) => row.point.id)).toEqual([
      'h200:c1',
      'h200:8g',
    ]);
    expect(
      body.rows.every(
        (row: { metrics: { apiPricePerVideo: number } }) => row.metrics.apiPricePerVideo === 0.64,
      ),
    ).toBe(true);
    const pair = resolveCompareSelection(
      { baseline: 'h200', candidate: 'h100', caseIndex: 3 },
      cells,
    );
    expect(body.comparison.metrics).toEqual(
      compareMetrics(pair.baseline!, pair.candidate!, options),
    );
    expect(body.params).toMatchObject({
      hidden: ['h100'],
      baseline: 'h200',
      candidate: 'h100',
      caseIndex: 3,
    });
    expect(
      body.kpis.find((row: { hardwareKey: string }) => row.hardwareKey === 'h100').point,
    ).not.toBeNull();
    expect(body.evidence.power).toEqual(powerUtilization(cells));
  });

  it('reports the same five-page bound and never silently presents truncated history as complete', async () => {
    source.mockImplementation((req: NextRequest) =>
      Response.json(page([], Number(req.nextUrl.searchParams.get('page')) + 1)),
    );
    const response = await GET(request());
    const body = await response.json();
    expect(source).toHaveBeenCalledTimes(5);
    expect(body.coverage).toEqual({ pagesRead: 5, maxPages: 5, nextPage: 6, truncated: true });
    expect(body.rows).toEqual([]);
  });

  it('keeps missing published comparison media distinct from an empty successful matched case list', async () => {
    const response = await GET(request('view=compare&v_base=h200&v_cand=h100&v_case=8'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.comparison.cases).toMatchObject({
      status: 'not-published',
      selected: null,
      resolvedCaseIndex: 0,
    });
    expect(
      source.mock.calls.filter(([req]) => req.nextUrl.searchParams.get('format') === 'published'),
    ).toHaveLength(1);
  });

  it('pairs published cases, clamps the requested index and excludes asset URLs and raw documents', async () => {
    const fixture = servingFixture();
    fixture.documents.set('manifest.json', fixture.manifest);
    fixture.documents.set('ci.json', fixture.ci);
    fixture.checksums.set('manifest.json', 'a'.repeat(64));
    const saved: StoredArtifact = {
      storageVersion: 1,
      runId: '123',
      artifact: { id: 456, name: 'published', expired: false, size_in_bytes: 1 },
      sources: [
        {
          id: '123',
          documents: [...fixture.documents],
          checksums: [...fixture.checksums],
          texts: [],
          assets: [
            [
              'gpu/c1/baseline/artifacts/measurement-r001-c001.mp4',
              {
                url: 'https://private.test/secret-token',
                downloadUrl: 'https://private.test/download',
              },
            ],
          ],
        },
      ],
    };
    source.mockImplementation((req: NextRequest) =>
      Response.json(
        req.nextUrl.searchParams.get('format') === 'published'
          ? saved
          : pages[Number(req.nextUrl.searchParams.get('page')) - 1],
      ),
    );
    const response = await GET(request('view=compare&v_case=9999'));
    const body = await response.json();
    expect(body.comparison.cases).toMatchObject({
      status: 'ready',
      count: 4,
      resolvedCaseIndex: 3,
      unmatched: { baseline: 0, candidate: 0 },
      selected: {
        repetition: 3,
        baseline: { slotId: 'measurement-r004-c001', seconds: 120 },
        candidate: { slotId: 'measurement-r004-c001', seconds: 120 },
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/private\.test|secret-token|\/runtime\/sglang/);
    expect(body.comparison.cases.selected.baseline.mediaPath).toBe(
      'gpu/c1/baseline/artifacts/measurement-r004-c001.mp4',
    );
  });

  it('retains explicit discovery and treats media read failure as unavailable, not zero pairs', async () => {
    source.mockImplementation(() => Response.json({ runs: [] }));
    const discoveryResponse = await GET(request('view=discovery&page=2'));
    const discovery = await discoveryResponse.json();
    expect(discovery.discovery).toEqual({ runs: [] });
    expect(source.mock.calls[0][0].nextUrl.searchParams.get('page')).toBe('2');
    source.mockImplementation((req: NextRequest) =>
      req.nextUrl.searchParams.get('format') === 'published'
        ? Response.json({ error: 'secret-token' }, { status: 503 })
        : Response.json(pages[Number(req.nextUrl.searchParams.get('page')) - 1]),
    );
    const compareResponse = await GET(request('view=compare'));
    const body = await compareResponse.json();
    expect(body.comparison.cases.status).toBe('unavailable');
    expect(body.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('secret-token');
  });

  it('rejects mixed modes and strips source errors instead of leaking private details', async () => {
    for (const query of [
      'view=dashboard&run=123',
      'run=123&v_x=p50Latency',
      'page=2',
      'v_hidden=h100&v_hidden=h200',
    ]) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
    }
    source.mockImplementation(() =>
      Response.json({ error: 'secret-token https://private.test' }, { status: 503 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Source data unavailable' });
  });
});
