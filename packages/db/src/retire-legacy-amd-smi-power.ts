/** Source-policy retirement of exact, audited legacy AMD-SMI benchmark power. */
import type postgres from 'postgres';
import { isDeepStrictEqual } from 'node:util';

import type { DbClient } from './connection.js';
import type { ConfigParams } from './etl/config-cache.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { LEGACY_GPU_POWER_KEYS } from './lib/amd-smi-retirement-inventory.js';
import {
  LEGACY_AMD_SMI_RESULT_IDS,
  LEGACY_AMD_SMI_RUN_IDS,
  isRetiredStoredSeries,
  retiredPowerSource,
  type LegacyPointIdentity,
} from './lib/legacy-amd-smi-policy.js';

interface StoredPoint {
  id: string;
  github_run_id: string;
  run_attempt: number;
  head_sha: string | null;
  benchmark_type: string;
  isl: number | null;
  osl: number | null;
  conc: number;
  offload_mode: string;
  recipe_fingerprint: string | null;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
  workers: unknown;
}

function storedPointIdentity(row: StoredPoint): LegacyPointIdentity {
  // Use every config dimension so the two raw-only selectors remain portable.
  const config: ConfigParams = {
    hardware: String(row.config.hardware),
    framework: String(row.config.framework),
    model: String(row.config.model),
    precision: String(row.config.precision),
    specMethod: String(row.config.spec_method),
    disagg: row.config.disagg === true,
    isMultinode: row.config.is_multinode === true,
    prefillTp: Number(row.config.prefill_tp),
    prefillEp: Number(row.config.prefill_ep),
    prefillDpAttn: row.config.prefill_dp_attention === true,
    prefillNumWorkers: Number(row.config.prefill_num_workers),
    decodeTp: Number(row.config.decode_tp),
    decodeEp: Number(row.config.decode_ep),
    decodeDpAttn: row.config.decode_dp_attention === true,
    decodeNumWorkers: Number(row.config.decode_num_workers),
    numPrefillGpu: Number(row.config.num_prefill_gpu),
    numDecodeGpu: Number(row.config.num_decode_gpu),
  };
  return {
    config,
    benchmarkType: row.benchmark_type,
    isl: row.isl,
    osl: row.osl,
    conc: row.conc,
    offloadMode: row.offload_mode,
    recipeFingerprint: row.recipe_fingerprint,
  };
}

async function readPoints(sql: DbClient, lock = false): Promise<StoredPoint[]> {
  const rows = lock
    ? await sql`
    select br.id::text, wr.github_run_id::text, wr.run_attempt, wr.head_sha,
      br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode,
      br.recipe_fingerprint, to_jsonb(c) as config, br.metrics, br.workers
    from benchmark_results br
    join workflow_runs wr on wr.id = br.workflow_run_id
    join configs c on c.id = br.config_id
    where br.id = any(${LEGACY_AMD_SMI_RESULT_IDS}::bigint[])
    order by br.id
    for update of br, wr, c
  `
    : await sql`
    select br.id::text, wr.github_run_id::text, wr.run_attempt, wr.head_sha,
      br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode,
      br.recipe_fingerprint, to_jsonb(c) as config, br.metrics, br.workers
    from benchmark_results br
    join workflow_runs wr on wr.id = br.workflow_run_id
    join configs c on c.id = br.config_id
    where br.id = any(${LEGACY_AMD_SMI_RESULT_IDS}::bigint[])
    order by br.id
  `;
  return rows as unknown as StoredPoint[];
}

async function telemetryTablesPresent(sql: DbClient): Promise<boolean> {
  const [row] = await sql`
    select to_regclass('gpu_metric_series') is not null as has_series,
      to_regclass('benchmark_result_gpu_metrics') is not null as has_links
  `;
  return row?.has_series === true && row.has_links === true;
}

async function linkedTelemetryIds(sql: DbClient): Promise<number[]> {
  const rows = await sql`
    select distinct benchmark_result_id::text as id
    from benchmark_result_gpu_metrics
    where benchmark_result_id = any(${LEGACY_AMD_SMI_RESULT_IDS}::bigint[])
  `;
  return rows.map((row) => Number(row.id));
}

interface StoredTelemetry {
  id: string;
  github_run_id: string;
  run_attempt: number;
  head_sha: string | null;
  vendor: string;
  csv_sha256: string;
  has_power: boolean;
}

async function retiredTelemetryIds(sql: DbClient, lock = false): Promise<number[]> {
  const rows = lock
    ? await sql`
      select s.id::text, wr.github_run_id::text, wr.run_attempt, wr.head_sha,
        s.vendor, s.csv_sha256,
        (exists (select 1 from gpu_metric_samples x where x.series_id = s.id and x.power_w is not null)
          or exists (select 1 from gpu_metric_gpu_stats x where x.series_id = s.id and x.metric = 'power_w')) as has_power
      from gpu_metric_series s
      join workflow_runs wr on wr.id = s.workflow_run_id
      where wr.github_run_id = any(${LEGACY_AMD_SMI_RUN_IDS}::bigint[])
      order by s.id
      for update of s, wr
    `
    : await sql`
      select s.id::text, wr.github_run_id::text, wr.run_attempt, wr.head_sha,
        s.vendor, s.csv_sha256,
        (exists (select 1 from gpu_metric_samples x where x.series_id = s.id and x.power_w is not null)
          or exists (select 1 from gpu_metric_gpu_stats x where x.series_id = s.id and x.metric = 'power_w')) as has_power
      from gpu_metric_series s
      join workflow_runs wr on wr.id = s.workflow_run_id
      where wr.github_run_id = any(${LEGACY_AMD_SMI_RUN_IDS}::bigint[])
      order by s.id
    `;
  return (rows as unknown as StoredTelemetry[])
    .filter(
      (row) =>
        row.has_power &&
        isRetiredStoredSeries(
          {
            githubRunId: Number(row.github_run_id),
            runAttempt: row.run_attempt,
            headSha: row.head_sha,
          },
          row.vendor,
          row.csv_sha256,
        ),
    )
    .map((row) => Number(row.id));
}

function planRows(rows: StoredPoint[]) {
  const expected = new Set(LEGACY_AMD_SMI_RESULT_IDS.map(String));
  for (const row of rows) {
    if (!expected.delete(row.id)) throw new Error(`Unexpected result ${row.id}`);
    const source = retiredPowerSource(
      {
        githubRunId: Number(row.github_run_id),
        runAttempt: row.run_attempt,
        headSha: row.head_sha,
      },
      storedPointIdentity(row),
    );
    if (!source) throw new Error(`Source identity changed for result ${row.id}`);
  }
  if (expected.size > 0) throw new Error(`Missing candidate results: ${[...expected].join(', ')}`);
  return rows.map((row) => ({
    resultId: Number(row.id),
    powerKeys: LEGACY_GPU_POWER_KEYS.filter((key) => row.metrics[key] !== undefined),
    hasWorkerPower:
      Array.isArray(row.workers) &&
      row.workers.some(
        (worker: unknown) =>
          typeof worker === 'object' &&
          worker !== null &&
          !Array.isArray(worker) &&
          LEGACY_GPU_POWER_KEYS.some((key) => key in worker),
      ),
  }));
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--yes')) {
    throw new Error('--apply requires --yes; default mode is read-only');
  }
  if (!apply && !process.env.DATABASE_READONLY_URL) {
    throw new Error('Dry-run requires DATABASE_READONLY_URL');
  }
  const sql = createAdminSql({ readonly: !apply, max: 1, onnotice: () => {} });
  try {
    const rows = await readPoints(sql as DbClient);
    const planned = planRows(rows);
    const telemetryPresent = await telemetryTablesPresent(sql as DbClient);
    const linkedIds = telemetryPresent ? await linkedTelemetryIds(sql as DbClient) : [];
    const seriesIds = telemetryPresent ? await retiredTelemetryIds(sql as DbClient) : [];
    const changing = planned.filter((row) => row.powerKeys.length > 0 || row.hasWorkerPower);
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: apply ? 'apply' : 'read_only_dry_run',
          sourceIdentityChecked: planned.length,
          rowsWithGpuPower: changing.length,
          telemetryTablesPresent: telemetryPresent,
          linkedTelemetryPoints: linkedIds.length,
          telemetrySeriesWithRetiredPower: seriesIds.length,
          targets: changing,
        },
        null,
        2,
      )}\n`,
    );
    if (!apply) return;
    if (changing.length > 0 || seriesIds.length > 0) {
      const writer = sql as ReturnType<typeof postgres>;
      await writer.begin(async (tx) => {
        const locked = planRows(await readPoints(tx as DbClient, true));
        if (!isDeepStrictEqual(locked, planned)) {
          throw new Error('Retirement preview changed before apply; rerun dry-run');
        }
        if (telemetryPresent) {
          const lockedSeriesIds = await retiredTelemetryIds(tx as DbClient, true);
          if (!isDeepStrictEqual(lockedSeriesIds, seriesIds)) {
            throw new Error('Telemetry source identity changed before apply; rerun dry-run');
          }
        }
        if (changing.length > 0) {
          await tx`
            update benchmark_results
            set metrics = metrics - ${LEGACY_GPU_POWER_KEYS}::text[],
              workers = case when workers is null then null else (
                select coalesce(jsonb_agg(worker - ${LEGACY_GPU_POWER_KEYS}::text[]), '[]'::jsonb)
                from jsonb_array_elements(workers) as worker
              ) end
            where id = any(${changing.map((row) => row.resultId)}::bigint[])
          `;
        }
        if (telemetryPresent) {
          await tx`
            update gpu_metric_samples set power_w = null
            where series_id = any(${seriesIds}::bigint[]) and power_w is not null
          `;
          await tx`
            delete from gpu_metric_gpu_stats
            where series_id = any(${seriesIds}::bigint[]) and metric = 'power_w'
          `;
          await tx`
            update gpu_metric_series set ingested_at = now()
            where id = any(${seriesIds}::bigint[])
          `;
        }
      });
    }
    // A retry after a committed scrub must still repair a failed materialized-view refresh.
    await refreshLatestBenchmarks(sql);
    process.stdout.write('Retirement applied. Invalidate the API cache before publication.\n');
  } finally {
    await sql.end();
  }
}

await main();
