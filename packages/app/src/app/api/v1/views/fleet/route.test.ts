import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetAllBenchmarksForHistory, mockCachedJson, mockCachedText } = vi.hoisted(() => ({
  mockGetAllBenchmarksForHistory: vi.fn(),
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
  getAllBenchmarksForHistory: mockGetAllBenchmarksForHistory,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: mockCachedJson,
  cachedText: mockCachedText,
}));

import type { BenchmarkRow } from '@/lib/api';
import { availabilityFromInterrupts, MS_PER_MONTH } from '@/components/calculator/lifecycle';

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
    date: '2026-06-01',
    run_url: 'https://github.com/run/1',
    ...overrides,
  };
}

/**
 * Two run dates for one config, each with a frontier bracketing the 35
 * tok/s/user target; the second date is ~33% faster, so the best-so-far
 * staircase has two rungs.
 */
const HISTORY_ROWS: BenchmarkRow[] = [
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
  makeRow({
    date: '2026-07-01',
    conc: 8,
    metrics: {
      median_intvty: 50,
      tput_per_gpu: 1200,
      output_tput_per_gpu: 400,
      input_tput_per_gpu: 800,
    },
    run_url: 'https://github.com/run/2',
  }),
  makeRow({
    date: '2026-07-01',
    conc: 16,
    metrics: {
      median_intvty: 30,
      tput_per_gpu: 2000,
      output_tput_per_gpu: 667,
      input_tput_per_gpu: 1333,
    },
    run_url: 'https://github.com/run/2',
  }),
];

/** DeepSeek-V4-Pro's registered release date — the series' month-0 anchor. */
const ANCHOR_MS = Date.parse('2026-04-24T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllBenchmarksForHistory.mockResolvedValue(HISTORY_ROWS);
});

describe('GET /api/v1/views/fleet', () => {
  it('requires mw', async () => {
    const response = await GET(request('/api/v1/views/fleet?model=DeepSeek-V4-Pro'));
    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.param).toBe('mw');
    expect(mockGetAllBenchmarksForHistory).not.toHaveBeenCalled();
  });

  it('rejects an unknown metric with the allowed values', async () => {
    const response = await GET(
      request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&mw=100&metric=profit'),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.param).toBe('metric');
    expect(body.allowed).toEqual([
      'margin',
      'marginPerMw',
      'revenue',
      'revenuePerMw',
      'cumulativeRevenue',
    ]);
  });

  it('builds one lifecycle series per chip from the best-so-far staircase', async () => {
    const response = await GET(
      request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100'),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.view).toBe('fleet');
    expect(body.apiVersion).toBe('v1');
    expect(body.generatedAt).toBe('2026-07-01');
    // Fixed sequence → 1k/1k resolves to its ISL/OSL history query.
    expect(mockGetAllBenchmarksForHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['dsv4']),
      1024,
      1024,
    );

    expect(body.count).toBe(1);
    const [series] = body.series;
    expect(series.hwKey).toBe('b300');
    expect(series.hwKeysUsed).toEqual(['b300_sglang']);
    expect(series.gpus).toBeGreaterThan(0);
    expect(series.improvementCount).toBe(1); // the July rung beat the June one
    expect(series.improvementFactor).toBeGreaterThan(1);
    expect(series.points.length).toBeGreaterThan(2);
    expect(series.points.every((p: { month: number }) => Number.isFinite(p.month))).toBe(true);

    // Parity: availability comes straight from the default interrupt assumptions.
    expect(series.availability).toBeCloseTo(availabilityFromInterrupts(24, 12), 12);
    expect(body.assumptions.availability).toBeCloseTo(availabilityFromInterrupts(24, 12), 12);

    // Default horizon: ceil(months from release anchor to last sweep + 2).
    const measuredMonths = (Date.parse('2026-07-01T00:00:00Z') - ANCHOR_MS) / MS_PER_MONTH;
    expect(body.assumptions.horizonMonths).toBe(Math.max(1, Math.ceil(measuredMonths + 2)));
    expect(body.assumptions.anchorDate).toBe('2026-04-24');
  });

  it('seeds both prices from the cheapest fleet break-even at the 4x ratio', async () => {
    // ramp=0 so the latest config is at full rate by the horizon — break-even
    // pricing must then close the final margin to ~zero (relative to cost).
    const bodyRes = await GET(
      request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100&ramp=0'),
    );
    const body = await bodyRes.json();
    const breakEven = body.assumptions.breakEvenPricePerMTok;
    expect(breakEven).toBeGreaterThan(0);
    expect(body.params.price).toBeCloseTo(breakEven, 12);
    expect(body.params.oprice).toBeCloseTo(breakEven * 4, 12);
    expect(body.series[0].breakEvenPricePerMTok).toBeCloseTo(breakEven, 12);

    // Break-even prices mean the fully-rolled-out fleet earns exactly its cost.
    const lastPoint = body.series[0].points.at(-1);
    expect(Math.abs(lastPoint.margin)).toBeLessThan(lastPoint.cost * 1e-9);
  });

  it('derives the missing price through the fixed output multiple', async () => {
    const bodyRes = await GET(
      request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100&price=2'),
    );
    const body = await bodyRes.json();
    expect(body.params.price).toBe(2);
    expect(body.params.oprice).toBe(8);
    expect(body.assumptions.inputPricePerMTok).toBe(2);
    expect(body.assumptions.outputPricePerMTok).toBe(8);
  });

  it('selects the plotted metric per point', async () => {
    const marginBodyRes = await GET(
      request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100&price=5'),
    );
    const marginBody = await marginBodyRes.json();
    const revenueBodyRes = await GET(
      request(
        '/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100&price=5&metric=revenue',
      ),
    );
    const revenueBody = await revenueBodyRes.json();
    const marginPoints = marginBody.series[0].points;
    const revenuePoints = revenueBody.series[0].points;
    expect(marginPoints[0].value).toBeCloseTo(marginPoints[0].margin, 12);
    expect(revenuePoints[0].value).toBeCloseTo(revenuePoints[0].revenue, 12);
    // Same underlying series either way.
    expect(revenuePoints[0].margin).toBeCloseTo(marginPoints[0].margin, 12);
  });

  it('filters chips by base gpu key', async () => {
    const bodyRes = await GET(
      request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100&gpus=mi355x'),
    );
    const body = await bodyRes.json();
    expect(body.count).toBe(0);
    expect(body.series).toEqual([]);
  });

  it('renders one CSV row per lifecycle point', async () => {
    const response = await GET(
      request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100&format=csv'),
    );
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const responseText = await response.text();
    const lines = responseText.trim().split('\n');
    expect(lines[0]).toContain('hwKey');
    expect(lines[0]).toContain('month');
    expect(lines.length).toBeGreaterThan(3);
    expect(lines[1]).toContain('b300');
  });

  it('queries agentic history without an ISL/OSL key', async () => {
    await GET(request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=agentic&mw=100'));
    expect(mockGetAllBenchmarksForHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['dsv4']),
      null,
      null,
      'agentic_traces',
    );
  });

  it('returns 500 when the query fails', async () => {
    mockGetAllBenchmarksForHistory.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await GET(
      request('/api/v1/views/fleet?model=DeepSeek-V4-Pro&sequence=1k/1k&mw=100'),
    );
    expect(response.status).toBe(500);
  });
});
