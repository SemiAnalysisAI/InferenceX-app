import type { DbClient } from '../connection.js';

export interface WorkflowRunRow {
  github_run_id: number;
  name: string;
  conclusion: string | null;
  run_attempt: number;
  html_url: string | null;
  created_at: string;
  date: string;
}

export interface ChangelogRow {
  workflow_run_id: number;
  date: string;
  base_ref: string;
  head_ref: string;
  config_keys: string[];
  description: string;
  pr_link: string | null;
}

export interface DateConfigRow {
  model: string;
  isl: number;
  osl: number;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
}

/** Get benchmark workflow runs for a specific date (latest attempt per run, any completed conclusion). */
export async function getWorkflowRunsByDate(
  sql: DbClient,
  date: string,
): Promise<WorkflowRunRow[]> {
  const rows = await sql`
    SELECT github_run_id, name, conclusion, run_attempt, html_url, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at, date::text
    FROM latest_workflow_runs
    WHERE date = ${date}::date
      AND conclusion IS NOT NULL
    ORDER BY created_at ASC
  `;
  return rows as unknown as WorkflowRunRow[];
}

/** Get changelog entries for a set of workflow run DB IDs. */
export async function getChangelogByDate(sql: DbClient, date: string): Promise<ChangelogRow[]> {
  const rows = await sql`
    SELECT
      wr.github_run_id as workflow_run_id,
      cl.date::text,
      cl.base_ref,
      cl.head_ref,
      cl.config_keys,
      cl.description,
      cl.pr_link
    FROM changelog_entries cl
    JOIN latest_workflow_runs wr ON wr.id = cl.workflow_run_id
    WHERE cl.date = ${date}::date
    ORDER BY cl.date DESC
  `;
  return rows as unknown as ChangelogRow[];
}

/** Get distinct model/sequence/precision/hardware combos for a date. */
export async function getDateConfigs(sql: DbClient, date: string): Promise<DateConfigRow[]> {
  const rows = await sql`
    SELECT DISTINCT
      c.model,
      br.isl,
      br.osl,
      c.precision,
      c.hardware,
      c.framework,
      c.spec_method,
      c.disagg
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE br.date = ${date}::date
      AND br.error IS NULL
  `;
  return rows as unknown as DateConfigRow[];
}

export interface AvailabilityRow {
  model: string;
  isl: number;
  osl: number;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  date: string;
}

/** Get available (model, ISL/OSL, precision, hardware, framework, spec_method, date) combos for the availability API. */
export async function getAvailabilityData(sql: DbClient): Promise<AvailabilityRow[]> {
  const rows = await sql`
    SELECT a.model, a.isl, a.osl, a.precision, a.hardware, a.framework, a.spec_method, a.disagg, a.date::text
    FROM availability a
    WHERE EXISTS (
      SELECT 1
      FROM benchmark_results br
      JOIN configs c ON c.id = br.config_id
      JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
      WHERE c.model = a.model
        AND c.hardware = a.hardware
        AND c.framework = a.framework
        AND c.precision = a.precision
        AND br.isl = a.isl
        AND br.osl = a.osl
        AND br.date = a.date
        AND br.error IS NULL
        AND wr.conclusion IS NOT NULL
    )
    ORDER BY a.date ASC
  `;
  return rows as unknown as AvailabilityRow[];
}
