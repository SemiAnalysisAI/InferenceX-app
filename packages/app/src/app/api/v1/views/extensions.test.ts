import { buildCorrelationData, buildGroupedData } from '@/components/gpu-power/chart-data';
import { servingFixture } from '@/components/video-benchmark/serving.fixture';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import type { BenchmarkRow } from '@/lib/api';
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

function agenticRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    model: 'dsv4',
    hardware: 'b200',
    framework: 'sglang',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 16,
    offload_mode: 'off',
    image: 'sglang:test',
    date: '2026-09-10',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
    metrics: {
      p90_itl: 1 / 45,
      p90_ttft: 0.5,
      tput_per_gpu: 6000,
      input_tput_per_gpu: 5400,
      output_tput_per_gpu: 600,
      server_gpu_cache_hit_rate: 0.9,
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 600,
      avg_total_gpu_power_w: 4800,
    },
    ...overrides,
  };
}

const hardwareKeys = (data: { rows: { hwKey: string }[] }) =>
  [...new Set(data.rows.map((row) => row.hwKey))].sort();

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
  it.each([false, true])(
    'retains an explicitly selected overlay-only precision with official rows present: %s',
    async (hasOfficialRows) => {
      mocks.benchmarks.mockImplementation(() =>
        Response.json(hasOfficialRows ? [agenticRow()] : []),
      );
      mocks.unofficial.mockImplementation(() =>
        Response.json({
          benchmarks: [agenticRow({ id: 200, precision: 'fp8' })],
          evaluations: [],
        }),
      );
      const response = await first(
        req(
          'first-token',
          'model=DeepSeek-V4-Pro&precisions=fp8&unofficialrun=123&caps=1&minInteractivity=40',
        ),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.params.precisions).toEqual(['fp8']);
      expect(body.data.measuredRows).toBe(0);
      expect(body.data.overlayMeasuredRows).toBe(1);
      expect(body.data.cells).toMatchObject([
        {
          series: { key: 'run:0' },
          winner: { precision: 'fp8', point: { sourceRow: { id: 200 } } },
        },
      ]);
    },
  );
  it.each([
    [4, undefined],
    [5, undefined],
    [4, 'fp8'],
    [5, 'fp8'],
  ])(
    'keeps the official default alongside %s overlay curves unless precision %s is explicit',
    async (overlayCurveCount, precision) => {
      const hardwares = ['h100', 'h200', 'b200', 'b300', 'mi355x'];
      const officialRows = hardwares
        .slice(0, 4)
        .map((hardware, index) => agenticRow({ id: index + 1, hardware }));
      const overlayRows = hardwares
        .slice(0, overlayCurveCount)
        .map((hardware, index) => agenticRow({ id: index + 101, hardware, precision: 'fp8' }));
      mocks.benchmarks.mockImplementation(() => Response.json(officialRows));
      mocks.unofficial.mockImplementation(() =>
        Response.json({ benchmarks: overlayRows, evaluations: [] }),
      );
      const response = await first(
        req(
          'first-token',
          `model=DeepSeek-V4-Pro&unofficialrun=123&caps=1&minInteractivity=40${precision ? `&precisions=${precision}` : ''}`,
        ),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.params.precisions).toEqual(precision ? ['fp8'] : ['fp4', 'fp8']);
      expect(body.data.measuredRows).toBe(precision ? 0 : 4);
      expect(body.data.overlayMeasuredRows).toBe(overlayCurveCount);
      expect(body.data.series.map((series: { key: string }) => series.key)).toEqual(
        precision ? ['run:0'] : ['vendor:NVIDIA', 'run:0'],
      );
      const overlayWinner = body.data.cells.at(-1).winner;
      expect(overlayWinner.precision).toBe('fp8');
      expect(overlayRows.map((row) => row.id)).toContain(overlayWinner.point.sourceRow.id);
    },
  );
  it.each([
    ['123, 456', ''],
    ['123,123,456', '/attempts/1'],
  ])('keeps normalized overlay identities distinct for %s', async (runIds, suffix) => {
    mocks.unofficial.mockImplementation(() =>
      Response.json({
        benchmarks: [
          agenticRow({ id: 123 }),
          agenticRow({
            id: 456,
            run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/456${suffix}`,
          }),
        ],
        evaluations: [],
      }),
    );
    const response = await first(
      req(
        'first-token',
        `model=DeepSeek-V4-Pro&unofficialrun=${encodeURIComponent(runIds)}&caps=1&minInteractivity=40`,
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.series.map((series: { key: string }) => series.key)).toEqual([
      'run:0',
      'run:1',
    ]);
    expect(
      body.data.cells.map(
        (cell: { winner: { runIndex: number; point: { sourceRow: BenchmarkRow } } }) => [
          cell.winner.runIndex,
          cell.winner.point.sourceRow.id,
        ],
      ),
    ).toEqual([
      [0, 123],
      [1, 456],
    ]);
  });
  it.each(['', '&precisions=fp8'])(
    'fetches overlays once per comparison request and preserves precision selection %s',
    async (precision) => {
      mocks.benchmarks.mockImplementation(() => Response.json([agenticRow()]));
      let overlay = agenticRow({ id: 456, hardware: 'b300', precision: 'fp8' });
      mocks.unofficial.mockImplementation(() =>
        Response.json({ benchmarks: [overlay], evaluations: [] }),
      );
      const query = `model=DeepSeek-V4-Pro&date=2026-09-11&dates=2026-09-09,2026-09-10&unofficialrun=456&target=45&priceSource=custom${precision}`;
      const response = await profit(req('profit-estimator', query));
      expect(response.status).toBe(200);
      const body = await response.json();
      const firstFetchCount = mocks.unofficial.mock.calls.length;
      expect(body.params.precisions).toEqual(precision ? ['fp8'] : ['fp4', 'fp8']);
      expect(hardwareKeys(body.data)).toEqual(precision ? [] : ['b200_sglang']);
      expect(hardwareKeys(body.overlays)).toEqual(['b300_sglang']);
      expect(body.comparisons.map((comparison: { data: unknown }) => comparison.data)).toEqual([
        body.data,
        body.data,
      ]);

      // An in-progress run can change between requests; the next one must fetch it again.
      overlay = { ...overlay, hardware: 'mi355x' };
      const freshResponse = await profit(req('profit-estimator', query));
      expect(freshResponse.status).toBe(200);
      const fresh = await freshResponse.json();
      expect(hardwareKeys(fresh.overlays)).toEqual(['mi355x_sglang']);
      expect(fresh.comparisons).toEqual(body.comparisons);
      expect([firstFetchCount, mocks.unofficial.mock.calls.length]).toEqual([1, 2]);
    },
  );
  it.each(['modeled', 'compare'])(
    'uses exact comparison snapshots with %s power while keeping the primary date cutoff',
    async (powerBasis) => {
      const rows = [
        agenticRow({ id: 90, hardware: 'mi355x', date: '2026-09-09' }),
        agenticRow({ id: 100 }),
      ];
      // A pinned run can legitimately contain append-only rows from an older date.
      const pinned = agenticRow({ id: 789, hardware: 'b300', date: '2026-09-08' });
      mocks.benchmarks.mockImplementation((request: NextRequest) => {
        const search = request.nextUrl.searchParams;
        if (search.get('runId') === '789' && search.get('exactRun') === 'true')
          return Response.json([pinned]);
        const date = search.get('date')!;
        return Response.json(
          rows.filter((row) =>
            search.get('exact') === 'true' ? row.date === date : row.date <= date,
          ),
        );
      });
      const response = await gw(
        req(
          'profit-estimator-per-gigawatt',
          `model=DeepSeek-V4-Pro&date=2026-09-11&dates=2026-09-10,2026-09-10~r789&precisions=fp4&target=45&priceSource=custom&powerBasis=${powerBasis}`,
        ),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.params.date).toBe('2026-09-11');
      expect(hardwareKeys(body.data)).toEqual(['b200_sglang', 'mi355x_sglang']);
      expect(body.comparisons.map((comparison: { entry: string }) => comparison.entry)).toEqual([
        '2026-09-10',
        '2026-09-10~r789',
      ]);
      expect(hardwareKeys(body.comparisons[0].data)).toEqual(['b200_sglang']);
      expect(hardwareKeys(body.comparisons[1].data)).toEqual(['b300_sglang']);
      expect(body.comparisons[0].data.skipped).toEqual([]);
      expect(body.comparisons[0].data.rows).toHaveLength(powerBasis === 'compare' ? 2 : 1);
      expect(body.comparisons[0].data.rows[0].revenuePerGpuHour).toBeCloseTo(5.8536, 4);
    },
  );
  it.each(['modeled', 'compare'])(
    'labels full-chassis extrapolation for official and overlay %s estimates',
    async (powerBasis) => {
      const partial = agenticRow({
        prefill_tp: 4,
        decode_tp: 4,
        num_prefill_gpu: 4,
        num_decode_gpu: 4,
        metrics: { ...agenticRow().metrics, avg_total_gpu_power_w: 2400 },
      });
      mocks.benchmarks.mockImplementation(() => Response.json([partial]));
      mocks.unofficial.mockImplementation(() =>
        Response.json({ benchmarks: [{ ...partial, id: 456 }], evaluations: [] }),
      );
      const response = await gw(
        req(
          'profit-estimator-per-gigawatt',
          `model=DeepSeek-V4-Pro&target=45&priceSource=custom&powerBasis=${powerBasis}&unofficialrun=456`,
        ),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      for (const output of [body.data, body.overlays]) {
        expect(output.skipped).toEqual([]);
        expect(output.rows.map((row: { powerLabel: string }) => row.powerLabel)).toEqual(
          powerBasis === 'compare'
            ? ['Provisioned', 'Measured + modeled · Full-chassis extrapolation']
            : ['Full-chassis extrapolation'],
        );
      }
    },
  );
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
