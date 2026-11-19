import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';
import type { ReproduceSource } from '@semianalysisai/inferencex-db/queries/reproduce';

const { mockGetReproduceSource, mockGetDb } = vi.hoisted(() => ({
  mockGetReproduceSource: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/reproduce', () => ({
  getReproduceSource: mockGetReproduceSource,
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: <T>(fn: T) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { NextRequest } from 'next/server';
import { transformBenchmarkRows } from '@/lib/benchmarks/benchmark-transform';
import { buildReproduceConfig } from '@/lib/reproduce/reproduce-config';
import { GET } from './route';

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

const disaggRow: BenchmarkRow = {
  id: 447998,
  hardware: 'gb300',
  framework: 'dynamo-trt',
  model: 'glm5.2',
  precision: 'fp4',
  spec_method: 'mtp',
  disagg: true,
  is_multinode: true,
  prefill_tp: 4,
  prefill_ep: 4,
  prefill_dp_attention: true,
  prefill_num_workers: 5,
  decode_tp: 16,
  decode_ep: 16,
  decode_dp_attention: true,
  decode_num_workers: 1,
  num_prefill_gpu: 20,
  num_decode_gpu: 16,
  benchmark_type: 'agentic_traces',
  isl: null,
  osl: null,
  conc: 260,
  offload_mode: 'off',
  image: 'nvcr.io/nvidia/tensorrt-llm/release:1.4.0rc2',
  recipe_fingerprint: 'a'.repeat(64),
  metrics: {
    tput_per_gpu: 1200,
    output_tput_per_gpu: 300,
    median_intvty: 40,
    prefill_pp: 1,
    decode_pp: 1,
    spec_algorithm: 'mtp',
    router_name: 'dynamo',
  } as unknown as Record<string, number>,
  date: '2026-10-31',
  workflow_run_id: 9,
  run_started_at: '2026-10-31 01:30:00+00',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/40793806073/attempts/5',
};

const source: ReproduceSource = {
  row: disaggRow,
  run: {
    github_run_id: 40793806073,
    run_attempt: 5,
    head_sha: 'ae3d6877c',
    run_url: disaggRow.run_url,
    created_at: '2026-10-31 01:00:00+00',
  },
  logs: {
    files: ['sweep_42522.log', 'im-gb300-r03-c001_prefill_w0.out'],
    launch_file: 'sweep_42522.log',
    engine_file: 'im-gb300-r03-c001_prefill_w0.out',
    launch: null,
    engine: { engine_args: null, versions: { nccl: null, cuda: null, tensorrt_llm: '1.4.0rc2' } },
    config_files: [{ file: 'config.yaml', text: 'name: inferencex-gb300-nv_19\n' }],
    fingerprints: [],
    benchmark_command: null,
  },
};

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/reproduce', () => {
  it('returns the same config the drawer builds from the chart point', async () => {
    mockGetReproduceSource.mockResolvedValueOnce(source);
    const response = await GET(req('/api/v1/reproduce?id=447998'));
    expect(response.status).toBe(200);
    const body = await response.json();

    const chartPoint = transformBenchmarkRows([disaggRow]).chartData[0]![0]!;
    expect(body.config).toEqual(buildReproduceConfig(chartPoint));
    expect(body.config).toMatchObject({
      hardware: 'gb300',
      framework: 'dynamo-trt',
      spec_algorithm: 'mtp',
      topology: {
        prefill: { gpus: 20, workers: 5, tp: 4, ep: 4, pp: 1, dp_attention: true },
        decode: { gpus: 16, workers: 1, tp: 16, ep: 16, pp: 1, dp_attention: true },
      },
      image: 'nvcr.io/nvidia/tensorrt-llm/release:1.4.0rc2',
      run_url: disaggRow.run_url,
    });
    expect(body).toMatchObject({ id: 447998, run: source.run, logs: source.logs });
    expect(mockGetReproduceSource).toHaveBeenCalledWith('mock-sql', 447998);
  });

  it('keeps stored TP and disagg: false for an aggregate point the chart rescales', async () => {
    const aggRow: BenchmarkRow = {
      ...disaggRow,
      id: 447975,
      framework: 'vllm',
      disagg: false,
      is_multinode: false,
      prefill_tp: 4,
      prefill_ep: 1,
      prefill_dp_attention: false,
      prefill_num_workers: 0,
      decode_tp: 4,
      decode_ep: 1,
      decode_dp_attention: false,
      decode_num_workers: 1,
      num_prefill_gpu: 0,
      num_decode_gpu: 8,
      metrics: { ...disaggRow.metrics, pp: 2, decode_pp: 2 },
    };
    mockGetReproduceSource.mockResolvedValueOnce({ ...source, row: aggRow });
    const response = await GET(req('/api/v1/reproduce?id=447975'));
    const body = await response.json();

    const chartPoint = transformBenchmarkRows([aggRow]).chartData[0]![0]!;
    expect(chartPoint.tp).toBe(8);
    expect(buildReproduceConfig(chartPoint)).toEqual(body.config);
    expect(body.config).toMatchObject({
      disagg: false,
      physical_chips: 8,
      topology: { tp: 4, ep: 1, pp: 2, dp_attention: false },
    });
  });

  it('returns 404 for an unknown result', async () => {
    mockGetReproduceSource.mockResolvedValueOnce(null);
    const response = await GET(req('/api/v1/reproduce?id=9'));
    expect(response.status).toBe(404);
  });

  it('rejects a missing id without querying', async () => {
    const response = await GET(req('/api/v1/reproduce'));
    expect(response.status).toBe(400);
    expect(mockGetReproduceSource).not.toHaveBeenCalled();
  });
});
