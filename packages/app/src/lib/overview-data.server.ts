import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api';
import { getCachedBenchmarks, getCachedBenchmarksAsOf } from '@/lib/benchmark-data.server';
import type { Model } from '@/lib/data-mappings';
import {
  assembleOverviewHistoricalPageData,
  assembleOverviewPageData,
  OVERVIEW_DEFAULT_COMPARISON_MODE,
  OVERVIEW_DEFAULT_HISTORY_DAYS,
  OVERVIEW_DEFAULT_MODEL_SCOPE,
  OVERVIEW_PRIMARY_TIER,
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  overviewHistoricalWindow,
  overviewModelsForScope,
  overviewSnapshotDate,
  type OverviewComparisonMode,
  type OverviewEngineScope,
  type OverviewHardware,
  type OverviewHistoryDays,
  type OverviewModelScope,
  type OverviewPageData,
  type OverviewReferenceHardware,
  type OverviewTier,
} from '@/lib/overview-data';
import { loadFixture } from '@/lib/test-fixtures';

async function loadRowsByModel(
  models: readonly Model[],
  loader: (keys: string[]) => Promise<BenchmarkRow[]>,
): Promise<Record<string, BenchmarkRow[]>> {
  const entries = await Promise.all(
    models.map(async (model) => {
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
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
  historyDays: OverviewHistoryDays = OVERVIEW_DEFAULT_HISTORY_DAYS,
  visibleHardware?: OverviewHardware[],
): Promise<OverviewPageData> {
  const models = overviewModelsForScope(modelScope);
  // Synthetic rows go through the same assemblers as the live path, so a
  // contract drift breaks fixture tests instead of stranding the page.
  const currentRowsByModel = FIXTURES_MODE
    ? loadFixture<Record<string, BenchmarkRow[]>>('overview-rows')
    : await loadRowsByModel(models, getCachedBenchmarks);
  if (comparisonMode === 'hardware') {
    return assembleOverviewPageData(
      currentRowsByModel,
      tier,
      engineScope,
      referenceHardware,
      modelScope,
      visibleHardware,
    );
  }

  // Note (wenyao): the selected history window must not move when inactive models are
  // revealed — a maintenance model can still post occasional runs, and a newer
  // one would silently shift the cost deltas already shown on default rows.
  // Anchor the snapshot to the default models in every scope.
  const snapshotRows =
    modelScope === 'all'
      ? Object.fromEntries(
          overviewModelsForScope('default').map((model) => [
            model,
            currentRowsByModel[model] ?? [],
          ]),
        )
      : currentRowsByModel;
  const snapshotDate = overviewSnapshotDate(snapshotRows, engineScope);
  if (snapshotDate === null) {
    return {
      ...assembleOverviewPageData(
        currentRowsByModel,
        tier,
        engineScope,
        referenceHardware,
        modelScope,
        visibleHardware,
      ),
      comparisonMode: 'history',
      historyDays,
    };
  }

  const window = overviewHistoricalWindow(snapshotDate, historyDays);
  const unboundedBaselineRows = FIXTURES_MODE
    ? loadFixture<Record<string, BenchmarkRow[]>>('overview-history-rows')
    : await loadRowsByModel(models, (keys) => getCachedBenchmarksAsOf(keys, window.targetDate));
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
    modelScope,
    historyDays,
    visibleHardware,
  );
}
