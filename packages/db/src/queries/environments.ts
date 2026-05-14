import type { DbClient } from '../connection.js';

export interface BenchmarkEnvironment {
  /** Provenance: 'env_json' = authoritative, 'log_parse' = best-effort fallback. */
  source: 'env_json' | 'log_parse';
  image: string | null;
  framework_version: string | null;
  framework_sha: string | null;
  torch_version: string | null;
  python_version: string | null;
  cuda_version: string | null;
  rocm_version: string | null;
  driver_version: string | null;
  gpu_sku: string | null;
  /** Anything captured that doesn't yet have a dedicated column. */
  extra: Record<string, unknown>;
}

/**
 * Fetch the environment row for a (workflow run, config) pair — the natural
 * key of `benchmark_environments`. Returns `null` when no row exists
 * (e.g. very old data that has never been backfilled).
 */
export async function getEnvironmentForRunConfig(
  sql: DbClient,
  workflowRunId: number,
  configId: number,
): Promise<BenchmarkEnvironment | null> {
  const rows = (await sql`
    select
      be.source,
      be.image,
      be.framework_version,
      be.framework_sha,
      be.torch_version,
      be.python_version,
      be.cuda_version,
      be.rocm_version,
      be.driver_version,
      be.gpu_sku,
      be.extra
    from benchmark_environments be
    where be.workflow_run_id = ${workflowRunId}
      and be.config_id       = ${configId}
    limit 1
  `) as unknown as BenchmarkEnvironment[];
  return rows[0] ?? null;
}
