/**
 * Persist one gpu_metrics artifact: series metadata, full-resolution samples,
 * the per-GPU statistics digest, and links to the benchmark points it covers.
 *
 * Idempotency: a series is identified by (workflow run, artifact name, CSV
 * path). Re-ingesting an identical CSV, sidecars and sample count only refreshes
 * the point links; a change replaces the stored samples and digest inside one
 * transaction so readers never observe a half-written series.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';

import type postgres from 'postgres';

import type { Sql } from './db-utils.js';

/** Either a pooled client or the transaction handle passed to `sql.begin` callbacks. */
type TxLike = Sql | postgres.TransactionSql;
import {
  computeGpuMetricStats,
  parseGpuMetricsCsv,
  summarizeGpuMetricSamples,
  type GpuMetricSample,
  type GpuMetricStats,
  type GpuMetricsVendor,
} from './gpu-metrics-csv.js';
import {
  contextUtcOffsetMinutes,
  gpuMetricsArtifactSuffix,
  listGpuMetricsCsvFiles,
  listMultinodePowerSampleFiles,
  readGpuMetricsSidecars,
  readMultinodePowerManifest,
  readPowerAuditValidations,
  type GpuMetricsArtifact,
  type GpuMetricsSidecars,
} from './gpu-metrics-artifacts.js';
import { multinodePowerVendor, parseMultinodePowerSamples } from './multinode-power-samples.js';
import { recoveredPowerAudit } from './power-audit-validations.js';

/** Samples are streamed to Postgres in unnest batches of this many rows. */
const SAMPLE_BATCH_SIZE = 5000;

function uniqueSamples(samples: readonly GpuMetricSample[]): GpuMetricSample[] {
  const seen = new Set<string>();
  return samples.filter((sample) => {
    const key = `${sample.gpuIndex}:${sample.timestampMs}`;
    if (seen.has(key)) return false;
    // Keep the first row, matching INSERT ... ON CONFLICT DO NOTHING.
    seen.add(key);
    return true;
  });
}

export interface PreparedGpuMetricSeries {
  fileName: string;
  vendor: GpuMetricsVendor;
  csvSha256: string;
  samples: GpuMetricSample[];
  stats: GpuMetricStats[];
  sampleIntervalS: number | null;
  gpuCount: number;
  startedAtMs: number;
  endedAtMs: number;
  sidecars: GpuMetricsSidecars;
}

export interface GpuMetricsIngestResult {
  seriesIds: number[];
  samplesInserted: number;
  seriesSkipped: number;
  metadataUpdatedBenchmarkResultIds: number[];
}

/**
 * One series per host from the multinode power bundle. The deployment-wide
 * CSV is hashed once, so every host series of one upload shares its source sha.
 * The `#<hostname>` fragment keeps the
 * (run, artifact, file) identity unique per host.
 */
function prepareMultinodePowerSeries(artifact: GpuMetricsArtifact): PreparedGpuMetricSeries[] {
  const prepared: PreparedGpuMetricSeries[] = [];
  const validations = readPowerAuditValidations(artifact.artifactDir, artifact.artifactName);
  for (const file of listMultinodePowerSampleFiles(artifact.artifactDir)) {
    const csvText = fs.readFileSync(file.path, 'utf8');
    const hosts = parseMultinodePowerSamples(csvText);
    if (!hosts) continue;
    const manifest = readMultinodePowerManifest(file.path);
    const vendor = multinodePowerVendor(manifest);
    const csvSha256 = createHash('sha256').update(csvText).digest('hex');
    for (const host of hosts) {
      const samples = uniqueSamples(host.samples);
      const summary = summarizeGpuMetricSamples(samples);
      if (!summary) continue;
      prepared.push({
        fileName: `${file.fileName}#${host.hostname}`,
        vendor,
        csvSha256,
        samples,
        stats: computeGpuMetricStats(samples),
        sampleIntervalS: summary.sampleIntervalS,
        gpuCount: summary.gpuCount,
        startedAtMs: summary.startedAtMs,
        endedAtMs: summary.endedAtMs,
        sidecars: {
          context: manifest,
          validations,
          identity: Object.entries(host.gpuUuids).map(([index, uuid]) => ({
            hostname: host.hostname,
            gpu_index: Number(index),
            gpu_uuid: uuid,
          })),
          energyStart: null,
          energyEnd: null,
        },
      });
    }
  }
  return prepared;
}

/**
 * Parse every CSV in an extracted artifact; refuse a partly readable CSV set.
 * Without usable nvidia-smi/amd-smi CSVs, fall back to the multinode power bundle.
 */
export function prepareGpuMetricsArtifact(artifact: GpuMetricsArtifact): PreparedGpuMetricSeries[] {
  const prepared: PreparedGpuMetricSeries[] = [];
  const unreadable: string[] = [];
  for (const file of listGpuMetricsCsvFiles(artifact.artifactDir)) {
    const csvText = fs.readFileSync(file.path, 'utf8');
    const sidecars = readGpuMetricsSidecars(file.path);
    if (artifact.artifactName.startsWith('power_audit_')) {
      sidecars.validations = readPowerAuditValidations(artifact.artifactDir, artifact.artifactName);
      const bundleFile = listMultinodePowerSampleFiles(artifact.artifactDir)[0];
      sidecars.powerManifest = bundleFile ? readMultinodePowerManifest(bundleFile.path) : null;
    }
    const parsed = parseGpuMetricsCsv(csvText, {
      nvidiaUtcOffsetMinutes: contextUtcOffsetMinutes(sidecars.context),
    });
    if (!parsed) {
      unreadable.push(file.fileName);
      continue;
    }
    const samples = uniqueSamples(parsed.samples);
    const summary = summarizeGpuMetricSamples(samples);
    if (!summary) {
      unreadable.push(file.fileName);
      continue;
    }
    prepared.push({
      fileName: file.fileName,
      vendor: parsed.vendor,
      csvSha256: createHash('sha256').update(csvText).digest('hex'),
      samples,
      stats: computeGpuMetricStats(samples),
      sampleIntervalS: summary.sampleIntervalS,
      gpuCount: summary.gpuCount,
      startedAtMs: summary.startedAtMs,
      endedAtMs: summary.endedAtMs,
      sidecars,
    });
  }
  if (prepared.length > 0 && unreadable.length > 0) {
    throw new Error(
      `Incomplete telemetry artifact ${artifact.artifactName}: unreadable CSVs ${unreadable.join(', ')}`,
    );
  }
  const series = prepared.length > 0 ? prepared : prepareMultinodePowerSeries(artifact);
  const seriesInventory = series.map((entry) => ({
    fileName: entry.fileName,
    sampleCount: entry.samples.length,
  }));
  for (const entry of series) entry.sidecars.seriesInventory = seriesInventory;
  return series;
}

const STAT_METRIC_COLUMN: Record<GpuMetricStats['metric'], string> = {
  powerW: 'power_w',
  temperatureC: 'temperature_c',
  smClockMhz: 'sm_clock_mhz',
  memClockMhz: 'mem_clock_mhz',
  gpuUtilPct: 'gpu_util_pct',
  memUtilPct: 'mem_util_pct',
  edgeTempC: 'edge_temp_c',
  memTempC: 'mem_temp_c',
  gfxVoltageMv: 'gfx_voltage_mv',
  socVoltageMv: 'soc_voltage_mv',
  memVoltageMv: 'mem_voltage_mv',
  fclkMhz: 'fclk_mhz',
  socclkMhz: 'socclk_mhz',
  mmActivityPct: 'mm_activity_pct',
};

/** Stored metric names use the column spelling so SQL readers need no mapping. */
export function statMetricColumn(metric: GpuMetricStats['metric']): string {
  return STAT_METRIC_COLUMN[metric];
}

async function insertSampleBatch(
  tx: TxLike,
  seriesId: number,
  batch: readonly GpuMetricSample[],
): Promise<number> {
  const inserted = await tx<{ n: number }[]>`
    with ins as (
      insert into gpu_metric_samples (
        series_id, gpu_index, sampled_at,
        power_w, temperature_c, sm_clock_mhz, mem_clock_mhz, gpu_util_pct, mem_util_pct,
        edge_temp_c, mem_temp_c, gfx_voltage_mv, soc_voltage_mv, mem_voltage_mv,
        fclk_mhz, socclk_mhz, mm_activity_pct
      )
      select
        ${seriesId},
        unnest(${tx.array(batch.map((s) => s.gpuIndex))}::smallint[]),
        to_timestamp(unnest(${tx.array(batch.map((s) => s.timestampMs / 1000))}::double precision[])),
        unnest(${tx.array(batch.map((s) => s.powerW))}::real[]),
        unnest(${tx.array(batch.map((s) => s.temperatureC))}::real[]),
        unnest(${tx.array(batch.map((s) => s.smClockMhz))}::real[]),
        unnest(${tx.array(batch.map((s) => s.memClockMhz))}::real[]),
        unnest(${tx.array(batch.map((s) => s.gpuUtilPct))}::real[]),
        unnest(${tx.array(batch.map((s) => s.memUtilPct))}::real[]),
        unnest(${tx.array(batch.map((s) => s.edgeTempC))}::real[]),
        unnest(${tx.array(batch.map((s) => s.memTempC))}::real[]),
        unnest(${tx.array(batch.map((s) => s.gfxVoltageMv))}::real[]),
        unnest(${tx.array(batch.map((s) => s.socVoltageMv))}::real[]),
        unnest(${tx.array(batch.map((s) => s.memVoltageMv))}::real[]),
        unnest(${tx.array(batch.map((s) => s.fclkMhz))}::real[]),
        unnest(${tx.array(batch.map((s) => s.socclkMhz))}::real[]),
        unnest(${tx.array(batch.map((s) => s.mmActivityPct))}::real[])
      -- nvidia-smi occasionally repeats the final sample when the monitor is
      -- stopped and flushed; the primary key makes that a no-op.
      on conflict (series_id, gpu_index, sampled_at) do nothing
      returning 1
    )
    select count(*)::int as n from ins
  `;
  return Number(inserted[0]?.n ?? 0);
}

async function insertStats(
  tx: TxLike,
  seriesId: number,
  stats: readonly GpuMetricStats[],
): Promise<void> {
  if (stats.length === 0) return;
  await tx`
    insert into gpu_metric_gpu_stats (
      series_id, gpu_index, metric, sample_count,
      min_value, max_value, mean_value, median_value, p95_value, p99_value, stddev_value
    )
    select
      ${seriesId},
      unnest(${tx.array(stats.map((s) => s.gpuIndex))}::smallint[]),
      unnest(${tx.array(stats.map((s) => statMetricColumn(s.metric)))}::text[]),
      unnest(${tx.array(stats.map((s) => s.count))}::int[]),
      unnest(${tx.array(stats.map((s) => s.min))}::real[]),
      unnest(${tx.array(stats.map((s) => s.max))}::real[]),
      unnest(${tx.array(stats.map((s) => s.mean))}::real[]),
      unnest(${tx.array(stats.map((s) => s.median))}::real[]),
      unnest(${tx.array(stats.map((s) => s.p95))}::real[]),
      unnest(${tx.array(stats.map((s) => s.p99))}::real[]),
      unnest(${tx.array(stats.map((s) => s.stddev))}::real[])
  `;
}

/**
 * Upsert one prepared series and link it to `benchmarkResultIds`. Returns the
 * series id and how many sample rows were written (0 when the CSV, sidecars,
 * and unique sample count are unchanged).
 */
export function upsertGpuMetricSeries(
  sql: Sql,
  input: {
    workflowRunId: number;
    artifactName: string;
    series: PreparedGpuMetricSeries;
    benchmarkResultIds: readonly number[];
  },
): Promise<{ seriesId: number; samplesInserted: number; replaced: boolean }> {
  const { workflowRunId, artifactName, series, benchmarkResultIds } = input;
  const configKey = gpuMetricsArtifactSuffix(artifactName) ?? artifactName;
  const sidecarsJson = JSON.stringify(series.sidecars);

  return sql.begin(async (tx) => {
    const existing = await tx<
      { id: number; csv_sha256: string; sample_count: number; sidecars_match: boolean }[]
    >`
      select id, csv_sha256, sample_count, sidecars = ${sidecarsJson}::jsonb as sidecars_match
      from gpu_metric_series
      where workflow_run_id = ${workflowRunId}
        and artifact_name = ${artifactName}
        and file_name = ${series.fileName}
      for update
    `;

    let seriesId: number;
    let needsSamples = true;
    let replaced = false;
    if (existing.length > 0) {
      seriesId = Number(existing[0]!.id);
      // Count also detects legacy digests computed before duplicate removal.
      if (
        existing[0]!.csv_sha256 === series.csvSha256 &&
        existing[0]!.sidecars_match &&
        existing[0]!.sample_count === series.samples.length
      ) {
        needsSamples = false;
      } else {
        replaced = true;
        await tx`delete from gpu_metric_samples where series_id = ${seriesId}`;
        await tx`delete from gpu_metric_gpu_stats where series_id = ${seriesId}`;
        await tx`
          update gpu_metric_series set
            vendor = ${series.vendor},
            csv_sha256 = ${series.csvSha256},
            sample_interval_s = ${series.sampleIntervalS},
            sample_count = ${series.samples.length},
            gpu_count = ${series.gpuCount},
            started_at = to_timestamp(${series.startedAtMs / 1000}::double precision),
            ended_at = to_timestamp(${series.endedAtMs / 1000}::double precision),
            sidecars = ${sidecarsJson}::jsonb,
            ingested_at = now()
          where id = ${seriesId}
        `;
      }
    } else {
      const [row] = await tx<{ id: number }[]>`
        insert into gpu_metric_series (
          workflow_run_id, artifact_name, config_key, file_name, vendor, csv_sha256,
          sample_interval_s, sample_count, gpu_count, started_at, ended_at, sidecars
        ) values (
          ${workflowRunId}, ${artifactName}, ${configKey}, ${series.fileName},
          ${series.vendor}, ${series.csvSha256}, ${series.sampleIntervalS},
          ${series.samples.length}, ${series.gpuCount},
          to_timestamp(${series.startedAtMs / 1000}::double precision),
          to_timestamp(${series.endedAtMs / 1000}::double precision),
          ${sidecarsJson}::jsonb
        )
        returning id
      `;
      seriesId = Number(row!.id);
    }

    let samplesInserted = 0;
    if (needsSamples) {
      for (let offset = 0; offset < series.samples.length; offset += SAMPLE_BATCH_SIZE) {
        samplesInserted += await insertSampleBatch(
          tx,
          seriesId,
          series.samples.slice(offset, offset + SAMPLE_BATCH_SIZE),
        );
      }
      await insertStats(tx, seriesId, series.stats);
    }

    if (benchmarkResultIds.length > 0) {
      await tx`
        insert into benchmark_result_gpu_metrics (benchmark_result_id, series_id)
        select unnest(${tx.array([...new Set(benchmarkResultIds)])}::bigint[]), ${seriesId}
        on conflict do nothing
      `;
    }

    return { seriesId, samplesInserted, replaced };
  });
}

/** Read, digest, and persist every CSV of one artifact for one set of points. */
export async function ingestGpuMetricsArtifact(
  sql: Sql,
  input: {
    workflowRunId: number;
    artifact: GpuMetricsArtifact;
    benchmarkResultIds: readonly number[];
  },
): Promise<GpuMetricsIngestResult> {
  const prepared = prepareGpuMetricsArtifact(input.artifact);
  const result: GpuMetricsIngestResult = {
    seriesIds: [],
    samplesInserted: 0,
    seriesSkipped: 0,
    metadataUpdatedBenchmarkResultIds: [],
  };
  for (const series of prepared) {
    const upserted = await upsertGpuMetricSeries(sql, {
      workflowRunId: input.workflowRunId,
      artifactName: input.artifact.artifactName,
      series,
      benchmarkResultIds: input.benchmarkResultIds,
    });
    result.seriesIds.push(upserted.seriesId);
    result.samplesInserted += upserted.samplesInserted;
    if (upserted.samplesInserted === 0 && !upserted.replaced) result.seriesSkipped++;
  }
  // The caller has resolved this artifact's exact benchmark identities. Recover
  // only a unique AgentX point within that explicit set, after every host is
  // stored/linked. This also repairs metadata when all samples were a no-op.
  const validations = prepared[0]?.sidecars.validations ?? {};
  const audits = Object.entries(validations)
    .map(([source, validation]) => ({
      audit: recoveredPowerAudit(source, validation),
      conc: (validation.selected_window as Record<string, unknown> | undefined)?.concurrency,
    }))
    .filter((entry) => entry.audit !== null);
  for (const { audit, conc } of audits) {
    if (typeof conc !== 'number' || !Number.isSafeInteger(conc) || conc <= 0) continue;
    if (audits.filter((entry) => entry.conc === conc).length !== 1) continue;
    const updated = await sql<{ id: number }[]>`
      with candidates as (
        select id from benchmark_results
        where workflow_run_id = ${input.workflowRunId}
          and id = any(${sql.array([...new Set(input.benchmarkResultIds)])}::bigint[])
          and benchmark_type = 'agentic_traces' and conc = ${conc}
      )
      update benchmark_results set power_audit = ${sql.json(audit)}::jsonb
      where id in (select id from candidates)
        and (select count(*) from candidates) = 1 and power_audit is null
      returning id
    `;
    result.metadataUpdatedBenchmarkResultIds.push(...updated.map((row) => Number(row.id)));
  }
  return result;
}
