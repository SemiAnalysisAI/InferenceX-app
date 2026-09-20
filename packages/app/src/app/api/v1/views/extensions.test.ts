import { buildCorrelationData, buildGroupedData } from '@/components/gpu-power/chart-data';
import { servingFixture } from '@/components/video-benchmark/serving.fixture';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as cache } from './cache-reuse/route';
import { GET as first } from './first-token/route';
import { GET as gpu } from './gpu-metrics/route';
import { GET as operator } from './operatorx/route';
import { GET as gw } from './profit-estimator-per-gigawatt/route';
import { GET as profit } from './profit-estimator/route';
import { GET as submissions } from './submissions/route';
import { GET as video } from './video/route';

const mocks = vi.hoisted(() => ({
  metrics: vi.fn(),
  video: vi.fn(),
  benchmarks: vi.fn(),
  unofficial: vi.fn(),
  operatorRuns: vi.fn(),
  operator: vi.fn(),
  submissions: vi.fn(),
}));
vi.mock('@/app/api/gpu-metrics/route', () => ({ GET: mocks.metrics }));
vi.mock('@/app/api/video-runs/route', () => ({ GET: mocks.video }));
vi.mock('@/app/api/v1/benchmarks/route', () => ({ GET: mocks.benchmarks }));
vi.mock('@/app/api/unofficial-run/route', () => ({ GET: mocks.unofficial }));
vi.mock('@/app/api/v1/operatorx/runs/route', () => ({ GET: mocks.operatorRuns }));
vi.mock('@/app/api/v1/operatorx/runs/[runId]/route', () => ({ GET: mocks.operator }));
vi.mock('@/app/api/v1/submissions/route', () => ({ GET: mocks.submissions }));
vi.mock('@/lib/api-cache', () => ({ cachedJson: (data: unknown) => Response.json(data) }));
const req = (view: string, query = '') =>
  new NextRequest(`https://example.test/api/v1/views/${view}?${query}`);
const metricRows = [0, 1].flatMap((index) =>
  [0, 1].map((second) => ({
    index,
    timestamp: `2026-01-01T00:00:0${second}Z`,
    power: 100 + index * 10 + second,
    temperature: 40 + index,
    smClock: 1000,
    memClock: 900,
    gpuUtil: 50,
    memUtil: 20,
  })),
);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.metrics.mockImplementation(() =>
    Response.json({ runInfo: { id: 123 }, artifacts: [{ name: 'h200', data: metricRows }] }),
  );
  mocks.benchmarks.mockImplementation(() => Response.json([]));
  mocks.unofficial.mockImplementation(() => Response.json({ benchmarks: [], evaluations: [] }));
  mocks.operatorRuns.mockImplementation(() => Response.json({ runs: [] }));
  mocks.submissions.mockImplementation(() => Response.json({ summary: [], volume: [] }));
});
describe('new dashboard projections', () => {
  it('GPU visibility, axes, statistics and no-store match shared helpers', async () => {
    const result = await gpu(
      req('gpu-metrics', 'runId=123&gpus=1&metric=temperature&sort=mean&direction=desc'),
    );
    expect(result.headers.get('cache-control')).toContain('no-store');
    const body = await result.json();
    expect(body.rows).toEqual(metricRows.filter((r) => r.index === 1));
    expect(body.chart).toEqual(
      Object.fromEntries(buildGroupedData(metricRows, new Set([1]), 'temperature')),
    );
    expect(body.stats).toHaveLength(2);
    expect(body.stats[0].gpuIndex).toBe(1);
    const corrResponse = await gpu(
      req(
        'gpu-metrics',
        'runId=123&gpus=0&chartView=correlation&corrXMetric=temperature&corrYMetric=power',
      ),
    );
    const corr = await corrResponse.json();
    expect(corr.chart).toEqual(
      buildCorrelationData(metricRows, new Set([0]), 'temperature', 'power'),
    );
  });
  it('rejects invalid GPU indices, artifacts and unsafe IDs', async () => {
    for (const query of [
      'runId=123&gpus=9',
      'runId=123&artifact=missing',
      'runId=9007199254740992',
    ]) {
      const response = await gpu(req('gpu-metrics', query));
      expect(response.status).toBe(400);
    }
  });
  it('preserves sanitized upstream failure status', async () => {
    mocks.metrics.mockImplementation(() =>
      Response.json({ secret: 'do not expose' }, { status: 503 }),
    );
    const result = await gpu(req('gpu-metrics', 'runId=123'));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: 'Source data unavailable' });
  });
  it('reads published video evidence without triggering artifact publication', async () => {
    mocks.video.mockImplementation(() => new Response(null, { status: 204 }));
    const result = await video(req('video', 'run=123&artifact=456'));
    expect(result.status).toBe(204);
    expect(mocks.video.mock.calls[0][0].nextUrl.searchParams.get('format')).toBe('published');
    expect(result.headers.get('cache-control')).toContain('no-store');
  });
  it('applies video source, cell, slot, power phase, denominator and axes', async () => {
    const fixture = servingFixture();
    fixture.documents.set('manifest.json', fixture.manifest);
    fixture.documents.set('ci.json', fixture.ci);
    fixture.checksums.set('manifest.json', 'a'.repeat(64));
    const payload = {
      storageVersion: 1,
      runId: '123',
      artifact: { id: 456, name: 'test', expired: false, size_in_bytes: 100 },
      sources: [
        {
          id: '123',
          documents: [...fixture.documents],
          checksums: [...fixture.checksums],
          texts: [],
          assets: [],
        },
      ],
    } as StoredArtifact;
    mocks.video.mockImplementation(() => Response.json(payload));
    const result = await video(
      req('video', 'run=123&artifact=456&source=123&cell=c2&phase=warmup&gpuBasis=allocated'),
    );
    const body = await result.json();
    expect(result.status).toBe(200);
    expect(body.evidence.cell).toBe('c2');
    expect(body.evidence.kind).toBe('serving');
    expect(body.evidence.power).toBeNull();
    expect(body.params.gpuBasis).toBe('allocated');
    expect(body.params.xAxis).toBe('median');
    expect(body.points.length).toBeGreaterThan(0);
    expect(body.points[0].run).not.toHaveProperty('bundle');
    const invalidSource = await video(req('video', 'run=123&artifact=456&source=unknown'));
    expect(invalidSource.status).toBe(400);
  });
  it('empty calculator extension evidence remains empty, with resolved assumptions', async () => {
    for (const [view, handler] of [
      ['first-token', first],
      ['cache-reuse', cache],
      ['profit-estimator', profit],
      ['profit-estimator-per-gigawatt', gw],
    ] as const) {
      const query = `model=DeepSeek-V4-Pro${view.startsWith('profit') ? '&priceSource=custom&utilization=50&labCut=10&powerBasis=compare' : ''}`;
      const result = await handler(req(view, query));
      expect(result.status, JSON.stringify(await result.clone().json())).toBe(200);
      const body = await result.json();
      expect(body.view).toBe(view);
      if (view.startsWith('profit'))
        expect(body.params).toMatchObject({ utilization: 50, labCut: 10, powerBasis: 'compare' });
      if (view === 'cache-reuse') expect(body.data).toBeNull();
    }
  });
  it('exact-run and public-overlay selectors are forwarded only to fixed GET handlers', async () => {
    await first(
      req(
        'first-token',
        'model=DeepSeek-V4-Pro&runId=123&unofficialrun=456&caps=1,2&costType=output',
      ),
    );
    const query = mocks.benchmarks.mock.calls[0][0].nextUrl.searchParams;
    expect(query.get('runId')).toBe('123');
    expect(query.get('exactRun')).toBe('true');
    expect(mocks.unofficial.mock.calls[0][0].nextUrl.pathname).toBe('/api/unofficial-run');
  });
  it('rejects unsupported extension options rather than silently ignoring them', async () => {
    for (const query of [
      'caps=-1',
      'costProvider=costn',
      'surprise=true',
      'runId=0',
      'date=2026-02-30',
    ]) {
      const response = await first(req('first-token', `model=DeepSeek-V4-Pro&${query}`));
      expect(response.status).toBe(400);
    }
    const invalidUtilization = await profit(
      req('profit-estimator', 'model=DeepSeek-V4-Pro&priceSource=custom&utilization=101'),
    );
    expect(invalidUtilization.status).toBe(400);
  });
  it('empty OperatorX discovery and submission history are successful empty views', async () => {
    const opResponse = await operator(req('operatorx'));
    const op = await opResponse.json();
    expect(op).toMatchObject({ run: null, total: 0, rows: [], points: [] });
    const result = await submissions(
      req('submissions', 'search=notfound&lines=amd&mode=cumulative'),
    );
    const body = await result.json();
    expect(result.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.series).toEqual([{ key: 'amd', points: [] }]);
  });
});
