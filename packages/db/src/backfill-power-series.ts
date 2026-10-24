/**
 * Precompute PowerX timeline series (`gpu_power_series`) for stored runs.
 *
 *   bun run db:backfill-power-series            # preview runs whose rows are missing or stale
 *   bun run db:backfill-power-series --yes      # write them
 *   bun run db:backfill-power-series --run-id <github run id> [--force] --yes
 *
 * Ingest writes these rows for new runs. Run this once after migration 019,
 * after bumping `POWER_SERIES_FORMAT_VERSION`, and after point overrides or
 * telemetry backfills; stale rows are never served, only slower until then.
 */
import { hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import { parseRunIdFlag } from './lib/backfill-runner';
import {
  materializePowerSeriesForRun,
  POWER_SERIES_FORMAT_VERSION,
} from './queries/gpu-power-series';

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
  const githubRunId = parseRunIdFlag() ?? null;
  const force = process.argv.includes('--force');
  // Latest attempt per GitHub run: the attempt the route serves.
  const runs = await sql<{ id: number; github_run_id: number }[]>`
    select distinct on (wr.github_run_id) wr.id, wr.github_run_id
    from workflow_runs wr
    where exists (select 1 from gpu_metric_series s where s.workflow_run_id = wr.id)
      and (${githubRunId}::bigint is null or wr.github_run_id = ${githubRunId})
    order by wr.github_run_id desc, wr.run_attempt desc
  `;
  console.log(
    `PowerX series format ${POWER_SERIES_FORMAT_VERSION}: ${runs.length} run(s) with stored telemetry.`,
  );
  if (!hasYesFlag()) {
    console.log('Dry run. Pass --yes to compute missing or stale series; samples are not changed.');
    return;
  }
  let failed = 0;
  for (const run of runs) {
    const started = Date.now();
    try {
      const result = await materializePowerSeriesForRun(sql, Number(run.id), { force });
      console.log(
        `${run.github_run_id}: ${result.written.length} written, ${result.unchanged.length} unchanged, ` +
          `${result.incomplete.length} incomplete${
            result.incomplete.length > 0 ? ` (${result.incomplete.join(', ')})` : ''
          } in ${((Date.now() - started) / 1000).toFixed(1)}s`,
      );
    } catch (error) {
      failed++;
      console.error(`${run.github_run_id}: precompute failed`, error);
    }
  }
  if (failed) throw new Error(`${failed} run(s) could not be precomputed`);
}

main()
  .catch((error) => {
    console.error('PowerX series backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
