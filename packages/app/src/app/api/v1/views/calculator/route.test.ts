import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetLatestBenchmarks, mockCachedJson, mockCachedText } = vi.hoisted(() => ({
  mockGetLatestBenchmarks: vi.fn(),
  mockCachedJson: vi.fn((data: unknown) => Response.json(data)),
  mockCachedText: vi.fn(
    (data: string, contentType: string) =>
      new Response(data, { headers: { 'Content-Type': contentType } }),
  ),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  FIXTURES_MODE: false,
  getDb: vi.fn(() => ({}) as unknown),
}));

vi.mock('@semianalysisai/inferencex-db/queries/benchmarks', () => ({
  getLatestBenchmarks: mockGetLatestBenchmarks,
}));

vi.mock('@/lib/api-cache', () => ({
  // Pass-through: the route's cachedQuery wrapper must not hide the query args.
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: mockCachedJson,
  cachedText: mockCachedText,
}));

import type { BenchmarkRow } from '@/lib/api';
import { interpolateForGPU } from '@/components/calculator/interpolation';
import { buildGpuGroups } from '@/components/calculator/throughput-data';
import { toCalculatorBenchmarkRows } from '@/lib/benchmark-api-view';
import { Percentile, Sequence } from '@/lib/data-mappings';

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    hardware: 'b300',
    framework: 'sglang',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 8,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 8,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 1024,
    osl: 1024,
    conc: 8,
    offload_mode: 'off',
    image: 'sglang:test',
    metrics: {
      median_intvty: 50,
      tput_per_gpu: 900,
      output_tput_per_gpu: 300,
      input_tput_per_gpu: 600,
    },
    date: '2026-07-19',
    run_url: null,
    ...overrides,
  };
}

/** Two operating points bracketing the default 35 tok/s/user target. */
const FIXTURE_ROWS: BenchmarkRow[] = [
  makeRow({ conc: 8 }),
  makeRow({
    conc: 16,
    metrics: {
      median_intvty: 30,
      tput_per_gpu: 1500,
      output_tput_per_gpu: 500,
      input_tput_per_gpu: 1000,
    },
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLatestBenchmarks.mockResolvedValue(FIXTURE_ROWS);
});

describe('GET /api/v1/views/calculator', () => {
  it('rejects an unknown mode with the allowed values', async () => {
    const response = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&mode=sideways'),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.param).toBe('mode');
    expect(body.allowed).toEqual(['interactivity-to-throughput', 'throughput-to-interactivity']);
    expect(mockGetLatestBenchmarks).not.toHaveBeenCalled();
  });

  it('requires model', async () => {
    const response = await GET(request('/api/v1/views/calculator'));
    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.param).toBe('model');
  });

  it('interpolates each hardware group at the target (parity with interpolateForGPU)', async () => {
    const response = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k'),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.view).toBe('calculator');
    expect(body.apiVersion).toBe('v1');
    expect(body.generatedAt).toBe('2026-07-19');
    expect(body.params).toMatchObject({
      model: 'DeepSeek-V4-Pro',
      sequence: '1k/1k',
      precisions: ['fp4'], // auto-resolved: only precision in the rows
      target: 35,
      mode: 'interactivity-to-throughput',
      costProvider: 'costh',
      costType: 'total',
      percentile: 'p90',
    });
    expect(body.count).toBe(1);

    const [entry] = body.hardware;
    expect(entry.hwKey).toBe('b300_sglang');
    expect(entry.clamped).toBe(false);
    expect(entry.value).toBeGreaterThan(900);
    expect(entry.value).toBeLessThan(1500);
    expect(entry.nearest.below).toMatchObject({ interactivity: 30, throughput: 1500 });
    expect(entry.nearest.above).toMatchObject({ interactivity: 50, throughput: 900 });
    expect(entry.fleet).toBeUndefined();

    // Parity: the exact pure pipeline the dashboard runs on these rows.
    const { grouped } = buildGpuGroups(toCalculatorBenchmarkRows(FIXTURE_ROWS, '1k/1k'), {
      sequence: Sequence.OneK_OneK,
      precisions: ['fp4'],
      percentile: Percentile.P90,
      tokenType: 'total',
      classify: (hwKey) => ({ key: hwKey, meta: { hwKey } }),
    });
    const expected = interpolateForGPU(
      grouped.b300_sglang,
      35,
      'interactivity_to_throughput',
      'costh',
    );
    expect(expected).not.toBeNull();
    expect(entry.value).toBeCloseTo(expected!.value, 10);
    expect(entry.cost.total).toBeCloseTo(expected!.cost, 10);
    expect(entry.tpPerMw).toBeCloseTo(expected!.tpPerMw, 10);
    expect(entry.concurrency).toBe(expected!.concurrency);
  });

  it('canonicalizes list params: gpu base key and full hwKey select the same group', async () => {
    const byBaseRes = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k&gpus=B300'),
    );
    const byBase = await byBaseRes.json();
    const byFullKeyRes = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k&gpus=b300_sglang'),
    );
    const byFullKey = await byFullKeyRes.json();
    expect(byBase.hardware).toEqual(byFullKey.hardware);
    expect(byBase.count).toBe(1);

    const filteredOutRes = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k&gpus=mi355x'),
    );
    const filteredOut = await filteredOutRes.json();
    expect(filteredOut.count).toBe(0);
  });

  it('sizes a fleet per bar when mw is set', async () => {
    const response = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100'),
    );
    const body = await response.json();
    const [entry] = body.hardware;
    expect(entry.fleet).not.toBeNull();
    expect(entry.fleet.chips).toBeGreaterThan(0);
    // The fleet streams the whole interpolated total rate.
    expect(entry.fleet.totalTokPerSec).toBeCloseTo(entry.fleet.chips * entry.value, 6);
    expect(entry.fleet.concurrentUsers).toBeGreaterThan(0);
  });

  it('supports throughput-to-interactivity mode', async () => {
    const response = await GET(
      request(
        '/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k&mode=throughput-to-interactivity&target=1200',
      ),
    );
    const body = await response.json();
    const [entry] = body.hardware;
    // 1200 tok/s/gpu sits between the 900 and 1500 measurements.
    expect(entry.value).toBeGreaterThan(30);
    expect(entry.value).toBeLessThan(50);
    expect(entry.clamped).toBe(false);
  });

  it('reports the cost-cap frontier when costcap is set', async () => {
    const response = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k&costcap=1000'),
    );
    const body = await response.json();
    expect(body.costCap).toHaveLength(1);
    // A cap this loose never binds, so the config serves its full measured range.
    expect(body.costCap[0].maxInteractivity).toBe(50);
  });

  it('renders CSV when format=csv', async () => {
    const response = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k&format=csv'),
    );
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const text = await response.text();
    const [header, firstRow] = text.split('\n');
    expect(header).toContain('hwKey');
    expect(firstRow).toContain('b300_sglang');
  });

  it('rejects a malformed runId and passes a numeric one to the query', async () => {
    const bad = await GET(request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&runId=abc'));
    expect(bad.status).toBe(400);
    const badBody = await bad.json();
    expect(badBody.param).toBe('runId');

    await GET(
      request(
        '/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k&date=2026-07-19&runId=123',
      ),
    );
    expect(mockGetLatestBenchmarks).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['dsv4']),
      '2026-07-19',
      undefined,
      '123',
    );
  });

  it('returns 500 when the query fails', async () => {
    mockGetLatestBenchmarks.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await GET(
      request('/api/v1/views/calculator?model=DeepSeek-V4-Pro&sequence=1k/1k'),
    );
    expect(response.status).toBe(500);
  });
});
