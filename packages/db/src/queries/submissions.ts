import type { DbClient } from '../connection.js';

export interface SubmissionSummaryRow {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  prefill_tp: number;
  prefill_ep: number;
  decode_tp: number;
  decode_ep: number;
  date: string;
  total_datapoints: number;
  distinct_sequences: number;
  distinct_concurrencies: number;
  max_concurrency: number;
  image: string | null;
}

export interface SubmissionVolumeRow {
  date: string;
  hardware: string;
  datapoints: number;
}

/** Get per-run config submissions (one row per config × date).
 *  Uses benchmark_results with error/workflow filters to include full history. */
export async function getSubmissionSummary(sql: DbClient): Promise<SubmissionSummaryRow[]> {
  const rows = await sql`
    SELECT
      c.model,
      c.hardware,
      c.framework,
      c.precision,
      c.spec_method,
      c.disagg,
      c.is_multinode,
      c.num_prefill_gpu,
      c.num_decode_gpu,
      c.prefill_tp,
      c.prefill_ep,
      c.decode_tp,
      c.decode_ep,
      br.date::text,
      COUNT(*)::int AS total_datapoints,
      COUNT(DISTINCT (br.isl, br.osl))::int AS distinct_sequences,
      COUNT(DISTINCT br.conc)::int AS distinct_concurrencies,
      MAX(br.conc)::int AS max_concurrency,
      (ARRAY_AGG(br.image) FILTER (WHERE br.image IS NOT NULL))[1] AS image
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE br.error IS NULL
    GROUP BY c.model, c.hardware, c.framework, c.precision, c.spec_method, c.disagg, c.is_multinode, c.num_prefill_gpu, c.num_decode_gpu, c.prefill_tp, c.prefill_ep, c.decode_tp, c.decode_ep, br.date
    ORDER BY br.date DESC, COUNT(*) DESC
  `;
  return rows as unknown as SubmissionSummaryRow[];
}

/** Get daily datapoint counts by hardware for volume charts.
 *  Uses benchmark_results with error/workflow filters to include full history. */
export async function getSubmissionVolume(sql: DbClient): Promise<SubmissionVolumeRow[]> {
  const rows = await sql`
    SELECT
      br.date::text,
      c.hardware,
      COUNT(*)::int AS datapoints
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE br.error IS NULL
    GROUP BY br.date, c.hardware
    ORDER BY br.date ASC
  `;
  return rows as unknown as SubmissionVolumeRow[];
}
