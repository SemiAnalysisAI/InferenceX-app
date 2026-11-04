import { isDeepStrictEqual } from 'node:util';

import { getDb } from './connection';
import { decodeGpuSampleBlob, GPU_SAMPLE_BLOB_FORMAT_VERSION } from './lib/gpu-sample-blob';
import {
  getGpuMetricsForPoint,
  readSqlSampleRows,
  type GpuMetricsPointPayload,
} from './queries/gpu-metrics';
import { storedSample } from './queries/gpu-sample-blobs';

const db = getDb();

function flagValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === name && process.argv[i + 1]) values.push(process.argv[++i]!);
  }
  return values;
}

const percentile = (sorted: readonly number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? Number.NaN;

function describeTimes(label: string, times: readonly number[]): string {
  const sorted = times.toSorted((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return (
    `${label}: median ${percentile(sorted, 0.5).toFixed(0)} ms, ` +
    `p95 ${percentile(sorted, 0.95).toFixed(0)} ms, max ${(sorted.at(-1) ?? 0).toFixed(0)} ms, ` +
    `total ${(total / 1000).toFixed(1)} s`
  );
}

const mib = (bytes: number): string => `${(bytes / 2 ** 20).toFixed(1)} MiB`;

async function main(): Promise<void> {
  const limit = Number(flagValues('--limit')[0] ?? 50);
  const requested = flagValues('--point-id').map(Number);
  const pointIds =
    requested.length > 0
      ? requested
      : (
          (await db`
            select l.benchmark_result_id as id
            from benchmark_result_gpu_metrics l
            join gpu_metric_series s on s.id = l.series_id
            left join gpu_metric_sample_blobs b on b.series_id = s.id
              and b.format_version = ${GPU_SAMPLE_BLOB_FORMAT_VERSION}
              and b.ingested_at = s.ingested_at
            group by l.benchmark_result_id
            having bool_and(b.series_id is not null)
            order by random()
            limit ${limit}
          `) as { id: number | string }[]
        ).map((row) => Number(row.id));
  console.log(
    `Comparing ${pointIds.length} point(s), blob format ${GPU_SAMPLE_BLOB_FORMAT_VERSION}.`,
  );

  const rowTimes: number[] = [];
  const blobTimes: number[] = [];
  const seriesIds = new Set<number>();
  let mismatches = 0;
  let samples = 0;
  for (const [index, pointId] of pointIds.entries()) {
    const order = index % 2 === 0 ? [false, true] : [true, false];
    const payloads = new Map<boolean, GpuMetricsPointPayload | null>();
    for (const sampleBlobs of order) {
      const start = performance.now();
      payloads.set(sampleBlobs, await getGpuMetricsForPoint(db, pointId, { sampleBlobs }));
      (sampleBlobs ? blobTimes : rowTimes).push(performance.now() - start);
    }
    const fromRows = payloads.get(false) ?? null;
    const fromBlobs = payloads.get(true) ?? null;
    for (const series of fromRows?.series ?? []) {
      seriesIds.add(series.id);
      samples += series.data.length;
    }
    if (
      !isDeepStrictEqual(fromRows, fromBlobs) ||
      JSON.stringify(fromRows) !== JSON.stringify(fromBlobs)
    ) {
      mismatches++;
      console.error(`  point ${pointId}: blob payload differs from the row payload`);
    }
  }
  console.log(`  ${samples.toLocaleString('en-US')} samples across ${seriesIds.size} series`);
  console.log(`  ${describeTimes('rows ', rowTimes)}`);
  console.log(`  ${describeTimes('blobs', blobTimes)}`);

  for (const seriesId of seriesIds) {
    const [blob] = (await db`
      select b.data
      from gpu_metric_sample_blobs b
      join gpu_metric_series s on s.id = b.series_id and s.ingested_at = b.ingested_at
      where b.series_id = ${seriesId} and b.format_version = ${GPU_SAMPLE_BLOB_FORMAT_VERSION}
    `) as { data: Uint8Array }[];
    const sqlRows = await readSqlSampleRows(db, [seriesId]);
    const rows = sqlRows.get(seriesId)?.map(storedSample) ?? [];
    if (!blob || !isDeepStrictEqual(decodeGpuSampleBlob(blob.data), rows)) {
      mismatches++;
      console.error(`  series ${seriesId}: ${blob ? 'decoded blob differs from rows' : 'no blob'}`);
    }
  }
  console.log(`  ${seriesIds.size} series compared row for row`);

  const [size] = (await db`
    select count(b.series_id) as blobs,
      coalesce(sum(b.sample_count), 0) as blob_samples,
      coalesce(sum(octet_length(b.data)), 0) as blob_bytes,
      pg_total_relation_size('gpu_metric_sample_blobs') as blob_table_bytes,
      (select coalesce(sum(sample_count), 0) from gpu_metric_series) as all_samples,
      pg_total_relation_size('gpu_metric_samples') as samples_table_bytes
    from gpu_metric_sample_blobs b
    join gpu_metric_series s on s.id = b.series_id and s.ingested_at = b.ingested_at
    where b.format_version = ${GPU_SAMPLE_BLOB_FORMAT_VERSION}
  `) as Record<string, number | string>[];
  const blobSamples = Number(size!.blob_samples);
  const allSamples = Number(size!.all_samples);
  const samplesTableBytes = Number(size!.samples_table_bytes);
  const rowShare = allSamples > 0 ? (samplesTableBytes * blobSamples) / allSamples : 0;
  console.log(
    `Storage: ${Number(size!.blobs)} current blobs hold ${blobSamples.toLocaleString('en-US')} of ` +
      `${allSamples.toLocaleString('en-US')} samples in ${mib(Number(size!.blob_bytes))} ` +
      `(table ${mib(Number(size!.blob_table_bytes))}); their share of gpu_metric_samples ` +
      `(${mib(samplesTableBytes)} total) is ~${mib(rowShare)}.`,
  );

  if (mismatches > 0) throw new Error(`${mismatches} difference(s) between blob and row reads`);
  console.log('Blob reads match row reads.');
}

main().catch((error) => {
  console.error('GPU sample blob verification failed:', error);
  process.exitCode = 1;
});
