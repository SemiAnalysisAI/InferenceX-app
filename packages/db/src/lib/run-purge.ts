import type { Sql } from '../etl/db-utils.js';

export async function purgeRuns(tx: Sql, wrIds: number[]): Promise<void> {
  const resultRows = await tx`
    SELECT id FROM benchmark_results WHERE workflow_run_id = ANY(${wrIds})
  `;
  await purgeBenchmarkResults(
    tx,
    resultRows.map((row) => row.id as number),
  );

  await tx`DELETE FROM run_stats WHERE workflow_run_id = ANY(${wrIds})`;
  await tx`DELETE FROM eval_results WHERE workflow_run_id = ANY(${wrIds})`;
  await tx`DELETE FROM changelog_entries WHERE workflow_run_id = ANY(${wrIds})`;

  await tx`DELETE FROM workflow_runs WHERE id = ANY(${wrIds})`;
}

export async function purgeBenchmarkResults(tx: Sql, resultIds: number[]): Promise<void> {
  if (resultIds.length === 0) return;

  const availKeys = await tx`
    SELECT DISTINCT c.model, br.isl, br.osl, c.precision, c.hardware,
           c.framework, c.spec_method, c.disagg, br.date::text AS date
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    WHERE br.id = ANY(${resultIds})
  `;
  const logRows = await tx`
    SELECT DISTINCT server_log_id AS id FROM benchmark_results
    WHERE id = ANY(${resultIds}) AND server_log_id IS NOT NULL
  `;
  const traceRows = await tx`
    SELECT DISTINCT trace_replay_id AS id FROM benchmark_results
    WHERE id = ANY(${resultIds}) AND trace_replay_id IS NOT NULL
  `;

  await tx`DELETE FROM benchmark_results WHERE id = ANY(${resultIds})`;

  const sIds = logRows.map((r) => r.id as number);
  if (sIds.length > 0) {
    await tx`
      DELETE FROM server_logs
      WHERE id = ANY(${sIds})
        AND NOT EXISTS (
          SELECT 1 FROM benchmark_results br WHERE br.server_log_id = server_logs.id
        )
    `;
  }

  const trIds = traceRows.map((r) => r.id as number);
  if (trIds.length > 0) {
    await tx`
      DELETE FROM agentic_trace_replay
      WHERE id = ANY(${trIds})
        AND NOT EXISTS (
          SELECT 1 FROM benchmark_results br WHERE br.trace_replay_id = agentic_trace_replay.id
        )
    `;
  }

  await deleteStaleAvailability(tx, availKeys);
}

export async function deleteStaleAvailability(
  tx: Sql,
  availKeys: readonly Record<string, unknown>[],
): Promise<void> {
  if (availKeys.length > 0) {
    const models = availKeys.map((r) => r.model as string);
    const isls = availKeys.map((r) => r.isl as number | null);
    const osls = availKeys.map((r) => r.osl as number | null);
    const precisions = availKeys.map((r) => r.precision as string);
    const hardwares = availKeys.map((r) => r.hardware as string);
    const frameworks = availKeys.map((r) => r.framework as string);
    const specMethods = availKeys.map((r) => r.spec_method as string);
    const disaggs = availKeys.map((r) => String(r.disagg));
    const dates = availKeys.map((r) => r.date as string);

    await tx`
      DELETE FROM availability a
      USING (
        SELECT t.model, t.isl::int AS isl, t.osl::int AS osl, t.precision, t.hardware,
               t.framework, t.spec_method, t.disagg::boolean AS disagg, t.date::date AS date
        FROM unnest(
          ${models}::text[], ${isls}::int[], ${osls}::int[],
          ${precisions}::text[], ${hardwares}::text[], ${frameworks}::text[],
          ${specMethods}::text[], ${disaggs}::text[], ${dates}::text[]
        ) AS t(model, isl, osl, precision, hardware, framework, spec_method, disagg, date)
      ) k
      WHERE a.model = k.model
        AND a.isl IS NOT DISTINCT FROM k.isl
        AND a.osl IS NOT DISTINCT FROM k.osl
        AND a.precision = k.precision AND a.hardware = k.hardware
        AND a.framework = k.framework AND a.spec_method = k.spec_method
        AND a.disagg = k.disagg AND a.date = k.date
        AND NOT EXISTS (
          SELECT 1 FROM benchmark_results br
          JOIN configs c ON c.id = br.config_id
          WHERE c.model = a.model
            AND br.isl IS NOT DISTINCT FROM a.isl
            AND br.osl IS NOT DISTINCT FROM a.osl
            AND c.precision = a.precision AND c.hardware = a.hardware
            AND c.framework = a.framework AND c.spec_method = a.spec_method
            AND c.disagg = a.disagg AND br.date = a.date AND br.error IS NULL
        )
    `;
  }
}
