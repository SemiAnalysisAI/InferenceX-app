import type { NeonClient } from '../connection.js';

export interface BenchmarkRow {
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
  prefill_tp: number;
  prefill_ep: number;
  prefill_dp_attention: boolean;
  prefill_num_workers: number;
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  decode_num_workers: number;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  isl: number;
  osl: number;
  conc: number;
  image: string | null;
  metrics: Record<string, number>;
  date: string;
}

/**
 * Fetch the latest benchmark results for a model across ALL sequences, up to a given date.
 * Returns the most recent result per (config, concurrency, isl, osl) — so every GPU/framework
 * + sequence combo that has been benchmarked appears, with the newest data winning.
 *
 * The frontend filters by sequence client-side. This eliminates API round-trips when
 * switching sequences — the data is already cached by React Query.
 */
export async function getLatestBenchmarks(
  sql: NeonClient,
  modelKey: string,
  date?: string,
): Promise<BenchmarkRow[]> {
  if (date) {
    // Date-filtered: use base table with DISTINCT ON (the view only has the absolute latest)
    const rows = await sql`
      SELECT DISTINCT ON (br.config_id, br.conc, br.isl, br.osl)
        c.hardware,
        c.framework,
        c.model,
        c.precision,
        c.spec_method,
        c.disagg,
        c.is_multinode,
        c.prefill_tp,
        c.prefill_ep,
        c.prefill_dp_attention,
        c.prefill_num_workers,
        c.decode_tp,
        c.decode_ep,
        c.decode_dp_attention,
        c.decode_num_workers,
        c.num_prefill_gpu,
        c.num_decode_gpu,
        br.isl,
        br.osl,
        br.conc,
        br.image,
        br.metrics,
        br.date::text
      FROM benchmark_results br
      JOIN configs c ON c.id = br.config_id
      JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
      WHERE c.model = ${modelKey}
        AND br.error IS NULL
        AND br.date <= ${date}::date
      ORDER BY br.config_id, br.conc, br.isl, br.osl, br.date DESC
    `;
    return rows as unknown as BenchmarkRow[];
  }

  // No date filter: use materialized view for instant lookups
  const rows = await sql`
    SELECT
      c.hardware,
      c.framework,
      c.model,
      c.precision,
      c.spec_method,
      c.disagg,
      c.is_multinode,
      c.prefill_tp,
      c.prefill_ep,
      c.prefill_dp_attention,
      c.prefill_num_workers,
      c.decode_tp,
      c.decode_ep,
      c.decode_dp_attention,
      c.decode_num_workers,
      c.num_prefill_gpu,
      c.num_decode_gpu,
      lb.isl,
      lb.osl,
      lb.conc,
      lb.image,
      lb.metrics,
      lb.date::text
    FROM latest_benchmarks lb
    JOIN configs c ON c.id = lb.config_id
    WHERE c.model = ${modelKey}
    ORDER BY lb.config_id, lb.conc, lb.isl, lb.osl, lb.date DESC
  `;
  return rows as unknown as BenchmarkRow[];
}

/**
 * Fetch ALL benchmark results for a model + sequence across ALL dates.
 * No DISTINCT ON — returns every successful result, one per (config, conc, date).
 * Used by Historical Trends and Performance Over Time features.
 */
export async function getAllBenchmarksForHistory(
  sql: NeonClient,
  modelKey: string,
  isl: number,
  osl: number,
): Promise<BenchmarkRow[]> {
  const rows = await sql`
    SELECT
      c.hardware,
      c.framework,
      c.model,
      c.precision,
      c.spec_method,
      c.disagg,
      c.is_multinode,
      c.prefill_tp,
      c.prefill_ep,
      c.prefill_dp_attention,
      c.prefill_num_workers,
      c.decode_tp,
      c.decode_ep,
      c.decode_dp_attention,
      c.decode_num_workers,
      c.num_prefill_gpu,
      c.num_decode_gpu,
      br.isl,
      br.osl,
      br.conc,
      br.metrics - '{std_ttft,std_tpot,std_e2el,std_intvty,std_itl,mean_ttft,mean_tpot,mean_e2el,mean_intvty,mean_itl}'::text[] as metrics,
      br.date::text
    FROM configs c
    JOIN benchmark_results br ON br.config_id = c.id
      AND br.isl = ${isl}
      AND br.osl = ${osl}
      AND br.error IS NULL
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE c.model = ${modelKey}
    ORDER BY br.date, c.id, br.conc
  `;
  return rows as unknown as BenchmarkRow[];
}
