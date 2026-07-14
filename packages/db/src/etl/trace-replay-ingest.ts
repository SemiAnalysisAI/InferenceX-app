/**
 * Insert per-point aiperf trace files (`profile_export.jsonl` +
 * `server_metrics_export.csv`) into `agentic_trace_replay` and link the new row
 * to each provided benchmark_results row via `trace_replay_id`.
 *
 * Mirrors the {@link insertServerLog} idempotency contract: rows that already
 * have a non-null `trace_replay_id` are left alone so a re-ingest doesn't
 * duplicate the sibling blob.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createGzip, gzipSync } from 'node:zlib';

import type postgres from 'postgres';

import { computeAggregateStats } from './compute-aggregate-stats.js';
import { computeChartSeries } from './compute-chart-series.js';
import { computeRequestTimeline } from './compute-request-timeline.js';
import type { ServerMetricsContext } from './server-metrics-adapters';

type Sql = ReturnType<typeof postgres>;

export type TraceReplayInput = Buffer | string | null;

export interface PreparedTraceReplayInput {
  data: Buffer | null;
  sourceSize: number | null;
}

/**
 * Keep each postgres.js Bind message comfortably below the large payload that
 * can stall through Neon's proxy. The final row is assembled server-side in a
 * transaction, so callers still get all-or-nothing trace persistence.
 */
export const TRACE_REPLAY_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

type TraceReplayUploadField =
  | 'profile_export_jsonl_gz'
  | 'server_metrics_csv'
  | 'server_metrics_json_gz'
  | 'aggregate_stats'
  | 'chart_series'
  | 'request_timeline';

export interface TraceReplayIngestOptions {
  metricsContext?: ServerMetricsContext;
  progressLabel?: string;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'none';
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(1)} GiB`;
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

function jsonBuffer(value: unknown | null): Buffer | null {
  if (value === null) return null;
  return Buffer.from(JSON.stringify(structuredClone(value)), 'utf8');
}

/**
 * Gzip a trace input without materializing file-backed GiB-scale exports in
 * Node's heap. Buffer inputs remain supported for callers and unit tests.
 */
export async function gzipTraceReplayInput(
  input: TraceReplayInput,
): Promise<PreparedTraceReplayInput> {
  if (input === null) return { data: null, sourceSize: null };
  if (Buffer.isBuffer(input)) {
    return { data: gzipSync(input), sourceSize: input.length };
  }

  const { size } = await stat(input);
  const chunks: Buffer[] = [];
  const stream = createReadStream(input, { highWaterMark: 1024 * 1024 }).pipe(
    createGzip({ chunkSize: 1024 * 1024 }),
  );
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return { data: Buffer.concat(chunks), sourceSize: size };
}

async function readTraceReplayInput(input: TraceReplayInput): Promise<PreparedTraceReplayInput> {
  if (input === null) return { data: null, sourceSize: null };
  if (Buffer.isBuffer(input)) return { data: input, sourceSize: input.length };
  const data = await readFile(input);
  return { data, sourceSize: data.length };
}

/**
 * Upload one trace-replay value as bounded binary parameters. The caller must
 * create `pg_temp.trace_replay_upload_parts` in the same transaction first.
 */
export async function uploadTraceReplayPayloadChunks(
  sql: postgres.TransactionSql,
  field: TraceReplayUploadField,
  payload: Buffer | null,
): Promise<number> {
  if (!payload) return 0;

  let part = 0;
  for (let offset = 0; offset < payload.length; offset += TRACE_REPLAY_UPLOAD_CHUNK_BYTES) {
    const chunk = payload.subarray(offset, offset + TRACE_REPLAY_UPLOAD_CHUNK_BYTES);
    await sql`
      insert into pg_temp.trace_replay_upload_parts (field, part, data)
      values (${field}, ${part}, ${chunk})
    `;
    part += 1;
  }
  return part;
}

/**
 * Persist the per-point trace files and link them to `benchmarkResultIds`.
 *
 * @param sql                 Active `postgres` connection.
 * @param benchmarkResultIds  DB ids of the benchmark_results rows produced by
 *                            the same `bmk_agentic_<suffix>` artifact whose
 *                            sibling `agentic_<suffix>` directory holds these
 *                            trace files.
 * @param profileExportJsonl  Raw bytes or a file path for `profile_export.jsonl`.
 *                            Gzipped before storage; file paths stream from disk.
 * @param serverMetricsCsv    Raw bytes or a file path for `server_metrics_export.csv`.
 *                            Stored as-is.
 * @param serverMetricsJson   Raw bytes or a file path for `server_metrics_export.json` —
 *                            per-scrape time-series of every Prometheus metric.
 *                            Optional, streamed and gzipped before storage (~42x ratio).
 * @param options             Canonical framework/disagg context plus optional
 *                            progress label for CI logs.
 */
export async function insertTraceReplay(
  sql: Sql,
  benchmarkResultIds: number[],
  profileExportJsonl: TraceReplayInput,
  serverMetricsCsv: TraceReplayInput,
  serverMetricsJson: TraceReplayInput = null,
  options: TraceReplayIngestOptions = {},
): Promise<void> {
  const { metricsContext = {}, progressLabel } = options;
  const log = (message: string): void => {
    if (progressLabel) console.log(`    trace_replay ${progressLabel}: ${message}`);
  };

  if (benchmarkResultIds.length === 0) return;
  if (!profileExportJsonl && !serverMetricsCsv && !serverMetricsJson) return;

  // Only link rows that don't already point at a trace_replay row — keeps
  // re-ingest from inserting duplicate sibling blobs.
  const linkStart = Date.now();
  log(`checking ${benchmarkResultIds.length} benchmark row(s) for existing links`);
  const unlinked = await sql<{ id: number }[]>`
    select id from benchmark_results
    where id = any(${sql.array(benchmarkResultIds)}::bigint[])
      and trace_replay_id is null
  `;
  log(`found ${unlinked.length} unlinked row(s) (${elapsed(linkStart)})`);
  if (unlinked.length === 0) {
    log('skipping blob insert; all benchmark rows already linked');
    return;
  }

  const gzipStart = Date.now();
  log('reading and compressing trace inputs');
  const [profile, csv, metricsJson] = await Promise.all([
    gzipTraceReplayInput(profileExportJsonl),
    readTraceReplayInput(serverMetricsCsv),
    gzipTraceReplayInput(serverMetricsJson),
  ]);
  const profileGz = profile.data;
  const profileSize = profile.sourceSize;
  const serverMetricsCsvData = csv.data;
  const csvSize = csv.sourceSize;
  const metricsJsonGz = metricsJson.data;
  const metricsJsonSize = metricsJson.sourceSize;
  log(
    `compressed profile=${formatBytes(profileSize)} -> ${formatBytes(profileGz?.length)}, ` +
      `server_csv=${formatBytes(csvSize)}, ` +
      `server_json=${formatBytes(metricsJsonSize)} -> ${formatBytes(metricsJsonGz?.length)} ` +
      `(${elapsed(gzipStart)})`,
  );

  // Pre-compute aggregate stats + chart-ready time-series + per-request
  // timeline so the detail page doesn't have to re-parse these blobs on
  // every request. Each helper tolerates a null blob and falls back to
  // a streaming parser for oversized server_metrics blobs.
  const computeStart = Date.now();
  log('computing aggregate stats, chart series, and request timeline');
  const [aggregateStats, chartSeries, requestTimeline] = await Promise.all([
    computeAggregateStats({ profileBlob: profileGz, serverBlob: metricsJsonGz }),
    computeChartSeries(metricsJsonGz, metricsContext),
    Promise.resolve(computeRequestTimeline(profileGz)),
  ]);
  log(
    `computed derived JSON: chart_windows=${chartSeries?.timeslicesCount ?? 0}, ` +
      `timeline_requests=${requestTimeline?.requests.length ?? 0} (${elapsed(computeStart)})`,
  );

  const aggregateStatsJson = jsonBuffer(aggregateStats);
  const chartSeriesJson = jsonBuffer(chartSeries);
  const requestTimelineJson = jsonBuffer(requestTimeline);

  const insertStart = Date.now();
  log(`uploading trace_replay payloads in ${formatBytes(TRACE_REPLAY_UPLOAD_CHUNK_BYTES)} chunks`);
  await sql.begin(async (tx) => {
    await tx`
      create temporary table trace_replay_upload_parts (
        field text not null,
        part integer not null,
        data bytea not null,
        primary key (field, part)
      ) on commit drop
    `;

    const payloads: [TraceReplayUploadField, Buffer | null][] = [
      ['profile_export_jsonl_gz', profileGz],
      ['server_metrics_csv', serverMetricsCsvData],
      ['server_metrics_json_gz', metricsJsonGz],
      ['aggregate_stats', aggregateStatsJson],
      ['chart_series', chartSeriesJson],
      ['request_timeline', requestTimelineJson],
    ];
    for (const [field, payload] of payloads) {
      const uploadStart = Date.now();
      const parts = await uploadTraceReplayPayloadChunks(tx, field, payload);
      log(
        `uploaded ${field}=${formatBytes(payload?.length)} in ${parts} part(s) ` +
          `(${elapsed(uploadStart)})`,
      );
    }

    log('assembling trace_replay blob row');
    const [{ id: traceReplayId }] = await tx<{ id: number }[]>`
      insert into agentic_trace_replay (
        profile_export_jsonl_gz,
        profile_export_uncompressed_size,
        server_metrics_csv,
        server_metrics_csv_size,
        server_metrics_json_gz,
        server_metrics_json_uncompressed_size,
        aggregate_stats,
        chart_series,
        request_timeline
      )
      values (
        (
          select string_agg(data, ''::bytea order by part)
          from pg_temp.trace_replay_upload_parts
          where field = 'profile_export_jsonl_gz'
        ),
        ${profileSize},
        (
          select string_agg(data, ''::bytea order by part)
          from pg_temp.trace_replay_upload_parts
          where field = 'server_metrics_csv'
        ),
        ${csvSize},
        (
          select string_agg(data, ''::bytea order by part)
          from pg_temp.trace_replay_upload_parts
          where field = 'server_metrics_json_gz'
        ),
        ${metricsJsonSize},
        (
          select convert_from(string_agg(data, ''::bytea order by part), 'UTF8')::jsonb
          from pg_temp.trace_replay_upload_parts
          where field = 'aggregate_stats'
        ),
        (
          select convert_from(string_agg(data, ''::bytea order by part), 'UTF8')::jsonb
          from pg_temp.trace_replay_upload_parts
          where field = 'chart_series'
        ),
        (
          select convert_from(string_agg(data, ''::bytea order by part), 'UTF8')::jsonb
          from pg_temp.trace_replay_upload_parts
          where field = 'request_timeline'
        )
      )
      returning id
    `;
    log(`assembled trace_replay_id=${traceReplayId}`);

    const updateStart = Date.now();
    log(`linking trace_replay_id=${traceReplayId} to ${unlinked.length} benchmark row(s)`);
    await tx`
      update benchmark_results
      set trace_replay_id = ${traceReplayId}
      where id = any(${tx.array(unlinked.map((r) => r.id))}::bigint[])
    `;
    log(`linked benchmark rows (${elapsed(updateStart)})`);

    // Derive lifetime GPU + CPU cache hit rates from chart_series. SGLang
    // runs don't populate these in the harness JSON; vLLM runs do but only
    // for GPU. We always recompute to keep the derivation consistent with
    // what the detail-page charts plot — overwriting any pre-existing value.
    //
    // Source label naming differs by framework / cache topology:
    //   SGLang hicache: 'cache hit (HBM)' + 'cache hit (CPU offload)'
    //   SGLang older:   'cache hit'      (no tier breakdown)
    //   vLLM LMCache:   'local_cache_hit' + 'external_kv_transfer'  (+ 'local_compute' for miss)
    //   vLLM single:    falls back to prefixCacheHitsTps total (= local cache only)
    if (chartSeries && chartSeries.prefillTps.length > 0) {
      const sumPrompts = chartSeries.prefillTps.reduce((s, p) => s + p.value, 0);
      if (sumPrompts > 0) {
        const sumOf = (name: string): number =>
          (chartSeries.promptTokensBySource[name] ?? []).reduce((s, p) => s + p.value, 0);
        // CPU-offload hits: SGLang hicache + vLLM LMCache external transfer.
        const cpuHits = sumOf('cache hit (CPU offload)') + sumOf('external_kv_transfer');
        // GPU/HBM hits from source breakdown, summed across known aliases.
        const hbmFromBreakdown =
          sumOf('cache hit (HBM)') + sumOf('cache hit') + sumOf('local_cache_hit');
        // If the source breakdown has any GPU entry, use it. Otherwise fall back
        // to total prefixCacheHitsTps sum (single-source vLLM path with no
        // by_source metric — equals the lone cache counter's lifetime).
        const gpuHits =
          hbmFromBreakdown > 0
            ? hbmFromBreakdown
            : chartSeries.prefixCacheHitsTps.reduce((s, p) => s + p.value, 0);
        const gpuRate = gpuHits / sumPrompts;
        const cpuRate = cpuHits > 0 ? cpuHits / sumPrompts : null;
        await tx`
          update benchmark_results
          set metrics = jsonb_set(
            case when ${cpuRate}::numeric is not null
              then jsonb_set(metrics, '{server_cpu_cache_hit_rate}', to_jsonb(${cpuRate}::numeric))
              else metrics
            end,
            '{server_gpu_cache_hit_rate}',
            to_jsonb(${gpuRate}::numeric)
          )
          where id = any(${tx.array(unlinked.map((r) => r.id))}::bigint[])
        `;
        log('updated cache-hit metrics from chart series');
      }
    }
  });
  log(`inserted trace_replay payload (${elapsed(insertStart)})`);
}
