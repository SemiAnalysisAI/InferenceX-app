/**
 * Rescales stored agentic disaggregated rows from per-total-chip input and output
 * throughput to the per-pool basis the rest of the data uses (input per prefill
 * chip, output per decode chip). Non-destructive: each row keeps its original
 * values as `input_tput_per_total_gpu` / `output_tput_per_total_gpu`. Rows already
 * rescaled or per pool are left alone, so the script is safe to rerun.
 */
import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import { isPerTotalAgenticCandidate, perPoolThroughputPatch } from './etl/disagg-throughput.js';
import { confirmProceed, jsonbParam, runBackfillMain } from './lib/backfill-runner.js';

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

interface CandidateRow {
  id: number;
  benchmark_type: string;
  metrics: Record<string, unknown>;
  disagg: boolean;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  prefill_num_workers: number;
  decode_num_workers: number;
}

async function main(): Promise<void> {
  console.log('=== backfill-agentic-disagg-throughput ===');

  const rows = await sql<CandidateRow[]>`
    select br.id, br.benchmark_type, br.metrics, c.disagg,
      c.num_prefill_gpu, c.num_decode_gpu, c.prefill_num_workers, c.decode_num_workers
    from benchmark_results br
    join configs c on c.id = br.config_id
    where br.benchmark_type = 'agentic_traces'
      and c.disagg
    order by br.id
  `;
  const patches = rows.flatMap((row) => {
    if (!isPerTotalAgenticCandidate(row)) return [];
    const patch = perPoolThroughputPatch(row.metrics, row.num_prefill_gpu, row.num_decode_gpu);
    return patch ? [{ id: row.id, patch }] : [];
  });
  console.log(
    `  ${rows.length} agentic disaggregated row(s), ${patches.length} still per total chip`,
  );
  if (patches.length === 0) {
    console.log('\n  Nothing to do — all rows up to date.');
    return;
  }
  if (!(await confirmProceed(`${patches.length} row(s) to rescale.`))) return;

  await sql.begin(async (tx) => {
    for (const { id, patch } of patches) {
      await tx`
        update benchmark_results
        set metrics = metrics || ${jsonbParam(sql, patch)}
        where id = ${id}
      `;
    }
  });
  console.log(`  Rescaled ${patches.length} row(s).`);
  console.log(
    '  Invalidate the API cache after the backfill: bun run admin:cache:invalidate <origin> --immediate',
  );
}

runBackfillMain('backfill-agentic-disagg-throughput', sql, main);
