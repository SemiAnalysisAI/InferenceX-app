import { readFile, writeFile } from 'node:fs/promises';
import { createAdminSql } from './etl/db-utils.js';
import { CHART_SERIES_VERSION } from './etl/compute-chart-series.js';
import { STATS_VERSION } from './etl/compute-aggregate-stats.js';
import { REQUEST_TIMELINE_VERSION } from './etl/compute-request-timeline.js';
import { parseLimitForceFlags, parseRunIdFlag, runBackfillMain } from './lib/backfill-runner.js';
import { verifyBackfillState, type BackfillState } from './lib/agentic-backfill-integrity.js';

const flags = parseLimitForceFlags();
const runId = parseRunIdFlag();
const snapshotIndex = process.argv.indexOf('--snapshot');
const verifyIndex = process.argv.indexOf('--verify');
const snapshotMode = process.argv.includes('--snapshot');
const verifyMode = process.argv.includes('--verify');
if (snapshotMode === verifyMode) throw new Error('Specify --snapshot FILE or --verify FILE');
const file = process.argv[(snapshotIndex === -1 ? verifyIndex : snapshotIndex) + 1];
if (!file || file.startsWith('--')) throw new Error('Missing manifest filename');
const sql = createAdminSql({ max: 1, onnotice: () => {} });

async function states(ids: string[]): Promise<BackfillState[]> {
  const rows: BackfillState[] = [];
  // Hash blobs inside Postgres: raw artifacts never leave the database during verification.
  for (const id of ids) {
    const result = await sql<BackfillState[]>`
      select br.id::text, a.id::text as trace_id,
        md5(row_to_json(br)::text) as benchmark_hash,
        md5(a.profile_export_jsonl_gz) as profile_hash,
        md5(a.server_metrics_json_gz) as server_hash,
        md5(a.request_timeline::text) as timeline_hash,
        (a.chart_series->>'version')::int as chart_version,
        (a.aggregate_stats->>'version')::int as stats_version,
        (a.request_timeline->>'version')::int as timeline_version,
        jsonb_build_object(
          'kvCacheUsage', coalesce(jsonb_array_length(a.chart_series->'kvCacheUsage'),0),
          'queueDepth', coalesce(jsonb_array_length(a.chart_series->'queueDepth'),0),
          'prefixCacheHitRate', coalesce(jsonb_array_length(a.chart_series->'prefixCacheHitRate'),0),
          'prefillTps', coalesce(jsonb_array_length(a.chart_series->'prefillTps'),0),
          'decodeTps', coalesce(jsonb_array_length(a.chart_series->'decodeTps'),0)
        ) as chart_counts,
        jsonb_build_object(
          'isl', coalesce(a.aggregate_stats->'isl' <> 'null'::jsonb,false),
          'osl', coalesce(a.aggregate_stats->'osl' <> 'null'::jsonb,false),
          'kvCacheUtil', coalesce(a.aggregate_stats->'kvCacheUtil' <> 'null'::jsonb,false),
          'prefixCacheHitRate', coalesce(a.aggregate_stats->'prefixCacheHitRate' <> 'null'::jsonb,false)
        ) as stats_present
      from benchmark_results br left join agentic_trace_replay a on a.id=br.trace_replay_id
      where br.id=${id}
    `;
    if (!result[0]) throw new Error(`point ${id} disappeared`);
    rows.push(result[0]);
    if (rows.length % 10 === 0)
      console.log(`Verified source fingerprints for ${rows.length}/${ids.length} points`);
  }
  return rows;
}

async function main(): Promise<void> {
  const database = new URL(process.env.DATABASE_WRITE_URL!).hostname;
  if (snapshotIndex !== -1) {
    const runFilter = runId ? sql`and w.github_run_id=${runId}` : sql``;
    const ids = await sql<{ id: string }[]>`
      select br.id::text from benchmark_results br
      join workflow_runs w on w.id=br.workflow_run_id
      where br.benchmark_type='agentic_traces'
        and mod(coalesce(br.trace_replay_id,br.id),${flags.shardCount})=${flags.shardIndex}
        ${runFilter}
      order by br.id
    `;
    if (ids.length === 0) throw new Error('No AgentX points matched the audit scope');
    const rows = await states(ids.map((row) => row.id));
    await writeFile(file!, JSON.stringify({ database, rows }));
    console.log(`Saved immutable-data fingerprints for ${rows.length} points`);
    return;
  }
  const manifest = JSON.parse(await readFile(file!, 'utf8')) as {
    database: string;
    rows: BackfillState[];
  };
  if (database !== manifest.database) throw new Error('Manifest belongs to a different database');
  const after = await states(manifest.rows.map((row) => row.id));
  const versions = {
    chart: CHART_SERIES_VERSION,
    stats: STATS_VERSION,
    timeline: REQUEST_TIMELINE_VERSION,
  };
  const failures: string[] = [];
  for (const [index, row] of after.entries()) {
    try {
      verifyBackfillState(manifest.rows[index]!, row, versions);
    } catch (error) {
      failures.push(String(error));
    }
  }
  console.log(
    JSON.stringify({
      points: after.length,
      versions,
      missingTrace: after.filter((r) => !r.trace_id).map((r) => r.id),
      noRawMetrics: after.filter((r) => r.trace_id && !r.server_hash).map((r) => r.id),
      failures,
    }),
  );
  if (failures.length > 0) throw new Error(`${failures.length} integrity or version checks failed`);
  console.log(
    'PASS: benchmark records, raw artifacts and current timelines unchanged; derived versions and metric coverage verified',
  );
}

runBackfillMain('verify-agentic-backfill', sql, main);
