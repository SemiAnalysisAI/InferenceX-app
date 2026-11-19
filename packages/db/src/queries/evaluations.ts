import type { DbClient } from '../connection.js';

export interface EvalRow {
  id: number;
  config_id: number;
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  spec_algorithm: string | null;
  spec_draft_model: string | null;
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
  task: string;
  date: string;
  conc: number | null;
  metrics: Record<string, number>;
  timestamp: string;
  run_url: string | null;
}

/** Get all evaluation results (latest attempt only). */
export async function getAllEvalResults(sql: DbClient): Promise<EvalRow[]> {
  const rows = await sql`
    SELECT
      er.id,
      er.config_id,
      c.hardware,
      c.framework,
      c.model,
      c.precision,
      c.spec_method,
      spec.spec_algorithm,
      spec.spec_draft_model,
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
      er.task,
      er.date::text,
      er.conc,
      er.metrics,
      to_char(wr.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as timestamp,
      wr.html_url as run_url
    FROM eval_results er
    JOIN configs c ON c.id = er.config_id
    JOIN latest_workflow_runs wr ON wr.id = er.workflow_run_id
    LEFT JOIN LATERAL (
      SELECT
        br.metrics ->> 'spec_algorithm' AS spec_algorithm,
        br.metrics ->> 'spec_draft_model' AS spec_draft_model
      FROM benchmark_results br
      WHERE br.workflow_run_id = er.workflow_run_id
        AND br.config_id = er.config_id
        AND c.spec_method <> 'none'
      LIMIT 1
    ) spec ON true
    ORDER BY er.date DESC, c.hardware
  `;
  return rows as unknown as EvalRow[];
}
