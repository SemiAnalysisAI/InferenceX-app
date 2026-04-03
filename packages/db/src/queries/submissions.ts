import type { DbClient } from '../connection.js';

export interface SubmissionSummaryRow {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
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

/** Get unique config submissions with first/latest date and datapoint counts. */
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
      MIN(br.date)::text AS first_date,
      MAX(br.date)::text AS latest_date,
      COUNT(DISTINCT br.date)::int AS run_days,
      COUNT(*)::int AS total_datapoints,
      COUNT(DISTINCT (br.isl, br.osl))::int AS distinct_sequences,
      COUNT(DISTINCT br.conc)::int AS distinct_concurrencies,
      MAX(br.conc)::int AS max_concurrency,
      (ARRAY_AGG(br.image ORDER BY br.date DESC) FILTER (WHERE br.image IS NOT NULL))[1] AS image
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE br.error IS NULL
      AND wr.conclusion IS NOT NULL
    GROUP BY c.model, c.hardware, c.framework, c.precision, c.spec_method, c.disagg, c.is_multinode, c.num_prefill_gpu, c.num_decode_gpu, c.prefill_tp, c.prefill_ep, c.decode_tp, c.decode_ep
    ORDER BY MAX(br.date) DESC, COUNT(*) DESC
  `;
  return rows as unknown as SubmissionSummaryRow[];
}

/** Get daily datapoint counts by hardware for volume charts. */
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
      AND wr.conclusion IS NOT NULL
    GROUP BY br.date, c.hardware
    ORDER BY br.date ASC
  `;
  return rows as unknown as SubmissionVolumeRow[];
}
