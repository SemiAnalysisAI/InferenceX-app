import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { buildReproduceEnvironment } from './reproduce-environment';
import type { ReproducePayload } from './reproduce-payload';

const point = {
  hw: 'gb200',
  hwKey: 'gb200_vllm',
  framework: 'vllm',
  image: 'vllm/vllm-openai:cu134-nightly-cf5cea2da37d3dfed27d2e0aa3041c3e553c2d57',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/42/attempts/1',
  date: '2026-11-11',
  tp: 4,
  conc: 64,
  precision: 'fp4',
} as InferenceData;

describe('buildReproduceEnvironment', () => {
  it('keeps expected-but-unrecorded values visible and hides facts the run type cannot have', () => {
    const rows = buildReproduceEnvironment({ ...point, image: undefined }, null);
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ['gpu_sku', 'gb200'],
      ['container_image', null],
      ['framework', 'vllm'],
      ['cuda_version', null],
      ['driver_version', null],
      ['workflow_run', point.run_url],
    ]);
  });

  it('links the InferenceX commit in the run repository and reads the nightly commit from the image', () => {
    const payload = {
      run: {
        github_run_id: 42,
        run_attempt: 1,
        head_sha: 'abc123',
        run_url: point.run_url!,
        created_at: null,
      },
      logs: {
        files: [],
        launch_file: null,
        engine_file: null,
        launch: null,
        engine: {
          engine_args: null,
          versions: { nccl: '2.32.3', cuda: '13.4', tensorrt_llm: null },
        },
      },
    } as unknown as ReproducePayload;
    const rows = Object.fromEntries(
      buildReproduceEnvironment(point, payload).map((row) => [row.key, row]),
    );
    expect(rows.framework_commit?.value).toBe('cf5cea2da37d3dfed27d2e0aa3041c3e553c2d57');
    expect(rows.cuda_version?.value).toBe('13.4');
    expect(rows.inferencex_commit).toEqual({
      key: 'inferencex_commit',
      value: 'abc123',
      href: 'https://github.com/SemiAnalysisAI/InferenceX/commit/abc123',
    });
  });
});
