import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api';
import { benchmarkCurveDate } from '@/lib/benchmark-run-selection';
import { cachedDerivedData } from '@/lib/api-cache';
import { getCachedBenchmarks, getCachedBenchmarksAsOf } from '@/lib/benchmark-data.server';
import type { Model } from '@/lib/data-mappings';
import {
  applyOverviewHardwareRowScope,
  applyOverviewRowScope,
  assembleOverviewHistoricalPageData,
  assembleOverviewPageData,
  OVERVIEW_DEFAULT_COMPARISON_MODE,
  OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
  OVERVIEW_DEFAULT_MODEL_SCOPE,
  OVERVIEW_DEFAULT_ROW_SCOPE,
  OVERVIEW_PRIMARY_TIER,
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  overviewHistoricalWindow,
  overviewModelsForScope,
  overviewSnapshotDate,
  type OverviewComparisonMode,
  type OverviewEngineScope,
  type OverviewHardwareRowScope,
  type OverviewModelScope,
  type OverviewPageData,
  type OverviewReferenceHardware,
  type OverviewRowScope,
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

async function buildOverviewPageData(
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
  rowScope: OverviewRowScope = OVERVIEW_DEFAULT_ROW_SCOPE,
  hardwareRowScope: OverviewHardwareRowScope = OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
): Promise<OverviewPageData> {
  // Each filter is a no-op outside its own comparison mode, so both run on
  // every path and the active one is whichever the matrix is actually in.
  const scopeRows = (data: OverviewPageData): OverviewPageData =>
    applyOverviewHardwareRowScope(applyOverviewRowScope(data, rowScope), hardwareRowScope);
  const models = overviewModelsForScope(modelScope);
  // Synthetic rows go through the same assemblers as the live path, so a
  // contract drift breaks fixture tests instead of stranding the page.
  const currentRowsByModel = FIXTURES_MODE
    ? loadFixture<Record<string, BenchmarkRow[]>>('overview-rows')
    : await loadRowsByModel(models, getCachedBenchmarks);
  if (comparisonMode === 'hardware') {
    return scopeRows(
      assembleOverviewPageData(
        currentRowsByModel,
        tier,
        engineScope,
        referenceHardware,
        modelScope,
      ),
    );
  }

  // Note (wenyao): the 30-day window must not move when inactive models are
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
      models: [],
      tier,
      engineScope,
      comparisonMode,
      referenceHardware,
      modelScope,
      rowScope,
      hardwareRowScope,
      unchangedRowCount: 0,
      emptyRowCount: 0,
      historicalWindow: null,
    };
  }

  const window = overviewHistoricalWindow(snapshotDate, comparisonMode);
  const unboundedBaselineRows = FIXTURES_MODE
    ? loadFixture<Record<string, BenchmarkRow[]>>('overview-history-rows')
    : await loadRowsByModel(models, (keys) => getCachedBenchmarksAsOf(keys, window.targetDate));
  const baselineRowsByModel = Object.fromEntries(
    Object.entries(unboundedBaselineRows).map(([model, rows]) => [
      model,
      rows.filter(
        (row) =>
          benchmarkCurveDate(row) >= window.earliestDate &&
          benchmarkCurveDate(row) <= window.targetDate,
      ),
    ]),
  );

  return scopeRows(
    assembleOverviewHistoricalPageData(
      currentRowsByModel,
      baselineRowsByModel,
      window,
      tier,
      engineScope,
      referenceHardware,
      modelScope,
    ),
  );
}

const getCachedOverviewPageData = cachedDerivedData(buildOverviewPageData, 'overview-page-v1');

export function getOverviewPageData(
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
  rowScope: OverviewRowScope = OVERVIEW_DEFAULT_ROW_SCOPE,
  hardwareRowScope: OverviewHardwareRowScope = OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
): Promise<OverviewPageData> {
  const loader = FIXTURES_MODE ? buildOverviewPageData : getCachedOverviewPageData;
  return loader(
    tier,
    engineScope,
    comparisonMode,
    referenceHardware,
    modelScope,
    rowScope,
    hardwareRowScope,
  );
}
