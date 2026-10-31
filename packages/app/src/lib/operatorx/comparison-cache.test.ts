import { describe, expect, it } from 'vitest';

import {
  buildComparison,
  comparisonCaseKey,
  comparisonView,
  type ComparisonInput,
  type ComparisonOp,
} from '@semianalysisai/inferencex-db/operatorx/compare';
import {
  buildRunComparison,
  mergeRunComparisons,
} from '@semianalysisai/inferencex-db/operatorx/comparison-cache';
import {
  normalizeBundle,
  type OperatorXStatus,
} from '@semianalysisai/inferencex-db/operatorx/normalize';

interface Row {
  m: number;
  status?: OperatorXStatus;
  backend?: string;
  latency?: number;
  sources?: string[];
}

function makeInput(
  runId: string,
  runner: string,
  rows: Row[],
  op: ComparisonOp = 'gemm',
): ComparisonInput {
  const dataset = normalizeBundle({
    run: {
      run_id: runId,
      revision: `${runId}-revision`,
      run_attempt: 1,
      source_sha: 'sha',
      source_branch: 'main',
      generated_at: `2026-10-23T00:00:00Z`,
      conclusion: 'success',
    },
    manifest: {},
    shards: [
      {
        id: 's1',
        attempt: 1,
        docs: [
          {
            rows: rows.map((r) => ({
              testlist: `${op}_deepseek_v4`,
              op: {
                type: op,
                backend: r.backend ?? 'vllm',
                args:
                  op === 'gemm'
                    ? { m: r.m, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } }
                    : {
                        tokens: r.m,
                        hidden: 7168,
                        experts: {
                          num: 256,
                          top_k: 8,
                          inter: 2048,
                          a1: { dtype: 'bf16' },
                          w1: { dtype: 'bf16' },
                        },
                      },
                sources: r.sources ?? ['deepseek-ai/DeepSeek-V4-Pro/attention'],
              },
              status: r.status ?? 'ok',
              metrics: {
                latency_us: r.latency ?? 10,
                cuda_graph: true,
                backend_meta: { vllm_quant_method: `${runId}-kernel` },
              },
            })),
          },
        ],
      },
    ],
  });
  // Missing rows normally come from the manifest, after measured rows. Setting
  // status here also exercises a fallback occupying the first insertion slot.
  rows.forEach((r, i) => {
    if (r.status === 'missing') dataset.results[i].status = 'missing';
  });
  return { runner, dataset };
}

/** Existing service path, before compact projections are introduced. */
function rawComparison(op: ComparisonOp, inputs: ComparisonInput[]) {
  const selected = new Map<
    string,
    { input: ComparisonInput; result: ComparisonInput['dataset']['results'][number] }
  >();
  for (const input of inputs)
    for (const result of input.dataset.results) {
      const key = comparisonCaseKey(op, input.runner, result);
      if (key === null) continue;
      const previous = selected.get(key);
      if (!previous || (previous.result.status === 'missing' && result.status !== 'missing')) {
        selected.set(key, { input, result });
      }
    }
  const byRun = new Map<string, ComparisonInput>();
  for (const { input, result } of selected.values()) {
    let into = byRun.get(input.dataset.run.runId);
    if (!into) {
      into = { runner: input.runner, dataset: { run: input.dataset.run, results: [] } };
      byRun.set(input.dataset.run.runId, into);
    }
    into.dataset.results.push(result);
  }
  return buildComparison(op, [...byRun.values()]);
}

function merge(inputs: ComparisonInput[]) {
  // JSON round-trip matches storage, not shared in-memory object references.
  return mergeRunComparisons(
    'gemm',
    inputs.map((i) => {
      const serialized = JSON.stringify(buildRunComparison('gemm', i));
      return JSON.parse(serialized);
    }),
  );
}

describe('stored OperatorX comparison merge', () => {
  it('fills an earlier missing duplicate inside a run without renumbering results', () => {
    const inputs = [
      makeInput('duplicates', 'h200-dgxc', [
        { m: 1, status: 'missing' },
        { m: 2, status: 'missing' },
        { m: 1, status: 'ok', latency: 7 },
        { m: 2, status: 'error' },
        { m: 2, status: 'ok', latency: 1 },
      ]),
    ];
    const actual = merge(inputs);
    expect(actual).toEqual(rawComparison('gemm', inputs));
    expect(actual.rows.map((r) => [r.x, r.status, r.latencyUs, r.resultIndex])).toEqual([
      [1, 'ok', 7, 2],
      [2, 'error', null, 3],
    ]);
  });
  it('falls back only for missing rows and preserves explicit statuses and timeline identities', () => {
    const inputs = [
      makeInput('new', 'h200-dgxc', [
        { m: 1, status: 'missing' },
        { m: 2, status: 'error' },
        { m: 3, status: 'unsupported' },
        { m: 4, latency: 20 },
      ]),
      makeInput(
        'old',
        'h200-dgxc',
        [1, 2, 3, 4].map((m) => ({ m, latency: 5 })),
      ),
    ];
    const actual = merge(inputs);
    expect(actual).toEqual(rawComparison('gemm', inputs));
    expect(actual.rows.map((r) => [r.x, r.status, r.runId, r.resultIndex, r.revision])).toEqual([
      [1, 'ok', 'old', 0, 'old-revision'],
      [2, 'error', 'new', 1, 'new-revision'],
      [3, 'unsupported', 'new', 2, 'new-revision'],
      [4, 'ok', 'new', 3, 'new-revision'],
    ]);
    expect(actual.hardware[0].runs.map((r) => r.runId)).toEqual(['old', 'new']);
  });

  it('counts shapes once across backends and preserves sources and tied backend ordering', () => {
    const inputs = [
      makeInput('new', 'h200-dgxc', [
        { m: 1, backend: 'vllm', latency: 5 },
        { m: 1, backend: 'torch', latency: 5 },
        { m: 2, sources: ['moonshotai/Kimi-K2.5/ffn'] },
      ]),
      makeInput('ascend', 'ascend950pr-external', [
        { m: 1, backend: 'torch_npu_linear', sources: ['deepseek-ai/DeepSeek-V4-Pro/ffn'] },
      ]),
      makeInput('obsolete', 'h200-dgxc', [{ m: 1, sources: ['obsolete/model/role'] }]),
    ];
    const actual = merge(inputs);
    const expected = rawComparison('gemm', inputs);
    expect(actual).toEqual(expected);
    expect(actual.workloads[0]).toMatchObject({ cases: 1, hardware: ['ascend950pr', 'h200'] });
    expect(actual.hardware[0].runs.map((r) => r.runId)).toEqual(['new']);
    const view = comparisonView(actual, 'gemm:DeepSeek-V4-Pro');
    expect(view).toEqual(comparisonView(expected, 'gemm:DeepSeek-V4-Pro'));
    expect(view.measurements.h200.backend).toEqual(['vllm']);
    expect(view.cases[0].sources[0].roles).toEqual(['attention', 'ffn']);
  });

  it('matches the raw pipeline across overlapping histories and every workload', () => {
    const statuses: OperatorXStatus[] = ['ok', 'missing', 'error', 'unsupported'];
    const inputs = Array.from({ length: 12 }, (_, run) =>
      makeInput(
        `run-${run}`,
        run % 3 === 0 ? 'h100-sxm' : 'h200-dgxc',
        Array.from({ length: 16 }, (_row, i) => ({
          m: 2 ** Math.floor(i / 2),
          backend: i % 2 ? 'torch' : 'vllm',
          status: statuses[(run + i * 3) % statuses.length],
          sources: [`deepseek-ai/DeepSeek-V4-Pro/${run % 2 ? 'ffn' : 'attention'}`],
          latency: run + i + 1,
        })),
      ),
    );
    const expected = rawComparison('gemm', inputs);
    const actual = merge(inputs);
    expect(actual).toEqual(expected);
    for (const workload of expected.workloads) {
      expect(comparisonView(actual, workload.id)).toEqual(comparisonView(expected, workload.id));
    }
  });

  it('preserves routed MoE calculations, fallback, and provenance across hardware', () => {
    const inputs = [
      makeInput(
        'new',
        'h200-dgxc',
        [
          { m: 16, status: 'missing' },
          { m: 32, status: 'error' },
        ],
        'moe',
      ),
      makeInput(
        'amd',
        'mi355x',
        [
          { m: 16, backend: 'torch' },
          { m: 32, backend: 'torch' },
        ],
        'moe',
      ),
      makeInput('old', 'h200-dgxc', [{ m: 16 }, { m: 32 }], 'moe'),
    ];
    const actual = mergeRunComparisons(
      'moe',
      inputs.map((i) => {
        const serialized = JSON.stringify(buildRunComparison('moe', i));
        return JSON.parse(serialized);
      }),
    );
    const expected = rawComparison('moe', inputs);
    expect(actual).toEqual(expected);
    for (const workload of expected.workloads) {
      const view = comparisonView(actual, workload.id);
      expect(view).toEqual(comparisonView(expected, workload.id));
      expect(view.cases[0].flops).toBeGreaterThan(0);
      expect(view.cases[0].dims).toMatchObject({ tokens: 16, hidden: 7168, experts: 256, topK: 8 });
    }
  });

  it('handles no runs and rejects a projection for another operation', () => {
    expect(mergeRunComparisons('gemm', [])).toEqual({
      op: 'gemm',
      hardware: [],
      workloads: [],
      rows: [],
    });
    expect(() =>
      mergeRunComparisons('gemm', [{ op: 'moe', hardware: [], workloads: [], rows: [] }]),
    ).toThrow('Expected gemm');
  });
});
