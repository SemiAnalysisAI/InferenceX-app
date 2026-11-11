import { describe, expect, it } from 'vitest';

import type { ReproduceLogs } from '@semianalysisai/inferencex-db/queries/reproduce';

import { buildLaunchCommand } from './launch-command';

const logs = (overrides: Partial<ReproduceLogs>): ReproduceLogs => ({
  files: ['server.log'],
  launch_file: null,
  engine_file: null,
  launch: null,
  engine: null,
  ...overrides,
});

describe('buildLaunchCommand', () => {
  it('renders recorded srtctl steps as a runnable script with one env assignment per line', () => {
    const command = buildLaunchCommand(
      logs({
        launch_file: 'sweep_1.log',
        launch: {
          container: 'lmsysorg/sglang:v0.5.22',
          srtctl_version: '2.59.1',
          recipe: 'inferencex-mi355x_06',
          resources: { nodes: null, cpu: null, gpus: null },
          steps: [
            {
              kind: 'worker',
              role: 'prefill',
              index: 0,
              hosts: ['a', 'b'],
              env: 'DYN_LOG=info,x=warn HF_HOME=/hf',
              command: 'python3 -m sglang.launch_server --tp 8',
            },
            {
              kind: 'frontend',
              role: 'sglang-router',
              index: 0,
              hosts: ['a'],
              env: null,
              command: 'python -m sglang_router.launch_router --pd-disaggregation',
            },
          ],
        },
      }),
    );
    expect(command).toEqual({
      kind: 'recorded',
      file: 'sweep_1.log',
      script: [
        '# Container: lmsysorg/sglang:v0.5.22\n# srtctl 2.59.1\n# Recipe: inferencex-mi355x_06',
        '# prefill worker 0 on a, b\nenv \\\n  DYN_LOG=info,x=warn \\\n  HF_HOME=/hf \\\n  python3 -m sglang.launch_server --tp 8',
        '# sglang-router 0 on a\npython -m sglang_router.launch_router --pd-disaggregation',
      ].join('\n\n'),
    });
  });

  it('shows logged engine arguments as JSON instead of inventing a command', () => {
    expect(
      buildLaunchCommand(
        logs({
          engine_file: 'server.log',
          engine: {
            engine_args: { source: 'vllm-non-default-args', args: { tensor_parallel_size: 8 } },
            versions: { nccl: null, cuda: null, tensorrt_llm: null },
          },
        }),
      ),
    ).toEqual({
      kind: 'engine-args',
      file: 'server.log',
      engine: 'vLLM',
      text: '{\n  "tensor_parallel_size": 8\n}',
    });
  });

  it('distinguishes a missing log bundle from logs without launch facts', () => {
    expect(buildLaunchCommand(null)).toEqual({ kind: 'unavailable', reason: 'no-logs' });
    expect(buildLaunchCommand(logs({ engine_file: 'server.log' }))).toEqual({
      kind: 'unavailable',
      reason: 'not-recorded',
    });
  });
});
