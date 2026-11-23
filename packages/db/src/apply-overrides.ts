import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import { validateRunBackfills } from './etl/run-overrides.js';
import {
  type BenchmarkPointBackfillTarget,
  type BenchmarkPointPurgeTarget,
  type ChangelogBackfillTarget,
  type PurgeTarget,
  type RunFrameworkOverrideTarget,
  applyBenchmarkPointBackfillToDatabase,
  applyChangelogBackfill,
  applyConclusions,
  applyRunFrameworkOverride,
  previewBenchmarkPointBackfill,
  previewBenchmarkPointPurge,
  previewChangelogBackfill,
  previewConclusions,
  previewPurge,
  previewRunFrameworkOverride,
  purgeBenchmarkPoints,
  purgeWorkflowRuns,
} from './lib/run-override-actions.js';
import { selectRunOverrides } from './lib/run-override-selection.js';

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

async function main(): Promise<void> {
  validateRunBackfills();
  console.log('=== apply-overrides ===');
  if (runId !== undefined) console.log(`  Scoped to GitHub run ${runId}`);

  let hasWork = false;

  const stale = await previewConclusions(sql, CONCLUSION_OVERRIDES);
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
      const target = await previewChangelogBackfill(sql, backfill);
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
      const target = await previewBenchmarkPointBackfill(sql, backfill);
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
      const target = await previewRunFrameworkOverride(sql, override);
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
      const result = await previewPurge(sql, id);
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
      const result = await previewPurge(sql, id, attempts);
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
      const result = await previewBenchmarkPointPurge(sql, point);
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
    await applyConclusions(sql, stale);
  }

  if (changelogBackfillTargets.length > 0) {
    console.log('\n  Patching changelogs...');
    for (const target of changelogBackfillTargets) {
      await applyChangelogBackfill(sql, target);
    }
  }

  if (benchmarkPointBackfillTargets.length > 0) {
    console.log('\n  Patching benchmark points...');
    for (const target of benchmarkPointBackfillTargets) {
      await applyBenchmarkPointBackfillToDatabase(sql, target);
    }
  }

  if (frameworkOverrideTargets.length > 0) {
    console.log('\n  Reassigning run frameworks...');
    for (const target of frameworkOverrideTargets) {
      await applyRunFrameworkOverride(sql, target);
    }
  }

  if (found.length > 0) {
    console.log('\n  Purging runs...');
    for (const { wrIds } of found) {
      await purgeWorkflowRuns(sql, wrIds);
    }
  }

  if (pointTargets.length > 0) {
    console.log('\n  Purging benchmark points...');
    for (const { resultIds } of pointTargets) {
      await purgeBenchmarkPoints(sql, resultIds);
    }
  }
  for (const override of RUN_FRAMEWORK_OVERRIDES) {
    const staleTarget = await previewRunFrameworkOverride(sql, override);
    if (staleTarget) throw new Error(`${override.id}: run framework verification failed`);
  }

  for (const backfill of CHANGELOG_BACKFILLS) {
    const staleTarget = await previewChangelogBackfill(sql, backfill);
    if (staleTarget) throw new Error(`${backfill.id}: changelog verification failed`);
  }
  for (const backfill of BENCHMARK_POINT_BACKFILLS) {
    const staleTarget = await previewBenchmarkPointBackfill(sql, backfill);
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
