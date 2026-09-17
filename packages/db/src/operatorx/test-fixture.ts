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

/** A mixed run with independently specified GEMM, MHA/GQA and MLA measurements. */
export function makeOperatorXAttentionBundle(): OperatorXBundle {
  const bundle = makeOperatorXBundle();
  const manifest = bundle.manifest as { include: { cases: unknown[] }[] };
  const doc = bundle.shards[0].docs[0] as { rows: unknown[] };
  const shapes = [
    {
      type: 'attention_mha',
      args: {
        batch_size: 8,
        seq_len_q: 1,
        seq_len_kv: 4096,
        num_heads: 32,
        num_heads_kv: 8,
        head_dim: 128,
        dtype_q: 'bf16',
        dtype_k: 'bf16',
        dtype_v: 'bf16',
        dtype_o: 'bf16',
        causal: true,
      },
    },
    {
      type: 'attention_mla',
      args: {
        batch_size: 8,
        seq_len_q: 1,
        seq_len_kv: 4096,
        num_heads: 128,
        head_dim_qk_nope: 128,
        head_dim_qk_rope: 64,
        head_dim_v: 128,
        kv_lora_rank: 512,
        dtype_q: 'bf16',
        dtype_kv: 'bf16',
        dtype_o: 'bf16',
      },
    },
  ];
  shapes.forEach((shape, index) => {
    manifest.include[0].cases.push({ testlist: 'attention', shape });
    doc.rows.push({
      op: { ...shape, backend: 'torch' },
      testlist: 'attention',
      status: 'ok',
      metrics: { latency_us: index === 0 ? 12.5 : 5.5 },
    });
  });
  return bundle;
}
