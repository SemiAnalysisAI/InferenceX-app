import { describe, expect, it } from 'vitest';

import type { OperatorXRawBundle } from './bundle';
import { normalizeBundle } from './normalize';

const shape = {
  type: 'gemm',
  args: { m: 1, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } },
  sources: ['openai/gpt-oss-120b/k_proj'],
};

function bundle(): OperatorXRawBundle {
  return {
    run: {
      run_id: '123',
      run_attempt: 1,
      source_sha: 'a'.repeat(40),
      source_branch: 'main',
      generated_at: '2026-09-26T00:00:00Z',
      conclusion: 'failure',
    },
    manifest: {
      include: [
        {
          id: 's1',
          runner: 'cluster:h200-dgxc',
          mode: 'timing',
          backends: ['vllm', 'torch'],
          cases: [{ testlist: 'gemm', shape }],
        },
      ],
    },
    shards: [
      {
        id: 's1',
        attempt: 1,
        docs: [
          {
            run: { cluster: 'h200', container_image: 'operatorx:test' },
            rows: [
              {
                testlist: 'gemm',
                op: { ...shape, backend: 'vllm' },
                status: 'ok',
                metrics: {
                  latency_us: 10,
                  profile: { timeline: [{ name: 'gemm', start_us: 0, dur_us: 10 }] },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('OperatorX normalization', () => {
  it('retains measured rows and marks only the absent backend missing', () => {
    const normalized = normalizeBundle(bundle());

    expect(normalized.run).toMatchObject({
      runId: '123',
      conclusion: 'failure',
      counts: { requested: 2, ok: 1, missing: 1, error: 0 },
      environment: { container_image: 'operatorx:test' },
    });
    expect(normalized.results).toMatchObject([
      { index: 0, backend: 'vllm', status: 'ok', latencyUs: 10 },
      {
        index: 1,
        backend: 'torch',
        status: 'missing',
        message: 'No result row for this case',
        latencyUs: null,
      },
    ]);
    expect(normalized.metrics[0]).toHaveProperty('profile.timeline');
    expect(normalized.metrics[1]).toBeNull();
  });

  it('keeps an explicit failure and its diagnostic without manufacturing latency', () => {
    const raw = bundle();
    const doc = raw.shards[0].docs[0] as { rows: Record<string, unknown>[] };
    doc.rows[0].status = 'error';
    doc.rows[0].message = 'CUDA out of memory';

    const normalized = normalizeBundle(raw);

    expect(normalized.results[0]).toMatchObject({
      status: 'error',
      message: 'CUDA out of memory',
      latencyUs: null,
      tflops: null,
    });
    expect(normalized.run.counts).toMatchObject({ ok: 0, error: 1, missing: 1 });
  });
});
