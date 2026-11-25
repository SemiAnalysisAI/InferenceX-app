import {
  liveHistoryEntry,
  videoHistoryEntry,
  type VideoHistoryObservation,
  type VideoHistoryPage,
} from '@/components/video-benchmark/history';
import {
  latestOlderEntries,
  namedRunPoints,
  videoPoints,
} from '@/components/video-benchmark/points';
import { parseResultsState, resultProjection } from '@/components/video-benchmark/results';
import { chartedCells } from '@/components/video-benchmark/results-chart';
import { servingFixture } from '@/components/video-benchmark/serving.fixture';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { verifiedQuality } from '@/components/video-benchmark/reference-quality';
import {
  publishedResultsSide,
  resultsClipEvidence,
  resultsClipPoints,
} from '@/components/video-benchmark/results-clips';
import { withQuality, type StoredArtifact } from '@/components/video-benchmark/stored';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { GET } from './route';
import retainedHistory from '../../../../../../cypress/fixtures/api/video-history.json';

const source = (() => vi.fn())();
mock.module('@/app/api/video-runs/route', () => ({ GET: source }));

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
function historyResponse(req: NextRequest) {
  const first = Number(req.nextUrl.searchParams.get('page')) - 1;
  const read = pages.slice(first, first + Number(req.nextUrl.searchParams.get('pages') ?? 1));
  return Response.json({
    schemaVersion: 1,
    entries: read.flatMap((item) => item.entries),
    nextPage: read.at(-1)!.nextPage,
  });
}

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
    if (req.nextUrl.searchParams.get('format') === 'history') return historyResponse(req);
    return new Response(null, { status: 204 });
  });
});

describe('published VideoGenX dashboard projection', () => {
  it('prefers the older slower named clip over a faster official clip on the same hardware', async () => {
    const named = referenceQualityFixture(20);
    const official = referenceQualityFixture(20, '124', 8, '4'.repeat(64));
    official.attachment.pairs[0].comparison.metrics.video_psnr_db = 35;
    for (const f of [named, official]) {
      f.stored.quality = verifiedQuality(
        f.attachment,
        f.descriptor,
        f.stored,
        '9'.repeat(64),
      ).pairs;
      const mediaPath = f.attachment.pairs[0].candidate.media_path;
      f.stored.sources[0].assets = [
        [mediaPath, { url: `/${f.stored.runId}.mp4`, downloadUrl: `/${f.stored.runId}.mp4` }],
      ];
    }
    const namedEntry = videoHistoryEntry(named.stored, null);
    const officialEntry = videoHistoryEntry(official.stored, null);
    officialEntry.approved = true;
    namedEntry.sources[0].observedAt = '2025-01-01T00:00:00Z';
    officialEntry.sources[0].observedAt = '2026-01-01T00:00:00Z';
    for (const entry of officialEntry.sources[0].observations) entry.p50 = 60;
    const history: VideoHistoryPage = {
      schemaVersion: 1,
      nextPage: null,
      entries: [officialEntry, namedEntry],
    };
    source.mockImplementation((req: NextRequest) =>
      Response.json(
        req.nextUrl.searchParams.get('format') === 'history'
          ? history
          : req.nextUrl.searchParams.get('run') === '123'
            ? named.stored
            : official.stored,
      ),
    );
    const response = await GET(request('view=overview&unofficialrun=123'));
    const body = await response.json();
    expect(body.cells[0].point.runId).toBe('124');
    expect(body.overlayCells[0].point.runId).toBe('123');
    expect(body.clipQuality.status).toBe('ready');
    expect(body.clipQuality.groups[0].clips[0].quality.releaseQualified).toBe(false);
    expect(body.clipQuality.groups[0].clips[0].quality.candidate.run_id).toBe('123');
    expect(body.clipQuality.groups[0].clips[0].quality.psnrDb).toBe(25);
    const state = parseResultsState('unofficialrun=123');
    const projection = resultProjection(
      videoPoints([history]),
      state,
      namedRunPoints([history], '123'),
    );
    const uiPoints = resultsClipPoints(chartedCells(projection, state), { tier: 'h' });
    expect(uiPoints.map((point) => point.runId)).toEqual(['123']);
    expect(body.clipQuality.groups).toEqual(
      resultsClipEvidence(uiPoints.map((point) => publishedResultsSide(named.stored, point))),
    );
    const clearedResponse = await GET(request('view=overview'));
    const cleared = await clearedResponse.json();
    expect(cleared.clipQuality.groups[0].clips[0].quality.candidate.run_id).toBe('124');
    expect(cleared.clipQuality.groups[0].clips[0].quality.psnrDb).toBe(35);
  });

  it('scores the clip of the engine the chart draws when two engines share a GPU', async () => {
    const official = referenceQualityFixture(20, '124', 8, '4'.repeat(64));
    const mediaPath = official.attachment.pairs[0].candidate.media_path;
    official.stored.sources[0].assets = [[mediaPath, { url: '/124.mp4', downloadUrl: '/124.mp4' }]];
    const entry = { ...videoHistoryEntry(official.stored, null), approved: true };
    const [source0] = entry.sources;
    // vLLM-Omni rates more videos per GPU-hour but is slower at the same cost per
    // video-second, so the chart draws SGLang.
    source0.observations = source0.observations.flatMap((o) => [
      { ...o, results: { ...o.results!, engine: 'sglang' } },
      {
        ...o,
        id: `${o.id}-vllm`,
        p50: o.p50! + 10,
        wallSeconds: 1,
        results: { ...o.results!, engine: 'vllm-omni' },
      },
    ]);
    source.mockImplementation((req: NextRequest) =>
      Response.json(
        req.nextUrl.searchParams.get('format') === 'history'
          ? { schemaVersion: 1, nextPage: null, entries: [entry] }
          : official.stored,
      ),
    );
    const response = await GET(request('view=overview'));
    const body = await response.json();
    const clips = body.clipQuality.groups.flatMap((group: { clips: { pointId: string }[] }) =>
      group.clips.map((clip) => clip.pointId),
    );
    expect(clips).toEqual([source0.observations[0].id]);
  });

  it('overlays an unstored named run from its live artifact read without approving it', async () => {
    const official = referenceQualityFixture(20, '124', 8, '4'.repeat(64)).stored;
    const history: VideoHistoryPage = {
      schemaVersion: 1,
      nextPage: null,
      entries: [{ ...videoHistoryEntry(official, '2026-09-20T00:00:00Z'), approved: true }],
    };
    const named = referenceQualityFixture(20);
    const live: VideoHistoryPage = {
      schemaVersion: 1,
      nextPage: null,
      entries: [liveHistoryEntry(named.stored)],
    };
    const liveArtifact = withQuality(
      named.stored,
      verifiedQuality(named.attachment, named.descriptor, named.stored, '9'.repeat(64)),
    );
    source.mockImplementation((req: NextRequest) => {
      const query = req.nextUrl.searchParams;
      if (query.get('format') === 'history') return Response.json(history);
      if (query.get('format') === 'live' && query.get('run') === '123')
        return Response.json(query.get('artifact') === '7' ? liveArtifact : live);
      return new Response(null, { status: 204 });
    });
    const response = await GET(request('view=overview&unofficialrun=123'));
    const body = await response.json();
    const overlay = body.overlayCells.map(
      (cell: { point: { runId: string; approved: boolean } }) => [
        cell.point.runId,
        cell.point.approved,
      ],
    );
    expect(overlay.length).toBeGreaterThan(0);
    expect(overlay).toEqual(overlay.map(() => ['123', false]));
    expect(body.cells.map((cell: { point: { runId: string } }) => cell.point.runId)).toEqual([
      '124',
    ]);
    const [clip] = body.clipQuality.groups[0].clips;
    expect([
      clip.quality.candidate.run_id,
      clip.quality.psnrDb,
      clip.quality.reference.url,
    ]).toEqual(['123', 25, '']);
  });

  it('returns the same results-page selection and economics with read-only stored media metadata', async () => {
    const history = structuredClone(retainedHistory) as unknown as VideoHistoryPage;
    history.nextPage = null;
    source.mockImplementation(() => Response.json(history));
    const query =
      'view=overview&r_tier=r&r_deadline=60&r_utilization=0.5&r_hidden=mi355x&unofficialrun=123&r_gpus=999&r_basis=allocated&r_x=p90';
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    const body = await response.json();
    const expected = resultProjection(videoPoints([history]), parseResultsState(query));
    expect(body).toMatchObject(expected);
    expect(body.cells.length).toBeGreaterThan(0);
    expect(body.params.view).toBe('overview');
    expect(body.params).toMatchObject({
      gpuCount: null,
      xMetric: 'p50',
      costBasis: 'participating',
    });
    const defaults = resultProjection(
      videoPoints([history]),
      parseResultsState(
        'r_tier=r&r_deadline=60&r_utilization=0.5&r_hidden=mi355x&unofficialrun=123',
      ),
    );
    expect(body.cells).toEqual(defaults.cells);
    expect(body.coverage.pagesRead).toBe(1);
    expect(
      source.mock.calls.every(([req]) =>
        ['history', 'live', 'published'].includes(req.nextUrl.searchParams.get('format')),
      ),
    ).toBe(true);
    const multiple = await GET(request('view=overview&unofficialruns=123,456'));
    const aliases = await GET(request('view=overview&unofficialrun=123&unofficialruns=456'));
    expect(multiple.status).toBe(400);
    expect(aliases.status).toBe(400);
  });

  it('keeps a stored legacy entry out of the default view', async () => {
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
    expect(body.cells).toEqual([]);
  });

  it('keeps CSV headers when hardware selection removes every cell', async () => {
    const response = await GET(
      request('view=overview&format=csv&r_hidden=gb200,b200,mi355x,h200,h100'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toMatch(
      /^channel,approved,published_at,run_id,artifact_id,.*\r\n$/u,
    );
  });
  it('defaults to the overview and reads the first five History pages in one call', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body.params.view).toBe('overview');
    expect(body.coverage).toEqual({ pagesRead: 1, maxPages: 5, nextPage: null, truncated: false });
    expect(body.cells.map((cell: { point: { id: string } }) => cell.point.id)).toEqual([
      'h200:c1',
      'h200:8g',
      'h100:c1',
    ]);
    expect(source.mock.calls[0][0].nextUrl.searchParams.toString()).toBe(
      'format=history&page=1&pages=5',
    );
  });

  it('reports the same five-page bound and never silently presents truncated history as complete', async () => {
    source.mockImplementation(() => Response.json(page([], 6)));
    const response = await GET(request());
    const body = await response.json();
    expect(source).toHaveBeenCalledTimes(1);
    expect(body.coverage).toEqual({ pagesRead: 5, maxPages: 5, nextPage: 6, truncated: true });
    expect(body.cells).toEqual([]);
  });

  it.each([
    [0, 1],
    [1, 1],
    [10, 1],
    [11, 2],
    [30, 3],
    [41, 5],
  ])('counts %i complete-history entries as %i pages read', async (count, pagesRead) => {
    const entry = page([], null).entries[0];
    const entries = Array.from({ length: count }, () => entry);
    source.mockImplementation(() => Response.json({ schemaVersion: 1, entries, nextPage: null }));
    const response = await GET(request());
    const body = await response.json();
    expect(body.coverage).toEqual({ pagesRead, maxPages: 5, nextPage: null, truncated: false });
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

  it('retains explicit discovery and reports a media read failure as unavailable', async () => {
    source.mockImplementation(() => Response.json({ runs: [] }));
    const discoveryResponse = await GET(request('view=discovery&page=2'));
    const discovery = await discoveryResponse.json();
    expect(discovery.discovery).toEqual({ runs: [] });
    expect(source.mock.calls[0][0].nextUrl.searchParams.get('page')).toBe('2');
    source.mockImplementation((req: NextRequest) =>
      req.nextUrl.searchParams.get('format') === 'published'
        ? Response.json({ error: 'secret-token' }, { status: 503 })
        : historyResponse(req),
    );
    const overviewResponse = await GET(request('view=overview'));
    const body = await overviewResponse.json();
    expect(body.clipQuality.status).toBe('unavailable');
    expect(body.cells.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('secret-token');
  });

  it('rejects removed views, mixed modes and strips source errors instead of leaking private details', async () => {
    for (const query of [
      'view=dashboard',
      'view=compare',
      'v_x=p50Latency',
      'page=2',
      'run=123&r_tier=h',
      'r_hidden=h100&r_hidden=h200',
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

  it('answers 502 when the History read is incomplete', async () => {
    source.mockImplementation(() =>
      Response.json(page([observation], null), { headers: { 'X-VideoGenX-Incomplete': '1' } }),
    );
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Published history incomplete' });
  });

  it('answers the live read status when an unstored named run cannot be read', async () => {
    source.mockImplementation((req: NextRequest) =>
      req.nextUrl.searchParams.get('format') === 'history'
        ? historyResponse(req)
        : Response.json({ error: 'Cannot list CI artifacts' }, { status: 502 }),
    );
    const response = await GET(request('view=overview&unofficialrun=999'));
    expect(response.status).toBe(502);
  });
});

/** A complete plan identity; the case list tells two workloads apart. */
const workloadKey = (cases: number) =>
  JSON.stringify({
    plan: {
      cases: Array.from({ length: cases }, (_, seed) => ({ prompt: 'A drummer.', seed })),
      generation: {
        width: 1344,
        height: 768,
        fps: 24,
        num_inference_steps: 50,
        duration_seconds: 8,
      },
      model_id: 'MiniMaxAI/MiniMax-H3',
      model_revision: 'a'.repeat(40),
    },
  });
const h100 = { ...observation, hardware: 'NVIDIA H100 80GB HBM3', workloadKey: workloadKey(4) };
const twelve = { scheduled: 12, completed: 12, valid: 12, samples: 12 };
const entry = (runId: string, observations: VideoHistoryObservation[]) => ({
  ...page(observations, null).entries[0],
  id: `${runId}.456`,
  runId,
});

describe('VideoGenX qualification', () => {
  it.each([
    [
      'C1 and C4 of one deployment',
      [
        entry('1', [
          { ...h100, id: 'h100:c1' },
          { ...h100, id: 'h100:c4', cell: 'c4', concurrency: 4 },
        ]),
      ],
      [],
      ['h100:c1'],
    ],
    [
      'a 12-clip plan on two chips and a 20-clip plan on one',
      [
        entry('1', [
          { ...h100, ...twelve, id: 'a:h100', workloadKey: workloadKey(12) },
          {
            ...h100,
            ...twelve,
            id: 'a:h200',
            hardware: 'NVIDIA H200',
            workloadKey: workloadKey(12),
          },
          { ...h100, id: 'b:b200', hardware: 'NVIDIA B200', workloadKey: workloadKey(20) },
        ]),
      ],
      [],
      ['b:b200'],
    ],
    [
      'a 12-clip rerun in the window and its 20-clip cell past it',
      [entry('2', [{ ...h100, ...twelve, id: 'rerun' }])],
      [entry('1', [{ ...h100, id: 'full' }])],
      ['full'],
    ],
  ])('gives the API and /vgx the same cells for %s', async (_name, window, older, cells) => {
    const history: VideoHistoryPage = {
      schemaVersion: 1,
      nextPage: null,
      entries: [...window, ...latestOlderEntries(window, older)],
    };
    source.mockImplementation((req: NextRequest) =>
      req.nextUrl.searchParams.get('format') === 'history'
        ? Response.json(history)
        : new Response(null, { status: 204 }),
    );
    const response = await GET(request());
    const body = await response.json();
    expect(body.cells.map((cell: { point: { id: string } }) => cell.point.id)).toEqual(cells);
    expect(
      resultProjection(videoPoints([history]), parseResultsState('')).cells.map(
        (cell) => cell.point.id,
      ),
    ).toEqual(cells);
  });
});
