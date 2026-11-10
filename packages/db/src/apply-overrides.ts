import { isDeepStrictEqual } from 'node:util';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils.js';
import { bulkUpsertAvailability } from './etl/benchmark-ingest.js';
import { configCacheKey, createConfigCache } from './etl/config-cache.js';
import { type Sql, createAdminSql } from './etl/db-utils.js';
import { jsonbParam } from './lib/backfill-runner.js';
import { planBenchmarkPointBackfill } from './lib/benchmark-point-backfill.js';
import { selectRunOverrides } from './lib/run-override-selection.js';
import { deleteStaleAvailability, purgeBenchmarkResults, purgeRuns } from './lib/run-purge';
import {
  type BenchmarkPointBackfill,
  type ChangelogBackfill,
  type PurgedBenchmarkPoint,
  type RunFrameworkOverride,
  backfillDesiredConfig,
  rewriteConfigKeyFramework,
  validateRunBackfills,
} from './etl/run-overrides.js';

const {
  runId,
  benchmarks: BENCHMARK_POINT_BACKFILLS,
  changelogs: CHANGELOG_BACKFILLS,
  conclusions: CONCLUSION_OVERRIDES,
  purgedPoints: PURGED_BENCHMARK_POINTS,
  purgedAttempts: PURGED_RUN_ATTEMPTS,
  purgedRuns: PURGED_RUNS,
  frameworks: RUN_FRAMEWORK_OVERRIDES,
} = selectRunOverrides(process.argv.slice(2));

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

interface StaleRow {
  githubRunId: number;
  current: string | null;
  expected: string;
}

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

interface ChangelogBackfillTarget {
  backfill: ChangelogBackfill;
  changelogId: number;
  workflowRunId: number;
}

function changelogBackfillIsApplied(
  row: Record<string, unknown>,
  backfill: ChangelogBackfill,
): boolean {
  const { set } = backfill;
  return (
    (set.configKeys === undefined || isDeepStrictEqual(row.config_keys, [...set.configKeys])) &&
    (set.description === undefined || row.description === set.description) &&
    (set.prLink === undefined || row.pr_link === set.prLink) &&
    (set.appendOnly === undefined ||
      (row.changelog_append_only === set.appendOnly && row.run_append_only === set.appendOnly))
  );
}

async function previewChangelogBackfill(
  backfill: ChangelogBackfill,
): Promise<ChangelogBackfillTarget | null> {
  const rows = await sql`
    SELECT cl.id, cl.workflow_run_id, cl.config_keys, cl.description, cl.pr_link,
           cl.append_only AS changelog_append_only, wr.append_only AS run_append_only
    FROM changelog_entries cl
    JOIN workflow_runs wr ON wr.id = cl.workflow_run_id
    WHERE wr.github_run_id = ${backfill.githubRunId}
      AND wr.run_attempt = ${backfill.runAttempt}
      AND cl.base_ref = ${backfill.baseRef}
      AND cl.head_ref = ${backfill.headRef}
  `;
  if (rows.length !== 1) {
    throw new Error(
      `${backfill.id}: expected exactly one changelog row, found ${rows.length} ` +
        `(run ${backfill.githubRunId} attempt ${backfill.runAttempt}, ` +
        `${backfill.baseRef}..${backfill.headRef})`,
    );
  }
  const [row] = rows;
  console.log(
    `    ${backfill.id}: run ${backfill.githubRunId} attempt ${backfill.runAttempt}, ` +
      `${backfill.baseRef}..${backfill.headRef}`,
  );
  console.log(`      reason: ${backfill.reason}`);
  if (changelogBackfillIsApplied(row, backfill)) {
    console.log('      already applied.');
    return null;
  }
  console.log(`      set ${JSON.stringify(backfill.set)}`);
  return {
    backfill,
    changelogId: row.id as number,
    workflowRunId: row.workflow_run_id as number,
  };
}

async function applyChangelogBackfill(target: ChangelogBackfillTarget): Promise<void> {
  const { backfill, changelogId, workflowRunId } = target;
  await sql.begin(async (_tx) => {
    const tx = _tx as unknown as Sql;
    if (backfill.set.configKeys !== undefined) {
      await tx`
        UPDATE changelog_entries
        SET config_keys = ${[...backfill.set.configKeys]}
        WHERE id = ${changelogId}
      `;
    }
    if (backfill.set.description !== undefined) {
      await tx`
        UPDATE changelog_entries SET description = ${backfill.set.description}
        WHERE id = ${changelogId}
      `;
    }
    if (backfill.set.prLink !== undefined) {
      await tx`
        UPDATE changelog_entries SET pr_link = ${backfill.set.prLink}
        WHERE id = ${changelogId}
      `;
    }
    if (backfill.set.appendOnly !== undefined) {
      await tx`
        UPDATE changelog_entries SET append_only = ${backfill.set.appendOnly}
        WHERE id = ${changelogId}
      `;
      await tx`
        UPDATE workflow_runs SET append_only = ${backfill.set.appendOnly}
        WHERE id = ${workflowRunId}
      `;
    }
  });
  console.log(`    ${backfill.id} patched.`);
}

interface BenchmarkPointBackfillTarget {
  backfill: BenchmarkPointBackfill;
  resultId: number;
  metrics: Record<string, unknown>;
  sourceSpecMethod: string;
  date: string;
}

function benchmarkPointDescription(backfill: BenchmarkPointBackfill): string {
  const auditId =
    backfill.productionConfigId === undefined
      ? `production benchmark id ${backfill.productionBenchmarkId}`
      : `production config id ${backfill.productionConfigId}`;
  return (
    `run ${backfill.githubRunId} attempt ${backfill.runAttempt}, ` +
    `config ${configCacheKey(backfill.config)} (${auditId}), ` +
    `${backfill.benchmarkType}, isl ${backfill.isl}, osl ${backfill.osl}, ` +
    `conc ${backfill.conc}, offload ${backfill.offloadMode}, ` +
    `recipe ${backfill.recipeFingerprint ?? 'legacy'}`
  );
}

async function previewBenchmarkPointBackfill(
  backfill: BenchmarkPointBackfill,
): Promise<BenchmarkPointBackfillTarget | null> {
  const desiredOffloadMode = backfill.set.offloadMode ?? backfill.offloadMode;
  const offloadModes = [...new Set([backfill.offloadMode, desiredOffloadMode])];
  const sourceRecipeFingerprint = backfill.recipeFingerprint ?? null;
  const desiredRecipeFingerprint = backfill.set.recipeFingerprint ?? sourceRecipeFingerprint;
  const { config } = backfill;
  const specMethods = [
    ...new Set([config.specMethod, backfill.set.specMethod ?? config.specMethod]),
  ];
  const rows = await sql`
    SELECT br.id, br.offload_mode, br.recipe_fingerprint, br.metrics, br.date::text AS date,
           c.spec_method
    FROM benchmark_results br
    JOIN workflow_runs wr ON wr.id = br.workflow_run_id
    JOIN configs c ON c.id = br.config_id
    WHERE wr.github_run_id = ${backfill.githubRunId}
      AND wr.run_attempt = ${backfill.runAttempt}
      AND c.hardware = ${config.hardware}
      AND c.framework = ${config.framework}
      AND c.model = ${config.model}
      AND c.precision = ${config.precision}
      AND c.spec_method = ANY(${specMethods})
      AND c.disagg = ${config.disagg}
      AND c.is_multinode = ${config.isMultinode}
      AND c.prefill_tp = ${config.prefillTp}
      AND c.prefill_ep = ${config.prefillEp}
      AND c.prefill_dp_attention = ${config.prefillDpAttn}
      AND c.prefill_num_workers = ${config.prefillNumWorkers}
      AND c.decode_tp = ${config.decodeTp}
      AND c.decode_ep = ${config.decodeEp}
      AND c.decode_dp_attention = ${config.decodeDpAttn}
      AND c.decode_num_workers = ${config.decodeNumWorkers}
      AND c.num_prefill_gpu = ${config.numPrefillGpu}
      AND c.num_decode_gpu = ${config.numDecodeGpu}
      AND br.benchmark_type = ${backfill.benchmarkType}
      AND br.isl IS NOT DISTINCT FROM ${backfill.isl}
      AND br.osl IS NOT DISTINCT FROM ${backfill.osl}
      AND br.conc = ${backfill.conc}
      AND br.offload_mode = ANY(${offloadModes})
      AND (
        br.recipe_fingerprint IS NOT DISTINCT FROM ${sourceRecipeFingerprint}
        OR br.recipe_fingerprint IS NOT DISTINCT FROM ${desiredRecipeFingerprint}
      )
  `;
  if (rows.length !== 1) {
    throw new Error(
      `${backfill.id}: expected exactly one source or desired benchmark row, ` +
        `found ${rows.length} (${benchmarkPointDescription(backfill)})`,
    );
  }
  const [row] = rows;
  console.log(`    ${backfill.id}: ${benchmarkPointDescription(backfill)}`);
  console.log(`      reason: ${backfill.reason}`);
  const metrics = planBenchmarkPointBackfill(
    {
      offload_mode: row.offload_mode,
      recipe_fingerprint: row.recipe_fingerprint,
      spec_method: row.spec_method,
      metrics: row.metrics,
    },
    backfill,
  );
  if (metrics === null) {
    console.log('      already applied.');
    return null;
  }

  if (Array.isArray(row.metrics)) {
    console.log('      repair malformed metrics written by the previous backfill attempt');
  }
  console.log(`      set ${JSON.stringify(backfill.set)}`);
  return {
    backfill,
    resultId: row.id as number,
    metrics,
    sourceSpecMethod: row.spec_method as string,
    date: row.date as string,
  };
}

async function applyBenchmarkPointBackfillToDatabase(
  target: BenchmarkPointBackfillTarget,
): Promise<void> {
  const { backfill, resultId, metrics, sourceSpecMethod, date } = target;
  const desiredOffloadMode = backfill.set.offloadMode ?? backfill.offloadMode;
  const desiredRecipeFingerprint =
    backfill.set.recipeFingerprint ?? backfill.recipeFingerprint ?? null;
  const desiredConfig = backfillDesiredConfig(backfill);
  await sql.begin(async (_tx) => {
    const tx = _tx as unknown as Sql;
    const configId = await createConfigCache(tx).getOrCreateConfig(desiredConfig);
    const [updated] = await tx`
      UPDATE benchmark_results
      SET config_id = ${configId},
          offload_mode = ${desiredOffloadMode},
          recipe_fingerprint = ${desiredRecipeFingerprint},
          metrics = ${jsonbParam(tx, metrics)}
      WHERE id = ${resultId}
      RETURNING id
    `;
    if (!updated) throw new Error(`${backfill.id}: benchmark row disappeared before update`);
    if (sourceSpecMethod === desiredConfig.specMethod) return;
    const availability = {
      model: desiredConfig.model,
      isl: backfill.isl,
      osl: backfill.osl,
      precision: desiredConfig.precision,
      hardware: desiredConfig.hardware,
      framework: desiredConfig.framework,
      disagg: desiredConfig.disagg,
    };
    await bulkUpsertAvailability(
      tx,
      [
        {
          ...availability,
          specMethod: desiredConfig.specMethod,
          benchmarkType: backfill.benchmarkType,
        },
      ],
      date,
    );
    await deleteStaleAvailability(tx, [{ ...availability, spec_method: sourceSpecMethod, date }]);
  });
  console.log(`    ${backfill.id} patched.`);
}

interface RunFrameworkOverrideTarget {
  override: RunFrameworkOverride;
  wrIds: number[];
  configs: { sourceConfigId: number; benchmarkRows: number; evalRows: number }[];
  changelogs: { changelogId: number; configKeys: string[] }[];
}

/**
 * Find every row of the run still stored under the declared framework. Rows are
 * matched per source config so each one moves to the config that differs only in
 * its framework; unique constraints make a collision with an existing destination
 * row fail the transaction instead of merging two points.
 */
async function previewRunFrameworkOverride(
  override: RunFrameworkOverride,
): Promise<RunFrameworkOverrideTarget | null> {
  console.log(`    ${override.id}: run ${override.githubRunId}, ${override.from} → ${override.to}`);
  console.log(`      reason: ${override.reason}`);
  const runs = await sql`
    SELECT id FROM workflow_runs WHERE github_run_id = ${override.githubRunId}
  `;
  if (runs.length === 0) {
    console.log('      run not in DB, skipping.');
    return null;
  }
  const wrIds = runs.map((r) => r.id as number);

  const configRows = await sql`
    SELECT c.id,
      (SELECT count(*)::int FROM benchmark_results br
        WHERE br.config_id = c.id AND br.workflow_run_id = ANY(${wrIds})) AS benchmark_rows,
      (SELECT count(*)::int FROM eval_results er
        WHERE er.config_id = c.id AND er.workflow_run_id = ANY(${wrIds})) AS eval_rows
    FROM configs c
    WHERE c.framework = ${override.from}
      AND (
        EXISTS (SELECT 1 FROM benchmark_results br
          WHERE br.config_id = c.id AND br.workflow_run_id = ANY(${wrIds}))
        OR EXISTS (SELECT 1 FROM eval_results er
          WHERE er.config_id = c.id AND er.workflow_run_id = ANY(${wrIds}))
      )
    ORDER BY c.id
  `;
  const configs = configRows.map((row) => ({
    sourceConfigId: row.id as number,
    benchmarkRows: row.benchmark_rows as number,
    evalRows: row.eval_rows as number,
  }));

  const changelogRows = await sql`
    SELECT id, config_keys FROM changelog_entries WHERE workflow_run_id = ANY(${wrIds}) ORDER BY id
  `;
  const changelogs: RunFrameworkOverrideTarget['changelogs'] = [];
  for (const row of changelogRows) {
    const current = Array.isArray(row.config_keys) ? (row.config_keys as string[]) : [];
    const rewritten = current.map((key) =>
      rewriteConfigKeyFramework(key, override.from, override.to),
    );
    if (!isDeepStrictEqual(current, rewritten)) {
      changelogs.push({ changelogId: row.id as number, configKeys: rewritten });
    }
  }

  if (configs.length === 0 && changelogs.length === 0) {
    const [applied] = await sql`
      SELECT count(*)::int AS n
      FROM benchmark_results br
      JOIN configs c ON c.id = br.config_id
      WHERE br.workflow_run_id = ANY(${wrIds}) AND c.framework = ${override.to}
    `;
    console.log(
      applied.n > 0
        ? `      already applied (${applied.n} benchmark row(s) under ${override.to}).`
        : `      no rows declare ${override.from}; nothing to do.`,
    );
    return null;
  }

  for (const config of configs) {
    console.log(
      `      config ${config.sourceConfigId}: ${config.benchmarkRows} benchmark row(s), ` +
        `${config.evalRows} eval row(s)`,
    );
  }
  for (const changelog of changelogs) {
    console.log(
      `      changelog ${changelog.changelogId}: ${JSON.stringify(changelog.configKeys)}`,
    );
  }
  return { override, wrIds, configs, changelogs };
}

async function applyRunFrameworkOverride(target: RunFrameworkOverrideTarget): Promise<void> {
  const { override, wrIds, configs, changelogs } = target;
  await sql.begin(async (_tx) => {
    const tx = _tx as unknown as Sql;
    for (const { sourceConfigId } of configs) {
      const [destination] = await tx`
        INSERT INTO configs (
          hardware, framework, model, precision, spec_method,
          disagg, is_multinode,
          prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
          decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
          num_prefill_gpu, num_decode_gpu
        )
        SELECT hardware, ${override.to}, model, precision, spec_method,
          disagg, is_multinode,
          prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
          decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
          num_prefill_gpu, num_decode_gpu
        FROM configs WHERE id = ${sourceConfigId}
        ON CONFLICT (
          hardware, framework, model, precision, spec_method,
          disagg, is_multinode,
          prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
          decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
          num_prefill_gpu, num_decode_gpu
        )
        DO UPDATE SET hardware = excluded.hardware
        RETURNING id
      `;
      if (!destination) {
        throw new Error(`${override.id}: config ${sourceConfigId} disappeared before update`);
      }
      const destinationConfigId = destination.id as number;
      await tx`
        UPDATE benchmark_results SET config_id = ${destinationConfigId}
        WHERE config_id = ${sourceConfigId} AND workflow_run_id = ANY(${wrIds})
      `;
      await tx`
        UPDATE eval_results SET config_id = ${destinationConfigId}
        WHERE config_id = ${sourceConfigId} AND workflow_run_id = ANY(${wrIds})
      `;
      console.log(`    config ${sourceConfigId} → ${destinationConfigId}`);
    }

    await tx`
      INSERT INTO availability (
        model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date
      )
      SELECT DISTINCT c.model, br.isl, br.osl, c.precision, c.hardware, c.framework,
        c.spec_method, c.disagg, br.benchmark_type, br.date
      FROM benchmark_results br
      JOIN configs c ON c.id = br.config_id
      WHERE br.workflow_run_id = ANY(${wrIds}) AND br.error IS NULL
        AND c.framework = ${override.to}
      ON CONFLICT DO NOTHING
    `;
    await tx`
      DELETE FROM availability a
      WHERE a.framework = ${override.from}
        AND EXISTS (
          SELECT 1 FROM benchmark_results br
          JOIN configs c ON c.id = br.config_id
          WHERE br.workflow_run_id = ANY(${wrIds})
            AND c.model = a.model AND c.precision = a.precision AND c.hardware = a.hardware
            AND c.spec_method = a.spec_method AND c.disagg = a.disagg
            AND br.isl IS NOT DISTINCT FROM a.isl AND br.osl IS NOT DISTINCT FROM a.osl
            AND br.benchmark_type = a.benchmark_type AND br.date = a.date
        )
        AND NOT EXISTS (
          SELECT 1 FROM benchmark_results br
          JOIN configs c ON c.id = br.config_id
          WHERE c.model = a.model
            AND br.isl IS NOT DISTINCT FROM a.isl
            AND br.osl IS NOT DISTINCT FROM a.osl
            AND c.precision = a.precision AND c.hardware = a.hardware
            AND c.framework = a.framework AND c.spec_method = a.spec_method
            AND c.disagg = a.disagg AND br.benchmark_type = a.benchmark_type
            AND br.date = a.date AND br.error IS NULL
        )
    `;

    for (const { changelogId, configKeys } of changelogs) {
      await tx`
        UPDATE changelog_entries SET config_keys = ${configKeys} WHERE id = ${changelogId}
      `;
    }
  });
  console.log(`    ${override.id} applied.`);
}

interface PurgeTarget {
  githubRunId: number;
  wrIds: number[];
  bmk: number;
  logs: number;
  stats: number;
  evals: number;
  changelogs: number;
}

async function previewPurge(
  githubRunId: number,
  attempts?: ReadonlySet<number>,
): Promise<PurgeTarget | null> {
  const runs = attempts
    ? await sql`
        SELECT id, run_attempt, date::text AS date, name, conclusion
        FROM workflow_runs
        WHERE github_run_id = ${githubRunId}
          AND run_attempt = ANY(${[...attempts]})
        ORDER BY run_attempt
      `
    : await sql`
        SELECT id, run_attempt, date::text AS date, name, conclusion
        FROM workflow_runs
        WHERE github_run_id = ${githubRunId}
        ORDER BY run_attempt
      `;
  if (runs.length === 0) {
    const suffix = attempts ? ` attempts ${[...attempts].toSorted().join(',')}` : '';
    console.log(`  ${githubRunId}${suffix} — not in DB, skipping.`);
    return null;
  }

  const wrIds = runs.map((r) => r.id as number);
  const header = attempts
    ? `${githubRunId} (attempts ${runs.map((r) => r.run_attempt).join(',')})`
    : `${githubRunId}`;
  console.log(`  ${header}`);
  for (const r of runs) {
    const shortName = r.name.split('\n')[0].slice(0, 80);
    console.log(
      `    attempt ${r.run_attempt} | ${r.date} | ${shortName} | ${r.conclusion ?? 'null'}`,
    );
  }

  const [[bmk], [stats], [evals], [changelogs], [logs], [telemetry]] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM benchmark_results WHERE workflow_run_id = ANY(${wrIds})`,
    sql`SELECT count(*)::int AS n FROM run_stats WHERE workflow_run_id = ANY(${wrIds})`,
    sql`SELECT count(*)::int AS n FROM eval_results WHERE workflow_run_id = ANY(${wrIds})`,
    sql`SELECT count(*)::int AS n FROM changelog_entries WHERE workflow_run_id = ANY(${wrIds})`,
    sql`SELECT count(DISTINCT server_log_id)::int AS n FROM benchmark_results WHERE workflow_run_id = ANY(${wrIds}) AND server_log_id IS NOT NULL`,
    sql`
      SELECT count(*)::int AS series, coalesce(sum(sample_count), 0)::bigint AS samples,
        (SELECT count(*)::int FROM benchmark_result_gpu_metrics l
          JOIN gpu_metric_series ls ON ls.id = l.series_id
          WHERE ls.workflow_run_id = ANY(${wrIds})) AS links
      FROM gpu_metric_series WHERE workflow_run_id = ANY(${wrIds})
    `,
  ]);

  console.log(
    `    ${bmk.n} benchmarks, ${logs.n} server_logs, ${stats.n} run_stats, ${evals.n} evals, ${changelogs.n} changelogs`,
  );
  if (telemetry.series > 0)
    console.log(
      `    ${telemetry.series} gpu_metric_series (${Number(telemetry.samples).toLocaleString('en-US')} samples, ${telemetry.links} point links)`,
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

async function purge(wrIds: number[]): Promise<void> {
  await sql.begin((tx) => purgeRuns(tx as unknown as Sql, wrIds));

  console.log(`    deleted.`);
}

interface BenchmarkPointPurgeTarget {
  resultIds: number[];
}

async function previewBenchmarkPointPurge(
  point: PurgedBenchmarkPoint,
): Promise<BenchmarkPointPurgeTarget | null> {
  console.log(`  ${point.githubRunId} (attempt ${point.runAttempt})`);
  const rows = await sql`
    SELECT br.id,
      (SELECT count(*)::int FROM benchmark_result_gpu_metrics l
        WHERE l.benchmark_result_id = br.id) AS telemetry_links
    FROM benchmark_results br
    JOIN workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE wr.github_run_id = ${point.githubRunId}
      AND wr.run_attempt = ${point.runAttempt}
      AND br.config_id = ${point.configId}
      AND br.benchmark_type = ${point.benchmarkType}
      AND br.isl IS NOT DISTINCT FROM ${point.isl}
      AND br.osl IS NOT DISTINCT FROM ${point.osl}
      AND br.conc = ${point.conc}
      AND br.offload_mode = ${point.offloadMode}
      AND br.recipe_fingerprint IS NOT DISTINCT FROM ${point.recipeFingerprint ?? null}
  `;
  const description =
    `config ${point.configId}, ${point.benchmarkType}, isl ${point.isl}, ` +
    `osl ${point.osl}, conc ${point.conc}, offload ${point.offloadMode}, ` +
    `recipe ${point.recipeFingerprint ?? 'legacy'}`;
  if (rows.length === 0) {
    console.log(`    ${description}, not in DB, skipping.`);
    return null;
  }
  console.log(`    ${description}, ${rows.length} benchmark row(s).`);
  const links = rows.reduce((sum, row) => sum + (row.telemetry_links as number), 0);
  if (links > 0)
    console.log(`    removes ${links} gpu_metric_series link(s); the series stay with the run.`);
  return { resultIds: rows.map((row) => row.id as number) };
}

async function purgeBenchmarkPoints(resultIds: number[]): Promise<void> {
  await sql.begin(async (_tx) => {
    await purgeBenchmarkResults(_tx as unknown as Sql, resultIds);
  });
  console.log(`    deleted ${resultIds.length} benchmark point(s).`);
}

async function main(): Promise<void> {
  validateRunBackfills();
  console.log('=== apply-overrides ===');
  if (runId !== undefined) console.log(`  Scoped to GitHub run ${runId}`);

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

  const changelogBackfillTargets: ChangelogBackfillTarget[] = [];
  if (CHANGELOG_BACKFILLS.length > 0) {
    console.log(`\n  Changelog backfills (${CHANGELOG_BACKFILLS.length}):`);
    for (const backfill of CHANGELOG_BACKFILLS) {
      const target = await previewChangelogBackfill(backfill);
      if (target) changelogBackfillTargets.push(target);
    }
  } else {
    console.log('\n  Changelog backfills: none registered.');
  }
  if (changelogBackfillTargets.length > 0) hasWork = true;

  const benchmarkPointBackfillTargets: BenchmarkPointBackfillTarget[] = [];
  if (BENCHMARK_POINT_BACKFILLS.length > 0) {
    console.log(`\n  Benchmark point backfills (${BENCHMARK_POINT_BACKFILLS.length}):`);
    for (const backfill of BENCHMARK_POINT_BACKFILLS) {
      const target = await previewBenchmarkPointBackfill(backfill);
      if (target) benchmarkPointBackfillTargets.push(target);
    }
  } else {
    console.log('\n  Benchmark point backfills: none registered.');
  }
  if (benchmarkPointBackfillTargets.length > 0) hasWork = true;

  const frameworkOverrideTargets: RunFrameworkOverrideTarget[] = [];
  if (RUN_FRAMEWORK_OVERRIDES.length > 0) {
    console.log(`\n  Run framework overrides (${RUN_FRAMEWORK_OVERRIDES.length}):`);
    for (const override of RUN_FRAMEWORK_OVERRIDES) {
      const target = await previewRunFrameworkOverride(override);
      if (target) frameworkOverrideTargets.push(target);
    }
  } else {
    console.log('\n  Run framework overrides: none registered.');
  }
  if (frameworkOverrideTargets.length > 0) hasWork = true;

  const purgeTargets = [...PURGED_RUNS];
  const found: PurgeTarget[] = [];
  if (purgeTargets.length > 0) {
    console.log(`\n  Purge targets (${purgeTargets.length}):`);
    for (const id of purgeTargets) {
      const result = await previewPurge(id);
      if (result) found.push(result);
    }
  }

  const attemptTargets = [...PURGED_RUN_ATTEMPTS.entries()];
  if (attemptTargets.length > 0) {
    console.log(`\n  Purge attempt targets (${attemptTargets.length}):`);
    for (const [id, attempts] of attemptTargets) {
      if (PURGED_RUNS.has(id)) {
        console.log(`  ${id} — already in PURGED_RUNS, skipping per-attempt purge.`);
        continue;
      }
      const result = await previewPurge(id, attempts);
      if (result) found.push(result);
    }
  }
  if (found.length > 0) hasWork = true;

  const pointTargets: BenchmarkPointPurgeTarget[] = [];
  if (PURGED_BENCHMARK_POINTS.length > 0) {
    console.log(`\n  Benchmark point purge targets (${PURGED_BENCHMARK_POINTS.length}):`);
    for (const point of PURGED_BENCHMARK_POINTS) {
      if (PURGED_RUNS.has(point.githubRunId)) {
        console.log(`  ${point.githubRunId}, already in PURGED_RUNS, skipping point purge.`);
        continue;
      }
      if (PURGED_RUN_ATTEMPTS.get(point.githubRunId)?.has(point.runAttempt)) {
        console.log(
          `  ${point.githubRunId} attempt ${point.runAttempt}, already purged, skipping point purge.`,
        );
        continue;
      }
      const result = await previewBenchmarkPointPurge(point);
      if (result) pointTargets.push(result);
    }
  }
  if (pointTargets.length > 0) hasWork = true;

  if (!hasWork) {
    console.log('\n  Nothing to do.');
    return;
  }

  if (!hasYesFlag()) {
    const ok = await confirm('\nApply changes? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  if (stale.length > 0) {
    console.log('\n  Patching conclusions...');
    await applyConclusions(stale);
  }

  if (changelogBackfillTargets.length > 0) {
    console.log('\n  Patching changelogs...');
    for (const target of changelogBackfillTargets) {
      await applyChangelogBackfill(target);
    }
  }

  if (benchmarkPointBackfillTargets.length > 0) {
    console.log('\n  Patching benchmark points...');
    for (const target of benchmarkPointBackfillTargets) {
      await applyBenchmarkPointBackfillToDatabase(target);
    }
  }

  if (frameworkOverrideTargets.length > 0) {
    console.log('\n  Reassigning run frameworks...');
    for (const target of frameworkOverrideTargets) {
      await applyRunFrameworkOverride(target);
    }
  }

  if (found.length > 0) {
    console.log('\n  Purging runs...');
    for (const { wrIds } of found) {
      await purge(wrIds);
    }
  }

  if (pointTargets.length > 0) {
    console.log('\n  Purging benchmark points...');
    for (const { resultIds } of pointTargets) {
      await purgeBenchmarkPoints(resultIds);
    }
  }
  for (const override of RUN_FRAMEWORK_OVERRIDES) {
    const staleTarget = await previewRunFrameworkOverride(override);
    if (staleTarget) throw new Error(`${override.id}: run framework verification failed`);
  }

  for (const backfill of CHANGELOG_BACKFILLS) {
    const staleTarget = await previewChangelogBackfill(backfill);
    if (staleTarget) throw new Error(`${backfill.id}: changelog verification failed`);
  }
  for (const backfill of BENCHMARK_POINT_BACKFILLS) {
    const staleTarget = await previewBenchmarkPointBackfill(backfill);
    if (staleTarget) throw new Error(`${backfill.id}: benchmark point verification failed`);
  }

  console.log('\n=== apply-overrides complete ===');
  console.log('  Manual runs: invalidate the API cache with bun run admin:cache:invalidate');
  console.log('  Merged run-overrides changes: production cache refresh is handled by CI.');
}

main()
  .catch((error) => {
    console.error('apply-overrides failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
