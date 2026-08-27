import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { Model } from '@/lib/data-mappings';
import { buildOverviewModelSummary } from '@/lib/overview-data';
import { buildRankingRows } from '@/lib/rankings';

const { mockGetCachedBenchmarks, mockCachedJson, mockCachedText } = vi.hoisted(() => ({
  mockGetCachedBenchmarks: vi.fn(),
  mockCachedJson: vi.fn((data: unknown) => Response.json(data)),
  mockCachedText: vi.fn(
    (data: string, contentType: string) =>
      new Response(data, { headers: { 'Content-Type': contentType } }),
  ),
}));

vi.mock('@/lib/benchmark-data.server', () => ({
  getCachedBenchmarks: mockGetCachedBenchmarks,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedDerivedData: <T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>) => fn,
  cachedJson: mockCachedJson,
  cachedText: mockCachedText,
}));

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

let nextId = 1;

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextId++,
    hardware: 'b200',
    framework: 'sglang',
    model: 'qwen3.5',
    precision: 'fp8',
    spec_method: 'mtp',
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
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 16,
    offload_mode: 'off',
    image: null,
    metrics: { median_intvty: 50, tput_per_gpu: 1000 },
    date: '2026-07-20',
    run_url: null,
    ...overrides,
  } as BenchmarkRow;
}

/** One frontier point per overview tier for a single serving series. */
function frontier(hardware: string, totals: [number, number, number, number]): BenchmarkRow[] {
  return [30, 50, 75, 100].map((intvty, index) =>
    row({
      hardware,
      conc: index + 1,
      metrics: { median_intvty: intvty, tput_per_gpu: totals[index] },
    }),
  );
}

const QWEN_ROWS = [
  ...frontier('b200', [1400, 1000, 700, 500]),
  ...frontier('mi355x', [1100, 800, 500, 300]),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCachedBenchmarks.mockImplementation((dbKeys: string[]) =>
    Promise.resolve(dbKeys.some((key) => key.startsWith('qwen')) ? QWEN_ROWS : []),
  );
});

describe('GET /api/v1/views/rankings', () => {
  it('defaults to cheapest-gpu over every curated scenario for an explicit model', async () => {
    const response = await GET(request('/api/v1/views/rankings?model=qwen-3-5'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.view).toBe('rankings');
    expect(body.apiVersion).toBe('v1');
    expect(body.generatedAt).toBe('2026-07-20');
    expect(body.params).toEqual({
      kind: 'cheapest-gpu',
      model: 'Qwen-3.5-397B-A17B',
      scenario: 'all',
      tier: 50,
      engine: 'community',
      format: 'json',
    });
    expect(body.tier).toBe(50);
    // Qwen3.5 is curated for both overview scenarios; agentx has no rows here
    // but stays listed for an explicit model so the response is self-describing.
    expect(body.entries.map((entry: { scenario: string }) => entry.scenario)).toEqual([
      'single_turn_8k1k',
      'agentx',
    ]);
    expect(body.entries[1].rows).toEqual([]);

    // Parity: the API rows must match the page derivation exactly.
    const summary = buildOverviewModelSummary(
      Model.Qwen3_5,
      QWEN_ROWS,
      50,
      'community',
      'single_turn_8k1k',
    );
    const expected = buildRankingRows(summary, 'cheapest-gpu');
    expect(expected.length).toBe(2);
    expect(body.entries[0].rows).toEqual(
      expected.map((rankingRow) => ({
        rank: rankingRow.rank,
        hardware: rankingRow.hardware,
        hardwareLabel: rankingRow.hardwareLabel,
        chip: rankingRow.chip?.slug ?? null,
        value: rankingRow.costPerMtok,
        unit: 'usd_per_million_tokens',
        framework: rankingRow.framework,
        precision: rankingRow.precision,
        disagg: rankingRow.disagg,
      })),
    );
    // cheapest-gpu ranks by ascending $/M tokens.
    const values = body.entries[0].rows.map((r: { value: number }) => r.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('ranks by throughput for kind=fastest-gpu', async () => {
    const response = await GET(
      request('/api/v1/views/rankings?kind=fastest-gpu&model=qwen-3-5&scenario=single_turn_8k1k'),
    );
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    const rows = body.entries[0].rows;
    expect(rows[0].unit).toBe('tokens_per_second_per_gpu');
    expect(rows[0].hardware).toBe('b200'); // 1000 tok/s/GPU at tier 50 beats 800
    expect(rows[0].value).toBe(1000);
    expect(rows[1].value).toBe(800);
  });

  it('canonicalizes scenario aliases: 8k-1k resolves like single_turn_8k1k', async () => {
    const aliasedRes = await GET(request('/api/v1/views/rankings?model=qwen-3-5&scenario=8k-1k'));
    const aliased = await aliasedRes.json();
    const canonicalRes = await GET(
      request('/api/v1/views/rankings?model=qwen-3-5&scenario=single_turn_8k1k'),
    );
    const canonical = await canonicalRes.json();
    expect(aliased).toEqual(canonical);
    expect(aliased.params.scenario).toBe('single_turn_8k1k');
  });

  it('drops rowless models from the all-models feed', async () => {
    const response = await GET(request('/api/v1/views/rankings'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries.length).toBeGreaterThan(0);
    for (const entry of body.entries) {
      expect(entry.modelSlug).toBe('qwen-3-5');
      expect(entry.rows.length).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown kind with the allowed list', async () => {
    const response = await GET(request('/api/v1/views/rankings?kind=slowest-gpu'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Unknown kind: slowest-gpu',
      param: 'kind',
      allowed: ['fastest-gpu', 'cheapest-gpu'],
    });
  });

  it('rejects an unknown scenario with the allowed list', async () => {
    const response = await GET(request('/api/v1/views/rankings?scenario=2k-2k'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.param).toBe('scenario');
    expect(body.allowed).toEqual(['single_turn_8k1k', 'agentx', '8k-1k', 'agentic']);
  });

  it('rejects an unknown model with the allowed list', async () => {
    const response = await GET(request('/api/v1/views/rankings?model=not-a-model'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.param).toBe('model');
    expect(Array.isArray(body.allowed)).toBe(true);
  });

  it('serves format=csv with one flat row per ranked hardware', async () => {
    const response = await GET(
      request('/api/v1/views/rankings?model=qwen-3-5&scenario=8k-1k&format=csv'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const responseText = await response.text();
    const lines = responseText.trim().split('\r\n');
    expect(lines[0]).toBe(
      'kind,model,model_slug,scenario,tier,rank,hardware,hardware_label,chip,value,unit,framework,precision,disagg',
    );
    expect(lines).toHaveLength(3); // header + b200 + mi355x
  });
});
