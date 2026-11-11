import { nightlyCommit } from '@/components/latest-image/latest-image-utils';
import type { InferenceData } from '@/components/inference/types';

import type { ReproducePayload } from './reproduce-payload';

export type EnvironmentKey =
  | 'gpu_sku'
  | 'container_image'
  | 'launched_container'
  | 'framework'
  | 'framework_commit'
  | 'tensorrt_llm_version'
  | 'nccl_version'
  | 'cuda_version'
  | 'driver_version'
  | 'router'
  | 'kv_offload_backend'
  | 'nodes'
  | 'gpus'
  | 'cpu'
  | 'srtctl_version'
  | 'recipe'
  | 'inferencex_commit'
  | 'workflow_run';

export interface EnvironmentRow {
  key: EnvironmentKey;
  /** Null means the run's stored artifacts do not record this value. */
  value: string | null;
  href?: string;
}

const GITHUB_REPO = /^(?<repo>https:\/\/github\.com\/[^/]+\/[^/]+)\/actions\/runs\//u;

function withVersion(name: string | undefined, version: string | undefined): string | null {
  if (!name) return null;
  return version ? `${name} ${version}` : name;
}

// Rows a run type can never have stay hidden. These say "not recorded" instead.
const ALWAYS_SHOWN: Partial<Record<EnvironmentKey, true>> = {
  gpu_sku: true,
  container_image: true,
  framework: true,
  cuda_version: true,
  driver_version: true,
  workflow_run: true,
};

/**
 * Environment facts for one point, from its row and, for stored results, the run
 * metadata and log facts in `/api/v1/reproduce`. Driver and CUDA stay null unless a
 * stored log states them, because no artifact records the host driver.
 */
export function buildReproduceEnvironment(
  point: InferenceData,
  payload: ReproducePayload | null,
): EnvironmentRow[] {
  const launch = payload?.logs?.launch ?? null;
  const versions = payload?.logs?.engine?.versions;
  const run = payload?.run;
  const runUrl = run?.run_url ?? point.run_url ?? null;
  const repo = runUrl ? GITHUB_REPO.exec(runUrl)?.groups?.repo : undefined;
  const commit = point.image ? nightlyCommit(point.image) : null;
  const rows: EnvironmentRow[] = [
    { key: 'gpu_sku', value: point.hw ?? null },
    { key: 'container_image', value: point.image ?? null },
    { key: 'launched_container', value: launch?.container ?? null },
    { key: 'framework', value: point.framework ?? null },
    { key: 'framework_commit', value: commit },
    { key: 'tensorrt_llm_version', value: versions?.tensorrt_llm ?? null },
    { key: 'nccl_version', value: versions?.nccl ?? null },
    { key: 'cuda_version', value: versions?.cuda ?? null },
    { key: 'driver_version', value: null },
    { key: 'router', value: withVersion(point.router_name, point.router_version) },
    {
      key: 'kv_offload_backend',
      value: withVersion(point.kv_offload_backend, point.kv_offload_backend_version),
    },
    { key: 'nodes', value: launch?.resources.nodes ?? null },
    { key: 'gpus', value: launch?.resources.gpus ?? null },
    { key: 'cpu', value: launch?.resources.cpu ?? null },
    { key: 'srtctl_version', value: launch?.srtctl_version ?? null },
    { key: 'recipe', value: launch?.recipe ?? null },
    {
      key: 'inferencex_commit',
      value: run?.head_sha ?? null,
      href: run?.head_sha && repo ? `${repo}/commit/${run.head_sha}` : undefined,
    },
    { key: 'workflow_run', value: runUrl, href: runUrl ?? undefined },
  ];
  return rows.filter((row) => row.value !== null || ALWAYS_SHOWN[row.key]);
}
