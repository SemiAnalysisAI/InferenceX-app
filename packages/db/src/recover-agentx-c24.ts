import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { mapBenchmarkRow } from './etl/benchmark-mapper';
import { configCacheKey, loadConfigIds } from './etl/config-cache';
import { createAdminSql, refreshLatestBenchmarks, type Sql } from './etl/db-utils';
import { createSkipTracker } from './etl/skip-tracker';
import { prepareTraceReplay, persistPreparedTraceReplay } from './etl/trace-replay-ingest';
import { confirmProceed, runBackfillMain } from './lib/backfill-runner';

// InferenceX run 38451594384, attempt 3: benchmark 11874035970 / trace 11874120780.
const profileHash = '07570e229b02f4fa6dac9eb40f06ea494dadd7710e3ae6ba9ef309f3105897b0';
const failedProfileHash = '2a1102469ce231e13c14b604fdb8eab929e46ab22ff1596d049c9ff9fa200699';
const md5 = (value: Buffer | null) => value && createHash('md5').update(value).digest('hex');

export async function recoverC24(sql: Sql, benchmarkFile: string, traceDir: string) {
  const profile = path.join(traceDir, 'profile_export.jsonl');
  const csv = path.join(traceDir, 'server_metrics_export.csv');
  const server = path.join(traceDir, 'server_metrics_export.json');
  for (const [file, expected] of [
    [benchmarkFile, 'd45872ec3b26dcefebc296d52f9b3b76bbd6de58d3fdb35eafe660729692a9d5'],
    [profile, profileHash],
    [csv, '85b417132bfcd1013c3f786ab76bf7baca2e66774c6b714212ad7d62728c7c32'],
    [server, 'e9a2c7f39f872c5cafd7cccb48c71bca91c4fbec975e65ad60b9d5ceb88d7a69'],
  ]) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest('hex') !== expected) throw new Error(`Unexpected c24 source: ${file}`);
  }
  const point = mapBenchmarkRow(
    JSON.parse(await readFile(benchmarkFile, 'utf8')),
    createSkipTracker(),
  );
  if (!point) throw new Error('Could not map the verified c24 measurement');
  const configs = await loadConfigIds(sql);
  const configId = configs.get(configCacheKey(point.config));
  if (configId === undefined) throw new Error('The c24 configuration is missing');
  const prepared = await prepareTraceReplay(profile, csv, server, {
    framework: 'vllm',
    disagg: false,
  });
  const metrics = { ...point.metrics };
  if (prepared.cacheHitRates) {
    metrics.server_gpu_cache_hit_rate = prepared.cacheHitRates.gpu;
    if (prepared.cacheHitRates.cpu !== null)
      metrics.server_cpu_cache_hit_rate = prepared.cacheHitRates.cpu;
  }
  if (!('median_full_response_itl' in metrics))
    Object.assign(metrics, prepared.fullResponseMetrics);

  return sql.begin(async (tx) => {
    const [current] = await tx<
      {
        id: number;
        metrics: Record<string, number>;
        trace_replay_id: number | null;
        profile: Buffer | null;
        trace_matches: boolean;
      }[]
    >`
      select br.id, br.metrics, br.trace_replay_id, t.profile_export_jsonl_gz as profile,
        (md5(t.profile_export_jsonl_gz) = ${md5(prepared.profileGz)}
          and md5(t.server_metrics_csv) = ${md5(prepared.serverMetricsCsv)}
          and md5(t.server_metrics_json_gz) = ${md5(prepared.serverMetricsJsonGz)}
          and t.aggregate_stats = ${prepared.aggregateStatsJson?.toString() ?? null}::jsonb
          and t.chart_series = ${prepared.chartSeriesJson?.toString() ?? null}::jsonb
          and t.request_timeline = ${prepared.requestTimelineJson?.toString() ?? null}::jsonb
        ) as trace_matches
      from benchmark_results br join workflow_runs w on w.id = br.workflow_run_id
      left join agentic_trace_replay t on t.id = br.trace_replay_id
      where br.id = 445010 and w.github_run_id = 38451594384 and w.run_attempt = 3
        and br.config_id = ${configId} and br.benchmark_type = ${point.benchmarkType}
        and br.conc = 24 and br.isl is null and br.osl is null
        and br.offload_mode = ${point.offloadMode}
        and br.recipe_fingerprint = ${point.recipeFingerprint}
      for update of br
    `;
    if (!current) throw new Error('The exact c24 target is missing');
    if ('kv_cache_pool_tokens' in current.metrics)
      metrics.kv_cache_pool_tokens = current.metrics.kv_cache_pool_tokens;
    if (current.trace_matches && isDeepStrictEqual(current.metrics, metrics)) return current.id;
    const storedHash =
      current.profile && createHash('sha256').update(gunzipSync(current.profile)).digest('hex');
    if (
      current.trace_replay_id !== null &&
      storedHash !== profileHash &&
      storedHash !== failedProfileHash
    )
      throw new Error('Existing c24 trace has an unknown source; inspect it before recovery');
    const { duration_seconds: duration, output_tput_tps: throughput } = current.metrics;
    if (
      !(
        (duration === 13.81349 && throughput === 0) ||
        (duration === 3620.60178 && throughput === 688.70374)
      )
    )
      throw new Error('Existing c24 measurements changed; inspect them before recovery');
    await tx`update benchmark_results set metrics = ${tx.json(metrics)}, trace_replay_id = null where id = ${current.id}`;
    await persistPreparedTraceReplay(tx, [current.id], prepared);
    return current.id;
  });
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      'benchmark-file': { type: 'string' },
      'trace-dir': { type: 'string' },
      yes: { type: 'boolean' },
    },
  });
  const benchmarkFile = values['benchmark-file'];
  const traceDir = values['trace-dir'];
  if (!benchmarkFile || !traceDir)
    throw new Error('Usage: recover-agentx-c24.ts --benchmark-file FILE --trace-dir DIR [--yes]');
  const sql = createAdminSql({ max: 1 });
  runBackfillMain('recover-agentx-c24', sql, async () => {
    if (!(await confirmProceed('Restore only benchmark 445010 from the successful c24 artifacts')))
      return;
    const id = await recoverC24(sql, benchmarkFile, traceDir);
    await refreshLatestBenchmarks(sql);
    console.log(`Recovered ${id}; verify the API and invalidate its cache before publication.`);
  });
}
