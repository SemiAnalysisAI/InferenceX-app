import type { OperatorXSource } from './source';
import { normalizeBundle } from '@semianalysisai/inferencex-db/operatorx/normalize';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  planFromManifest,
  type OperatorXRawBundle,
} from '@semianalysisai/inferencex-db/operatorx/bundle';
import { buildComparison, comparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';

import { caseRefs } from '@/components/operatorx/compare/model';

const sourceMock = vi.hoisted(() => vi.fn());
vi.mock('./sources', () => ({ getOperatorXSource: sourceMock }));

const args = { m: 1, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } };
const shape = { type: 'gemm', args, sources: ['openai/gpt-oss-120b/k_proj'] };
function bundle(
  id: string,
  backends: string[],
  options: { noDocs?: boolean; status?: 'ok' | 'error'; revision?: string; kernel?: string } = {},
): OperatorXRawBundle {
  const kernel = options.kernel ?? 'gemm_kernel';
  return {
    run: {
      run_id: id,
      run_attempt: 1,
      revision: options.revision ?? '1',
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
                  metrics: {
                    latency_us: 10,
                    profile: {
                      timeline: [{ name: kernel, start_us: 0, dur_us: 10, stream: 0 }],
                      kernels: [{ name: kernel, us_per_call: 10, count_per_call: 1 }],
                    },
                  },
                })),
              },
            ],
          },
        ],
  };
}

function projection(raw: OperatorXRawBundle) {
  return buildComparison('gemm', [{ runner: 'h200-dgxc', dataset: normalizeBundle(raw) }]);
}

function source(bundles: OperatorXRawBundle[], failedIds = new Set<string>()) {
  const byId = new Map(bundles.map((item) => [item.run.run_id, item]));
  const getBundle = vi.fn((id: string) =>
    failedIds.has(id)
      ? Promise.reject(new Error('database unavailable'))
      : Promise.resolve(byId.get(id)!),
  );
  const config: OperatorXSource = {
    name: 'fixture',
    listRuns: () =>
      Promise.resolve(
        bundles.map((item) => ({
          ...item.run,
          plan: planFromManifest(item.manifest)!,
        })),
      ),
    getBundle,
  };
  sourceMock.mockReturnValue(config);
  return { getBundle, config };
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
  const view = comparisonView(comparison, null);
  const ref = caseRefs(view, ['h200'], 0)[0].ref;
  expect(ref).toBe('1:0:1');

  source([recent, old]);
  const result = await getTimelines('gemm', [ref]);

  expect(result.known).toBe(true);
  expect(result.timelines[ref]).toMatchObject({ names: ['gemm_kernel'], spanUs: 10 });
});

it('uses the new stored revision after re-ingest instead of a cached old bundle', async () => {
  source([bundle('1', ['vllm'], { revision: '101', kernel: 'old_kernel' })]);
  const { getDataset, getTimelines } = await import('./service');
  await getDataset('1');

  source([bundle('1', ['vllm'], { revision: '102', kernel: 'new_kernel' })]);
  const current = await getTimelines('gemm', ['1:0:102']);
  const replaced = await getTimelines('gemm', ['1:0:101']);

  expect(current).toMatchObject({
    known: true,
    timelines: { '1:0:102': { names: ['new_kernel'] } },
  });
  expect(replaced).toEqual({ known: false, timelines: { '1:0:101': null } });
});

describe('compact OperatorX comparison reads', () => {
  it('serves stored comparisons without reading artifacts, and reuses the revision cache', async () => {
    const raw = bundle('9', ['vllm'], { revision: '900' });
    const reads = source([raw]);
    const compact = buildComparison('gemm', [
      { runner: 'h200-dgxc', dataset: normalizeBundle(raw) },
    ]);
    const getRunComparison = vi.fn().mockResolvedValue(compact);
    reads.config.getRunComparison = getRunComparison;
    const { getComparison } = await import('./service');
    expect(await getComparison('gemm')).toEqual(compact);
    expect(await getComparison('gemm')).toEqual(compact);
    expect(getRunComparison).toHaveBeenCalledTimes(1);
    expect(reads.getBundle).not.toHaveBeenCalled();
  });

  it('mixes compact and legacy runs while filling only missing cases', async () => {
    const newest = bundle('9', ['vllm', 'torch'], { noDocs: true });
    const older = bundle('8', ['vllm', 'torch']);
    const reads = source([newest, older]);
    reads.config.getRunComparison = vi.fn((id: string) =>
      Promise.resolve(
        id === '9'
          ? buildComparison('gemm', [{ runner: 'h200-dgxc', dataset: normalizeBundle(newest) }])
          : null,
      ),
    );
    const { getComparison } = await import('./service');
    const result = await getComparison('gemm');
    expect(result.rows.map((r) => [r.runId, r.status, r.revision])).toEqual([
      ['8', 'ok', '1'],
      ['8', 'ok', '1'],
    ]);
    expect(reads.getBundle).toHaveBeenCalledTimes(1);
    expect(reads.getBundle).toHaveBeenCalledWith('8');
  });

  it('does not cache a partial compact read or hide a storage error with artifact fallback', async () => {
    const rows = [bundle('9', ['vllm']), bundle('8', ['vllm'])];
    const reads = source(rows);
    const getRunComparison = vi.fn((id: string) => {
      if (id === '9') return Promise.reject(new Error('storage unavailable'));
      return Promise.resolve(
        buildComparison('gemm', [{ runner: 'h200-dgxc', dataset: normalizeBundle(rows[1]) }]),
      );
    });
    reads.config.getRunComparison = getRunComparison;
    const { getComparison, isPartialComparison } = await import('./service');
    const first = await getComparison('gemm');
    expect(first.rows[0].runId).toBe('8');
    expect(isPartialComparison(first)).toBe(true);
    await getComparison('gemm');
    expect(getRunComparison).toHaveBeenCalledTimes(4);
    expect(reads.getBundle).not.toHaveBeenCalled();
  });

  it('refreshes compact results when the run revision changes', async () => {
    const first = bundle('9', ['vllm'], { revision: '900' });
    const firstReads = source([first]);
    firstReads.config.getRunComparison = vi
      .fn()
      .mockResolvedValue(
        buildComparison('gemm', [{ runner: 'h200-dgxc', dataset: normalizeBundle(first) }]),
      );
    const { getComparison } = await import('./service');
    const originalComparison = await getComparison('gemm');
    expect(originalComparison.rows[0].revision).toBe('900');
    const replaced = bundle('9', ['vllm'], { revision: '901' });
    const reads = source([replaced]);
    const getRunComparison = vi
      .fn()
      .mockResolvedValue(
        buildComparison('gemm', [{ runner: 'h200-dgxc', dataset: normalizeBundle(replaced) }]),
      );
    reads.config.getRunComparison = getRunComparison;
    const updatedComparison = await getComparison('gemm');
    expect(updatedComparison.rows[0].revision).toBe('901');
    expect(getRunComparison).toHaveBeenCalledTimes(1);
    expect(reads.getBundle).not.toHaveBeenCalled();
  });
});

describe('bulk OperatorX comparison reads', () => {
  it.each([true, false])(
    'uses one query, preserving merge order and fallback (complete=%s)',
    async (complete) => {
      const newest = bundle('9', ['vllm'], { status: 'error' });
      const older = bundle('8', ['vllm', 'torch']);
      const reads = source([newest, older]);
      const compact = new Map(
        (complete ? [older, newest] : [newest]).map((raw) => [raw.run.run_id, projection(raw)]),
      );
      const read = vi.fn().mockResolvedValue(compact);
      reads.config.getRunComparisons = read;
      reads.config.getRunComparison = vi
        .fn()
        .mockRejectedValue(new Error('unexpected per-run read'));
      const { getComparison } = await import('./service');
      const result = await getComparison('gemm');
      expect(result.rows.map((row) => [row.runId, row.status])).toEqual([
        ['9', 'error'],
        ['8', 'ok'],
      ]);
      await getComparison('gemm');
      expect(read).toHaveBeenCalledTimes(1);
      expect(read.mock.calls[0][0]).toMatchObject([{ run_id: '9' }, { run_id: '8' }]);
      expect(reads.config.getRunComparison).not.toHaveBeenCalled();
      expect(reads.getBundle).toHaveBeenCalledTimes(complete ? 0 : 1);
    },
  );

  it('retries a failed bulk query without silently loading raw artifacts', async () => {
    const reads = source([bundle('9', ['vllm'])]);
    reads.config.getRunComparisons = vi.fn().mockRejectedValue(new Error('bulk read unavailable'));
    const { getComparison } = await import('./service');
    await expect(getComparison('gemm')).rejects.toThrow('bulk read unavailable');
    await expect(getComparison('gemm')).rejects.toThrow('bulk read unavailable');
    expect(reads.config.getRunComparisons).toHaveBeenCalledTimes(2);
    expect(reads.getBundle).not.toHaveBeenCalled();
  });
});
