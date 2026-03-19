import type { NeonClient } from '../connection.js';

export interface EvalRow {
  config_id: number;
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  task: string;
  date: string;
  conc: number | null;
  metrics: Record<string, number>;
  timestamp: string;
}

/** Get all evaluation results (latest attempt only). */
export async function getAllEvalResults(sql: NeonClient): Promise<EvalRow[]> {
  const rows = await sql`
    SELECT
      er.config_id,
      c.hardware,
      c.framework,
      c.model,
      c.precision,
      c.spec_method,
      c.decode_tp,
      c.decode_ep,
      c.decode_dp_attention,
      er.task,
      er.date::text,
      er.conc,
      er.metrics,
      to_char(wr.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as timestamp
    FROM eval_results er
    JOIN configs c ON c.id = er.config_id
    JOIN latest_workflow_runs wr ON wr.id = er.workflow_run_id
    ORDER BY er.date DESC, c.hardware
  `;
  return rows as unknown as EvalRow[];
}
