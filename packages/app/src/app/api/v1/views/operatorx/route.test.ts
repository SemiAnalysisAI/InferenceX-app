import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Comparison, ComparisonRow } from '@semianalysisai/inferencex-db/operatorx/compare';

import { sizeBin } from '@/components/operatorx/model-view/OpBars';
import { getComparison } from '@/lib/operatorx/service';

import { GET } from './route';

vi.mock('@/lib/operatorx/service', () => ({
  getComparison: vi.fn(),
  isPartialComparison: vi.fn(() => false),
}));
vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: vi.fn((_request: Request, body: unknown) => NextResponse.json(body)),
  operatorXCacheTag: vi.fn(() => 'opx'),
}));

const row = (m: number, precision: 'bf16' | 'fp8'): ComparisonRow => ({
  caseKey: `${precision}-${m}`,
  hardware: 'h200',
  testlist: 'gemm',
  opType: 'gemm',
  parallel: '',
  workloads: ['gemm:test'],
  sources: [],
  shape: `${m}×64×128`,
  precision,
  computePrecision: precision,
  x: m,
  dims: { m, n: 64, k: 128 },
  status: 'ok',
  latencyUs: 1,
  flops: 1e6,
  bytes: 1e6,
  work: null,
  kernel: null,
  cudaGraph: false,
  runId: 'run',
  resultIndex: 0,
  revision: 'rev',
});

/** Three GEMM cases on one GPU: bf16 at 64 and 128 tokens, fp8 at 128 tokens. */
function comparison(): Comparison {
  return {
    op: 'gemm',
    hardware: [{ id: 'h200', runner: 'h200', runs: [] }],
    workloads: [{ id: 'gemm:test', label: 'Test', cases: 3, hardware: ['h200'] }],
    rows: [row(64, 'bf16'), row(128, 'bf16'), row(128, 'fp8')],
  };
}

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/v1/views/operatorx?op=gemm&${query}`));

beforeEach(() => vi.mocked(getComparison).mockResolvedValue(comparison()));

it('filters rows by the model view precision and token bin, using the UI bin function', async () => {
  const bin = sizeBin(128);
  const response = await get(`precision=bf16&bin=${bin}`);
  const body = await response.json();
  expect(body.params).toMatchObject({ precision: 'bf16', bin });
  expect(body.rows.map((r: { case_key: string }) => r.case_key)).toEqual(['bf16-128']);
  expect(body.total).toBe(1);
});

it('returns every case when the filters are omitted', async () => {
  const response = await get('');
  const body = await response.json();
  expect(body.params).toMatchObject({ precision: null, bin: null });
  expect(body.total).toBe(3);
});

it('rejects an unknown precision or a malformed bin', async () => {
  expect(await get('precision=fp64')).toHaveProperty('status', 400);
  expect(await get('bin=1.5')).toHaveProperty('status', 400);
  expect(await get('bin=-1')).toHaveProperty('status', 400);
});
