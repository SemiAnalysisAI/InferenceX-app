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

export interface RunConfigRow {
  github_run_id: number;
  run_started_at: string | null;
  html_url: string | null;
  head_sha: string | null;
  model: string;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
}

/**
 * Per-(run, config) coverage for a date: which workflow runs produced benchmark
 * data for which configs. Data-driven (joins benchmark_results) so a run that
 * shipped data without a changelog entry still surfaces — the comparison UI uses
 * this to enumerate every run on a date, not just runs with changelog notes.
 */
export async function getRunConfigsByDate(sql: DbClient, date: string): Promise<RunConfigRow[]> {
  const rows = await sql`
    SELECT DISTINCT
      wr.github_run_id,
      to_char(COALESCE(wr.run_started_at, wr.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as run_started_at,
      wr.html_url,
      wr.head_sha,
      c.model,
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
  return rows as unknown as RunConfigRow[];
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
  // Null for agentic_traces rows; numeric for single_turn fixed-seq rows.
  isl: number | null;
  osl: number | null;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  benchmark_type: string;
  date: string;
}

/** Get available (model, ISL/OSL, precision, hardware, framework, spec_method, benchmark_type, date) combos for the availability API. */
export async function getAvailabilityData(sql: DbClient): Promise<AvailabilityRow[]> {
  const rows = await sql`
    SELECT a.model, a.isl, a.osl, a.precision, a.hardware, a.framework, a.spec_method, a.disagg, a.benchmark_type, a.date::text
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
        AND br.isl IS NOT DISTINCT FROM a.isl
        AND br.osl IS NOT DISTINCT FROM a.osl
        AND br.benchmark_type = a.benchmark_type
        AND br.date = a.date
        AND br.error IS NULL
        AND wr.conclusion IS NOT NULL
    )
    ORDER BY a.date ASC
  `;
  return rows as unknown as AvailabilityRow[];
}
