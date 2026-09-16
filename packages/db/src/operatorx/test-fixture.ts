import type { OperatorXBundle } from './reader';
export function makeOperatorXBundle(): OperatorXBundle {
  const args = { m: 1000, n: 1000, k: 1000, dtype_a: 'bf16', dtype_b: 'bf16', dtype_out: 'bf16' };
  return {
    run: {
      run_id: '123',
      run_attempt: 1,
      source_sha: 'abc',
      source_branch: 'test',
      generated_at: '2026-09-16T00:00:00Z',
      conclusion: 'success',
    },
    manifest: {
      version: 1,
      run_id: '123',
      source_sha: 'abc',
      include: [
        {
          id: 'a',
          cluster: 'h100_dgxc_8x',
          world_size: 1,
          backends: ['torch'],
          cases: [{ testlist: 'gemm', shape: { type: 'gemm', args } }],
        },
      ],
    },
    shards: [
      {
        id: 'a',
        attempt: 1,
        docs: [
          {
            schema_version: '1',
            run: {
              operatorx_git_sha: 'abc',
              cluster: 'h100_dgxc_8x',
              env: {
                OPERATORX_GITHUB_RUN_ID: '123',
                OPERATORX_GITHUB_RUN_ATTEMPT: '1',
                OPERATORX_SHARD_ID: 'a',
                WORLD_SIZE: '1',
              },
            },
            rows: [
              {
                op: { type: 'gemm', args, backend: 'torch' },
                testlist: 'gemm',
                status: 'ok',
                metrics: { latency_us: 1000 },
              },
            ],
          },
        ],
      },
    ],
  };
}
