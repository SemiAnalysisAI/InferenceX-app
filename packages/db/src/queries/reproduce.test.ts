import { describe, expect, it } from 'vitest';

import { groupLaunchFiles, selectLaunchLogFiles } from './reproduce';

describe('selectLaunchLogFiles', () => {
  it('reads launch steps from the sweep log and versions from the first engine worker', () => {
    expect(
      selectLaunchLogFiles([
        'results/benchmark.log',
        'srt-single-node-logs/logs/sweep_32572.log',
        'srt-single-node-logs/logs/host_vllm-router_0.out',
        'srt-single-node-logs/logs/host-b_prefill_w0.out',
        'srt-single-node-logs/logs/host-a_decode_w0.out',
        'srt-single-node-logs/logs/host-a_prefill_w1.out',
      ]),
    ).toEqual({
      launch: 'srt-single-node-logs/logs/sweep_32572.log',
      engine: 'srt-single-node-logs/logs/host-a_decode_w0.out',
    });
  });

  it('uses the server log of runs launched without srtctl', () => {
    expect(selectLaunchLogFiles(['results/benchmark.log', 'results/server.log'])).toEqual({
      launch: null,
      engine: 'results/server.log',
    });
    expect(selectLaunchLogFiles(['benchmark.out'])).toEqual({
      launch: null,
      engine: 'benchmark.out',
    });
  });

  it('does not treat a client log as the engine log of an srtctl bundle', () => {
    expect(selectLaunchLogFiles(['results/benchmark.log', 'sweep_1.log'])).toEqual({
      launch: 'sweep_1.log',
      engine: null,
    });
  });
});

describe('groupLaunchFiles', () => {
  it('orders config files for a reader, drops duplicate copies, and parses fingerprints', () => {
    const fingerprint = JSON.stringify({
      hostname: 'host-a',
      gpu: { driver: '580.126.20', gpus: [{ name: 'NVIDIA GB200' }] },
      cuda_version: 'Cuda compilation tools, release 13.4, V13.4.92',
      nccl_version: '(2, 30, 7)',
      frameworks: { vllm: '0.33.0' },
    });
    const grouped = groupLaunchFiles([
      { file: 'logs/host-a_config.json', text: '{"tp": 8}' },
      { file: 'trtllm_config_prefill.yaml', text: 'max_batch_size: 8\n' },
      { file: 'recipe.lock.yaml', text: 'schema: 2\nresolved: true\n' },
      { file: 'srt-single-node-logs/config.yaml', text: 'schema: 2\n' },
      { file: 'srt-single-node-logs/logs/config.yaml', text: 'schema: 2\n' },
      { file: 'logs/fingerprint_prefill_w0.json', text: fingerprint },
      { file: 'logs/fingerprint_decode_w0.json', text: 'not json' },
      { file: 'logs/agentic/benchmark_command.txt', text: 'agentx profile --concurrency 8\n' },
    ]);
    expect(grouped.config_files.map((file) => file.file)).toEqual([
      'srt-single-node-logs/config.yaml',
      'recipe.lock.yaml',
      'trtllm_config_prefill.yaml',
      'logs/host-a_config.json',
    ]);
    expect(grouped.fingerprints).toEqual([
      {
        file: 'logs/fingerprint_prefill_w0.json',
        hostname: 'host-a',
        os: null,
        arch: null,
        cpu: null,
        gpu: 'NVIDIA GB200',
        gpu_count: 1,
        driver: '580.126.20',
        cuda: '13.4.92',
        nccl: '2.30.7',
        python: null,
        frameworks: { vllm: '0.33.0' },
      },
    ]);
    expect(grouped.benchmark_command).toBe('agentx profile --concurrency 8');
  });
});
