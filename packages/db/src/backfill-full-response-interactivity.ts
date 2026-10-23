import { readTraceProfileLines } from './lib/trace-profile-storage';

import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { fullResponseMetricsFromLines } from './etl/full-response-interactivity.js';
import {
  jsonbParam,
  parseLimitForceFlags,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
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
              and (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0)
            order by br.id
            ${flags.limit ? sql`limit ${flags.limit}` : sql``}
          `
        : await sql<{ id: number }[]>`
            select br.id
            from benchmark_results br
            join agentic_trace_replay atr on atr.id = br.trace_replay_id
            where br.benchmark_type = 'agentic_traces'
              and (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0)
              and not (br.metrics ? 'median_full_response_itl')
            order by br.id
            ${flags.limit ? sql`limit ${flags.limit}` : sql``}
          `;
      return candidates.map((candidate) => candidate.id);
    },
    async (id) => {
      const [row] = await sql<{ trace_replay_id: number }[]>`
        select atr.id as trace_replay_id
        from benchmark_results br
        join agentic_trace_replay atr on atr.id = br.trace_replay_id
        where br.id = ${id}
      `;
      if (!row) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }

      const patch = await fullResponseMetricsFromLines(
        readTraceProfileLines(sql, row.trace_replay_id),
      );
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
    (count) => `${count} candidate benchmark row(s).`,
  );

  if (processedCandidates && process.exitCode !== 1) await refreshLatestBenchmarks(sql);
}

runBackfillMain('backfill-full-response-interactivity', sql, main);
