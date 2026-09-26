import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  planFromManifest,
  type OperatorXRawBundle,
} from '@semianalysisai/inferencex-db/operatorx/bundle';

const sourceMock = vi.hoisted(() => vi.fn());
vi.mock('./sources', () => ({ getOperatorXSource: sourceMock }));

const args = { m: 1, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } };
const shape = { type: 'gemm', args, sources: ['openai/gpt-oss-120b/k_proj'] };
const profile = {
  timeline: [{ name: 'gemm_kernel', start_us: 0, dur_us: 10, stream: 0 }],
  kernels: [{ name: 'gemm_kernel', us_per_call: 10, count_per_call: 1 }],
};

function bundle(
  id: string,
  backends: string[],
  options: { noDocs?: boolean; status?: 'ok' | 'error' } = {},
): OperatorXRawBundle {
  return {
    run: {
      run_id: id,
      run_attempt: 1,
      source_sha: 'a'.repeat(40),
      source_branch: 'main',
      generated_at: '2026-09-26T00:00:00Z',
      conclusion: options.noDocs ? 'failure' : 'success',
    },
    manifest: {
      include: [
        {
          id: 's1',
          runner: 'cluster:h200-dgxc',
          mode: 'timing',
          backends,
          cases: [{ testlist: 'gemm', shape }],
        },
      ],
    },
    shards: options.noDocs
      ? []
      : [
          {
            id: 's1',
            attempt: 1,
            docs: [
              {
                run: { cluster: 'h200' },
                rows: backends.map((backend) => ({
                  testlist: 'gemm',
                  op: { ...shape, backend },
                  status: options.status ?? 'ok',
                  metrics: { latency_us: 10, profile },
                })),
              },
            ],
          },
        ],
  };
}

function source(bundles: OperatorXRawBundle[], failedIds = new Set<string>()) {
  const byId = new Map(bundles.map((item) => [item.run.run_id, item]));
  const getBundle = vi.fn((id: string) =>
    failedIds.has(id)
      ? Promise.reject(new Error('database unavailable'))
      : Promise.resolve(byId.get(id)!),
  );
  sourceMock.mockReturnValue({
    name: 'fixture',
    listRuns: () =>
      Promise.resolve(
        bundles.map((item) => ({
          ...item.run,
          plan: planFromManifest(item.manifest)!,
        })),
      ),
    getBundle,
  });
  return { getBundle };
}

beforeEach(() => {
  vi.resetModules();
  sourceMock.mockReset();
});

describe('OperatorX comparison coverage', () => {
  it('keeps an older backend when the new run only measures vLLM', async () => {
    const reads = source([bundle('2', ['vllm']), bundle('1', ['vllm', 'torch'])]);
    const { getComparison } = await import('./service');

    const comparison = await getComparison('gemm');

    expect(comparison.rows.map((row) => [row.caseKey.split('|').at(-1), row.runId])).toEqual([
      ['vllm', '2'],
      ['torch', '1'],
    ]);
    expect(reads.getBundle).toHaveBeenCalledTimes(2);
    await getComparison('gemm');
    expect(reads.getBundle).toHaveBeenCalledTimes(2);
  });

  it('fills missing shard results from an older measurement', async () => {
    source([bundle('2', ['vllm'], { noDocs: true }), bundle('1', ['vllm'])]);
    const { getComparison } = await import('./service');

    const comparison = await getComparison('gemm');
    expect(comparison.rows).toMatchObject([{ runId: '1', status: 'ok', latencyUs: 10 }]);
  });

  it('loads an older run after the newest bundle read fails', async () => {
    const reads = source([bundle('2', ['vllm']), bundle('1', ['vllm'])], new Set(['2']));
    const { getComparison } = await import('./service');

    const comparison = await getComparison('gemm');
    expect(comparison.rows).toMatchObject([{ runId: '1', status: 'ok' }]);
    expect(reads.getBundle).toHaveBeenCalledTimes(2);
  });

  it('reports a source failure rather than an empty successful comparison', async () => {
    source([bundle('2', ['vllm'])], new Set(['2']));
    const { getComparison } = await import('./service');

    await expect(getComparison('gemm')).rejects.toMatchObject({ status: 503 });
  });

  it('keeps a newer explicit error instead of resurrecting an old success', async () => {
    source([bundle('2', ['vllm'], { status: 'error' }), bundle('1', ['vllm'])]);
    const { getComparison } = await import('./service');

    const comparison = await getComparison('gemm');
    expect(comparison.rows).toMatchObject([{ runId: '2', status: 'error', latencyUs: null }]);
  });
});

it('reads a stored timeline after a newer comparison replaces its row', async () => {
  const old = bundle('1', ['vllm']);
  const recent = bundle('2', ['vllm']);
  source([old]);
  const { getComparison, getTimelines } = await import('./service');
  const comparison = await getComparison('gemm');
  const [row] = comparison.rows;
  const ref = `${row.runId}:${row.resultIndex}`;

  source([recent, old]);
  const result = await getTimelines('gemm', [ref]);

  expect(result.known).toBe(true);
  expect(result.timelines[ref]).toMatchObject({ names: ['gemm_kernel'], spanUs: 10 });
});
