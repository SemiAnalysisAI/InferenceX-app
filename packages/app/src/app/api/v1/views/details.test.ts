import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRowOverlaps,
  buildVisibleRows,
  computeBraceLayout,
} from '@/components/datasets/trace-flamegraph-model';
import type { StructureNode } from '@/hooks/api/use-datasets';
import { filterEvalSamplePage } from '@/lib/eval-sample-search';
import {
  averageSequenceLengthInFlight,
  buildThroughputChartSeries,
  rollingRequestMetric,
  timeRollingAverage,
} from '@/components/inference/agentic-point/time-series-math';
import { GET as dataset } from './dataset/route';
import { GET as catalog } from './agentx-catalog/route';
import { GET as point } from './agentx-point/route';
import { GET as samples } from './evaluation-samples/route';

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  index: vi.fn(),
  conversation: vi.fn(),
  catalog: vi.fn(),
  available: vi.fn(),
  requests: vi.fn(),
  metrics: vi.fn(),
  source: vi.fn(),
  stored: vi.fn(),
  live: vi.fn(),
}));
vi.mock('@/app/api/v1/datasets/[slug]/route', () => ({ GET: mocks.detail }));
vi.mock('@/app/api/v1/datasets/[slug]/conversations/route', () => ({ GET: mocks.index }));
vi.mock('@/app/api/v1/datasets/[slug]/conversations/[convId]/route', () => ({
  GET: mocks.conversation,
}));
vi.mock('@/lib/agentic-catalog', () => ({ getAgenticCatalogGroups: mocks.catalog }));
vi.mock('@/app/api/v1/trace-availability/route', () => ({ GET: mocks.available }));
vi.mock('@/app/api/v1/request-chart-data/route', () => ({ GET: mocks.requests }));
vi.mock('@/app/api/v1/trace-server-metrics/route', () => ({ GET: mocks.metrics }));
vi.mock('@/app/api/v1/trace-server-metric-source/route', () => ({ GET: mocks.source }));
vi.mock('@/app/api/v1/eval-samples/route', () => ({ GET: mocks.stored }));
vi.mock('@/app/api/v1/eval-samples-live/route', () => ({ GET: mocks.live }));
vi.mock('@/app/api/v1/benchmarks/route', () => ({ GET: vi.fn() }));
vi.mock('@/app/api/unofficial-run/route', () => ({ GET: vi.fn() }));
vi.mock('@/lib/api-cache', () => ({ cachedJson: (data: unknown) => Response.json(data) }));

const req = (view: string, query = '') =>
  new NextRequest(`https://example.test/api/v1/views/${view}?${query}`);
const turn = {
  kind: 'turn' as const,
  turnIndex: 0,
  in: 10,
  out: 2,
  cached: 6,
  uncached: 4,
  startS: 0,
  endS: 2,
};
const nodes: StructureNode[] = [
  turn,
  {
    kind: 'subagent',
    label: 'worker',
    agentId: 'sa1',
    in: 30,
    out: 6,
    cached: 18,
    uncached: 12,
    children: [turn, { ...turn, turnIndex: 1, startS: 1, endS: 3 }],
  },
];
const allSamples = [
  { docId: 0, prompt: 'Hello', response: null, target: 'world', passed: true, score: 1 },
  { docId: 1, prompt: null, response: 'WORLD', target: null, passed: false, score: 0 },
  { docId: 2, prompt: 'none', response: null, target: null, passed: null, score: null },
];
const page = {
  samples: allSamples,
  total: 12,
  passedTotal: 5,
  failedTotal: 6,
  source: 'db',
  offset: 0,
};
const server = {
  startNs: 1e9,
  endNs: 10e9,
  durationS: 9,
  timeslicesCount: 3,
  meta: { id: 7 },
  kvCacheUsage: [
    { t: 0, value: 0 },
    { t: 1, value: 0.5 },
    { t: 2, value: 1 },
  ],
  prefixCacheHitRate: [],
  queueDepth: [],
  promptTokensBySource: {},
  prefillTps: [],
  decodeTps: [],
  prefixCacheHitsTps: [],
  hostKvCacheUsage: [],
  kvCacheUsageByEngine: [],
  metricSources: [{ source: { id: 'worker/1' } }],
  kvCachePoolTokens: null,
};
const wire = {
  version: 1,
  timelineVersion: 1,
  startNs: 0,
  endNs: 10e9,
  durationS: 10,
  cids: ['c1'],
  phases: ['warmup', 'profiling'],
  requests: [
    [0, 0, 0, 1e6, 2, 3, 10, 20, 0],
    [0, 1, 2e6, 3e6, null, null, null, 0, 1],
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.detail.mockImplementation(() =>
    Response.json({ slug: 'dataset', chart_data: { version: 2 }, summary: {} }),
  );
  mocks.index.mockImplementation(() => Response.json({ total: 51, items: [{ conv_id: 'c1' }] }));
  mocks.conversation.mockImplementation(() =>
    Response.json({ conv_id: 'c1', structure: { nodes } }),
  );
  mocks.catalog.mockResolvedValue([{ key: 'm', cards: [{ id: 7 }, { id: 8 }], totalPoints: 11 }]);
  mocks.available.mockImplementation(() => Response.json({ 7: true }));
  mocks.requests.mockImplementation(() => Response.json(wire));
  mocks.metrics.mockImplementation(() => Response.json(server));
  mocks.source.mockImplementation(() =>
    Response.json({
      ...server,
      source: { id: 'worker/1' },
      promptTps: [{ t: 1, value: 123 }],
      generationTps: [],
    }),
  );
  mocks.stored.mockImplementation(() => Response.json(page));
  mocks.live.mockImplementation(() => Response.json({ ...page, source: 'github_artifact' }));
});

describe('dataset and telemetry catalog views', () => {
  it('forwards paginated ID search and sorting without bulk-reading conversations', async () => {
    const response = await dataset(
      req('dataset', 'slug=a%252Fb&sort=subagents&search=literal%25&limit=1&offset=4'),
    );
    expect(response.status).toBe(200);
    expect(await mocks.detail.mock.calls[0][1].params).toEqual({ slug: 'a%2Fb' });
    const indexRequest = mocks.index.mock.calls[0][0] as NextRequest;
    expect(Object.fromEntries(indexRequest.nextUrl.searchParams)).toEqual({
      search: 'literal%',
      sort: 'subagents',
      limit: '1',
      offset: '4',
    });
    const body = await response.json();
    expect(body.dataset.chart_data).toEqual({ version: 2 });
    expect(body.flamegraph).toBeNull();
    expect(body.pagination).toEqual({ returned: 1, total: 51, hasMore: true });
    expect(mocks.conversation).not.toHaveBeenCalled();
  });
  it('matches visible rows and overlap brackets, including deep-link expansion and separate group scales', async () => {
    const response = await dataset(req('dataset', 'slug=dataset&convId=c1&raw=1&inner=1'));
    const body = await response.json();
    const rows = buildVisibleRows(nodes, new Set([1]), buildRowOverlaps(nodes));
    expect(body.flamegraph.rows).toEqual(rows);
    expect(body.flamegraph.brackets).toEqual(computeBraceLayout(rows));
    expect(body.flamegraph.target.rowKey).toBe('g-1-c-1');
    expect(body.flamegraph.maxTokens).toBe(12);
    expect(body.flamegraph.maxGroupTokens).toBe(36);
    expect(body.flamegraph.expanded).toEqual([1]);
  });
  it.each([
    'expanded=0',
    'expanded=no',
    'limit=201',
    'offset=-1',
    'limit=1.5',
    'turn=-1',
    'surprise=1',
    'sort=id&sort=tokens',
  ])('rejects invalid dataset selection %s', async (query) => {
    const response = await dataset(req('dataset', `slug=dataset&convId=c1&${query}`));
    expect(response.status).toBe(400);
  });
  it('rejects over-long ID search as a selector error before calling the index', async () => {
    const accepted = await dataset(req('dataset', `slug=dataset&search=${'a'.repeat(100)}`));
    expect(accepted.status).toBe(200);
    expect(mocks.index).toHaveBeenCalledTimes(1);
    const response = await dataset(req('dataset', `slug=dataset&search=${'a'.repeat(101)}`));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/search.*100 characters/u);
    expect(mocks.index).toHaveBeenCalledTimes(1);
  });
  it('requires a conversation for deep-link controls and preserves not-found errors', async () => {
    const invalid = await dataset(req('dataset', 'slug=dataset&expanded=all'));
    expect(invalid.status).toBe(400);
    mocks.detail.mockImplementation(() =>
      Response.json({ error: 'private detail' }, { status: 404 }),
    );
    const response = await dataset(req('dataset', 'slug=missing'));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('private detail');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('uses the page catalog groups and counts without fetching any telemetry', async () => {
    const response = await catalog(req('agentx-catalog'));
    const body = await response.json();
    expect(body.configCount).toBe(2);
    expect(body.pointCount).toBe(11);
    expect(mocks.requests).not.toHaveBeenCalled();
    const invalid = await catalog(req('agentx-catalog', 'model=x'));
    expect(invalid.status).toBe(400);
  });
});

describe('selected AgentX point', () => {
  it('matches request percentiles, E2E latency, sequence and throughput control calculations', async () => {
    mocks.requests.mockImplementation(() =>
      Response.json({
        ...wire,
        phases: ['profiling'],
        requests: [
          [0, 0, 0, 1e6, 20, 10, 10, 0, 0],
          [0, 0, 1e6, 2e6, 40, 20, 20, 2, 0],
          [0, 0, 2e6, 4e6, 80, 40, 30, 4, 0],
        ],
      }),
    );
    const response = await point(
      req('agentx-point', 'id=7&percentile=p75&latencyMetric=e2e&throughput=decode'),
    );
    const body = await response.json();
    expect(body.params).toMatchObject({
      percentile: 'p75',
      latencyMetric: 'e2e',
      throughput: ['decode'],
    });
    expect(body.charts.latency).toEqual(
      rollingRequestMetric(body.requestData.requests, 'e2e', 'p75', 50),
    );
    expect(body.charts.interactivity).toEqual(
      rollingRequestMetric(body.requestData.requests, 'interactivity', 'p75', 50),
    );
    expect(body.charts.server.throughput).toEqual(
      buildThroughputChartSeries(server.prefillTps, server.decodeTps, new Set(['decode'])),
    );
    expect(body.charts.sequence.osl.distribution).toMatchObject({ count: 3, excludedFromLog: 1 });
    expect(
      body.charts.sequence.osl.distribution.histogram.counts.reduce(
        (a: number, b: number) => a + b,
        0,
      ),
    ).toBe(2);
    expect(body.charts.sequence.isl.inflight.smoothed).toEqual(
      timeRollingAverage(averageSequenceLengthInFlight(body.requestData.requests, 'isl'), 30),
    );
    expect(body.charts.completedRequests.at(-1).value).toBe(3);
    const defaultResponse = await point(req('agentx-point', 'id=7'));
    const defaultBody = await defaultResponse.json();
    expect(defaultBody.charts.latency.trend).not.toEqual(body.charts.latency.trend);
  });
  it.each(['percentile=p95', 'latencyMetric=foo', 'throughput=', 'throughput=invalid'])(
    'rejects invalid chart control %s before I/O',
    async (query) => {
      const response = await point(req('agentx-point', `id=7&${query}`));
      expect(response.status).toBe(400);
      expect(mocks.available).not.toHaveBeenCalled();
    },
  );
  it('decodes compact records and slices server metrics across different clock origins', async () => {
    const response = await point(req('agentx-point', 'id=7'));
    const body = await response.json();
    expect(body.boundarySec).toBe(1);
    expect(body.requestData.requests).toEqual([
      {
        cid: 'c1',
        phase: 'profiling',
        start: 0,
        end: 1e9,
        ttftMs: null,
        tpotMs: null,
        isl: null,
        osl: 0,
        cancelled: true,
      },
    ]);
    expect(body.serverData.series.kvCacheUsage).toEqual([
      { t: 0, value: 0.5 },
      { t: 1, value: 1 },
    ]);
    expect(body.requestData.startNs).toBe(2e9);
    expect(body.origins).toEqual({ requestStartNs: 0, serverStartNs: 1e9 });
  });
  it('keeps all phases on request and selects a metric source only when requested', async () => {
    const response = await point(req('agentx-point', 'id=7&phase=all&source=worker%2F1'));
    const body = await response.json();
    expect(body.requestData.requests).toHaveLength(2);
    expect(body.serverData.series.prefillTps).toEqual([{ t: 1, value: 123 }]);
    expect(mocks.source.mock.calls[0][0].nextUrl.searchParams.get('source')).toBe('worker/1');
    const invalid = await point(req('agentx-point', 'id=7&source=missing'));
    expect(invalid.status).toBe(400);
  });
  it('scopes the selected source without retaining unsliced wire aliases', async () => {
    const response = await point(req('agentx-point', 'id=7&source=worker%2F1'));
    const body = await response.json();
    expect(body.serverData.series.prefillTps).toEqual([{ t: 0, value: 123 }]);
    expect(body.serverData.series).not.toHaveProperty('promptTps');
    expect(body.serverData.series).not.toHaveProperty('generationTps');
  });
  it('returns only warmup requests and the server samples before the boundary', async () => {
    const response = await point(req('agentx-point', 'id=7&phase=warmup'));
    const body = await response.json();
    expect(body.params.effectivePhase).toBe('warmup');
    expect(body.requestData.requests).toHaveLength(1);
    expect(body.requestData.requests[0]).toMatchObject({
      phase: 'warmup',
      start: 0,
      cancelled: false,
    });
    expect(body.serverData.series.kvCacheUsage).toEqual([{ t: 0, value: 0 }]);
  });
  it('resolves runs without warmup to profiling without discarding their samples', async () => {
    mocks.requests.mockImplementation(() =>
      Response.json({ ...wire, requests: [wire.requests[1]] }),
    );
    const response = await point(req('agentx-point', 'id=7&phase=warmup'));
    const body = await response.json();
    expect(body.params.effectivePhase).toBe('profiling');
    expect(body.boundarySec).toBeNull();
    expect(body.requestData.requests).toHaveLength(1);
    expect(body.serverData.series.kvCacheUsage).toEqual(server.kvCacheUsage);
  });
  it('preserves missing metrics and never fetches heavy data when availability is absent', async () => {
    mocks.metrics.mockImplementation(() => Response.json({}, { status: 404 }));
    const response = await point(req('agentx-point', 'id=7'));
    const body = await response.json();
    expect(body.serverData).toBeNull();
    expect(body.kvCachePoolTokens).toBeNull();
    mocks.requests.mockClear();
    mocks.available.mockImplementation(() => Response.json({}));
    const missing = await point(req('agentx-point', 'id=7'));
    expect(missing.status).toBe(404);
    expect(mocks.requests).not.toHaveBeenCalled();
  });
  it.each(['id=1e3', 'id=0', 'id=9007199254740992', 'id=7&id=8', 'id=7&phase=bogus'])(
    'rejects %s before fetching',
    async (query) => {
      const response = await point(req('agentx-point', query));
      expect(response.status).toBe(400);
      expect(mocks.available).not.toHaveBeenCalled();
    },
  );
  it('preserves upstream failures rather than reporting empty evidence', async () => {
    mocks.metrics.mockImplementation(() => Response.json({}, { status: 503 }));
    const response = await point(req('agentx-point', 'id=7'));
    expect(response.status).toBe(503);
  });
});

describe('evaluation sample drawer', () => {
  it('shares current-page search semantics and preserves pre-search totals and null outcomes', async () => {
    const response = await samples(
      req('evaluation-samples', 'evalResultId=1&search=world&filter=failed'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body.samples).toEqual(filterEvalSamplePage(allSamples, 'world'));
    expect(body.samples).toHaveLength(2);
    expect(body.total).toBe(12);
    expect(body.pageCount).toBe(3);
    expect(body.params).toMatchObject({ limit: 50, filter: 'failed' });
    expect(body.searchScope).toBe('current-page');
    expect(filterEvalSamplePage(allSamples, '')[2].passed).toBeNull();
  });
  it('resolves stored doc ID zero into the returned page and resets the filter', async () => {
    mocks.stored.mockImplementation(() => Response.json({ ...page, offset: 50 }));
    const response = await samples(
      req('evaluation-samples', 'evalResultId=1&docId=0&filter=failed'),
    );
    const body = await response.json();
    expect(body.params).toMatchObject({ offset: 50, docId: 0, filter: 'all' });
    expect(mocks.stored.mock.calls[0][0].nextUrl.searchParams.get('doc_id')).toBe('0');
  });
  it('forwards exact unofficial identities, without relabeling source or enabling caching', async () => {
    const response = await samples(
      req(
        'evaluation-samples',
        'runId=123&task=gsm8k&model=raw&framework=sglang&hardware=b200&precision=fp8&specMethod=none&disagg=true&concurrency=16',
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe('github_artifact');
    expect(body.params.model).toBe('raw');
    expect(Object.fromEntries(mocks.live.mock.calls[0][0].nextUrl.searchParams)).toMatchObject({
      run_id: '123',
      spec_method: 'none',
      disagg: 'true',
      conc: '16',
    });
    expect(mocks.stored).not.toHaveBeenCalled();
  });
  it.each([
    '',
    'evalResultId=1&runId=2',
    'evalResultId=1.5',
    'evalResultId=1&docId=-1',
    'evalResultId=1&limit=501',
    'evalResultId=1&hardware=b200',
    'runId=2&docId=0',
  ])('rejects ambiguous/unsafe sample selection %s', async (query) => {
    const response = await samples(req('evaluation-samples', query));
    expect(response.status).toBe(400);
    expect(mocks.stored).not.toHaveBeenCalled();
    expect(mocks.live).not.toHaveBeenCalled();
  });
});
