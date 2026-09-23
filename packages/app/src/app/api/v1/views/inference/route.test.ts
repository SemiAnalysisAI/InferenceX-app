import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildEqualServiceComparison,
  getEqualServiceSources,
} from '@/components/inference/utils/equal-service-comparison';
import { buildInferenceSeries } from '@/lib/views-api/series';
import { Sequence } from '@/lib/data-mappings';
import type { BenchmarkRow } from '@/lib/api';

const { mockGetLatestBenchmarks, mockGetBenchmarksForRun, mockUnofficialRun, mockGetDb } =
  vi.hoisted(() => ({
    mockGetLatestBenchmarks: vi.fn(),
    mockGetBenchmarksForRun: vi.fn(),
    mockUnofficialRun: vi.fn(),
    mockGetDb: vi.fn(() => 'mock-sql'),
  }));

vi.mock('@/app/api/unofficial-run/route', () => ({ GET: mockUnofficialRun }));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/benchmarks', () => ({
  getLatestBenchmarks: mockGetLatestBenchmarks,
  getBenchmarksForRun: mockGetBenchmarksForRun,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedDerivedData: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: (data: unknown) => Response.json(data),
  cachedText: (data: string, contentType: string) =>
    new Response(data, { headers: { 'Content-Type': contentType } }),
}));

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

let nextId = 1;

function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextId++,
    hardware: 'h200',
    framework: 'trt',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    offload_mode: 'off',
    isl: 8192,
    osl: 1024,
    conc: 64,
    image: 'img:1',
    metrics: {
      tput_per_gpu: 450.5,
      output_tput_per_gpu: 400.2,
      input_tput_per_gpu: 50.3,
      median_ttft: 0.15,
      p90_ttft: 0.3,
      median_tpot: 0.012,
      median_intvty: 12.5,
      median_itl: 0.011,
      median_e2el: 2.3,
    },
    date: '2026-03-01',
    run_url: 'https://github.com/org/repo/actions/runs/777',
    ...overrides,
  } as BenchmarkRow;
}

const ROWS = [
  makeRow({ conc: 16, metrics: { ...makeRow().metrics, median_intvty: 40, tput_per_gpu: 200 } }),
  makeRow(),
  makeRow({ hardware: 'mi300x', framework: 'vllm', conc: 32 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLatestBenchmarks.mockResolvedValue(ROWS);
  mockGetBenchmarksForRun.mockResolvedValue(ROWS);
  mockUnofficialRun.mockImplementation(() => Response.json({ benchmarks: [], evaluations: [] }));
});

describe('GET /api/v1/views/inference', () => {
  it('calculates equal-service panels from observed points before frontier pruning with endpoint provenance', async () => {
    const rows = ['h200', 'mi300x'].flatMap((hardware, index) =>
      [20, 60].map((x, position) =>
        makeRow({
          hardware,
          conc: position + 1,
          metrics: {
            ...makeRow().metrics,
            median_intvty: x,
            avg_power_w: 200 + 200 * position + 50 * index,
            output_tput_per_gpu: 100 + 100 * position + 50 * index,
            joules_per_output_token: 4 - 2 * position - index,
            power_valid: 1,
            power_metric_schema_version: 2,
          },
        }),
      ),
    );
    mockGetLatestBenchmarks.mockResolvedValue(rows);
    const projected = buildInferenceSeries(rows, {
      sequence: Sequence.EightK_OneK,
      percentile: 'p90',
      precisions: ['fp8'],
      metricConfigKey: 'y_measuredAvgPower',
      xmode: 'interactivity',
      xmetric: 'p90_ttft',
      gpus: [],
      quickFilters: { vendors: [], frameworks: [], deployment: [], spec: [], power: [] },
      optimal: true,
      best: true,
    });
    const sources = getEqualServiceSources(projected.observedPoints);
    const expected = buildEqualServiceComparison(projected.observedPoints, {
      baseline: sources[0].key,
      comparator: sources[1].key,
      target: 40,
      xField: 'median_intvty',
    });
    const response = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=measuredAvgPower&serviceCompare=true&serviceTarget=40',
      ),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.serviceSources).toEqual(sources);
    expect(body.equalServiceComparison.metrics.meanWattsPerGpu.changePercent).toBeCloseTo(100 / 6);
    expect(body.equalServiceComparison.metrics.outputTokensPerSecond.changePercent).toBeCloseTo(
      100 / 3,
    );
    expect(body.equalServiceComparison.metrics.joulesPerOutputToken.changePercent).toBeCloseTo(
      -100 / 3,
    );
    for (const [metric, values] of Object.entries(expected.metrics)) {
      expect(body.equalServiceComparison.metrics[metric].changePercent).toBe(values.changePercent);
      expect(body.equalServiceComparison.metrics[metric].baseline.value).toBe(
        values.baseline?.value,
      );
    }
    expect(
      body.equalServiceComparison.metrics.meanWattsPerGpu.baseline.endpoints.map(
        (endpoint: { point: { id: number } }) => endpoint.point.id,
      ),
    ).toEqual(rows.slice(0, 2).map((row) => row.id));
    expect(
      body.equalServiceComparison.metrics.meanWattsPerGpu.baseline.endpoints[0].point.runUrl,
    ).toBe(rows[0].run_url);
    expect(body).not.toHaveProperty('observedPoints');
    expect(body.equalServiceCurve).toHaveLength(2);
  });

  it('preserves explicit unavailable sources, omits target by default and rejects unsupported CSV panels', async () => {
    const response = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&serviceCompare=true'),
    );
    const responseBody = await response.json();
    expect(responseBody.equalServiceComparison).toBeNull();
    const stale = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&serviceCompare=true&serviceBaseline=missing&serviceTarget=40',
      ),
    );
    const body = await stale.json();
    expect(body.params.serviceBaseline).toBe('missing');
    expect(body.equalServiceComparison.reason).toBe('unknown-source');
    const diagnostic = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&serviceCompare=true&serviceTarget=40&xmode=concurrency',
      ),
    );
    const diagnosticBody = await diagnostic.json();
    expect(diagnosticBody.equalServiceComparison.reason).toBe('unsupported-axis');
    for (const extra of [
      'format=csv&serviceCompare=true',
      'format=csv&roleShare=true',
      'serviceTarget=0',
      'serviceTarget=',
      'serviceTarget=NaN',
    ]) {
      const invalid = await GET(request(`/api/v1/views/inference?model=DeepSeek-R1-0528&${extra}`));
      expect(invalid.status).toBe(400);
    }
  });

  it('includes unofficial sources and validated role shares using one output-token denominator', async () => {
    const row = makeRow({
      hardware: 'gb200',
      framework: 'trt',
      disagg: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
      prefill_num_workers: 1,
      decode_num_workers: 1,
      metrics: {
        ...makeRow().metrics,
        avg_power_w: 400,
        power_valid: 1,
        power_metric_schema_version: 2,
        joules_per_input_token: 1,
        joules_per_output_token: 8,
        prefill_joules_per_input_token: 0.4,
        decode_joules_per_output_token: 4.8,
      },
    });
    mockGetLatestBenchmarks.mockResolvedValue([row]);
    mockUnofficialRun.mockImplementation(() =>
      Response.json({
        benchmarks: [{ ...row, id: 999, run_url: 'https://github.com/org/repo/actions/runs/999' }],
        evaluations: [],
      }),
    );
    const response = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=measuredAvgPower&serviceCompare=true&roleShare=true&unofficialrun=999',
      ),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.serviceSources).toHaveLength(2);
    expect(body.roleEnergyShares).toHaveLength(2);
    expect(
      body.roleEnergyShares
        .map((item: { point: { id: number } }) => item.point.id)
        .sort((a: number, b: number) => a - b),
    ).toEqual([row.id, 999].sort((a, b) => a - b));
    for (const share of body.roleEnergyShares) {
      expect(share).toMatchObject({
        prefill: 3.2,
        decode: 4.8,
        total: 8,
        prefillShare: 40,
        decodeShare: 60,
      });
    }
    expect(body.overlays[0]).not.toHaveProperty('observedPoints');
  });

  it('resolves the fixed-sequence statistic and rejects unknown values', async () => {
    mockGetLatestBenchmarks.mockResolvedValue([
      makeRow({ metrics: { ...makeRow().metrics, mean_tpot: 0.025, mean_intvty: 99 } }),
    ]);
    const response = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&xstat=mean'),
    );
    const body = await response.json();
    expect(body.params.xstat).toBe('mean');
    expect(body.xAxis).toMatchObject({ field: 'mean_tpot_intvty', statistic: 'mean' });
    expect(body.series[0].points[0].x).toBe(40);
    const diagnostic = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&xstat=mean&xmode=concurrency',
      ),
    );
    const diagnosticBody = await diagnostic.json();
    expect(diagnosticBody.params.xstat).toBeNull();
    expect(diagnosticBody.xAxis.statistic).toBeNull();
    const invalid = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&xstat=average'),
    );
    expect(invalid.status).toBe(400);
    const invalidBody = await invalid.json();
    expect(invalidBody.param).toBe('xstat');
  });

  it('keeps AgentX percentile selection independent of fixed-sequence xstat', async () => {
    mockGetLatestBenchmarks.mockResolvedValue([
      makeRow({
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        metrics: { ...makeRow().metrics, p75_itl: 1 / 35, mean_tpot: 0.025 },
      }),
    ]);
    const response = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&sequence=agentic&metric=tpPerGpu&xstat=mean&percentile=p75',
      ),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.params.xstat).toBeNull();
    expect(body.xAxis).toMatchObject({ field: 'p75_intvty', statistic: 'p75' });
    expect(body.series[0].points[0].x).toBe(35);
  });

  it('returns chart-ready series with resolved params for the default selection', async () => {
    const res = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith(
      'mock-sql',
      ['dsr1'],
      undefined,
      undefined,
      undefined,
    );
    expect(body.view).toBe('inference');
    expect(body.apiVersion).toBe('v1');
    expect(body.params).toMatchObject({
      model: 'DeepSeek-R1-0528',
      sequence: '8k/1k',
      metric: 'y_tpPerGpu',
      xmode: 'interactivity',
      xmetric: 'p90_ttft',
      percentile: 'p90',
      precisions: ['fp8'],
      optimal: true,
      best: true,
      format: 'json',
    });

    expect(body.series).toHaveLength(2);
    expect(body.count).toBe(3);
    expect(body.metric.configKey).toBe('y_tpPerGpu');
    expect(body.xAxis.field).toBe('median_intvty');
    const h200 = body.series.find((s: { gpu: string }) => s.gpu === 'h200');
    expect(h200.points).toHaveLength(2);
    expect(h200.points[0].runId).toBe(777);
  });

  it('rejects unknown models and bad enums with a 400 and allowed values', async () => {
    const badModel = await GET(request('/api/v1/views/inference?model=NotAModel'));
    expect(badModel.status).toBe(400);
    const badModelBody = await badModel.json();
    expect(badModelBody.param).toBe('model');

    const badMode = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&xmode=bogus'),
    );
    expect(badMode.status).toBe(400);
    const body = await badMode.json();
    expect(body.param).toBe('xmode');
    expect(body.allowed).toContain('interactivity');
  });

  it('resolves e2e-normalized-interactivity to the interactivity chart', async () => {
    const res = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&xmode=e2e-normalized-interactivity',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.params.xmode).toBe('interactivity');
    expect(body.xAxis.mode).toBe('interactivity');
  });

  it('fetches an exact run snapshot when runId is given', async () => {
    const res = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&runId=99'),
    );
    expect(res.status).toBe(200);
    expect(mockGetBenchmarksForRun).toHaveBeenCalledWith('mock-sql', ['dsr1'], '99');
    expect(mockGetLatestBenchmarks).not.toHaveBeenCalled();
    const resBody = await res.json();
    expect(resBody.params.runId).toBe('99');
  });

  it('keeps measured-power boundaries separate for official and unofficial runs', async () => {
    const sweep = [
      { conc: 1, interactivity: 100, watts: 250 },
      { conc: 8, interactivity: 50, watts: 500 },
      { conc: 32, interactivity: 25, watts: 450 },
    ];
    const official = sweep.map(({ conc, interactivity, watts }, index) =>
      makeRow({
        id: 100 + index,
        conc,
        metrics: { ...makeRow().metrics, median_intvty: interactivity, avg_power_w: watts },
      }),
    );
    const runUrl = 'https://github.com/org/repo/actions/runs/888/attempts/1';
    const overlay = official.map((row, index) => ({
      ...row,
      id: 200 + index,
      run_url: runUrl,
      metrics: { ...row.metrics, avg_power_w: row.metrics.avg_power_w * 2 },
    }));
    mockGetLatestBenchmarks.mockResolvedValue(official);
    mockUnofficialRun.mockImplementation(() =>
      Response.json({ benchmarks: overlay, evaluations: [] }),
    );

    const res = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=measuredAvgPower&optimal=true&unofficialrun=888',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.params.optimal).toBe(true);
    expect(body.count).toBe(2);
    expect(body.frontier).toEqual({ direction: 'upper_right', points: 2 });
    expect(body.series).toHaveLength(1);
    expect(body.series[0].points).toMatchObject([
      { id: 101, concurrency: 8, x: 50, y: 500, runId: 777, frontier: true },
      { id: 100, concurrency: 1, x: 100, y: 250, runId: 777, frontier: true },
    ]);
    expect(body.overlays).toHaveLength(1);
    expect(body.overlays[0]).toMatchObject({
      runUrl,
      count: 2,
      frontier: { direction: 'upper_right', points: 2 },
      series: [
        {
          points: [
            { id: 201, concurrency: 8, x: 50, y: 1000, runId: 888, frontier: true },
            { id: 200, concurrency: 1, x: 100, y: 500, runId: 888, frontier: true },
          ],
        },
      ],
    });
  });

  it('canonicalizes list params and applies quick filters', async () => {
    const res = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&vendors=amd&deployment=agg',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.params.vendors).toEqual(['AMD']);
    expect(body.params.deployment).toEqual(['multi-node', 'single-node']);
    expect(body.series).toHaveLength(1);
    expect(body.series[0].gpu).toBe('mi300x');
  });

  it('discovers exact topology keys and retains every observed concurrency in that topology', async () => {
    const discover = await GET(
      request(
        '/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&xmode=concurrency&optimal=true&best=true',
      ),
    );
    const initial = await discover.json();
    const key = initial.series[0].points[0].topologyKey;
    expect(typeof key).toBe('string');
    const otherTopology = makeRow({
      decode_tp: 4,
      num_decode_gpu: 4,
      num_prefill_gpu: 4,
      conc: 128,
    });
    mockGetLatestBenchmarks.mockResolvedValue([...ROWS, otherTopology]);
    const query = new URLSearchParams({
      model: 'DeepSeek-R1-0528',
      metric: 'tpPerGpu',
      xmode: 'concurrency',
      optimal: 'true',
      best: 'true',
      topologies: key,
    });
    const response = await GET(request(`/api/v1/views/inference?${query}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.params).toMatchObject({ optimal: false, best: false, topologies: [key] });
    expect(body.xAxis).toMatchObject({ mode: 'concurrency', field: 'conc' });
    expect(body.frontier).toEqual({ direction: null, points: 0 });
    expect(body.count).toBe(3);
    const points = body.series.flatMap(
      (series: { points: { x: number; concurrency: number; topologyKey: string }[] }) =>
        series.points,
    );
    expect(
      points.map((point: { x: number }) => point.x).sort((a: number, b: number) => a - b),
    ).toEqual([16, 32, 64]);
    for (const point of points) {
      expect(point.x).toBe(point.concurrency);
      expect(point.topologyKey).toBe(key);
    }
    query.set('topologies', 'unavailable-topology');
    const missing = await GET(request(`/api/v1/views/inference?${query}`));
    const missingBody = await missing.json();
    expect(missingBody.count).toBe(0);
  });

  it('case-folds the gpus filter: uppercase base keys select the same series', async () => {
    const upperRes = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&gpus=MI300X'),
    );
    expect(upperRes.status).toBe(200);
    const upper = await upperRes.json();
    const lowerRes = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&gpus=mi300x'),
    );
    const lower = await lowerRes.json();
    expect(upper.params.gpus).toEqual(['mi300x']);
    expect(upper.series).toEqual(lower.series);
    expect(upper.series.length).toBeGreaterThan(0);
  });

  it('returns flat CSV rows when format=csv', async () => {
    const res = await GET(
      request('/api/v1/views/inference?model=DeepSeek-R1-0528&metric=tpPerGpu&format=csv'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const text = await res.text();
    const [header, ...lines] = text.trim().split(/\r?\n/);
    expect(header).toContain('hwKey');
    expect(header).toContain('x');
    expect(header).toContain('y');
    expect(lines).toHaveLength(3);
  });
});
