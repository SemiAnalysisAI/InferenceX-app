import { describe, expect, it } from 'vitest';

import {
  comparisonView,
  type Comparison,
  type ComparisonRow,
} from '@semianalysisai/inferencex-db/operatorx/compare';

function row(
  hardware: string,
  backend: string,
  latencyUs: number | null,
  extra: Partial<ComparisonRow> = {},
): ComparisonRow {
  return {
    caseKey: `${JSON.stringify({ a: { dtype: 'bf16' }, b: { dtype: 'bf16' }, m: 1, n: 64, k: 128 })}|${backend}`,
    hardware,
    testlist: 'gemm',
    workloads: ['gemm:test'],
    sources: [],
    shape: '1×64×128',
    precision: 'bf16',
    computePrecision: 'bf16',
    x: 1,
    dims: { m: 1, n: 64, k: 128 },
    status: 'ok',
    latencyUs,
    flops: 16384,
    bytes: 16768,
    kernel: backend,
    cudaGraph: false,
    runId: `${hardware}-${backend}`,
    resultIndex: 4,
    revision: 'rev',
    ...extra,
  };
}
function view(rows: ComparisonRow[]) {
  const hardware = [...new Set(rows.map((r) => r.hardware))];
  const comparison: Comparison = {
    op: 'gemm',
    rows,
    hardware: hardware.map((id) => ({ id, runner: id, runs: [] })),
    workloads: [{ id: 'gemm:test', label: 'Test', cases: rows.length, hardware }],
  };
  return comparisonView(comparison, null);
}

describe('cross-backend hardware comparison', () => {
  it('aligns identical arguments across vendor backends and retains source identities', () => {
    const result = view([row('ascend950pr', 'torch_npu_linear', 10), row('h200', 'vllm', 5)]);
    expect(result.cases).toHaveLength(1);
    expect(result.measurements.ascend950pr).toMatchObject({
      latencyUs: [10],
      backend: ['torch_npu_linear'],
      runId: ['ascend950pr-torch_npu_linear'],
      resultIndex: [4],
      revision: ['rev'],
    });
    expect(result.measurements.h200).toMatchObject({
      latencyUs: [5],
      backend: ['vllm'],
      runId: ['h200-vllm'],
    });
  });

  it('selects the fastest valid backend independent of row order and preserves its timeline', () => {
    const rows = [
      row('h200', 'slow', 20),
      row('h200', 'fast', 5, { resultIndex: 8 }),
      row('h200', 'failed', null, { status: 'error' }),
      row('h200', 'invalid', 0),
    ];
    for (const ordered of [rows, rows.toReversed()]) {
      const result = view(ordered);
      expect(result.measurements.h200).toMatchObject({
        latencyUs: [5],
        backend: ['fast'],
        runId: ['h200-fast'],
        resultIndex: [8],
      });
    }
  });

  it('does not merge different shapes, precisions, or quantization arguments', () => {
    const base = row('ascend950pr', 'torch_npu_linear', 10);
    const variants = [
      { a: { dtype: 'bf16' }, b: { dtype: 'bf16' }, m: 2, n: 64, k: 128 },
      { a: { dtype: 'e4m3' }, b: { dtype: 'e4m3' }, m: 1, n: 64, k: 128 },
      {
        a: { dtype: 'bf16', scale: { group: [1, 128] } },
        b: { dtype: 'bf16' },
        m: 1,
        n: 64,
        k: 128,
      },
    ];
    const result = view([
      base,
      ...variants.map((args) =>
        row('h200', 'vllm', 5, { caseKey: `${JSON.stringify(args)}|vllm` }),
      ),
    ]);
    expect(result.cases).toHaveLength(4);
    expect(result.measurements.ascend950pr.latencyUs).toEqual([10, null, null, null]);
    expect(result.measurements.h200.latencyUs).toEqual([null, 5, 5, 5]);
  });

  it('preserves failed measurements and missing hardware rather than inventing values', () => {
    const result = view([
      row('ascend950pr', 'torch_npu_linear', null, { status: 'error' }),
      row('h200', 'vllm', 5),
    ]);
    expect(result.measurements.ascend950pr.status).toEqual(['error']);
    expect(result.measurements.ascend950pr.latencyUs).toEqual([null]);
  });
  it('prefers an explicit failure to a missing backend and keeps tied measurements stable', () => {
    const failed = view([
      row('h200', 'missing', null, { status: 'missing' }),
      row('h200', 'failed', null, { status: 'unsupported' }),
    ]);
    expect(failed.measurements.h200.status).toEqual(['unsupported']);
    expect(failed.measurements.h200.backend).toEqual(['failed']);
    const tied = view([row('h200', 'first', 5), row('h200', 'second', 5)]);
    expect(tied.measurements.h200.backend).toEqual(['first']);
  });
});

function moe(ids: string[]): Comparison {
  return {
    op: 'moe',
    rows: [],
    hardware: [],
    // Listed in API order: most hardware first, so DeepSeek-R1-0528 would win by position.
    workloads: ids.map((id) => ({ id, label: id, cases: 0, hardware: [] })),
  };
}

describe('default workload', () => {
  it('opens MoE on DeepSeek-V4.1-Flash when the request names no valid workload', () => {
    const c = moe(['moe:DeepSeek-R1-0528', 'moe:DeepSeek-V4.1-Flash']);
    expect(comparisonView(c, null).workload).toBe('moe:DeepSeek-V4.1-Flash');
    // `/operatorx?op=moe&workload=moe` names no real workload.
    expect(comparisonView(c, 'moe').workload).toBe('moe:DeepSeek-V4.1-Flash');
  });

  it('keeps an explicit workload choice', () => {
    const c = moe(['moe:DeepSeek-R1-0528', 'moe:DeepSeek-V4.1-Flash']);
    expect(comparisonView(c, 'moe:DeepSeek-R1-0528').workload).toBe('moe:DeepSeek-R1-0528');
  });

  it('falls back to the first listed workload when the preferred one has no data', () => {
    expect(comparisonView(moe(['moe:DeepSeek-R1-0528']), null).workload).toBe(
      'moe:DeepSeek-R1-0528',
    );
  });

  it('leaves GEMM on its first listed workload', () => {
    const gemm = comparisonView(
      { ...moe(['gemm:DeepSeek-V4-Pro', 'gemm:GLM-5']), op: 'gemm' },
      null,
    );
    expect(gemm.workload).toBe('gemm:DeepSeek-V4-Pro');
  });
});
