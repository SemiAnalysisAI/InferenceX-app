/**
 * Persist one gpu_metrics artifact: series metadata, full-resolution samples,
 * and links to the benchmark points it covers.
 *
 * Idempotency: a series is identified by (workflow run, artifact name, CSV
 * path). Re-ingesting an identical CSV, sidecars and sample count only refreshes
 * the point links; a source change, or `replace`, replaces the samples atomically.
 */

import fs from 'node:fs';

import type postgres from 'postgres';

import { sha256Hex } from './benchmark-artifacts.js';
import type { Sql } from './db-utils.js';

/** Either a pooled client or the transaction handle passed to `sql.begin` callbacks. */
type TxLike = Sql | postgres.TransactionSql;
import {
  parseGpuMetricsCsv,
  summarizeGpuMetricSamples,
  type GpuMetricSample,
  type GpuMetricsVendor,
} from './gpu-metrics-csv.js';
import {
  contextUtcOffsetMinutes,
  gpuMetricsArtifactSuffix,
  isGpuMetricsCsvPath,
  readGpuMetricsSidecars,
  readMultinodePowerManifest,
  readPowerAuditValidations,
  walkFiles,
  type GpuMetricsArtifact,
  type GpuMetricsSidecars,
} from './gpu-metrics-artifacts.js';
import {
  isMultinodePowerSamplesPath,
  multinodePowerVendor,
  parseMultinodePowerSamples,
} from './multinode-power-samples.js';

/** Samples are streamed to Postgres in unnest batches of this many rows. */
const SAMPLE_BATCH_SIZE = 5000;

function uniqueSamples(samples: readonly GpuMetricSample[]): GpuMetricSample[] {
  const seen = new Set<string>();
  return samples.filter((sample) => {
    const key = `${sample.gpuIndex}:${sample.timestampMs}`;
    // nvidia-smi can repeat the final sample when the monitor stops and flushes.
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface PreparedGpuMetricSeries {
  fileName: string;
  vendor: GpuMetricsVendor;
  csvSha256: string;
  samples: GpuMetricSample[];
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
  for (const file of walkFiles(artifact.artifactDir, isMultinodePowerSamplesPath)) {
    const csvText = fs.readFileSync(file.path, 'utf8');
    const hosts = parseMultinodePowerSamples(csvText);
    if (!hosts) continue;
    const manifest = readMultinodePowerManifest(file.path);
    const vendor = multinodePowerVendor(manifest);
    const csvSha256 = sha256Hex(csvText);
    for (const host of hosts) {
      const samples = uniqueSamples(host.samples);
      const summary = summarizeGpuMetricSamples(samples);
      if (!summary) continue;
      prepared.push({
        fileName: `${file.fileName}#${host.hostname}`,
        vendor,
        csvSha256,
        samples,
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
  // Bundle-level sidecars depend only on the artifact, so read them once and
  // share them across every CSV of the bundle.
  const bundle = artifact.artifactName.startsWith('power_audit_')
    ? {
        validations: readPowerAuditValidations(artifact.artifactDir, artifact.artifactName),
        powerManifest: (() => {
          const bundleFile = walkFiles(artifact.artifactDir, isMultinodePowerSamplesPath)[0];
          return bundleFile ? readMultinodePowerManifest(bundleFile.path) : null;
        })(),
      }
    : null;
  for (const file of walkFiles(artifact.artifactDir, isGpuMetricsCsvPath)) {
    const csvText = fs.readFileSync(file.path, 'utf8');
    const sidecars = readGpuMetricsSidecars(file.path);
    if (bundle) {
      sidecars.validations = bundle.validations;
      sidecars.powerManifest = bundle.powerManifest;
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
      csvSha256: sha256Hex(csvText),
      samples,
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

async function insertSampleBatch(
  tx: TxLike,
  seriesId: number,
  batch: readonly GpuMetricSample[],
): Promise<void> {
  await tx`
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
  `;
}

/**
 * Upsert one prepared series and link it to `benchmarkResultIds`. Returns the
 * series id and how many sample rows were written (0 when the CSV, sidecars,
 * and unique sample count are unchanged and `replace` is not set).
 */
export function upsertGpuMetricSeries(
  sql: Sql,
  input: {
    workflowRunId: number;
    artifactName: string;
    series: PreparedGpuMetricSeries;
    benchmarkResultIds: readonly number[];
    /** Rewrite unchanged series too: a parser fix alters values, not the source. */
    replace?: boolean;
  },
): Promise<{
  seriesId: number;
  samplesInserted: number;
  replaced: boolean;
}> {
  const { workflowRunId, artifactName, series, benchmarkResultIds, replace = false } = input;
  const configKey = gpuMetricsArtifactSuffix(artifactName) ?? artifactName;
  const sidecars = sql.json(series.sidecars as unknown as postgres.JSONValue);

  return sql.begin(async (tx) => {
    const existing = await tx<
      {
        id: number;
        csv_sha256: string;
        sample_count: number;
        sidecars_match: boolean;
      }[]
    >`
      select id, csv_sha256, sample_count, sidecars = ${sidecars} as sidecars_match
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
      // A parser or deduplication change can alter the count of an unchanged CSV.
      if (
        !replace &&
        existing[0]!.csv_sha256 === series.csvSha256 &&
        existing[0]!.sidecars_match &&
        existing[0]!.sample_count === series.samples.length
      ) {
        needsSamples = false;
      } else {
        replaced = true;
        await tx`delete from gpu_metric_samples where series_id = ${seriesId}`;
        await tx`
          update gpu_metric_series set
            vendor = ${series.vendor},
            csv_sha256 = ${series.csvSha256},
            sample_interval_s = ${series.sampleIntervalS},
            sample_count = ${series.samples.length},
            gpu_count = ${series.gpuCount},
            started_at = to_timestamp(${series.startedAtMs / 1000}::double precision),
            ended_at = to_timestamp(${series.endedAtMs / 1000}::double precision),
            sidecars = ${sidecars},
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
          ${sidecars}
        )
        returning id
      `;
      seriesId = Number(row!.id);
    }

    if (needsSamples) {
      for (let offset = 0; offset < series.samples.length; offset += SAMPLE_BATCH_SIZE) {
        await insertSampleBatch(
          tx,
          seriesId,
          series.samples.slice(offset, offset + SAMPLE_BATCH_SIZE),
        );
      }
    }

    if (benchmarkResultIds.length > 0) {
      await tx`
        insert into benchmark_result_gpu_metrics (benchmark_result_id, series_id)
        select unnest(${tx.array([...new Set(benchmarkResultIds)])}::bigint[]), ${seriesId}
        on conflict do nothing
      `;
    }

    return { seriesId, samplesInserted: needsSamples ? series.samples.length : 0, replaced };
  });
}

/**
 * Read and persist every CSV of one artifact for one set of points.
 * Writes telemetry tables and point links only; benchmark-row provenance is
 * attached by the caller that owns the point set (CI before insert, the
 * backfill after this call stores and links every series).
 */
export async function ingestGpuMetricsArtifact(
  sql: Sql,
  input: {
    workflowRunId: number;
    artifact: GpuMetricsArtifact;
    benchmarkResultIds: readonly number[];
    replace?: boolean;
  },
): Promise<GpuMetricsIngestResult> {
  const prepared = prepareGpuMetricsArtifact(input.artifact);
  const result: GpuMetricsIngestResult = { seriesIds: [], samplesInserted: 0, seriesSkipped: 0 };
  for (const series of prepared) {
    const upserted = await upsertGpuMetricSeries(sql, {
      workflowRunId: input.workflowRunId,
      artifactName: input.artifact.artifactName,
      series,
      benchmarkResultIds: input.benchmarkResultIds,
      replace: input.replace,
    });
    result.seriesIds.push(upserted.seriesId);
    result.samplesInserted += upserted.samplesInserted;
    if (upserted.samplesInserted === 0 && !upserted.replaced) result.seriesSkipped++;
  }
  return result;
}
