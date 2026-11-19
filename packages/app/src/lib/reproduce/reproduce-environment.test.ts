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

const fingerprint = (file: string, driver: string) => ({
  file,
  hostname: file,
  os: 'Ubuntu 24.04.5 LTS',
  arch: 'aarch64',
  cpu: null,
  gpu: 'NVIDIA GB200',
  gpu_count: 4,
  driver,
  cuda: '13.4.92',
  nccl: '2.30.7',
  python: '3.12.3',
  frameworks: { vllm: '0.33.0rc1.dev1030+gcf5cea2da' },
});

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

  it('prefers worker fingerprints over engine-log banners and lists each distinct value', () => {
    const payload = {
      run: null,
      logs: {
        engine: {
          engine_args: null,
          versions: { nccl: '2.32.3', cuda: '13.4', tensorrt_llm: null },
        },
        fingerprints: [
          fingerprint('fingerprint_prefill_w0.json', '580.126.20'),
          fingerprint('fingerprint_decode_w0.json', '580.126.20'),
          fingerprint('fingerprint_decode_w1.json', '580.95.05'),
        ],
      },
    } as unknown as ReproducePayload;
    const rows = Object.fromEntries(
      buildReproduceEnvironment(point, payload).map((row) => [row.key, row.value]),
    );
    expect(rows).toMatchObject({
      gpu_model: 'NVIDIA GB200',
      framework_build: 'vllm 0.33.0rc1.dev1030+gcf5cea2da',
      nccl_version: '2.30.7',
      cuda_version: '13.4.92',
      driver_version: '580.126.20, 580.95.05',
      python_version: '3.12.3',
      os: 'Ubuntu 24.04.5 LTS',
    });
  });
});
