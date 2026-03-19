import type { NeonClient } from '../connection.js';

export interface WorkflowRunRow {
  github_run_id: number;
  name: string;
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

/** Get successful benchmark workflow runs for a specific date. */
export async function getWorkflowRunsByDate(
  sql: NeonClient,
  date: string,
): Promise<WorkflowRunRow[]> {
  const rows = await sql`
    SELECT github_run_id, name, html_url, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at, date::text
    FROM latest_workflow_runs
    WHERE date = ${date}::date
      AND conclusion = 'success'
    ORDER BY created_at DESC
  `;
  return rows as unknown as WorkflowRunRow[];
}

/** Get changelog entries for a set of workflow run DB IDs. */
export async function getChangelogByDate(sql: NeonClient, date: string): Promise<ChangelogRow[]> {
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
export async function getDateConfigs(sql: NeonClient, date: string): Promise<DateConfigRow[]> {
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
export async function getAvailabilityData(sql: NeonClient): Promise<AvailabilityRow[]> {
  const rows = await sql`
    SELECT a.model, a.isl, a.osl, a.precision, a.hardware, a.framework, a.spec_method, a.disagg, a.date::text
    FROM availability a
    WHERE EXISTS (
      SELECT 1 FROM latest_workflow_runs wr
      WHERE wr.date = a.date AND wr.conclusion = 'success'
    )
    ORDER BY a.date ASC
  `;
  return rows as unknown as AvailabilityRow[];
}
