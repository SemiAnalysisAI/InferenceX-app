import { describe, expect, it } from 'vitest';

import type { ComparisonCase, ComparisonColumns, ComputePrecision } from './compare';
import { opLabels } from './describe';
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

function moeCase(tokens: number, extra: Record<string, unknown> = {}): ComparisonCase {
  const args = {
    experts: { num: 384, top_k: 6, inter: 2304, a1: { dtype: 'e4m3' }, w1: { dtype: 'e2m1' } },
    hidden: 5120,
    router: { select: { kind: 'topk' } },
    tokens,
    ...extra,
  };
  const labels = opLabels('moe', args);
  return {
    key: JSON.stringify(args),
    testlist: 'moe',
    sources: [],
    ...labels,
    computePrecision: 'fp8',
    x: tokens,
    dims: { tokens },
    flops: 1,
    bytes: 1,
  };
}

describe('OperatorX metric-vs-size slices', () => {
  it('puts token counts of one operation on one line', () => {
    expect(sliceKey('moe', moeCase(8))).toBe(sliceKey('moe', moeCase(256)));
  });

  it('keeps split layouts and hash routing off the single-device line', () => {
    const keys = [
      moeCase(8),
      moeCase(8, { parallel: { tp: 8 } }),
      moeCase(8, { parallel: { ep: 8, tp: 8 } }),
      moeCase(8, { parallel: { dp: 8, ep: 8 } }),
      moeCase(8, { router: { select: { kind: 'hash', vocab: 129280 } } }),
    ].map((c) => sliceKey('moe', c));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('separates tensor-parallel GEMMs from single-device GEMMs of the same N and K', () => {
    const split = {
      ...row(8, 'bf16'),
      key: JSON.stringify({ m: 8, n: 64, k: 128, parallel: { tp: 4 } }),
    };
    expect(sliceKey('gemm', split)).toBe('N=64 K=128 · tp=4 · bf16');
    expect(sliceKey('gemm', row(8, 'bf16'))).toBe('N=64 K=128 · bf16');
  });
});
