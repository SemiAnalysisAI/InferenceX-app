/**
 * Writes `gpu_metric_sample_blobs` rows (migration 022) from the stored samples.
 * Readers prefer a current row over `gpu_metric_samples` (`loadSeriesDetails`).
 */
import { isDeepStrictEqual } from 'node:util';

import type postgres from 'postgres';

import type { DbClient } from '../connection.js';
import type { Sql } from '../etl/db-utils';
import type { StoredGpuMetricSample } from '../lib/gpu-metric-stats';
import {
  decodeGpuSampleBlob,
  encodeGpuSampleBlob,
  GPU_SAMPLE_BLOB_FORMAT_VERSION,
  GpuSampleBlobUnsupportedError,
} from '../lib/gpu-sample-blob';
import { readSqlSampleRows, type RawSampleRow } from './gpu-metrics';

/** Neon's HTTP driver returns at most 64 MiB, hex-encoded; larger series keep reading rows. */
export const GPU_SAMPLE_BLOB_MAX_BYTES = 24 * 1024 * 1024;

export type StoreGpuSampleBlobResult =
  | { status: 'written'; sampleCount: number; bytes: number }
  | { status: 'skipped'; reason: string };

/** A SQL sample row in the shape `decodeGpuSampleBlob` returns. */
export function storedSample(row: RawSampleRow): StoredGpuMetricSample {
  const { series_id: _seriesId, ...sample } = row;
  return sample;
}

/**
 * Encode the series' rows exactly as the reader's SQL path returns them and store
 * the blob, stamped with the series' `ingested_at`. The caller's transaction must
 * hold the series row (the ingest's own write, or FOR SHARE) so the rows and the
 * stamp belong to one series version. A series the codec cannot reproduce exactly,
 * or whose blob exceeds GPU_SAMPLE_BLOB_MAX_BYTES, keeps no blob.
 */
export async function storeGpuSampleBlob(
  tx: Sql | postgres.TransactionSql,
  seriesId: number,
): Promise<StoreGpuSampleBlobResult> {
  const db = tx as unknown as DbClient;
  const sqlRows = await readSqlSampleRows(db, [seriesId]);
  const rows = sqlRows.get(seriesId)?.map(storedSample) ?? [];
  const dropBlob = async (reason: string): Promise<StoreGpuSampleBlobResult> => {
    await db`delete from gpu_metric_sample_blobs where series_id = ${seriesId}`;
    return { status: 'skipped', reason };
  };
  let data: Buffer;
  try {
    data = encodeGpuSampleBlob(rows);
  } catch (error) {
    if (!(error instanceof GpuSampleBlobUnsupportedError)) throw error;
    return dropBlob(error.message);
  }
  if (data.byteLength > GPU_SAMPLE_BLOB_MAX_BYTES) {
    return dropBlob(`${data.byteLength} bytes exceed ${GPU_SAMPLE_BLOB_MAX_BYTES}`);
  }
  if (!isDeepStrictEqual(decodeGpuSampleBlob(data), rows)) {
    return dropBlob('decoded rows differ from gpu_metric_samples');
  }
  await db`
    insert into gpu_metric_sample_blobs (series_id, format_version, sample_count, ingested_at, data)
    select id, ${GPU_SAMPLE_BLOB_FORMAT_VERSION}::smallint, ${rows.length}::integer, ingested_at,
      ${data}::bytea
    from gpu_metric_series
    where id = ${seriesId}
    on conflict (series_id) do update set
      format_version = excluded.format_version,
      sample_count = excluded.sample_count,
      ingested_at = excluded.ingested_at,
      data = excluded.data
  `;
  return { status: 'written', sampleCount: rows.length, bytes: data.byteLength };
}
