import { describe, expect, it } from 'vitest';

import type { ComparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';

import { distributionView } from './distribution-view';

const column = (latencyUs: (number | null)[]) => ({
  status: latencyUs.map((value) => (value === null ? null : ('ok' as const))),
  latencyUs,
  kernel: latencyUs.map(() => null),
  cudaGraph: latencyUs.map(() => null),
  runId: latencyUs.map(() => 'run'),
  resultIndex: latencyUs.map((_, index) => index),
  revision: latencyUs.map(() => 'rev'),
});

function view(): ComparisonView {
  return {
    op: 'gemm',
    defaults: { metricVsSizeSlice: null, rooflinePrecision: 'bf16', rooflineNormalized: true },
    workload: 'gemm:test',
    workloads: [{ id: 'gemm:test', label: 'Test', cases: 2, hardware: ['ascend950pr', 'h200'] }],
    hardware: [
      { id: 'ascend950pr', runner: 'ascend950pr-external', runs: [] },
      { id: 'h200', runner: 'h200-dgxc', runs: [] },
    ],
    cases: [
      {
        key: 'bf16',
        testlist: 'gemm',
        sources: [],
        shape: 'BF16',
        precision: 'bf16',
        computePrecision: 'bf16',
        x: 1,
        dims: { m: 1, n: 64, k: 128 },
        flops: 378e6,
        bytes: 1.6e6,
      },
      {
        key: 'fp8',
        testlist: 'gemm',
        sources: [],
        shape: 'FP8',
        precision: 'fp8',
        computePrecision: 'fp8',
        x: 2,
        dims: { m: 2, n: 64, k: 128 },
        flops: 756e6,
        bytes: 3.2e6,
      },
    ],
    models: [],
    kernels: [],
    measurements: {
      ascend950pr: column([1, 1]),
      h200: column([2, 2]),
    },
  };
}

describe('OperatorX distribution projection', () => {
  it('normalizes each case by its precision peak before finding matched box quantiles', () => {
    const raw = distributionView(view(), {
      metric: 'tflops',
      hardware: ['ascend950pr', 'h200'],
      matchedOnly: true,
      normalized: false,
    });
    expect(raw.matchedCases).toBe(2);
    expect(raw.boxes[0]).toMatchObject({ n: 2, p50: 567, caseIndices: [0, 1] });

    const normalized = distributionView(view(), {
      metric: 'tflops',
      hardware: ['ascend950pr', 'h200'],
      matchedOnly: true,
      normalized: true,
    });
    expect(normalized).toMatchObject({ metric: 'computeUtil', normalized: true, matchedCases: 2 });
    expect(normalized.boxes[0]).toMatchObject({
      hardware: 'ascend950pr',
      n: 2,
      p50: 1,
      caseIndices: [0, 1],
    });
    expect(normalized.boxes[1].p50).toBeCloseTo((189 / 989 + 378 / 1979) / 2);
  });

  it('uses bandwidth peak for bandwidth and leaves latency in microseconds', () => {
    const bandwidth = distributionView(view(), {
      metric: 'bandwidth',
      hardware: ['ascend950pr'],
      matchedOnly: false,
      normalized: true,
    });
    expect(bandwidth).toMatchObject({ metric: 'bandwidthUtil', normalized: true });
    // 2.4 TB/s achieved against the derived 1.6384 TB/s 950PR reference.
    expect(bandwidth.boxes[0].p50).toBeCloseTo(2.4 / 1.6384, 12);

    const latency = distributionView(view(), {
      metric: 'latency',
      hardware: ['ascend950pr'],
      matchedOnly: false,
      normalized: true,
    });
    expect(latency).toMatchObject({ metric: 'latency', normalized: false });
    expect(latency.boxes[0].p50).toBe(1);
  });

  it('preserves missing values and falls back to all cases when no matched measurement exists', () => {
    const input = view();
    input.measurements.h200.status[0] = null;
    input.measurements.h200.latencyUs[0] = null;
    input.measurements.ascend950pr.status[1] = null;
    input.measurements.ascend950pr.latencyUs[1] = null;
    const projection = distributionView(input, {
      metric: 'tflops',
      hardware: ['ascend950pr', 'h200'],
      matchedOnly: true,
      normalized: true,
    });
    expect(projection).toMatchObject({ matchedCases: 0, matchedOnly: false });
    expect(projection.boxes[0]).toMatchObject({ n: 1, caseIndices: [0], p50: 1 });
    expect(projection.boxes[1]).toMatchObject({ n: 1, caseIndices: [1] });
  });
});
