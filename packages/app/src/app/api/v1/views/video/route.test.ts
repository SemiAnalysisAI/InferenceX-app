import { compareMetrics } from '@/components/video-benchmark/compare';
import { resolveCompareSelection } from '@/components/video-benchmark/compare-url-state';
import { concurrencyPlateau, powerUtilization } from '@/components/video-benchmark/evidence';
import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';
import { metricValue } from '@/components/video-benchmark/metrics';
import { listedVideoCells, plotVideoPoints } from '@/components/video-benchmark/plot';
import { dashboardCells, namedRunPoints, videoPoints } from '@/components/video-benchmark/points';
import { parseResultsState, resultProjection } from '@/components/video-benchmark/results';
import { servingFixture } from '@/components/video-benchmark/serving.fixture';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import {
  metricOptions,
  readVideoDashboardState,
} from '@/components/video-benchmark/video-url-state';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import retainedHistory from '../../../../../../cypress/fixtures/api/video-history.json';

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
        approved: true,
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

function storedServingArtifact(): StoredArtifact {
  const fixture = servingFixture();
  fixture.documents.set('manifest.json', fixture.manifest);
  fixture.documents.set('ci.json', fixture.ci);
  fixture.checksums.set('manifest.json', 'a'.repeat(64));
  return {
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
}

beforeEach(() => {
  source.mockReset();
  source.mockImplementation((req: NextRequest) => {
    if (req.nextUrl.searchParams.get('format') === 'history')
      return Response.json(pages[Number(req.nextUrl.searchParams.get('page')) - 1]);
    return new Response(null, { status: 204 });
  });
});

describe('published VideoGenX dashboard projection', () => {
  it('returns H100 in the shared roster and keeps its unapproved named projection isolated', async () => {
    const history = structuredClone(retainedHistory) as unknown as VideoHistoryPage;
    history.nextPage = null;
    source.mockImplementation(() => Response.json(history));
    const point = videoPoints([history]).find(
      (item) => item.hardwareKey === 'h100' && item.concurrency === 1,
    )!;
    const officialResponse = await GET(request('view=overview'));
    const official = await officialResponse.json();
    expect(official.roster).toContain('h100');
    expect(
      official.cells.find((cell: { point: { id: string } }) => cell.point.id === point.id).point
        .hardwareKey,
    ).toBe('h100');
    history.entries.find((entry) => entry.runId === point.runId)!.approved = false;
    const namedResponse = await GET(request(`view=overview&unofficialrun=${point.runId}`));
    const named = await namedResponse.json();
    expect(named).toMatchObject(
      resultProjection(
        videoPoints([history]),
        parseResultsState(`unofficialrun=${point.runId}`),
        namedRunPoints([history], point.runId),
      ),
    );
    expect(named.overlayCells[0].point).toMatchObject({ hardwareKey: 'h100', approved: false });
    const hiddenResponse = await GET(
      request(`view=overview&unofficialrun=${point.runId}&r_hidden=h100`),
    );
    const hidden = await hiddenResponse.json();
    expect(hidden.overlayCells).toEqual([]);
    const clearedResponse = await GET(request('view=overview'));
    const cleared = await clearedResponse.json();
    expect(cleared.roster).not.toContain('h100');
    expect(
      cleared.cells.some(
        (cell: { point: { hardwareKey: string } }) => cell.point.hardwareKey === 'h100',
      ),
    ).toBe(false);
  });

  it('returns the same nine-group selection and economics as the UI without reading or publishing media', async () => {
    const history = structuredClone(retainedHistory) as unknown as VideoHistoryPage;
    history.nextPage = null;
    source.mockImplementation(() => Response.json(history));
    const query =
      'view=overview&r_tier=r&r_deadline=60&r_utilization=0.5&r_hidden=mi355x&unofficialrun=123';
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    const body = await response.json();
    const expected = resultProjection(videoPoints([history]), parseResultsState(query));
    expect(body).toMatchObject(expected);
    expect(body.cells.length).toBeGreaterThan(0);
    expect(body.params.view).toBe('overview');
    expect(body.coverage.pagesRead).toBe(1);
    expect(
      source.mock.calls.every(([req]) => req.nextUrl.searchParams.get('format') === 'history'),
    ).toBe(true);
    const mixed = await GET(request('view=overview&v_api=0.08'));
    const wrongView = await GET(request('view=dashboard&r_tier=h'));
    expect(mixed.status).toBe(400);
    expect(wrongView.status).toBe(400);
  });

  it('keeps a stored legacy entry out of the default public dashboard', async () => {
    source.mockImplementation((req: NextRequest) =>
      req.nextUrl.searchParams.get('format') === 'history'
        ? Response.json({
            ...pages[0],
            nextPage: null,
            entries: [{ ...pages[0].entries[0], approved: false }],
          })
        : new Response(null, { status: 204 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows).toEqual([]);
  });

  it('shows only the explicitly named unapproved run in overview overlays', async () => {
    const history = structuredClone(retainedHistory) as unknown as VideoHistoryPage;
    history.nextPage = null;
    const run = videoPoints([history]).find((point) => point.hardwareKey === 'b200')!.runId;
    const selected = history.entries.find((entry) => entry.runId === run)!;
    selected.approved = false;
    const other = structuredClone(selected);
    other.runId = '987654321';
    other.id = `${other.runId}.${other.artifact.id}`;
    for (const item of other.sources)
      for (const row of item.observations) row.id = `other:${row.id}`;
    history.entries.unshift(other);
    source.mockImplementation(() => Response.json(history));

    const response = await GET(request(`view=overview&unofficialrun=${run}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.overlayCells).toHaveLength(1);
    expect(body).toMatchObject(
      resultProjection(
        videoPoints([history]),
        parseResultsState(`unofficialrun=${run}`),
        namedRunPoints([history], run),
      ),
    );
    expect(body.overlayCells[0]).toMatchObject({
      overlay: true,
      point: { runId: run, approved: false, artifactId: selected.artifact.id },
    });
    expect(body.cells.map((cell: { point: { runId: string } }) => cell.point.runId)).not.toContain(
      run,
    );
    expect(JSON.stringify(body)).not.toContain(other.runId);

    const clearedResponse = await GET(request('view=overview'));
    const cleared = await clearedResponse.json();
    expect(cleared.overlayCells).toEqual([]);
    expect(
      cleared.cells.map((cell: { point: { runId: string } }) => cell.point.runId),
    ).not.toContain(run);
    expect(
      source.mock.calls.every(([req]) => req.nextUrl.searchParams.get('format') === 'history'),
    ).toBe(true);
  });

  it('returns the shared diagnostic-only projection and keeps CSV unsupported', async () => {
    const history = structuredClone(retainedHistory) as unknown as VideoHistoryPage;
    history.nextPage = null;
    const run = videoPoints([history]).find((point) => point.hardwareKey === 'b200')!.runId;
    for (const entry of history.entries) entry.approved = false;
    source.mockImplementation(() => Response.json(history));
    const response = await GET(request(`view=overview&unofficialruns=${run}`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.cells).toEqual([]);
    expect(body.workloadMix).toEqual([]);
    expect(body.overlayCells).toHaveLength(1);
    expect(body).toMatchObject(
      resultProjection(
        videoPoints([history]),
        parseResultsState(`unofficialruns=${run}`),
        namedRunPoints([history], run),
      ),
    );
    const csv = await GET(request('view=overview&format=csv'));
    expect(csv.status).toBe(400);
  });
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
  it('accepts the canonical single overlay alias but rejects ambiguous or multiple overlays', async () => {
    const single = await GET(request('view=overview&unofficialruns=123'));
    expect(single.status).toBe(200);
    const body = await single.json();
    expect(body.params.unofficialRun).toBe('123');
    const multiple = await GET(request('view=overview&unofficialruns=123,456'));
    const aliases = await GET(request('view=overview&unofficialrun=123&unofficialruns=456'));
    expect(multiple.status).toBe(400);
    expect(aliases.status).toBe(400);
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
    const saved = storedServingArtifact();
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

  it('keeps the primary legacy artifact and lists an unpublished compare ref', async () => {
    const saved = storedServingArtifact();
    source.mockImplementation((req: NextRequest) =>
      req.nextUrl.searchParams.get('run') === '123'
        ? Response.json(saved)
        : new Response(null, { status: 204 }),
    );
    const response = await GET(request('run=123&artifact=456&view=tradeoff&compare=789:1011'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.params.compare).toEqual(['789:1011']);
    expect(body.unpublishedCompare).toEqual(['789:1011']);
    expect(body.serving.map((item: { run: string }) => item.run)).toEqual(['123']);
    expect(body.points.length).toBeGreaterThan(0);
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
