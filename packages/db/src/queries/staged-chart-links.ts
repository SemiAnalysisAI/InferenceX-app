import type { DbClient } from '../connection.js';

export interface StagedChartScope {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  benchmark_type: string;
  isl: number | null;
  osl: number | null;
  date: string;
}

export async function getStagedChartScopes(
  sql: DbClient,
  githubRunId: string,
): Promise<StagedChartScope[]> {
  const rows = await sql`
    SELECT DISTINCT
      c.model, c.hardware, c.framework, c.precision, c.spec_method, c.disagg,
      br.benchmark_type, br.isl, br.osl, br.date::text
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE wr.github_run_id = ${githubRunId}::bigint
      AND br.error IS NULL
  `;
  return rows as unknown as StagedChartScope[];
}
