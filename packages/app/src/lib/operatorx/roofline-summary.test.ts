import { describe, expect, it } from 'vitest';

import type { ComparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';
import { rooflineSummary } from './roofline-summary';

const column = (latencyUs: (number | null)[]) => ({
  status: latencyUs.map((v) => (v === null ? null : ('ok' as const))),
  latencyUs,
  kernel: latencyUs.map(() => null),
  cudaGraph: latencyUs.map(() => null),
  runId: latencyUs.map(() => 'run'),
  resultIndex: latencyUs.map((_, i) => i),
  revision: latencyUs.map(() => '1'),
});
function fixture(): ComparisonView {
  return {
    op: 'gemm',
    workload: 'test',
    workloads: [],
    models: [],
    kernels: [],
    defaults: { metricVsSizeSlice: null, rooflinePrecision: 'bf16', rooflineNormalized: true },
    hardware: ['ascend950pr', 'h200', 'unknown'].map((id) => ({ id, runner: id, runs: [] })),
    cases: [200, 300, 400, 500, 600].map((ai, i) => ({
      key: String(i),
      testlist: 'gemm',
      sources: [],
      shape: String(i),
      precision: 'bf16',
      computePrecision: 'bf16',
      x: i + 1,
      dims: { m: i + 1, n: 10, k: 10 },
      flops: 600e6,
      bytes: 600e6 / ai,
    })),
    measurements: {
      ascend950pr: column([0.1, 2, 4, 1, 0.5]),
      h200: column([0.1, 1, 2, 3, null]),
      unknown: column([1, 1, 1, 1, 1]),
    },
  };
}

describe('roofline median and best summary', () => {
  it('uses one shared compute-bound cohort and sorts by the displayed median', () => {
    const view = fixture();
    const params = {
      precision: 'bf16' as const,
      hardware: ['ascend950pr', 'h200'],
      normalized: false,
    };
    const absolute = rooflineSummary(view, params);
    expect(absolute.matchedCases).toBe(4);
    expect(absolute.caseIndices).toEqual([1, 2, 3]);
    expect(absolute.bars).toMatchObject([
      { hardware: 'ascend950pr', median: 300, best: 600, n: 3, bestCaseIndex: 3 },
      { hardware: 'h200', median: 300, best: 600, n: 3, bestCaseIndex: 1 },
    ]);
    const normalized = rooflineSummary(view, { ...params, normalized: true });
    expect(normalized.caseIndices).toEqual([1, 2, 3]);
    expect(normalized.bars[0].median).toBeCloseTo(300 / 378);
    expect(normalized.bars[1].median).toBeCloseTo(300 / 989);
    expect(normalized.bars[0].bestTflops).toBe(600);
    const selected = rooflineSummary(view, { ...params, hardware: ['h200'] });
    expect(selected.caseIndices).toEqual([1, 2, 3]);
    const ascend = rooflineSummary(view, { ...params, hardware: ['ascend950pr'] });
    expect(ascend.caseIndices).toEqual([1, 2, 3, 4]);
    expect(ascend.bars[0]).toMatchObject({ median: 450, best: 1200, n: 4 });
  });

  it('requires the selected precision and every selected reference without falling back to unmatched data', () => {
    const view = fixture();
    const params = {
      precision: 'fp8' as const,
      hardware: ['ascend950pr', 'h200'],
      normalized: true,
    };
    expect(rooflineSummary(view, params).bars).toEqual([]);
    view.cases.forEach((c) => {
      c.computePrecision = 'fp8';
    });
    const fp8 = rooflineSummary(view, params);
    expect(fp8.caseIndices).toEqual([3]);
    expect(fp8.bars[0]).toMatchObject({ hardware: 'ascend950pr', n: 1 });
    expect(fp8.bars[0].median).toBeCloseTo(600 / 756);
    const missing = rooflineSummary(view, { ...params, hardware: ['ascend950pr', 'unknown'] });
    expect(missing.missingReferences).toEqual(['unknown']);
    expect(missing.bars).toEqual([]);
    view.measurements.h200.status[3] = 'error';
    expect(rooflineSummary(view, params).bars).toEqual([]);
  });
});
