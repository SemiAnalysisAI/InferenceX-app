import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { BenchmarkRow } from '@/lib/api/api';

const mocks = vi.hoisted(() => ({ benchmarks: vi.fn(), unofficial: vi.fn() }));
vi.mock('@/app/api/v1/benchmarks/route', () => ({ GET: mocks.benchmarks }));
vi.mock('@/app/api/unofficial-run/route', () => ({ GET: mocks.unofficial }));
vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { GET } from './route';

const row: BenchmarkRow = {
  id: 1,
  hardware: 'b200',
  framework: 'vllm',
  model: 'kimik3',
  precision: 'fp8',
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
  conc: 8,
  image: 'vllm:test',
  offload_mode: 'off',
  date: '2026-10-29',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
  metrics: {
    p90_itl: 1 / 60,
    tput_per_gpu: 1000,
    input_tput_per_gpu: 500,
    output_tput_per_gpu: 500,
    server_gpu_cache_hit_rate: 0,
    theoretical_cache_hit_rate: 0.8,
  },
};
const base =
  '/api/v1/views/revenue-capacity?model=Kimi-K3&priceSource=custom&inputPrice=1&cachedInputPrice=0.1&outputPrice=1&target=60&utilization=50&revenueTarget=10000&precisions=fp8&cacheHitMode=actual';
function get(suffix = '') {
  return GET(new NextRequest(`http://localhost${base}${suffix}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.benchmarks.mockImplementation(() => Response.json([row]));
  mocks.unofficial.mockImplementation(() =>
    Response.json({
      benchmarks: [{ ...row, run_url: row.run_url!.replace('123', '456') }],
      evaluations: [],
    }),
  );
});

describe('revenue capacity GET', () => {
  it('prices real benchmark rows and shares the frontend response contract', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.params).toMatchObject({
      period: 'month',
      hours: 730,
      utilization: 50,
      target: 60,
    });
    expect(payload.data.rows[0]).toMatchObject({
      requiredGpus: 8,
      deploymentGpus: 8,
      revenuePerGpuHour: 3.6,
    });
    expect(payload.data.rows[0].projectedRevenue).toBeCloseTo(10512);
  });
  it('applies cache billing, quarterly targets and hardware filters', async () => {
    const theoreticalResponse = await GET(
      new NextRequest(
        `http://localhost${base.replace('cacheHitMode=actual', 'cacheHitMode=theoretical')}`,
      ),
    );
    const theoretical = await theoreticalResponse.json();
    expect(theoretical.data.rows[0].revenuePerGpuHour).toBeCloseTo(2.304);
    const quarterlyResponse = await get('&period=quarter');
    const quarterly = await quarterlyResponse.json();
    expect(quarterly.params.hours).toBe(2190);
    const filteredResponse = await get('&gpus=mi355x');
    const filtered = await filteredResponse.json();
    expect(filtered.data.rows).toEqual([]);
  });
  it('keeps unofficial rows separate with run colors and source provenance', async () => {
    const response = await get('&unofficialrun=456');
    const payload = await response.json();
    expect(payload.data.rows).toHaveLength(1);
    expect(payload.overlays.rows).toHaveLength(1);
    expect(payload.overlays.rows[0]).toMatchObject({
      isOverlay: true,
      runIndex: 0,
      requiredGpus: 8,
      runUrl: row.run_url!.replace('123', '456'),
    });
  });
  it('compares all available precisions by default without pooling their curves', async () => {
    mocks.benchmarks.mockImplementation(() =>
      Response.json([
        row,
        {
          ...row,
          id: 2,
          precision: 'bf16',
          metrics: {
            ...row.metrics,
            tput_per_gpu: 500,
            input_tput_per_gpu: 250,
            output_tput_per_gpu: 250,
          },
        },
      ]),
    );
    const response = await GET(
      new NextRequest(`http://localhost${base.replace('&precisions=fp8', '')}`),
    );
    const payload = await response.json();
    expect(payload.data.rows).toHaveLength(2);
    expect(
      payload.data.rows.map((item: { precision: string; requiredGpus: number }) => [
        item.precision,
        item.requiredGpus,
      ]),
    ).toEqual([
      ['fp8', 8],
      ['bf16', 16],
    ]);
  });
  it('forwards exact snapshots and marks outside-range points unavailable', async () => {
    await get('&date=2026-10-28&runId=123');
    expect(mocks.benchmarks.mock.calls[0][0].nextUrl.searchParams.get('runId')).toBe('123');
    expect(mocks.benchmarks.mock.calls[0][0].nextUrl.searchParams.get('exactRun')).toBe('true');
    const response = await GET(
      new NextRequest(`http://localhost${base.replace('target=60', 'target=600')}`),
    );
    const payload = await response.json();
    expect(payload.data.skipped[0].reason).toBe('outside-measured-range');
  });
  it.each(['&period=week', '&percentile=p75', '&sequence=1k/1k', '&fee=30'])(
    'rejects unsupported semantics %s',
    async (suffix) => {
      const response = await get(suffix);
      expect(response.status).toBe(400);
    },
  );
});
