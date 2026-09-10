/**
 * Repair benchmark config references without modifying shared config rows or metrics.
 * Dry run (default): bun --env-file=../../.env src/backfill-benchmark-topology.ts
 * Apply the printed plan: append --apply [--yes]. Conflicts roll back the entire plan.
 */
import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils.js';
import { createConfigCache, type ConfigParams } from './etl/config-cache.js';
import { createAdminSql, refreshLatestBenchmarks, type Sql } from './etl/db-utils.js';
import { correctedBenchmarkConfig } from './lib/benchmark-topology.js';

const apply = process.argv.includes('--apply');
const reader = createAdminSql({ readonly: true, noSsl: hasNoSslFlag(), max: 1 });

async function main(): Promise<void> {
  const rows = await reader<
    {
      id: string;
      config_id: number;
      benchmark_type: string;
      metrics: Record<string, number>;
      config: ConfigParams;
    }[]
  >`
    select br.id, br.config_id, br.benchmark_type, br.metrics,
      jsonb_build_object(
        'hardware', c.hardware, 'framework', c.framework, 'model', c.model,
        'precision', c.precision, 'specMethod', c.spec_method,
        'disagg', c.disagg, 'isMultinode', c.is_multinode,
        'prefillTp', c.prefill_tp, 'prefillEp', c.prefill_ep,
        'prefillDpAttn', c.prefill_dp_attention, 'prefillNumWorkers', c.prefill_num_workers,
        'decodeTp', c.decode_tp, 'decodeEp', c.decode_ep,
        'decodeDpAttn', c.decode_dp_attention, 'decodeNumWorkers', c.decode_num_workers,
        'numPrefillGpu', c.num_prefill_gpu, 'numDecodeGpu', c.num_decode_gpu
      ) as config
    from benchmark_results br join configs c on c.id = br.config_id
    where br.benchmark_type in ('single_turn', 'agentic_traces')
      and (not c.is_multinode or (c.disagg and c.num_decode_gpu = 0))
    order by br.id
  `;
  const plan = rows.flatMap((row) => {
    const corrected = correctedBenchmarkConfig(row.config, row.benchmark_type, row.metrics);
    return corrected === row.config ? [] : [{ ...row, corrected }];
  });
  for (const row of plan) {
    console.log(
      JSON.stringify({
        id: row.id,
        configId: row.config_id,
        benchmarkType: row.benchmark_type,
        before: row.config,
        after: row.corrected,
      }),
    );
  }
  console.log(
    `${plan.length} benchmark rows require repair. ${apply ? 'Apply requested.' : 'Dry run: no writes.'}`,
  );
  if (!apply || plan.length === 0) return;
  if (!hasYesFlag() && !(await confirm('Apply this plan in one transaction? (y/N) '))) return;

  const writer = createAdminSql({ noSsl: hasNoSslFlag(), max: 1 });
  try {
    await writer.begin(async (tx) => {
      const configs = createConfigCache(tx as unknown as Sql);
      for (const row of plan) {
        const configId = await configs.getOrCreateConfig(row.corrected);
        const changed = await tx`
          update benchmark_results set config_id = ${configId}
          where id = ${row.id} and config_id = ${row.config_id}
            and metrics = ${tx.json(row.metrics)}
          returning id
        `;
        if (changed.length !== 1)
          throw new Error(`Benchmark ${row.id} changed since planning; retry the dry run.`);
      }
    });
    await refreshLatestBenchmarks(writer);
    console.log('Repair committed. Invalidate the website DB cache before verifying public reads.');
  } finally {
    await writer.end();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => reader.end());
