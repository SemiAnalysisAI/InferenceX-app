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
