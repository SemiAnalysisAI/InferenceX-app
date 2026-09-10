/**
 * Backfill canonical AgentX ITL/interactivity from retained AIPerf profiles.
 *
 * New aggregate artifacts provide `full_response_itl` during normal ingest.
 * Historical rows predate that field, but retain the request lifecycle
 * timestamps, TTFT, and output token count needed to reconstruct it.
 *
 * Usage:
 *   bun run --cwd packages/db db:backfill-full-response-interactivity
 *     [--limit N]   update at most N benchmark rows; skipped profiles do not count
 *     [--force]     recompute rows that already have the namespaced metric
 *     [--yes]       skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { fullResponseMetricsFromGzip } from './etl/full-response-interactivity.js';
import {
  jsonbParam,
  parseLimitForceFlags,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
  if (flags.limit !== null && (!Number.isSafeInteger(flags.limit) || flags.limit < 1)) {
    throw new Error('--limit requires a positive integer');
  }
  console.log('=== backfill-full-response-interactivity ===');
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  const processedCandidates = await runCandidateIdBackfill(
    async () => {
      const candidates = flags.force
        ? await sql<{ id: number }[]>`
            select br.id
            from benchmark_results br
            join agentic_trace_replay atr on atr.id = br.trace_replay_id
            where br.benchmark_type = 'agentic_traces'
              and atr.profile_export_jsonl_gz is not null
            order by br.id
          `
        : await sql<{ id: number }[]>`
            select br.id
            from benchmark_results br
            join agentic_trace_replay atr on atr.id = br.trace_replay_id
            where br.benchmark_type = 'agentic_traces'
              and atr.profile_export_jsonl_gz is not null
              and (not (br.metrics ? 'median_full_response_itl')
                or not (br.metrics ? 'measurement_start_unix_seconds')
                or not (br.metrics ? 'measurement_end_unix_seconds'))
            order by br.id
          `;
      return candidates.map((candidate) => candidate.id);
    },
    async (id) => {
      const [row] = await sql<
        { profile_export_jsonl_gz: Buffer | null; has_full_response: boolean }[]
      >`
        select atr.profile_export_jsonl_gz,
          br.metrics ? 'median_full_response_itl' as has_full_response
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
      const dates = Object.fromEntries(
        Object.entries(patch).filter(
          ([key]) =>
            key === 'measurement_start_unix_seconds' || key === 'measurement_end_unix_seconds',
        ),
      );
      if (!flags.force && row.has_full_response && Object.keys(dates).length === 0) {
        console.warn(`  id=${id}: profile has no measurement timestamps, skipping`);
        return 'skipped';
      }

      const changed = await sql`
        update benchmark_results
        set metrics = case when not ${flags.force} and metrics ? 'median_full_response_itl'
          then ${jsonbParam(sql, dates)} || metrics
          else metrics || ${jsonbParam(sql, patch)} end
        where id = ${id}
          and metrics is distinct from
            case when not ${flags.force} and metrics ? 'median_full_response_itl'
              then ${jsonbParam(sql, dates)} || metrics
              else metrics || ${jsonbParam(sql, patch)} end
        returning id
      `;
      if (changed.length === 0) {
        console.warn(`  id=${id}: no new metrics to store, skipping`);
        return 'skipped';
      }
      return 'ok';
    },
    (count) =>
      `${count} candidate benchmark row(s).${flags.limit === null ? '' : ` Scan until ${flags.limit} row(s) are updated; skipped profiles do not count.`}`,
    flags.limit ?? undefined,
  );

  if (processedCandidates && process.exitCode !== 1) await refreshLatestBenchmarks(sql);
}

runBackfillMain('backfill-full-response-interactivity', sql, main);
