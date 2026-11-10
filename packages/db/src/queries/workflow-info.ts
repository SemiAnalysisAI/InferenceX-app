import type { DbClient } from '../connection.js';
import { mergeDistinctRows } from '../lib/distinct-by.js';
import { mergeWorkflowRuns } from './across-dbs.js';

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
  append_only: boolean;
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
      cl.pr_link,
      cl.append_only
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
export async function getRunConfigsByDate(
  sql: DbClient,
  date: string,
  benchmarkType?: 'agentic_traces',
): Promise<RunConfigRow[]> {
  const benchmarkTypeFilter = benchmarkType ? sql`AND br.benchmark_type = ${benchmarkType}` : sql``;
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
      ${benchmarkTypeFilter}
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

export async function getAvailabilityData(sql: DbClient): Promise<AvailabilityRow[]> {
  const [document] = await sql`
    SELECT '[' || coalesce(string_agg(rows, ',' ORDER BY date), '') || ']' AS rows
    FROM published_availability_dates
  `;
  return JSON.parse(String(document.rows)) as AvailabilityRow[];
}

export interface DateChangelogBundle {
  date: string;
  runs: WorkflowRunRow[];
  changelogs: ChangelogRow[];
  runConfigs: RunConfigRow[];
}

export async function getChangelogDatesInRange(
  sql: DbClient | readonly DbClient[],
  from: string,
  to: string,
  benchmarkType?: 'agentic_traces',
): Promise<DateChangelogBundle[]> {
  const dbs = typeof sql === 'function' ? [sql] : sql;
  const changelogParts = (await Promise.all(
    dbs.map(
      (db) => db`
        SELECT
          wr.github_run_id as workflow_run_id,
          cl.date::text,
          cl.base_ref,
          cl.head_ref,
          cl.config_keys,
          cl.description,
          cl.pr_link,
          cl.append_only
        FROM changelog_entries cl
        JOIN latest_workflow_runs wr ON wr.id = cl.workflow_run_id
        WHERE cl.date BETWEEN ${from}::date AND ${to}::date
        ORDER BY cl.date ASC
      `,
    ),
  )) as unknown as ChangelogRow[][];
  const changelogs =
    changelogParts.length === 1
      ? changelogParts[0]!
      : changelogParts.flat().toSorted((a, b) => a.date.localeCompare(b.date));
  if (changelogs.length === 0) return [];

  const byDate = new Map<string, DateChangelogBundle>();
  for (const row of changelogs) {
    let bundle = byDate.get(row.date);
    if (!bundle) {
      bundle = { date: row.date, runs: [], changelogs: [], runConfigs: [] };
      byDate.set(row.date, bundle);
    }
    bundle.changelogs.push(row);
  }
  const dates = [...byDate.keys()];

  const perDb = await Promise.all(
    dbs.map((db) => {
      const benchmarkTypeFilter = benchmarkType
        ? db`AND br.benchmark_type = ${benchmarkType}`
        : db``;
      return Promise.all([
        db`
          SELECT github_run_id, name, conclusion, run_attempt, html_url, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at, date::text
          FROM latest_workflow_runs
          WHERE date = ANY(${dates}::date[])
            AND conclusion IS NOT NULL
          ORDER BY date ASC, created_at ASC, github_run_id ASC
        `,
        db`
          SELECT DISTINCT
            br.date::text as date,
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
          WHERE br.date = ANY(${dates}::date[])
            AND br.error IS NULL
            ${benchmarkTypeFilter}
        `,
      ]);
    }),
  );
  const runs = mergeWorkflowRuns(perDb.map(([rows]) => rows as unknown as WorkflowRunRow[]));
  const runConfigs = mergeDistinctRows(
    perDb.map(([, rows]) => rows as unknown as (RunConfigRow & { date: string })[]),
  );
  for (const row of runs) byDate.get(row.date)?.runs.push(row);
  for (const { date, ...row } of runConfigs) byDate.get(date)?.runConfigs.push(row);
  return dates.map((date) => byDate.get(date)!);
}
