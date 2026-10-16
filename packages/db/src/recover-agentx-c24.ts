import path from 'node:path';
import { parseArgs } from 'node:util';
import { configCacheKey, loadConfigIds } from './etl/config-cache';
import { createAdminSql, refreshLatestBenchmarks, type Sql } from './etl/db-utils';
import { prepareTraceReplay } from './etl/trace-replay-ingest';
import { confirmProceed, runBackfillMain } from './lib/backfill-runner';
import {
  readHistoricalC24Benchmark,
  reconcileHistoricalBenchmarkTrace,
  verifyHistoricalC24TraceSources,
} from './lib/historical-agentx-c24';

export async function recoverHistoricalC24(
  sql: Sql,
  sources: { benchmarkFile: string; traceDirectory: string },
): Promise<number> {
  const { config, ...measurement } = await readHistoricalC24Benchmark(sources.benchmarkFile);
  const trace = await verifyHistoricalC24TraceSources({
    profileJsonl: path.join(sources.traceDirectory, 'profile_export.jsonl'),
    serverMetricsCsv: path.join(sources.traceDirectory, 'server_metrics_export.csv'),
    serverMetricsJson: path.join(sources.traceDirectory, 'server_metrics_export.json'),
  });
  const configs = await loadConfigIds(sql);
  const configId = configs.get(configCacheKey(config));
  const runs = await sql<{ id: number }[]>`
    select id from workflow_runs where github_run_id=38451594384 and run_attempt=3
  `;
  const run = runs[0];
  if (configId === undefined || runs.length !== 1 || !run)
    throw new Error('Expected the existing historical c24 configuration and source run');
  return reconcileHistoricalBenchmarkTrace(
    sql,
    { ...measurement, configId },
    run.id,
    async (consume) =>
      consume(
        await prepareTraceReplay(
          trace.profileJsonl,
          trace.serverMetricsCsv,
          trace.serverMetricsJson,
          {
            framework: config.framework,
            disagg: config.disagg,
          },
        ),
      ),
  );
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      'benchmark-file': { type: 'string' },
      'trace-dir': { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
    },
  });
  const benchmarkFile = values['benchmark-file'];
  const traceDirectory = values['trace-dir'];
  if (!benchmarkFile || !traceDirectory)
    throw new Error(
      'Usage: recover-agentx-c24.ts --benchmark-file FILE --trace-dir DIRECTORY [--yes]',
    );
  const sql = createAdminSql({ max: 1 });
  runBackfillMain('recover-agentx-c24', sql, async () => {
    if (!(await confirmProceed('Repair run 38451594384 attempt 3 / c24 metrics and trace'))) return;
    const id = await recoverHistoricalC24(sql, { benchmarkFile, traceDirectory });
    await refreshLatestBenchmarks(sql);
    console.log(
      `Recovered benchmark ${id}; inspect its API and trace before invalidating the application cache.`,
    );
  });
}
