/**
 * Single-row eval result insert.
 */

import type postgres from 'postgres';

type Sql = postgres.Sql;

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
 * Nullable identities reuse the existing row under a per-run transaction lock,
 * since PostgreSQL's ordinary UNIQUE constraint treats NULL values as distinct.
 *
 * @param sql - Active `postgres` connection.
 * @param configId - Resolved `configs.id` for this result.
 * @param p - Eval fields persisted on `eval_results`.
 * @param workflowRunId - DB id of the parent `workflow_runs` row.
 * @param date - ISO date string (`YYYY-MM-DD`) for the `date` column.
 * @returns Outcome (`'new'` or `'dup'`) and the inserted/updated row's `id`,
 *   so the caller can attach related data (e.g. `eval_samples`) to it.
 */
export function ingestEvalRow(
  sql: Sql,
  configId: number,
  p: EvalPersistenceInput,
  workflowRunId: number,
  date: string,
): Promise<{ outcome: 'new' | 'dup'; id: number }> {
  if (p.isl !== null && p.osl !== null && p.conc !== null) {
    return insertEvalRow(sql, configId, p, workflowRunId, date);
  }

  return sql.begin(async (tx) => {
    // Serialize nullable-key writers for this run without changing historical rows.
    await tx`select id from workflow_runs where id = ${workflowRunId} for update`;
    const [existing] = await tx<{ id: number }[]>`
      update eval_results set metrics = ${tx.json(p.metrics)}
      where id = (
        select id from eval_results
        where workflow_run_id = ${workflowRunId} and config_id = ${configId}
          and task = ${p.task}
          and isl is not distinct from ${p.isl}
          and osl is not distinct from ${p.osl}
          and conc is not distinct from ${p.conc}
        order by id limit 1
      )
      returning id
    `;
    if (existing) return { outcome: 'dup' as const, id: existing.id };
    return insertEvalRow(tx, configId, p, workflowRunId, date);
  });
}

async function insertEvalRow(
  sql: Sql | postgres.TransactionSql,
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
