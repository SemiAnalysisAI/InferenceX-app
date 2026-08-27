import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import type { BenchmarkRow } from '@/lib/api';

const { mockGetLatestBenchmarks, mockGetBenchmarksForRun, mockGetDb } = vi.hoisted(() => ({
  mockGetLatestBenchmarks: vi.fn(),
  mockGetBenchmarksForRun: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

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
});

describe('GET /api/v1/views/inference', () => {
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
      optimal: false,
      best: false,
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
