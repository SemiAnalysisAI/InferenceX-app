import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import type { BenchmarkRow } from '@/lib/api';

const { mockGetAllBenchmarksForHistory, mockGetDb } = vi.hoisted(() => ({
  mockGetAllBenchmarksForHistory: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/benchmarks', () => ({
  getAllBenchmarksForHistory: mockGetAllBenchmarksForHistory,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
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
      tput_per_gpu: 300,
      output_tput_per_gpu: 280,
      input_tput_per_gpu: 20,
      median_ttft: 0.15,
      median_intvty: 35,
      median_e2el: 2.3,
    },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  } as BenchmarkRow;
}

/** A three-point interactivity curve for one hardware on one snapshot date. */
function curve(date: string, hardware: string, framework: string, scale = 1): BenchmarkRow[] {
  return [
    [10, 500],
    [35, 300],
    [60, 100],
  ].map(([intvty, tput]) =>
    makeRow({
      hardware,
      framework,
      date,
      conc: 64 / (intvty / 10),
      metrics: {
        ...makeRow().metrics,
        median_intvty: intvty,
        tput_per_gpu: tput * scale,
        output_tput_per_gpu: tput * scale,
      },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllBenchmarksForHistory.mockResolvedValue([
    ...curve('2026-02-01', 'h200', 'trt'),
    ...curve('2026-03-01', 'h200', 'trt', 1.2),
    ...curve('2026-02-01', 'mi300x', 'vllm'),
  ]);
});

describe('GET /api/v1/views/historical', () => {
  it('builds interpolated trend lines at the target interactivity', async () => {
    const res = await GET(
      request('/api/v1/views/historical?model=DeepSeek-R1-0528&metric=tpPerGpu&target=35'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockGetAllBenchmarksForHistory).toHaveBeenCalledWith('mock-sql', ['dsr1'], 8192, 1024);
    expect(body.view).toBe('historical');
    expect(body.apiVersion).toBe('v1');
    expect(body.params).toMatchObject({
      model: 'DeepSeek-R1-0528',
      sequence: '8k/1k',
      metric: 'y_tpPerGpu',
      target: 35,
      precisions: ['fp8'],
    });
    expect(body.metric.key).toBe('tpPerGpu');

    expect(body.series.length).toBe(2);
    const h200 = body.series.find((s: { hwKey: string }) => s.hwKey.startsWith('h200'));
    expect(h200.points).toHaveLength(2);
    // Target 35 sits exactly on a sample point: value equals that point's metric.
    expect(h200.points[0]).toMatchObject({ date: '2026-02-01', value: 300 });
    expect(h200.points[1].date).toBe('2026-03-01');
    expect(body.hwKeysWithData.length).toBe(2);
  });

  it('extends shorter lines to the latest data date with a synthetic point', async () => {
    const bodyRes = await GET(
      request('/api/v1/views/historical?model=DeepSeek-R1-0528&metric=tpPerGpu'),
    );
    const body = await bodyRes.json();

    const mi300x = body.series.find((s: { hwKey: string }) => s.hwKey.startsWith('mi300x'));
    // Real 2026-02-01 point plus a synthetic extension to 2026-03-01 (latest data date).
    expect(mi300x.points).toHaveLength(2);
    expect(mi300x.points[1]).toMatchObject({ date: '2026-03-01', synthetic: true });
    expect(mi300x.points[1].value).toBe(mi300x.points[0].value);
  });

  it('applies vendor and date-range row filters', async () => {
    const amdRes = await GET(
      request('/api/v1/views/historical?model=DeepSeek-R1-0528&metric=tpPerGpu&vendors=amd'),
    );
    const amd = await amdRes.json();
    expect(amd.series).toHaveLength(1);
    expect(amd.series[0].hwKey.startsWith('mi300x')).toBe(true);

    const earlyRes = await GET(
      request('/api/v1/views/historical?model=DeepSeek-R1-0528&metric=tpPerGpu&end=2026-02-15'),
    );
    const early = await earlyRes.json();
    expect(early.params.end).toBe('2026-02-15');
    // Only the February snapshot survives; no extension beyond it.
    for (const series of early.series) {
      expect(series.points).toHaveLength(1);
      expect(series.points[0].date).toBe('2026-02-01');
    }
  });

  it('queries the agentic history for agentic-traces', async () => {
    mockGetAllBenchmarksForHistory.mockResolvedValue([]);
    const res = await GET(
      request('/api/v1/views/historical?model=DeepSeek-R1-0528&metric=tpPerGpu&sequence=agentic'),
    );
    expect(res.status).toBe(200);
    expect(mockGetAllBenchmarksForHistory).toHaveBeenCalledWith(
      'mock-sql',
      ['dsr1'],
      null,
      null,
      'agentic_traces',
    );
    const resBody = await res.json();
    expect(resBody.params.sequence).toBe('agentic-traces');
  });

  it('rejects unknown metrics and out-of-range targets', async () => {
    const badMetric = await GET(
      request('/api/v1/views/historical?model=DeepSeek-R1-0528&metric=bogus'),
    );
    expect(badMetric.status).toBe(400);
    const badMetricBody = await badMetric.json();
    expect(badMetricBody.param).toBe('metric');

    const badTarget = await GET(
      request('/api/v1/views/historical?model=DeepSeek-R1-0528&target=0'),
    );
    expect(badTarget.status).toBe(400);
    const badTargetBody = await badTarget.json();
    expect(badTargetBody.param).toBe('target');
  });

  it('returns flat CSV rows when format=csv', async () => {
    const res = await GET(
      request('/api/v1/views/historical?model=DeepSeek-R1-0528&metric=tpPerGpu&format=csv'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const resText = await res.text();
    const [header, ...lines] = resText.trim().split(/\r?\n/);
    expect(header).toContain('hwKey');
    expect(header).toContain('date');
    expect(header).toContain('value');
    expect(lines.length).toBeGreaterThan(0);
  });
});
