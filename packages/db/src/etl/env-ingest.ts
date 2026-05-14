/**
 * Idempotent upsert into `benchmark_environments`.
 *
 * Conflict-resolution rule (per `005_benchmark_environments.sql`):
 *   - source = 'env_json':  overwrite every column. env.json is authoritative.
 *   - source = 'log_parse': only fill columns that are still NULL (COALESCE),
 *                           and never demote a row that's already env_json.
 *
 * This means log-parse fallback from ingest and authoritative env.json ingest
 * can run in any order without clobbering authoritative data.
 */

import type postgres from 'postgres';

import type { ParsedEnv } from './env-parser';

type Sql = ReturnType<typeof postgres>;

export async function upsertBenchmarkEnvironment(
  sql: Sql,
  workflowRunId: number,
  configId: number,
  image: string | null,
  parsed: ParsedEnv,
): Promise<void> {
  const extraJson = JSON.stringify(parsed.extra ?? {});

  if (parsed.source === 'env_json') {
    await sql`
      insert into benchmark_environments (
        workflow_run_id, config_id,
        image, framework_version, framework_sha,
        torch_version, python_version, cuda_version, rocm_version,
        driver_version, gpu_sku, source, extra, parsed_at
      ) values (
        ${workflowRunId}, ${configId},
        ${image}, ${parsed.frameworkVersion}, ${parsed.frameworkSha},
        ${parsed.torchVersion}, ${parsed.pythonVersion}, ${parsed.cudaVersion}, ${parsed.rocmVersion},
        ${parsed.driverVersion}, ${parsed.gpuSku}, 'env_json', ${extraJson}::jsonb, now()
      )
      on conflict (workflow_run_id, config_id) do update set
        image             = excluded.image,
        framework_version = excluded.framework_version,
        framework_sha     = excluded.framework_sha,
        torch_version     = excluded.torch_version,
        python_version    = excluded.python_version,
        cuda_version      = excluded.cuda_version,
        rocm_version      = excluded.rocm_version,
        driver_version    = excluded.driver_version,
        gpu_sku           = excluded.gpu_sku,
        source            = 'env_json',
        extra             = excluded.extra,
        parsed_at         = now()
    `;
    return;
  }

  // log_parse: never overwrite an existing env_json row; only fill NULL
  // columns. We rely on COALESCE in the DO UPDATE clause so a subsequent
  // env_json insert can still upgrade us, and an earlier env_json insert
  // is fully preserved.
  await sql`
    insert into benchmark_environments (
      workflow_run_id, config_id,
      image, framework_version, framework_sha,
      torch_version, python_version, cuda_version, rocm_version,
      driver_version, gpu_sku, source, extra, parsed_at
    ) values (
      ${workflowRunId}, ${configId},
      ${image}, ${parsed.frameworkVersion}, ${parsed.frameworkSha},
      ${parsed.torchVersion}, ${parsed.pythonVersion}, ${parsed.cudaVersion}, ${parsed.rocmVersion},
      ${parsed.driverVersion}, ${parsed.gpuSku}, 'log_parse', ${extraJson}::jsonb, now()
    )
    on conflict (workflow_run_id, config_id) do update set
      image             = coalesce(benchmark_environments.image,             excluded.image),
      framework_version = coalesce(benchmark_environments.framework_version, excluded.framework_version),
      framework_sha     = coalesce(benchmark_environments.framework_sha,     excluded.framework_sha),
      torch_version     = coalesce(benchmark_environments.torch_version,     excluded.torch_version),
      python_version    = coalesce(benchmark_environments.python_version,    excluded.python_version),
      cuda_version      = coalesce(benchmark_environments.cuda_version,      excluded.cuda_version),
      rocm_version      = coalesce(benchmark_environments.rocm_version,      excluded.rocm_version),
      driver_version    = coalesce(benchmark_environments.driver_version,    excluded.driver_version),
      gpu_sku           = coalesce(benchmark_environments.gpu_sku,           excluded.gpu_sku),
      -- source stays whatever it already was; log_parse can't downgrade env_json
      parsed_at         = now()
  `;
}
