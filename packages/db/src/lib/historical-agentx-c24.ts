import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type postgres from 'postgres';
import { sha256Hex } from '../etl/benchmark-artifacts';
import { mapBenchmarkRow } from '../etl/benchmark-mapper';
import { configCacheKey } from '../etl/config-cache';
import { createSkipTracker } from '../etl/skip-tracker';
import type { BenchmarkPersistenceInput } from '../etl/benchmark-ingest';
import { updateAtomKvCachePoolTokens } from '../etl/atom-kv-capacity';
import { stagePreparedTraceReplay, type PreparedTraceReplay } from '../etl/trace-replay-ingest';
import type { TraceReplayArtifactPaths } from '../etl/trace-artifact-discovery';

type Sql = ReturnType<typeof postgres>;

export async function readHistoricalC24Benchmark(file: string) {
  const bytes = await readFile(file);
  if (sha256Hex(bytes) !== 'd45872ec3b26dcefebc296d52f9b3b76bbd6de58d3fdb35eafe660729692a9d5')
    throw new Error('Historical c24 benchmark source hash mismatch');
  const point = mapBenchmarkRow(JSON.parse(bytes.toString('utf8')), createSkipTracker());
  if (
    !point ||
    configCacheKey(point.config) !==
      'mi355x:vllm:kimik3:fp4:mtp:false:false:8:1:false:0:8:1:false:0:8:8' ||
    point.benchmarkType !== 'agentic_traces' ||
    point.conc !== 24 ||
    point.isl !== null ||
    point.osl !== null ||
    point.offloadMode !== 'on' ||
    point.recipeFingerprint !== '44a49a20b029e398ab8b1830347e6cb2fa428b8517abcc6b6de0fa449c9f91f2'
  )
    throw new Error('Historical c24 benchmark identity mismatch');
  return point;
}

export async function verifyHistoricalC24TraceSources(trace: TraceReplayArtifactPaths | undefined) {
  const { profileJsonl, serverMetricsCsv, serverMetricsJson } = trace ?? {};
  if (!profileJsonl || !serverMetricsCsv || !serverMetricsJson)
    throw new Error(
      'Historical c24 repair requires its winning profile JSONL, server CSV and server JSON',
    );
  const sources = [
    [
      profileJsonl,
      'profile_export.jsonl',
      '07570e229b02f4fa6dac9eb40f06ea494dadd7710e3ae6ba9ef309f3105897b0',
    ],
    [
      serverMetricsCsv,
      'server_metrics_export.csv',
      '85b417132bfcd1013c3f786ab76bf7baca2e66774c6b714212ad7d62728c7c32',
    ],
    [
      serverMetricsJson,
      'server_metrics_export.json',
      'e9a2c7f39f872c5cafd7cccb48c71bca91c4fbec975e65ad60b9d5ceb88d7a69',
    ],
  ] as const;
  for (const [source, name, expected] of sources) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(source)) hash.update(chunk);
    if (hash.digest('hex') !== expected)
      throw new Error(`Historical c24 repair source hash mismatch: ${name}`);
  }
  return { profileJsonl, serverMetricsCsv, serverMetricsJson };
}

export async function reconcileHistoricalBenchmarkTrace(
  sql: Sql,
  winner: BenchmarkPersistenceInput,
  workflowRunId: number,
  prepareAndConsume: (
    consume: (prepared: PreparedTraceReplay) => Promise<number>,
  ) => Promise<number>,
): Promise<number> {
  const [expected] = await sql<{ id: number; snapshot: Record<string, unknown> }[]>`
    select id, to_jsonb(br) as snapshot from benchmark_results br
    where workflow_run_id = ${workflowRunId} and config_id = ${winner.configId}
      and benchmark_type = ${winner.benchmarkType}
      and isl is not distinct from ${winner.isl}::int
      and osl is not distinct from ${winner.osl}::int
      and conc = ${winner.conc} and offload_mode = ${winner.offloadMode}
      and recipe_fingerprint is not distinct from ${winner.recipeFingerprint}::text
  `;
  if (!expected) throw new Error('Historical c24 target does not exist');
  return prepareAndConsume(async (prepared) => {
    if (!prepared.profileGz) throw new Error('Historical c24 repair requires the selected profile');
    await sql.begin(async (tx) => {
      const [current] = await tx<{ trace_replay_id: number | null; unchanged: boolean }[]>`
        select trace_replay_id, to_jsonb(br) = ${JSON.stringify(expected.snapshot)}::jsonb as unchanged
        from benchmark_results br where id = ${expected.id} for update
      `;
      if (!current?.unchanged)
        throw new Error('Historical c24 benchmark changed during trace preparation');
      await stagePreparedTraceReplay(tx, prepared, () => {});
      let traceId = current.trace_replay_id;
      if (traceId !== null) {
        const [trace] = await tx<{ profile_export_jsonl_gz: Buffer | null; matches: boolean }[]>`
          select t.profile_export_jsonl_gz,
            row(t.profile_export_jsonl_gz, t.profile_export_uncompressed_size, t.server_metrics_csv, t.server_metrics_csv_size, t.server_metrics_json_gz, t.server_metrics_json_uncompressed_size, t.aggregate_stats, t.chart_series, t.request_timeline) is not distinct from
            row(p.profile_export_jsonl_gz, p.profile_export_uncompressed_size, p.server_metrics_csv, p.server_metrics_csv_size, p.server_metrics_json_gz, p.server_metrics_json_uncompressed_size, p.aggregate_stats, p.chart_series, p.request_timeline) as matches
          from agentic_trace_replay t cross join pg_temp.trace_replay_payload p
          where t.id = ${traceId} for share of t
        `;
        if (!trace?.matches) {
          const profile = trace?.profile_export_jsonl_gz;
          if (
            !profile ||
            createHash('sha256').update(gunzipSync(profile)).digest('hex') !==
              '2a1102469ce231e13c14b604fdb8eab929e46ab22ff1596d049c9ff9fa200699'
          )
            throw new Error('Refusing historical c24 repair with an unknown existing trace');
          traceId = null;
        }
      }
      if (traceId === null) {
        const [stored] = await tx<{ id: number }[]>`
          insert into agentic_trace_replay (
            profile_export_jsonl_gz, profile_export_uncompressed_size, server_metrics_csv,
            server_metrics_csv_size, server_metrics_json_gz, server_metrics_json_uncompressed_size,
            aggregate_stats, chart_series, request_timeline
          ) select * from pg_temp.trace_replay_payload returning id
        `;
        if (!stored) throw new Error('Historical c24 trace was not stored');
        traceId = stored.id;
      }
      const metrics = { ...winner.metrics };
      const previous = expected.snapshot.metrics;
      if (
        !('kv_cache_pool_tokens' in metrics) &&
        previous &&
        typeof previous === 'object' &&
        'kv_cache_pool_tokens' in previous &&
        typeof previous.kv_cache_pool_tokens === 'number'
      )
        metrics.kv_cache_pool_tokens = previous.kv_cache_pool_tokens;
      if (prepared.cacheHitRates) {
        metrics.server_gpu_cache_hit_rate = prepared.cacheHitRates.gpu;
        if (prepared.cacheHitRates.cpu !== null)
          metrics.server_cpu_cache_hit_rate = prepared.cacheHitRates.cpu;
      }
      // Aggregate full-response measurements remain authoritative when already present.
      if (!('median_full_response_itl' in metrics))
        Object.assign(metrics, prepared.fullResponseMetrics);
      await tx`
        update benchmark_results set metrics = ${tx.json(metrics)}, image = ${winner.image},
          workers = coalesce(${winner.workers ? JSON.stringify(winner.workers) : null}::jsonb, workers),
          power_invalid_reasons = coalesce(${winner.powerInvalidReasons ? tx.json(winner.powerInvalidReasons) : null}, power_invalid_reasons),
          power_audit = coalesce(${winner.powerAudit ? JSON.stringify(winner.powerAudit) : null}::jsonb, power_audit),
          trace_replay_id = ${traceId}
        where id = ${expected.id}
      `;
      await updateAtomKvCachePoolTokens(tx, [expected.id], prepared.atomKvCacheBlocks ?? null);
    });
    return expected.id;
  });
}
