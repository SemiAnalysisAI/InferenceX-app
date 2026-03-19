import type { NeonClient } from '../connection.js';

export interface ReliabilityRow {
  hardware: string;
  date: string;
  n_success: number;
  total: number;
}

/** Get all run_stats rows for reliability aggregation (latest attempt only). */
export async function getReliabilityStats(sql: NeonClient): Promise<ReliabilityRow[]> {
  const rows = await sql`
    SELECT rs.hardware, rs.date::text, rs.n_success, rs.total
    FROM run_stats rs
    JOIN latest_workflow_runs wr ON wr.id = rs.workflow_run_id
    ORDER BY rs.date DESC
  `;
  return rows as unknown as ReliabilityRow[];
}
