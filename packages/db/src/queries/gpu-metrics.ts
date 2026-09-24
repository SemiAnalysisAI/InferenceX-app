/**
 * Read side of the PowerX telemetry digest (migration 016).
 *
 * Two entry points: everything recorded during one GitHub Actions run (the
 * PowerX explorer keyed by run ID), and the series linked to one benchmark
 * point (the per-point detail tab). Samples are returned as flat rows with
 * ISO timestamps so the existing D3 charts consume them unchanged.
 */

import type { DbClient } from '../connection.js';

export interface GpuMetricSampleRow {
  timestamp: string;
  index: number;
  power: number;
  /**
   * Absent when the collector did not sample the metric (the multinode DCGM
   * power bundle scrapes power only), so readers can tell "not collected"
   * from a genuine zero reading.
   */
  temperature?: number;
  smClock?: number;
  memClock?: number;
  gpuUtil?: number;
  memUtil?: number;
  edgeTemp?: number;
  memTemp?: number;
  gfxVoltage?: number;
  socVoltage?: number;
  memVoltage?: number;
  fclk?: number;
  socClk?: number;
  mmActivity?: number;
}

export interface GpuMetricStatRow {
  gpuIndex: number;
  metric: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
}

export interface GpuMetricSeries {
  id: number;
  artifactName: string;
  configKey: string;
  fileName: string;
  vendor: string;
  sampleIntervalS: number | null;
  sampleCount: number;
  gpuCount: number;
  startedAt: string;
  endedAt: string;
  sidecars: Record<string, unknown>;
  benchmarkResultIds: number[];
  /** Existing benchmark provenance can recover windows from older ingests. */
  powerAudits?: Record<string, unknown>[];
  stats: GpuMetricStatRow[];
  data: GpuMetricSampleRow[];
}

export interface GpuMetricsRunPayload {
  workflowRun: {
    id: number;
    githubRunId: number;
    runAttempt: number;
    name: string;
    date: string;
    htmlUrl: string | null;
    headBranch: string | null;
    headSha: string | null;
    conclusion: string | null;
    status: string | null;
    createdAt: string | null;
  };
  series: GpuMetricSeries[];
}

interface RawSeriesRow {
  id: number | string;
  workflow_run_id: number | string;
  artifact_name: string;
  config_key: string;
  file_name: string;
  vendor: string;
  sample_interval_s: number | null;
  sample_count: number;
  gpu_count: number;
  started_at: string | Date;
  ended_at: string | Date;
  sidecars: Record<string, unknown> | string;
  benchmark_result_ids: (number | string)[] | null;
  power_audits: Record<string, unknown>[] | null;
  csv_sha256: string;
  ingested_at: string | Date;
}

/** The columns `upsertGpuMetricSeries` rewrites whenever it replaces a series. */
interface RawSeriesVersionRow {
  id: number | string;
  csv_sha256: string;
  sample_count: number;
  ingested_at: string | Date;
}

interface RawStatRow {
  series_id: number | string;
  gpu_index: number;
  metric: string;
  sample_count: number;
  min_value: number;
  max_value: number;
  mean_value: number;
  median_value: number;
  p95_value: number;
  p99_value: number;
  stddev_value: number;
}

interface RawSampleRow {
  series_id: number | string;
  gpu_index: number;
  sampled_at: string | Date;
  power_w: number | null;
  temperature_c: number | null;
  sm_clock_mhz: number | null;
  mem_clock_mhz: number | null;
  gpu_util_pct: number | null;
  mem_util_pct: number | null;
  edge_temp_c: number | null;
  mem_temp_c: number | null;
  gfx_voltage_mv: number | null;
  soc_voltage_mv: number | null;
  mem_voltage_mv: number | null;
  fclk_mhz: number | null;
  socclk_mhz: number | null;
  mm_activity_pct: number | null;
}

const isoString = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const optional = (value: number | null): number | undefined => (value === null ? undefined : value);

/**
 * Thrown by the point/run readers when a series was replaced while its parts
 * were being read; the caller restarts the whole read (links may have changed).
 */
export class TelemetrySnapshotChangedError extends Error {
  constructor(seriesIds: readonly number[]) {
    super(`gpu_metric_series ${seriesIds.join(', ')} changed while being read`);
    this.name = 'TelemetrySnapshotChangedError';
  }
}

const MAX_SNAPSHOT_ATTEMPTS = 3;

const seriesVersionKey = (row: RawSeriesVersionRow): string =>
  `${Number(row.id)}:${row.csv_sha256}:${Number(row.sample_count)}:${isoString(row.ingested_at)}`;

async function withConsistentSnapshot<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof TelemetrySnapshotChangedError) || attempt >= MAX_SNAPSHOT_ATTEMPTS) {
        throw error;
      }
    }
  }
}

function toSampleRow(raw: RawSampleRow): GpuMetricSampleRow {
  return {
    timestamp: isoString(raw.sampled_at),
    index: Number(raw.gpu_index),
    power: raw.power_w ?? 0,
    temperature: optional(raw.temperature_c),
    smClock: optional(raw.sm_clock_mhz),
    memClock: optional(raw.mem_clock_mhz),
    gpuUtil: optional(raw.gpu_util_pct),
    memUtil: optional(raw.mem_util_pct),
    edgeTemp: optional(raw.edge_temp_c),
    memTemp: optional(raw.mem_temp_c),
    gfxVoltage: optional(raw.gfx_voltage_mv),
    socVoltage: optional(raw.soc_voltage_mv),
    memVoltage: optional(raw.mem_voltage_mv),
    fclk: optional(raw.fclk_mhz),
    socClk: optional(raw.socclk_mhz),
    mmActivity: optional(raw.mm_activity_pct),
  };
}

function toStatRow(raw: RawStatRow): GpuMetricStatRow {
  return {
    gpuIndex: Number(raw.gpu_index),
    metric: raw.metric,
    count: Number(raw.sample_count),
    min: raw.min_value,
    max: raw.max_value,
    mean: raw.mean_value,
    median: raw.median_value,
    p95: raw.p95_value,
    p99: raw.p99_value,
    stddev: raw.stddev_value,
  };
}

function groupBySeries<Raw extends { series_id: number | string }, Row>(
  rows: readonly Raw[],
  toRow: (raw: Raw) => Row,
): Map<number, Row[]> {
  const groups = new Map<number, Row[]>();
  for (const raw of rows) {
    const key = Number(raw.series_id);
    const bucket = groups.get(key);
    if (bucket) bucket.push(toRow(raw));
    else groups.set(key, [toRow(raw)]);
  }
  return groups;
}

async function loadSeriesDetails(
  sql: DbClient,
  seriesRows: readonly RawSeriesRow[],
): Promise<GpuMetricSeries[]> {
  if (seriesRows.length === 0) return [];
  const ids = seriesRows.map((row) => Number(row.id));

  const statRows = (await sql`
    select series_id, gpu_index, metric, sample_count, min_value, max_value, mean_value,
      median_value, p95_value, p99_value, stddev_value
    from gpu_metric_gpu_stats
    where series_id = any(${ids}::bigint[])
    order by series_id, gpu_index, metric
  `) as unknown as RawStatRow[];

  const sampleRows = (await sql`
    select series_id, gpu_index, sampled_at, power_w, temperature_c, sm_clock_mhz,
      mem_clock_mhz, gpu_util_pct, mem_util_pct, edge_temp_c, mem_temp_c,
      gfx_voltage_mv, soc_voltage_mv, mem_voltage_mv, fclk_mhz, socclk_mhz, mm_activity_pct
    from gpu_metric_samples
    where series_id = any(${ids}::bigint[])
    order by series_id, sampled_at, gpu_index
  `) as unknown as RawSampleRow[];

  // The three statements above run as separate autocommit queries (the DbClient
  // has no transaction), so a re-ingest can commit between them. The writer
  // replaces samples, stats and the series row in one transaction and stamps
  // `ingested_at`, so a version key that is unchanged after the samples were
  // read proves stats and samples belong to the same series version.
  const versionRows = (await sql`
    select id, csv_sha256, sample_count, ingested_at
    from gpu_metric_series
    where id = any(${ids}::bigint[])
  `) as unknown as RawSeriesVersionRow[];
  const versionKeys = new Set(versionRows.map(seriesVersionKey));
  if (
    versionRows.length !== seriesRows.length ||
    !seriesRows.every((row) => versionKeys.has(seriesVersionKey(row)))
  ) {
    throw new TelemetrySnapshotChangedError(ids);
  }

  const statsBySeries = groupBySeries(statRows, toStatRow);
  const samplesBySeries = groupBySeries(sampleRows, toSampleRow);

  return seriesRows.map((row) => {
    const id = Number(row.id);
    return {
      id,
      artifactName: row.artifact_name,
      configKey: row.config_key,
      fileName: row.file_name,
      vendor: row.vendor,
      sampleIntervalS: row.sample_interval_s,
      sampleCount: Number(row.sample_count),
      gpuCount: Number(row.gpu_count),
      startedAt: isoString(row.started_at),
      endedAt: isoString(row.ended_at),
      sidecars:
        typeof row.sidecars === 'string'
          ? (JSON.parse(row.sidecars) as Record<string, unknown>)
          : row.sidecars,
      benchmarkResultIds: (row.benchmark_result_ids ?? []).map(Number),
      powerAudits: row.power_audits ?? [],
      stats: statsBySeries.get(id) ?? [],
      data: samplesBySeries.get(id) ?? [],
    };
  });
}

/**
 * Every telemetry series stored for one GitHub Actions run (latest attempt).
 * Returns null when the run is unknown or has no stored series, so callers can
 * fall back to the live GitHub artifacts for in-flight runs.
 */
export function getGpuMetricsForRun(
  sql: DbClient,
  githubRunId: number,
): Promise<GpuMetricsRunPayload | null> {
  return withConsistentSnapshot(() => readGpuMetricsForRun(sql, githubRunId));
}

async function readGpuMetricsForRun(
  sql: DbClient,
  githubRunId: number,
): Promise<GpuMetricsRunPayload | null> {
  const runRows = (await sql`
    select id, github_run_id, run_attempt, name, date, html_url, head_branch, head_sha,
      conclusion, status, created_at
    from workflow_runs
    where github_run_id = ${githubRunId}
    order by run_attempt desc
    limit 1
  `) as unknown as {
    id: number | string;
    github_run_id: number | string;
    run_attempt: number;
    name: string;
    date: string | Date;
    html_url: string | null;
    head_branch: string | null;
    head_sha: string | null;
    conclusion: string | null;
    status: string | null;
    created_at: string | Date | null;
  }[];
  const run = runRows[0];
  if (!run) return null;

  const seriesRows = (await sql`
    select s.id, s.workflow_run_id, s.artifact_name, s.config_key, s.file_name, s.vendor,
      s.sample_interval_s, s.sample_count, s.gpu_count, s.started_at, s.ended_at, s.sidecars,
      s.csv_sha256, s.ingested_at,
      (
        select array_agg(l.benchmark_result_id order by l.benchmark_result_id)
        from benchmark_result_gpu_metrics l where l.series_id = s.id
      ) as benchmark_result_ids,
      (
        select jsonb_agg(br.power_audit order by br.id)
        from benchmark_result_gpu_metrics l
        join benchmark_results br on br.id = l.benchmark_result_id
        where l.series_id = s.id and br.power_audit is not null
      ) as power_audits
    from gpu_metric_series s
    where s.workflow_run_id = ${Number(run.id)}
    order by s.artifact_name, s.file_name
  `) as unknown as RawSeriesRow[];
  if (seriesRows.length === 0) return null;

  return {
    workflowRun: {
      id: Number(run.id),
      githubRunId: Number(run.github_run_id),
      runAttempt: Number(run.run_attempt),
      name: run.name,
      date: isoString(run.date).slice(0, 10),
      htmlUrl: run.html_url,
      headBranch: run.head_branch,
      headSha: run.head_sha,
      conclusion: run.conclusion,
      status: run.status,
      createdAt: run.created_at ? isoString(run.created_at) : null,
    },
    series: await loadSeriesDetails(sql, seriesRows),
  };
}

export interface GpuMetricsPointPayload {
  benchmarkResultId: number;
  series: GpuMetricSeries[];
}

/** Series linked to one benchmark point, with samples. Null when none is linked. */
export function getGpuMetricsForPoint(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<GpuMetricsPointPayload | null> {
  return withConsistentSnapshot(() => readGpuMetricsForPoint(sql, benchmarkResultId));
}

async function readGpuMetricsForPoint(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<GpuMetricsPointPayload | null> {
  const seriesRows = (await sql`
    select s.id, s.workflow_run_id, s.artifact_name, s.config_key, s.file_name, s.vendor,
      s.sample_interval_s, s.sample_count, s.gpu_count, s.started_at, s.ended_at, s.sidecars,
      s.csv_sha256, s.ingested_at,
      (
        select array_agg(l.benchmark_result_id order by l.benchmark_result_id)
        from benchmark_result_gpu_metrics l where l.series_id = s.id
      ) as benchmark_result_ids,
      (
        select jsonb_agg(br.power_audit order by br.id)
        from benchmark_result_gpu_metrics l
        join benchmark_results br on br.id = l.benchmark_result_id
        where l.series_id = s.id and br.power_audit is not null
      ) as power_audits
    from benchmark_result_gpu_metrics link
    join gpu_metric_series s on s.id = link.series_id
    where link.benchmark_result_id = ${benchmarkResultId}
    order by s.artifact_name, s.file_name
  `) as unknown as RawSeriesRow[];
  if (seriesRows.length === 0) return null;
  return {
    benchmarkResultId,
    series: await loadSeriesDetails(sql, seriesRows),
  };
}
