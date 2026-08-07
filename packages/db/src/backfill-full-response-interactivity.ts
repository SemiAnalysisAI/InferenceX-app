/**
 * Backfill canonical AgentX ITL/interactivity from retained AIPerf profiles.
 *
 * New aggregate artifacts provide `full_response_itl` during normal ingest.
 * Historical rows predate that field, but retain the request lifecycle
 * timestamps, TTFT, and output token count needed to reconstruct it.
 *
 * Usage:
 *   bun run --cwd packages/db db:backfill-full-response-interactivity
 *     [--limit N]   only process the first N candidate benchmark rows
 *     [--force]     recompute rows that already have the namespaced metric
 *     [--yes]       skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { fullResponseMetricsFromGzip } from './etl/full-response-interactivity.js';
import {
  confirmProceed,
  jsonbParam,
  parseLimitForceFlags,
  runBackfillMain,
  runPerIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
  console.log('=== backfill-full-response-interactivity ===');
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  const candidates = flags.force
    ? await sql<{ id: number }[]>`
        select br.id
        from benchmark_results br
        join agentic_trace_replay atr on atr.id = br.trace_replay_id
        where br.benchmark_type = 'agentic_traces'
          and atr.profile_export_jsonl_gz is not null
        order by br.id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `
    : await sql<{ id: number }[]>`
        select br.id
        from benchmark_results br
        join agentic_trace_replay atr on atr.id = br.trace_replay_id
        where br.benchmark_type = 'agentic_traces'
          and atr.profile_export_jsonl_gz is not null
          and not (br.metrics ? 'median_full_response_itl')
        order by br.id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `;

  if (candidates.length === 0) {
    console.log('\n  Nothing to do — all rows up to date.');
    return;
  }
  if (!(await confirmProceed(`${candidates.length} candidate benchmark row(s).`))) return;

  await runPerIdBackfill(
    candidates.map((candidate) => candidate.id),
    async (id) => {
      const [row] = await sql<{ profile_export_jsonl_gz: Buffer | null }[]>`
        select atr.profile_export_jsonl_gz
        from benchmark_results br
        join agentic_trace_replay atr on atr.id = br.trace_replay_id
        where br.id = ${id}
      `;
      if (!row) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }

      const patch = fullResponseMetricsFromGzip(row.profile_export_jsonl_gz);
      if (Object.keys(patch).length === 0) {
        console.warn(`  id=${id}: profile has no usable request samples, skipping`);
        return 'skipped';
      }

      await sql`
        update benchmark_results
        set metrics = metrics || ${jsonbParam(sql, patch)}
        where id = ${id}
      `;
      return 'ok';
    },
  );

  if (process.exitCode !== 1) await refreshLatestBenchmarks(sql);
}

runBackfillMain('backfill-full-response-interactivity', sql, main);
