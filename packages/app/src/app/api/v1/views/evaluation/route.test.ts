import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetAllEvalResults, mockGetDb } = vi.hoisted(() => ({
  mockGetAllEvalResults: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/evaluations', () => ({
  getAllEvalResults: mockGetAllEvalResults,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: (data: unknown) => Response.json(data),
  cachedText: (data: string, contentType: string) =>
    new Response(data, { headers: { 'Content-Type': contentType } }),
}));

import {
  aggregateEvaluationChartRows,
  buildEvaluationChartRows,
} from '@/components/evaluation/chart-data';
import type { EvalRow } from '@/lib/api';
import { Model } from '@/lib/data-mappings';

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

function evalRow(overrides: Partial<EvalRow> = {}): EvalRow {
  return {
    id: 1,
    config_id: 1,
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
    task: 'gsm8k',
    date: '2026-03-01',
    conc: 128,
    metrics: { em_strict: 0.9, em_strict_se: 0.01 },
    timestamp: '2026-03-01T00:00:00Z',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
    ...overrides,
  };
}

const ROWS: EvalRow[] = [
  // Two same-config/same-date retries — aggregated into one bar (n=2).
  evalRow({ id: 1, config_id: 1, metrics: { em_strict: 0.8, em_strict_se: 0.01 } }),
  evalRow({ id: 2, config_id: 1, metrics: { em_strict: 0.9, em_strict_se: 0.01 } }),
  // Second benchmark, later date, different config.
  evalRow({
    id: 3,
    config_id: 2,
    task: 'aime25',
    date: '2026-03-05',
    hardware: 'b200',
    framework: 'trtllm',
    metrics: { em_strict: 0.7, em_strict_se: 0.02 },
  }),
];

const MODEL = Model.DeepSeek_R1;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllEvalResults.mockResolvedValue(ROWS);
});

describe('GET /api/v1/views/evaluation', () => {
  it('requires model', async () => {
    const res = await GET(request('/api/v1/views/evaluation'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.param).toBe('model');
    expect(Array.isArray(body.allowed)).toBe(true);
  });

  it('rejects unknown models with the allowed list', async () => {
    const res = await GET(request('/api/v1/views/evaluation?model=not-a-model'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.param).toBe('model');
    expect(body.allowed).toContain(MODEL);
  });

  it('defaults benchmark to the first available and date to the latest', async () => {
    const res = await GET(request(`/api/v1/views/evaluation?model=${MODEL}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.view).toBe('evaluation');
    expect(body.apiVersion).toBe('v1');
    expect(body.benchmarks).toEqual(['aime25', 'gsm8k']);
    expect(body.params).toEqual({
      model: MODEL,
      benchmark: 'aime25',
      date: '2026-03-05',
      precisions: ['fp8'],
      format: 'json',
    });
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      hwKey: 'b200_trt',
      score: 0.7,
      n: 1,
      precision: 'fp8',
      framework: 'trtllm',
      date: '2026-03-05',
    });
    // Half the min/max error-band width — float noise, so compare approximately.
    expect(body.rows[0].stderr).toBeCloseTo(0.02, 10);
  });

  it('aggregates same-config retries into one row with mean score and n', async () => {
    const res = await GET(request(`/api/v1/views/evaluation?model=${MODEL}&benchmark=gsm8k`));
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ hwKey: 'h200_sglang', n: 2 });
    expect(body.rows[0].score).toBeCloseTo(0.85, 10);
  });

  it('matches the shared chart-data pipeline (parity)', async () => {
    const res = await GET(request(`/api/v1/views/evaluation?model=${MODEL}&benchmark=gsm8k`));
    const body = await res.json();

    const chartRows = buildEvaluationChartRows(ROWS, 'gsm8k', MODEL, ['fp8'], '2026-03-05');
    const expected = aggregateEvaluationChartRows(
      chartRows,
      new Set(chartRows.map((row) => String(row.hwKey))),
    );
    expect(body.rows).toHaveLength(expected.length);
    expect(body.rows[0].score).toBe(expected[0].score);
    expect(body.rows[0].stderr).toBe(expected[0].scoreError);
    expect(body.rows[0].label).toBe(expected[0].configLabel);
  });

  it('resolves a requested date to the nearest available date', async () => {
    const res = await GET(
      request(`/api/v1/views/evaluation?model=${MODEL}&benchmark=gsm8k&date=2026-03-02`),
    );
    const body = await res.json();
    expect(body.params.date).toBe('2026-03-01');
  });

  it('rejects a malformed date', async () => {
    const res = await GET(request(`/api/v1/views/evaluation?model=${MODEL}&date=03-02-2026`));
    expect(res.status).toBe(400);
    const resBody = await res.json();
    expect(resBody.param).toBe('date');
  });

  it('rejects an unknown benchmark with the available list', async () => {
    const res = await GET(request(`/api/v1/views/evaluation?model=${MODEL}&benchmark=mmlu`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.param).toBe('benchmark');
    expect(body.allowed).toEqual(['aime25', 'gsm8k']);
  });

  it('is case-insensitive for model and canonical for precisions', async () => {
    const res = await GET(
      request(
        `/api/v1/views/evaluation?model=${MODEL.toLowerCase()}&benchmark=gsm8k&precisions=fp8`,
      ),
    );
    const body = await res.json();
    expect(body.params.model).toBe(MODEL);
    expect(body.params.precisions).toEqual(['fp8']);
    expect(body.rows).toHaveLength(1);
  });

  it('returns empty rows for a model without eval data', async () => {
    const res = await GET(request('/api/v1/views/evaluation?model=DeepSeek-V4-Pro'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.benchmarks).toEqual([]);
    expect(body.rows).toEqual([]);
    expect(body.params.benchmark).toBeNull();
  });

  it('returns a CSV representation with format=csv', async () => {
    const res = await GET(
      request(`/api/v1/views/evaluation?model=${MODEL}&benchmark=gsm8k&format=csv`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const resText = await res.text();
    const lines = resText.trim().split('\r\n');
    expect(lines[0]).toBe('hwKey,label,score,stderr,n,precision,framework,date');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('h200_sglang');
    // Multi-line config labels are flattened for CSV rows.
    expect(lines[1]).not.toContain('\n');
  });

  it('returns 500 when the query throws', async () => {
    mockGetAllEvalResults.mockRejectedValueOnce(new Error('DB unreachable'));
    const res = await GET(request(`/api/v1/views/evaluation?model=${MODEL}`));
    expect(res.status).toBe(500);
    const resBody = await res.json();
    expect(resBody.error).toBe('Internal server error');
  });
});
