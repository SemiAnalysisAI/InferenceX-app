import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api';
import { getCachedBenchmarks, getCachedBenchmarksAsOf } from '@/lib/benchmark-data.server';
import { DEFAULT_MODELS } from '@/lib/data-mappings';
import {
  assembleOverviewHistoricalPageData,
  assembleOverviewPageData,
  OVERVIEW_DEFAULT_COMPARISON_MODE,
  OVERVIEW_PRIMARY_TIER,
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  overviewHistoricalWindow,
  overviewSnapshotDate,
  type OverviewComparisonMode,
  type OverviewEngineScope,
  type OverviewPageData,
  type OverviewReferenceHardware,
  type OverviewTier,
} from '@/lib/overview-data';
import { loadFixture } from '@/lib/test-fixtures';

async function loadRowsByModel(
  loader: (keys: string[]) => Promise<BenchmarkRow[]>,
): Promise<Record<string, BenchmarkRow[]>> {
  const entries = await Promise.all(
    [...DEFAULT_MODELS].map(async (model) => {
      const keys = DISPLAY_MODEL_TO_DB[model] ?? [];
      const rows = keys.length > 0 ? await loader(keys) : [];
      return [model, rows] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function getOverviewPageData(
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
): Promise<OverviewPageData> {
  // Synthetic rows go through the same assemblers as the live path, so a
  // contract drift breaks fixture tests instead of stranding the page.
  const currentRowsByModel = FIXTURES_MODE
    ? loadFixture<Record<string, BenchmarkRow[]>>('overview-rows')
    : await loadRowsByModel(getCachedBenchmarks);
  if (comparisonMode === 'hardware') {
    return assembleOverviewPageData(currentRowsByModel, tier, engineScope, referenceHardware);
  }

  const snapshotDate = overviewSnapshotDate(currentRowsByModel, engineScope);
  if (snapshotDate === null) {
    return {
      ...assembleOverviewPageData(currentRowsByModel, tier, engineScope, referenceHardware),
      comparisonMode: 'history',
    };
  }

  const window = overviewHistoricalWindow(snapshotDate);
  const unboundedBaselineRows = FIXTURES_MODE
    ? loadFixture<Record<string, BenchmarkRow[]>>('overview-history-rows')
    : await loadRowsByModel((keys) => getCachedBenchmarksAsOf(keys, window.targetDate));
  const baselineRowsByModel = Object.fromEntries(
    Object.entries(unboundedBaselineRows).map(([model, rows]) => [
      model,
      rows.filter((row) => row.date >= window.earliestDate && row.date <= window.targetDate),
    ]),
  );

  return assembleOverviewHistoricalPageData(
    currentRowsByModel,
    baselineRowsByModel,
    window,
    tier,
    engineScope,
    referenceHardware,
  );
}
