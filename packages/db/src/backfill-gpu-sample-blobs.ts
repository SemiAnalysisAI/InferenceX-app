/**
 * Store compressed per-series sample blobs (`gpu_metric_sample_blobs`, migration 022).
 *
 *   bun run db:backfill-gpu-sample-blobs            # count series without a current blob
 *   bun run db:backfill-gpu-sample-blobs --yes      # write them
 *   bun run db:backfill-gpu-sample-blobs --run-id <github run id> [--force] [--limit N] --yes
 *
 * Each series is read through the reader's SQL path, encoded, decoded and compared
 * with those rows, then written in one transaction that holds the series row FOR
 * SHARE, so a concurrent re-ingest waits and the blob names the version it encodes.
 * Run it once after migration 022 and after bumping GPU_SAMPLE_BLOB_FORMAT_VERSION.
 * Missing or stale blobs only make reads slower, never wrong.
 */
import { hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import { parseLimitForceFlags, parseRunIdFlag } from './lib/backfill-runner';
import { GPU_SAMPLE_BLOB_FORMAT_VERSION } from './lib/gpu-sample-blob';
import { storeGpuSampleBlob, type StoreGpuSampleBlobResult } from './queries/gpu-sample-blobs';

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
  const githubRunId = parseRunIdFlag() ?? null;
  const { limit, force } = parseLimitForceFlags();
  const series = await sql<{ id: string; sample_count: number }[]>`
    select s.id, s.sample_count
    from gpu_metric_series s
    left join gpu_metric_sample_blobs b on b.series_id = s.id
      and b.format_version = ${GPU_SAMPLE_BLOB_FORMAT_VERSION}
      and b.ingested_at = s.ingested_at
    where (${force}::boolean or b.series_id is null)
      and (${githubRunId}::bigint is null or s.workflow_run_id in (
        select wr.id from workflow_runs wr where wr.github_run_id = ${githubRunId}))
    order by s.id
    limit ${limit}::bigint
  `;
  const samples = series.reduce((total, row) => total + Number(row.sample_count), 0);
  console.log(
    `GPU sample blob format ${GPU_SAMPLE_BLOB_FORMAT_VERSION}: ${series.length} series ` +
      `(${samples.toLocaleString('en-US')} samples) ${force ? 'selected' : 'without a current blob'}.`,
  );
  if (!hasYesFlag()) {
    console.log('Dry run. Pass --yes to write blobs; gpu_metric_samples is not changed.');
    return;
  }
  const started = Date.now();
  let written = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;
  for (const [index, row] of series.entries()) {
    const id = Number(row.id);
    try {
      const result = await sql.begin(async (tx): Promise<StoreGpuSampleBlobResult> => {
        const locked = await tx`select 1 from gpu_metric_series where id = ${id} for share`;
        if (locked.length === 0) return { status: 'skipped', reason: 'series deleted' };
        return storeGpuSampleBlob(tx, id);
      });
      if (result.status === 'written') {
        written++;
        bytes += result.bytes;
      } else {
        skipped++;
        console.warn(`  ${id}: no blob, ${result.reason}`);
      }
    } catch (error) {
      failed++;
      console.error(`  ${id}: failed`, error);
    }
    if ((index + 1) % 100 === 0 || index + 1 === series.length) {
      console.log(
        `  ${index + 1}/${series.length}: ${written} written (${(bytes / 2 ** 20).toFixed(1)} MiB), ` +
          `${skipped} skipped, ${failed} failed in ${((Date.now() - started) / 1000).toFixed(0)}s`,
      );
    }
  }
  if (failed) throw new Error(`${failed} series could not be stored`);
}

main()
  .catch((error) => {
    console.error('GPU sample blob backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
