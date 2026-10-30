import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  comparisonView,
  type Comparison,
  type ComparisonRow,
} from '@semianalysisai/inferencex-db/operatorx/compare';

import { distributionView } from '@/lib/operatorx/distribution-view';
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

function comparison(): Comparison {
  const args = { a: { dtype: 'bf16' }, b: { dtype: 'bf16' }, m: 1, n: 64, k: 128 };
  const row = (hardware: string, latencyUs: number): ComparisonRow => ({
    caseKey: `${JSON.stringify(args)}|${hardware === 'ascend950pr' ? 'torch_npu' : 'vllm'}`,
    hardware,
    testlist: 'gemm',
    opType: 'gemm',
    parallel: '',
    workloads: ['gemm:test'],
    sources: [],
    shape: '1×64×128',
    precision: 'bf16',
    computePrecision: 'bf16',
    x: 1,
    dims: { m: 1, n: 64, k: 128 },
    status: 'ok',
    latencyUs,
    flops: 378e6,
    bytes: 1.6e6,
    work: null,
    kernel: null,
    cudaGraph: false,
    runId: `${hardware}-run`,
    resultIndex: 0,
    revision: 'rev',
  });
  return {
    op: 'gemm',
    hardware: ['ascend950pr', 'h200'].map((id) => ({ id, runner: id, runs: [] })),
    workloads: [{ id: 'gemm:test', label: 'Test', cases: 1, hardware: ['ascend950pr', 'h200'] }],
    rows: [row('ascend950pr', 1), row('h200', 2)],
  };
}

beforeEach(() => vi.mocked(getComparison).mockReset());

it('returns the chart’s normalized distribution with resolved controls and source identities', async () => {
  const source = comparison();
  vi.mocked(getComparison).mockResolvedValue(source);
  const response = await GET(
    new NextRequest(
      'http://localhost/api/v1/operatorx/compare?op=gemm&distributionMetric=tflops&distributionNormalized=true&distributionMatchedOnly=true&distributionHardware=ascend950pr,h200',
    ),
  );
  const body = await response.json();
  const expectedView = comparisonView(source, null);
  expect(response.status).toBe(200);
  expect(body.distribution).toEqual(
    distributionView(expectedView, {
      metric: 'tflops',
      normalized: true,
      matchedOnly: true,
      hardware: ['ascend950pr', 'h200'],
    }),
  );
  expect(body.distribution.boxes[0]).toMatchObject({ p50: 1, caseIndices: [0] });
  expect(body.measurements.ascend950pr).toMatchObject({
    runId: ['ascend950pr-run'],
    resultIndex: [0],
  });
});

it('rejects invalid distribution selectors without changing the default comparison contract', async () => {
  vi.mocked(getComparison).mockResolvedValue(comparison());
  const invalid = await GET(
    new NextRequest(
      'http://localhost/api/v1/operatorx/compare?op=gemm&distributionNormalized=maybe',
    ),
  );
  expect(invalid.status).toBe(400);
  expect(vi.mocked(getComparison)).not.toHaveBeenCalled();

  const unknownHardware = await GET(
    new NextRequest(
      'http://localhost/api/v1/operatorx/compare?op=gemm&distributionHardware=unknown',
    ),
  );
  expect(unknownHardware.status).toBe(400);

  const defaultResponse = await GET(
    new NextRequest('http://localhost/api/v1/operatorx/compare?op=gemm'),
  );
  expect(await defaultResponse.json()).not.toHaveProperty('distribution');
});
