import { describe, expect, it } from 'vitest';

import type { ComparisonCase, ComparisonColumns, ComputePrecision } from './compare';
import { comparisonDefaults, sliceKey } from './visualization';

function row(x: number, precision: ComputePrecision, n = 64): ComparisonCase {
  return {
    key: `${x}-${n}-${precision}`,
    testlist: 'gemm',
    sources: [],
    shape: `${x}×${n}×128`,
    precision,
    computePrecision: precision,
    x,
    dims: { m: x, n, k: 128 },
    flops: 2 * x * n * 128,
    bytes: 2 * (x * 128 + n * 128 + x * n),
  };
}

function measurements(
  status: ComparisonColumns['status'],
  latencyUs: ComparisonColumns['latencyUs'],
): ComparisonColumns {
  const empty = () => status.map(() => null);
  return {
    status,
    latencyUs,
    kernel: empty(),
    cudaGraph: empty(),
    runId: empty(),
    resultIndex: empty(),
    revision: empty(),
  };
}

const cases = [row(1, 'fp8'), row(2, 'fp8'), row(4, 'fp8'), row(1, 'bf16'), row(2, 'bf16')];

describe('OperatorX visualization defaults', () => {
  it('prefers a multi-size 950PR curve and BF16 over a larger FP8 cohort', () => {
    const view = {
      op: 'gemm' as const,
      cases,
      measurements: {
        ascend950pr: measurements([null, null, null, 'ok', 'ok'], [null, null, null, 10, 20]),
      },
    };
    expect(comparisonDefaults(view)).toEqual({
      metricVsSizeSlice: sliceKey('gemm', cases[3]),
      rooflinePrecision: 'bf16',
      rooflineNormalized: true,
    });
    expect(view.measurements.ascend950pr.latencyUs).toEqual([null, null, null, 10, 20]);
  });

  it.each(['missing', 'error', 'unsupported'] as const)(
    'does not choose a 950PR curve with only one measured size and a %s row',
    (status) => {
      const view = {
        op: 'gemm' as const,
        cases,
        measurements: {
          ascend950pr: measurements([null, null, null, 'ok', status], [null, null, null, 10, 20]),
        },
      };
      expect(comparisonDefaults(view).metricVsSizeSlice).toBe(sliceKey('gemm', cases[0]));
    },
  );

  it('does not count two backends at the same size as a multi-size curve', () => {
    const duplicateSizes = [...cases.slice(0, 3), row(1, 'bf16'), row(1, 'bf16')];
    expect(
      comparisonDefaults({
        op: 'gemm',
        cases: duplicateSizes,
        measurements: {
          ascend950pr: measurements([null, null, null, 'ok', 'ok'], [null, null, null, 10, 20]),
        },
      }).metricVsSizeSlice,
    ).toBe(sliceKey('gemm', cases[0]));
  });

  it.each([null, 0, -1, Infinity])('ignores invalid 950PR latency %s', (latency) => {
    expect(
      comparisonDefaults({
        op: 'gemm',
        cases,
        measurements: {
          ascend950pr: measurements(
            [null, null, null, 'ok', 'ok'],
            [null, null, null, 10, latency],
          ),
        },
      }).metricVsSizeSlice,
    ).toBe(sliceKey('gemm', cases[0]));
  });

  it('preserves the ranked fallback without 950PR and resolves empty/other-precision workloads', () => {
    expect(comparisonDefaults({ op: 'gemm', cases: cases.slice(0, 3), measurements: {} })).toEqual({
      metricVsSizeSlice: sliceKey('gemm', cases[0]),
      rooflinePrecision: 'fp8',
      rooflineNormalized: true,
    });
    expect(comparisonDefaults({ op: 'moe', cases: [], measurements: {} })).toEqual({
      metricVsSizeSlice: null,
      rooflinePrecision: null,
      rooflineNormalized: true,
    });
    expect(
      comparisonDefaults({ op: 'gemm', cases: [row(1, 'other')], measurements: {} })
        .rooflinePrecision,
    ).toBeNull();
  });
});
