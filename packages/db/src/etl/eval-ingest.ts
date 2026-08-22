/**
 * Single-row eval result insert.
 */

import type postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

export interface EvalPersistenceInput {
  task: string;
  isl: number | null;
  osl: number | null;
  conc: number | null;
  lmEvalVersion: string | null;
  metrics: Record<string, number>;
}

/**
 * Insert a single `eval_results` row for an already resolved config id.
 * On conflict `(workflow_run_id, config_id, task, isl, osl, conc)` the metrics
 * are overwritten with the latest values.
 *
 * @param sql - Active `postgres` connection.
 * @param configId - Resolved `configs.id` for this result.
 * @param p - Eval fields persisted on `eval_results`.
 * @param workflowRunId - DB id of the parent `workflow_runs` row.
 * @param date - ISO date string (`YYYY-MM-DD`) for the `date` column.
 * @returns Outcome (`'new'` or `'dup'`) and the inserted/updated row's `id`,
 *   so the caller can attach related data (e.g. `eval_samples`) to it.
 */
export async function ingestEvalRow(
  sql: Sql,
  configId: number,
  p: EvalPersistenceInput,
  workflowRunId: number,
  date: string,
): Promise<{ outcome: 'new' | 'dup'; id: number }> {
  const [row] = await sql<{ inserted: boolean; id: number }[]>`
    insert into eval_results (
      workflow_run_id, config_id, task, date,
      isl, osl, conc, lm_eval_version, metrics
    ) values (
      ${workflowRunId}, ${configId}, ${p.task}, ${date},
      ${p.isl}, ${p.osl}, ${p.conc}, ${p.lmEvalVersion},
      ${sql.json(p.metrics)}
    )
    on conflict (workflow_run_id, config_id, task, isl, osl, conc)
    do update set metrics = excluded.metrics
    returning id, (xmax = 0) as inserted
  `;
  return { outcome: row.inserted ? 'new' : 'dup', id: row.id };
}
