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

/** Get unique config submissions with first/latest date and datapoint counts.
 *  Uses latest_benchmarks (deduplicated: newest per config+conc+isl+osl, no errors). */
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
      MIN(lb.date)::text AS first_date,
      MAX(lb.date)::text AS latest_date,
      COUNT(DISTINCT lb.date)::int AS run_days,
      COUNT(*)::int AS total_datapoints,
      COUNT(DISTINCT (lb.isl, lb.osl))::int AS distinct_sequences,
      COUNT(DISTINCT lb.conc)::int AS distinct_concurrencies,
      MAX(lb.conc)::int AS max_concurrency,
      (ARRAY_AGG(lb.image ORDER BY lb.date DESC) FILTER (WHERE lb.image IS NOT NULL))[1] AS image
    FROM latest_benchmarks lb
    JOIN configs c ON c.id = lb.config_id
    GROUP BY c.model, c.hardware, c.framework, c.precision, c.spec_method, c.disagg, c.is_multinode, c.num_prefill_gpu, c.num_decode_gpu, c.prefill_tp, c.prefill_ep, c.decode_tp, c.decode_ep
    ORDER BY MAX(lb.date) DESC, COUNT(*) DESC
  `;
  return rows as unknown as SubmissionSummaryRow[];
}

/** Get daily datapoint counts by hardware for volume charts.
 *  Uses latest_benchmarks (deduplicated: newest per config+conc+isl+osl, no errors). */
export async function getSubmissionVolume(sql: DbClient): Promise<SubmissionVolumeRow[]> {
  const rows = await sql`
    SELECT
      lb.date::text,
      c.hardware,
      COUNT(*)::int AS datapoints
    FROM latest_benchmarks lb
    JOIN configs c ON c.id = lb.config_id
    GROUP BY lb.date, c.hardware
    ORDER BY lb.date ASC
  `;
  return rows as unknown as SubmissionVolumeRow[];
}
