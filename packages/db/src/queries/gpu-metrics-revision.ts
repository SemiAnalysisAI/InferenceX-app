import type { DbClient } from '../connection';

/** Re-ingest and shared-link changes must bypass older point payloads. */
export async function getGpuMetricsPointRevision(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<string | null> {
  const [row] = await sql`
    select md5(jsonb_agg(jsonb_build_array(
      s.id, s.ingested_at, s.csv_sha256, s.sample_count, s.sidecars,
      (
        select jsonb_agg(jsonb_build_array(l.benchmark_result_id, b.power_audit)
          order by l.benchmark_result_id)
        from benchmark_result_gpu_metrics l
        join benchmark_results b on b.id = l.benchmark_result_id
        where l.series_id = s.id
      )
    ) order by s.id)::text) as revision
    from benchmark_result_gpu_metrics link
    join gpu_metric_series s on s.id = link.series_id
    where link.benchmark_result_id = ${benchmarkResultId}
  `;
  return typeof row?.revision === 'string' ? row.revision : null;
}
