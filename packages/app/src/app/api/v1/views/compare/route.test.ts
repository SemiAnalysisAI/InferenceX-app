import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import type { ComparePageDerivedData } from '@/lib/compare-page-data.server';
import { computeCompareTableData, summarize } from '@/lib/compare-ssr';
import { buildCompareTable } from '@/lib/views-api/compare-view';

const { mockGetComparePageDerivedData, mockCachedJson, mockCachedText } = vi.hoisted(() => ({
  mockGetComparePageDerivedData: vi.fn(),
  mockCachedJson: vi.fn((data: unknown) => Response.json(data)),
  mockCachedText: vi.fn(
    (data: string, contentType: string) =>
      new Response(data, { headers: { 'Content-Type': contentType } }),
  ),
}));

vi.mock('@/lib/compare-page-data.server', () => ({
  getComparePageDerivedData: mockGetComparePageDerivedData,
}));

vi.mock('@/lib/benchmark-data.server', () => ({
  getCachedBenchmarks: vi.fn(),
}));

vi.mock('@/lib/api-cache', () => ({
  cachedJson: mockCachedJson,
  cachedText: mockCachedText,
}));

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

let nextId = 1;

function stubRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextId++,
    hardware: 'h200',
    framework: 'sglang',
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
    isl: 1024,
    osl: 1024,
    conc: 128,
    image: null,
    metrics: { tput_per_gpu: 100, median_intvty: 30 },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  } as BenchmarkRow;
}

function pairRows(): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [];
  const knots: [number, number][] = [
    [16, 40],
    [32, 30],
    [64, 20],
    [128, 10],
  ];
  for (const hardware of ['b200', 'h200']) {
    const scale = hardware === 'b200' ? 1.5 : 1;
    for (const [conc, intvty] of knots) {
      rows.push(
        stubRow({
          hardware,
          conc,
          metrics: { tput_per_gpu: conc * 10 * scale, median_intvty: intvty },
        }),
      );
    }
  }
  return rows;
}

function buildDerived(rows: BenchmarkRow[]): ComparePageDerivedData {
  const { defaultTargets, ssrRows, interactivityRange } = computeCompareTableData(
    rows,
    'b200',
    'h200',
    '1k/1k',
    'fp8',
  );
  return {
    sequence: '1k/1k',
    precision: 'fp8',
    summaryA: summarize(rows, 'b200'),
    summaryB: summarize(rows, 'h200'),
    defaultTargets,
    ssrRows,
    interactivityRange,
    oldest: '2026-03-01',
    newest: '2026-03-01',
    initialPairBenchmarkRows: rows,
  };
}

const ROWS = pairRows();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetComparePageDerivedData.mockResolvedValue(buildDerived(ROWS));
});

describe('GET /api/v1/views/compare', () => {
  it('serves a slug pair with page-parity table rows', async () => {
    const response = await GET(request('/api/v1/views/compare?slug=deepseek-r1-h200-vs-b200'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.view).toBe('compare');
    expect(body.apiVersion).toBe('v1');
    expect(body.generatedAt).toBe('2026-03-01');
    // GPU order is canonicalized (alphabetical) like the page redirect.
    expect(body.params.slug).toBe('deepseek-r1-b200-vs-h200');
    expect(body.gpus).toEqual(['b200', 'h200']);
    expect(body.model).toEqual({
      slug: 'deepseek-r1',
      displayName: 'DeepSeek-R1-0528',
      label: 'DeepSeek R1',
    });
    expect(body.scenario).toBe('1k/1k');
    expect(body.precision).toBe('fp8');
    expect(mockGetComparePageDerivedData).toHaveBeenCalledWith(
      ['dsr1'],
      'b200',
      'h200',
      null,
      null,
      '8k/1k',
    );

    // Parity with the page pipeline, minus nearestPoints evidence arrays.
    const derived = buildDerived(ROWS);
    expect(body.table).toEqual(
      structuredClone(buildCompareTable(derived.ssrRows, 'default', 'b200', 'h200')),
    );
    expect(body.tiers).toEqual(derived.defaultTargets);
    expect(body.table).toHaveLength(3);
    for (const row of body.table) {
      expect(row.basis).toBe('throughputPerGpu');
      expect(row.winner).toBe('b200'); // 1.5x throughput at every knot
      expect(row.a.throughputPerGpu).toBeGreaterThan(row.b.throughputPerGpu);
      expect(row.a).not.toHaveProperty('nearestPoints');
    }
    expect(body.summary.headToHead?.faster).toBe('B200');
    expect(body.summary.a.configCount).toBeGreaterThan(0);
  });

  it('accepts model+gpus and matches the slug spelling', async () => {
    const bySlugRes = await GET(request('/api/v1/views/compare?slug=deepseek-r1-b200-vs-h200'));
    const bySlug = await bySlugRes.json();
    const byPairRes = await GET(request('/api/v1/views/compare?model=deepseek-r1&gpus=h200,b200'));
    const byPair = await byPairRes.json();
    expect(byPair).toEqual(bySlug);
  });

  it('switches the winner basis to cost for variant=per-dollar', async () => {
    const response = await GET(
      request('/api/v1/views/compare?slug=deepseek-r1-b200-vs-h200&variant=per-dollar'),
    );
    const body = await response.json();
    for (const row of body.table) {
      expect(row.basis).toBe('costPerMtok');
      const expectedWinner = row.a.costPerMtok < row.b.costPerMtok ? 'b200' : 'h200';
      expect(row.winner).toBe(expectedWinner);
    }
  });

  it('interpolates custom tiers and drops out-of-range requests', async () => {
    const response = await GET(
      request('/api/v1/views/compare?slug=deepseek-r1-b200-vs-h200&tiers=15,25,500'),
    );
    const body = await response.json();
    // Measured interactivity spans 10-40 tok/s/user; 500 is unreachable.
    expect(body.tiers).toEqual([15, 25]);
    expect(body.params.tiers).toEqual([15, 25, 500]);
    for (const row of body.table) {
      expect(row.a).not.toBeNull();
      expect(row.b).not.toBeNull();
    }
    // headToHead stays pinned to the default targets (display label, as on page).
    expect(body.summary.headToHead?.faster).toBe('B200');
  });

  it('adds a spec-decode breakdown for variant=spec-decode', async () => {
    const response = await GET(
      request('/api/v1/views/compare?slug=deepseek-r1-b200-vs-h200&variant=spec-decode'),
    );
    const body = await response.json();
    expect(body.summary.bySpecDecode).toHaveLength(1);
    const entry = body.summary.bySpecDecode[0];
    expect(entry.specMethod).toBe('none');
    expect(entry.a?.hardware).toBe('b200');
    expect(entry.b?.hardware).toBe('h200');
    expect(entry.a.throughputPerGpu).toBeGreaterThan(entry.b.throughputPerGpu);
  });

  it('rejects an unknown slug', async () => {
    const response = await GET(request('/api/v1/views/compare?slug=not-a-pair'));
    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.param).toBe('slug');
    expect(mockGetComparePageDerivedData).not.toHaveBeenCalled();
  });

  it('rejects gpus lists that are not exactly two known keys', async () => {
    const single = await GET(request('/api/v1/views/compare?model=deepseek-r1&gpus=b200'));
    expect(single.status).toBe(400);
    const singleBody = await single.json();
    expect(singleBody.param).toBe('gpus');

    const unknown = await GET(request('/api/v1/views/compare?model=deepseek-r1&gpus=b200,warp9'));
    expect(unknown.status).toBe(400);
    const body = await unknown.json();
    expect(body.param).toBe('gpus');
    expect(body.allowed).toContain('b200');
  });

  it('rejects requests with neither slug nor model+gpus', async () => {
    const response = await GET(request('/api/v1/views/compare'));
    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.param).toBe('slug');
  });

  it('rejects malformed tiers and unknown scenario aliases', async () => {
    const tiers = await GET(
      request('/api/v1/views/compare?slug=deepseek-r1-b200-vs-h200&tiers=15,-3'),
    );
    expect(tiers.status).toBe(400);
    const tiersBody = await tiers.json();
    expect(tiersBody.param).toBe('tiers');

    const scenario = await GET(
      request('/api/v1/views/compare?slug=deepseek-r1-b200-vs-h200&scenario=16k-16k'),
    );
    expect(scenario.status).toBe(400);
    const scenarioBody = await scenario.json();
    expect(scenarioBody.param).toBe('scenario');
  });

  it('serves format=csv with one row per tier', async () => {
    const response = await GET(
      request('/api/v1/views/compare?slug=deepseek-r1-b200-vs-h200&format=csv'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const responseText = await response.text();
    const lines = responseText.trim().split('\r\n');
    expect(lines[0].startsWith('model,scenario,tier,basis,delta_pct,winner,a_hardware')).toBe(true);
    expect(lines).toHaveLength(4); // header + 3 default targets
  });

  it('returns 500 when compare assembly fails', async () => {
    mockGetComparePageDerivedData.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await GET(request('/api/v1/views/compare?slug=deepseek-r1-b200-vs-h200'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
