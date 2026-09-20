export const swapMatrix = { include: [{ backend: 'swap-blocks', sku: 'h200-dgxc' }] };
export const swapMeta = {
  run_id: '170',
  run_attempt: 1,
  generated_at: '2026-09-16T12:00:00Z',
  conclusion: 'success',
  source_sha: 'abc123',
};
export function makeSwapDoc() {
  return {
    schema: 'collectivex-swap-blocks-v1',
    operation: 'vllm._custom_ops.swap_blocks',
    timing: 'drained-wall-clock-including-submission-and-synchronization',
    warmup: 4,
    iterations: 20,
    runtime: {
      device: 'NVIDIA H200',
      torch: '2.11',
      vllm: '0.25.1',
      cuda: '13.0',
      hip: null,
      image: 'vllm/vllm-openai:v0.25.1',
      source_sha: 'abc123',
    },
    selection: {
      max_payload_bytes: 1073741824,
      skipped_cases: [{ direction: 'h2d', block_bytes: 1073741824, num_blocks: 4 }],
    },
    cases: [
      {
        direction: 'h2d',
        layout: 'contiguous',
        block_bytes: 1024,
        num_blocks: 1,
        payload_bytes: 1024,
        seed: 0,
        host_memory: 'pinned',
        api: 'explicit-block-size',
        correctness_passed: true,
        latency: { sample_count: 20, percentiles_us: { p50: 2, p90: 4, p95: 8, p99: 16 } },
      },
      {
        direction: 'h2d',
        layout: 'contiguous',
        block_bytes: 1073741824,
        num_blocks: 1,
        payload_bytes: 1073741824,
        seed: 0,
        host_memory: 'pinned',
        api: 'explicit-block-size',
        correctness_passed: true,
        latency: {
          sample_count: 20,
          percentiles_us: { p50: 32768, p90: 65536, p95: 131072, p99: 262144 },
        },
      },
      {
        direction: 'd2d',
        layout: 'random',
        block_bytes: 1024,
        num_blocks: 4,
        payload_bytes: 4096,
        seed: 0,
        host_memory: 'none',
        api: 'explicit-block-size',
        correctness_passed: true,
        latency: { sample_count: 20, percentiles_us: { p50: 1, p90: 2, p95: 4, p99: 8 } },
      },
    ],
  };
}
