/**
 * Read side of the stored PowerX telemetry (migration 016).
 *
 * Two entry points: everything recorded during one GitHub Actions run (keyed by
 * run ID), and the series linked to one benchmark point. Samples are returned
 * as flat rows with ISO timestamps, the shape the live artifact parser produces.
 * Per-GPU statistics are computed from the stored samples on every read.
 */

import {
  computeStoredGpuMetricStats,
  statMetricColumn,
  type StoredGpuMetricSample,
} from '../lib/gpu-metric-stats';

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
  fileName: string;
  vendor: string;
  sampleIntervalS: number | null;
  sampleCount: number;
  gpuCount: number;
  startedAt: string;
  endedAt: string;
  sidecars: Record<string, unknown>;
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
  /** Every artifact label when only one view artifact's samples were requested. */
  artifactNames?: string[];
}

export interface GpuMetricsRunSelection {
  /** Undefined reads every artifact; null selects the first artifact name. */
  artifact?: string | null;
}

// One sample row serializes to roughly 0.5 KB over the Neon HTTP driver (17 numeric
// columns plus keys and an ISO timestamp), so 50k rows stay near 25 MB, well below the
// 64 MiB response cap, while a 1.25M-sample run needs ~25 sequential pages, not 125.
export const SAMPLE_PAGE_SIZE = 50_000;

interface RawSeriesRow {
  id: number | string;
  artifact_name: string;
  file_name: string;
  vendor: string;
  sample_interval_s: number | null;
  sample_count: number;
  gpu_count: number;
  started_at: string | Date;
  ended_at: string | Date;
  sidecars: Record<string, unknown>;
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

interface RawSampleRow extends StoredGpuMetricSample {
  series_id: number | string;
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

/** Series rows of one run (optionally only `seriesIds`) or linked to one benchmark point. */
async function readSeriesRows(
  sql: DbClient,
  scope: { workflowRunId: number; seriesIds: number[] | null } | { benchmarkResultId: number },
): Promise<RawSeriesRow[]> {
  const runId = 'workflowRunId' in scope ? scope.workflowRunId : null;
  const seriesIds = 'workflowRunId' in scope ? scope.seriesIds : null;
  const pointId = 'benchmarkResultId' in scope ? scope.benchmarkResultId : null;
  // Under the null guard, `in (select ...)` would scan every series; an array
  // keeps the point lookup on the link and series primary keys.
  return (await sql`
    select s.id, s.artifact_name, s.file_name, s.vendor, s.sample_interval_s, s.sample_count,
      s.gpu_count, s.started_at, s.ended_at, s.sidecars, s.csv_sha256, s.ingested_at,
      (
        select jsonb_agg(br.power_audit order by br.id)
        from benchmark_result_gpu_metrics l
        join benchmark_results br on br.id = l.benchmark_result_id
        where l.series_id = s.id and br.power_audit is not null
      ) as power_audits
    from gpu_metric_series s
    where (${runId}::bigint is null or s.workflow_run_id = ${runId})
      and (${seriesIds}::bigint[] is null or s.id = any(${seriesIds}::bigint[]))
      and (${pointId}::bigint is null or s.id = any(array(
        select link.series_id from benchmark_result_gpu_metrics link
        where link.benchmark_result_id = ${pointId})))
    order by s.artifact_name, s.file_name
  `) as unknown as RawSeriesRow[];
}

async function loadSeriesDetails(
  sql: DbClient,
  seriesRows: readonly RawSeriesRow[],
): Promise<GpuMetricSeries[]> {
  if (seriesRows.length === 0) return [];
  const ids = seriesRows.map((row) => Number(row.id));

  const sampleRows: RawSampleRow[] = [];
  let cursor: RawSampleRow | undefined;
  for (;;) {
    const page = (await sql`
      select series_id, gpu_index,
        to_char(sampled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sampled_at,
        power_w, temperature_c, sm_clock_mhz, mem_clock_mhz, gpu_util_pct, mem_util_pct,
        edge_temp_c, mem_temp_c, gfx_voltage_mv, soc_voltage_mv, mem_voltage_mv,
        fclk_mhz, socclk_mhz, mm_activity_pct
      from gpu_metric_samples
      where series_id = any(${ids}::bigint[])
        and (${cursor?.series_id ?? null}::bigint is null or
          (series_id, gpu_index, sampled_at) >
          (${cursor?.series_id ?? null}::bigint, ${cursor?.gpu_index ?? null}::smallint,
            ${cursor?.sampled_at ?? null}::timestamptz))
      order by series_id, gpu_index, gpu_metric_samples.sampled_at
      limit ${SAMPLE_PAGE_SIZE}
    `) as unknown as RawSampleRow[];
    sampleRows.push(...page);
    if (page.length < SAMPLE_PAGE_SIZE) break;
    // Keep PostgreSQL's microseconds: a JS Date cursor would repeat or omit boundary rows.
    cursor = page.at(-1)!;
  }
  // The primary-key pages group by GPU; retain the public time-then-GPU ordering.
  sampleRows.sort(
    (a, b) =>
      Number(a.series_id) - Number(b.series_id) ||
      String(a.sampled_at).localeCompare(String(b.sampled_at)) ||
      Number(a.gpu_index) - Number(b.gpu_index),
  );

  // The series and sample pages use separate autocommit queries (the DbClient has
  // no transaction), so a re-ingest can commit between them. The writer replaces
  // samples and the series row in one transaction and stamps `ingested_at`. An
  // unchanged key after the sample read proves both belong to the same series version.
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

  const samplesBySeries = new Map<number, RawSampleRow[]>();
  for (const sample of sampleRows) {
    const id = Number(sample.series_id);
    const bucket = samplesBySeries.get(id);
    if (bucket) bucket.push(sample);
    else samplesBySeries.set(id, [sample]);
  }

  return seriesRows.map((row) => {
    const id = Number(row.id);
    const samples = samplesBySeries.get(id) ?? [];
    return {
      id,
      artifactName: row.artifact_name,
      fileName: row.file_name,
      vendor: row.vendor,
      sampleIntervalS: row.sample_interval_s,
      sampleCount: Number(row.sample_count),
      gpuCount: Number(row.gpu_count),
      startedAt: isoString(row.started_at),
      endedAt: isoString(row.ended_at),
      sidecars: row.sidecars,
      powerAudits: row.power_audits ?? [],
      // Never present a partial population as full-record statistics.
      stats:
        samples.length === Number(row.sample_count)
          ? computeStoredGpuMetricStats(samples).map((stat) => ({
              ...stat,
              metric: statMetricColumn(stat.metric),
            }))
          : [],
      data: samples.map(toSampleRow),
    };
  });
}

/**
 * Stored telemetry for one GitHub Actions run (latest attempt), optionally scoped
 * before reading samples. View selection also returns the full artifact-name inventory.
 * Returns null when the run is unknown or has no stored series, so callers can
 * fall back to the live GitHub artifacts for in-flight runs.
 */
export function getGpuMetricsForRun(
  sql: DbClient,
  githubRunId: number,
  selection: GpuMetricsRunSelection = {},
): Promise<GpuMetricsRunPayload | null> {
  return withConsistentSnapshot(() => readGpuMetricsForRun(sql, githubRunId, selection));
}

async function readGpuMetricsForRun(
  sql: DbClient,
  githubRunId: number,
  selection: GpuMetricsRunSelection,
): Promise<GpuMetricsRunPayload | null> {
  const runRows = (await sql`
    select id, github_run_id, run_attempt, name, date, html_url, head_branch, head_sha,
      conclusion, status, created_at,
      exists (select 1 from gpu_metric_series s where s.workflow_run_id = workflow_runs.id)
        as has_series
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
    has_series: boolean;
  }[];
  const run = runRows[0];
  if (!run?.has_series) return null;

  let artifactNames: string[] | undefined;
  let selectedIds: number[] | null = null;
  if (selection.artifact !== undefined) {
    const inventory = (await sql`
      select id,
        case when count(*) over (partition by artifact_name) > 1
          then artifact_name || '/' || file_name else artifact_name end as name
      from gpu_metric_series
      where workflow_run_id = ${Number(run.id)}
      order by artifact_name, file_name
    `) as { id: number | string; name: string }[];
    if (inventory.length === 0) return null;
    artifactNames = inventory.map((entry) => entry.name);
    const selected = selection.artifact ?? artifactNames[0];
    selectedIds = inventory
      .filter((entry) => entry.name === selected)
      .map((entry) => Number(entry.id));
  }

  const seriesRows = await readSeriesRows(sql, {
    workflowRunId: Number(run.id),
    seriesIds: selectedIds,
  });

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
    ...(artifactNames === undefined ? {} : { artifactNames }),
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
  const seriesRows = await readSeriesRows(sql, { benchmarkResultId });
  if (seriesRows.length === 0) return null;
  return {
    benchmarkResultId,
    series: await loadSeriesDetails(sql, seriesRows),
  };
}
