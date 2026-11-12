import { describe, expect, it } from 'vitest';

import { selectLaunchLogFiles } from './reproduce';

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
