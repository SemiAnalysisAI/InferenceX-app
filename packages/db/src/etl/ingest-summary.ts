import type { SkipTracker } from './skip-tracker';

export interface IngestDatabaseTotals {
  configs: number | string | bigint;
  benchmarkResults: number | string | bigint;
  runStats: number | string | bigint;
  evalResults: number | string | bigint;
  evalSamples: number | string | bigint;
  changelogEntries: number | string | bigint;
}

export interface IngestSummaryOptions {
  includeFailedRuns?: boolean;
  includeUnmappedPrecisions?: boolean;
}

/** Print the DB totals and shared skip/unmapped-value footer used by ingest scripts. */
export function printIngestSummaryFooter(
  totals: IngestDatabaseTotals,
  tracker: SkipTracker,
  options?: IngestSummaryOptions,
): void {
  console.log(`\n  DB totals:`);
  console.log(`    configs           ${totals.configs}`);
  console.log(`    benchmark_results ${totals.benchmarkResults}`);
  console.log(`    run_stats         ${totals.runStats}`);
  console.log(`    eval_results      ${totals.evalResults}`);
  console.log(`    eval_samples      ${totals.evalSamples}`);
  console.log(`    changelog_entries ${totals.changelogEntries}`);

  const { skips, unmappedModels, unmappedHws, unmappedPrecisions } = tracker;
  const skipLines: [string, number][] = [['no isl/osl (old format)', skips.noIslOsl]];
  if (options?.includeFailedRuns) {
    skipLines.push(['failed run (0 successful)', skips.failedRun]);
  }
  skipLines.push(
    ['unmapped model', skips.unmappedModel],
    ['unmapped hw', skips.unmappedHw],
    ['bad/empty zip', skips.badZip],
    ['DB errors', skips.dbError],
  );

  const nonzeroSkipLines = skipLines.filter(([, count]) => count > 0);
  const totalSkips = nonzeroSkipLines.reduce((total, [, count]) => total + count, 0);
  if (totalSkips > 0) {
    console.log(`\n  Skipped: ${totalSkips} rows`);
    const pad = Math.max(...nonzeroSkipLines.map(([label]) => label.length));
    for (const [label, count] of nonzeroSkipLines) {
      console.log(`    ${label.padEnd(pad)}: ${count}`);
    }
  }

  if (unmappedModels.size > 0) {
    console.log(`\n  Unmapped model values (add to MODEL_TO_KEY to ingest):`);
    [...unmappedModels].slice(0, 20).forEach((value) => console.log(`    ${value}`));
    if (unmappedModels.size > 20) console.log(`    ... and ${unmappedModels.size - 20} more`);
  }

  if (unmappedHws.size > 0) {
    console.log(`\n  Unmapped hw values (add to hwToGpuKey to ingest):`);
    [...unmappedHws].slice(0, 20).forEach((value) => console.log(`    ${value}`));
  }

  if (options?.includeUnmappedPrecisions && unmappedPrecisions.size > 0) {
    console.log(`\n  Unmapped precision values (add to PRECISION_KEYS to ingest):`);
    [...unmappedPrecisions].forEach((value) => console.log(`    ${value}`));
  }
}
