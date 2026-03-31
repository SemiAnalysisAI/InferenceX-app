/**
 * Enforce all run-overrides.ts entries against the DB:
 *   1. Patch conclusions for CONCLUSION_OVERRIDES
 *   2. Purge runs listed in PURGED_RUNS
 *
 * Previews changes (read-only), then confirms before writing.
 *
 * Usage:
 *   pnpm db:apply-overrides            # preview + confirm
 *   pnpm db:apply-overrides --yes      # skip confirmation
 */

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils.js';
import { type Sql, createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { CONCLUSION_OVERRIDES, PURGED_RUNS } from './etl/run-overrides.js';

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

// ── Conclusion overrides ──────────────────────────────────────────────────────

interface StaleRow {
  githubRunId: number;
  current: string | null;
  expected: string;
}

/** Find runs whose conclusion doesn't match CONCLUSION_OVERRIDES. */
async function previewConclusions(): Promise<StaleRow[]> {
  if (CONCLUSION_OVERRIDES.size === 0) return [];

  const ids = [...CONCLUSION_OVERRIDES.keys()];
  const rows = await sql`
    SELECT github_run_id, conclusion
    FROM workflow_runs
    WHERE github_run_id = ANY(${ids})
  `;

  const stale: StaleRow[] = [];
  for (const r of rows) {
    const expected = CONCLUSION_OVERRIDES.get(Number(r.github_run_id));
    if (expected && r.conclusion !== expected) {
      stale.push({
        githubRunId: r.github_run_id as number,
        current: r.conclusion as string | null,
        expected,
      });
    }
  }
  return stale;
}

async function applyConclusions(stale: StaleRow[]): Promise<void> {
  for (const { githubRunId, expected } of stale) {
    await sql`
      UPDATE workflow_runs SET conclusion = ${expected}
      WHERE github_run_id = ${githubRunId}
    `;
    console.log(`    ${githubRunId} → ${expected}`);
  }
}

// ── Purge ─────────────────────────────────────────────────────────────────────

interface PurgeTarget {
  githubRunId: number;
  wrIds: number[];
  bmk: number;
  logs: number;
  stats: number;
  evals: number;
  changelogs: number;
}

/** Preview a run: print metadata and row counts. Returns null if not in DB. */
async function previewPurge(githubRunId: number): Promise<PurgeTarget | null> {
  const runs = await sql`
    SELECT id, run_attempt, date::text AS date, name, conclusion
    FROM workflow_runs
    WHERE github_run_id = ${githubRunId}
    ORDER BY run_attempt
  `;
  if (runs.length === 0) {
    console.log(`  ${githubRunId} — not in DB, skipping.`);
    return null;
  }

  const wrIds = runs.map((r) => r.id as number);
  console.log(`  ${githubRunId}`);
  for (const r of runs) {
    const shortName = r.name.split('\n')[0].slice(0, 80);
    console.log(
      `    attempt ${r.run_attempt} | ${r.date} | ${shortName} | ${r.conclusion ?? 'null'}`,
    );
  }

  const [[bmk], [stats], [evals], [changelogs], [logs]] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM benchmark_results WHERE workflow_run_id = ANY(${wrIds})`,
    sql`SELECT count(*)::int AS n FROM run_stats WHERE workflow_run_id = ANY(${wrIds})`,
    sql`SELECT count(*)::int AS n FROM eval_results WHERE workflow_run_id = ANY(${wrIds})`,
    sql`SELECT count(*)::int AS n FROM changelog_entries WHERE workflow_run_id = ANY(${wrIds})`,
    sql`SELECT count(DISTINCT server_log_id)::int AS n FROM benchmark_results WHERE workflow_run_id = ANY(${wrIds}) AND server_log_id IS NOT NULL`,
  ]);

  console.log(
    `    ${bmk.n} benchmarks, ${logs.n} server_logs, ${stats.n} run_stats, ${evals.n} evals, ${changelogs.n} changelogs`,
  );

  return {
    githubRunId,
    wrIds,
    bmk: bmk.n,
    logs: logs.n,
    stats: stats.n,
    evals: evals.n,
    changelogs: changelogs.n,
  };
}

/** Delete all data for a run within a transaction. */
async function purge(githubRunId: number, wrIds: number[]): Promise<void> {
  // postgres TransactionSql Omit drops the call signature — cast to Sql type
  await sql.begin(async (_tx) => {
    const tx = _tx as unknown as Sql;

    // Capture availability keys + server_log_ids before deleting benchmarks
    const availKeys = await tx`
      SELECT DISTINCT c.model, br.isl, br.osl, c.precision, c.hardware,
             c.framework, c.spec_method, c.disagg, br.date::text AS date
      FROM benchmark_results br
      JOIN configs c ON c.id = br.config_id
      WHERE br.workflow_run_id = ANY(${wrIds})
    `;
    const logRows = await tx`
      SELECT DISTINCT server_log_id AS id FROM benchmark_results
      WHERE workflow_run_id = ANY(${wrIds}) AND server_log_id IS NOT NULL
    `;

    // Children first
    await tx`DELETE FROM benchmark_results WHERE workflow_run_id = ANY(${wrIds})`;
    await tx`DELETE FROM run_stats WHERE workflow_run_id = ANY(${wrIds})`;
    await tx`DELETE FROM eval_results WHERE workflow_run_id = ANY(${wrIds})`;
    await tx`DELETE FROM changelog_entries WHERE workflow_run_id = ANY(${wrIds})`;

    // Orphaned server_logs
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

    // Orphaned availability rows
    if (availKeys.length > 0) {
      const models = availKeys.map((r) => r.model as string);
      const isls = availKeys.map((r) => r.isl as number);
      const osls = availKeys.map((r) => r.osl as number);
      const precisions = availKeys.map((r) => r.precision as string);
      const hardwares = availKeys.map((r) => r.hardware as string);
      const frameworks = availKeys.map((r) => r.framework as string);
      const specMethods = availKeys.map((r) => r.spec_method as string);
      const disaggs = availKeys.map((r) => String(r.disagg));
      const dates = availKeys.map((r) => r.date as string);

      await tx`
        DELETE FROM availability a
        WHERE (a.model, a.isl, a.osl, a.precision, a.hardware, a.framework, a.spec_method, a.disagg, a.date)
          IN (
            SELECT t.model, t.isl::int, t.osl::int, t.precision, t.hardware,
                   t.framework, t.spec_method, t.disagg::boolean, t.date::date
            FROM unnest(
              ${models}::text[], ${isls}::int[], ${osls}::int[],
              ${precisions}::text[], ${hardwares}::text[], ${frameworks}::text[],
              ${specMethods}::text[], ${disaggs}::text[], ${dates}::text[]
            ) AS t(model, isl, osl, precision, hardware, framework, spec_method, disagg, date)
          )
          AND NOT EXISTS (
            SELECT 1 FROM benchmark_results br
            JOIN configs c ON c.id = br.config_id
            WHERE c.model = a.model AND br.isl = a.isl AND br.osl = a.osl
              AND c.precision = a.precision AND c.hardware = a.hardware
              AND c.framework = a.framework AND c.spec_method = a.spec_method
              AND c.disagg = a.disagg AND br.date = a.date AND br.error IS NULL
          )
      `;
    }

    // Parent last
    await tx`DELETE FROM workflow_runs WHERE github_run_id = ${githubRunId}`;
  });

  console.log(`    deleted.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== apply-overrides ===');

  // Phase 1: preview (read-only)
  let hasWork = false;

  const stale = await previewConclusions();
  if (stale.length > 0) {
    hasWork = true;
    console.log(`\n  Conclusion overrides (${stale.length}):`);
    for (const { githubRunId, current, expected } of stale) {
      console.log(`    ${githubRunId}: ${current ?? 'null'} → ${expected}`);
    }
  } else {
    console.log('\n  Conclusions: all up to date.');
  }

  const purgeTargets = [...PURGED_RUNS];
  const found: PurgeTarget[] = [];
  if (purgeTargets.length > 0) {
    console.log(`\n  Purge targets (${purgeTargets.length}):`);
    for (const id of purgeTargets) {
      const result = await previewPurge(id);
      if (result) found.push(result);
    }
  }
  if (found.length > 0) hasWork = true;

  if (!hasWork) {
    console.log('\n  Nothing to do.');
    return;
  }

  // Phase 2: confirm before writes
  if (!hasYesFlag()) {
    const ok = await confirm('\nApply changes? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  // Phase 3: apply
  if (stale.length > 0) {
    console.log('\n  Patching conclusions...');
    await applyConclusions(stale);
  }

  if (found.length > 0) {
    console.log('\n  Purging runs...');
    for (const { githubRunId, wrIds } of found) {
      await purge(githubRunId, wrIds);
    }
  }

  // Phase 4: refresh mat view
  await refreshLatestBenchmarks(sql);

  console.log('\n=== apply-overrides complete ===');
  console.log('  Invalidate API cache: pnpm admin:cache:invalidate');
}

main()
  .catch((err) => {
    console.error('apply-overrides failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
