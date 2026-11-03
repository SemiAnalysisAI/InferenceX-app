import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api/api';
import { benchmarkCurveDate } from '@/lib/benchmarks/benchmark-run-selection';
import { cachedDerivedData } from '@/lib/cache/api-cache';
import {
  getCachedBenchmarks,
  getCachedBenchmarksAsOf,
} from '@/lib/benchmarks/benchmark-data.server';
import type { Model } from '@/lib/catalog/data-mappings';
import {
  applyOverviewHardwareRowScope,
  applyOverviewRowScope,
  buildOverviewCube,
  buildOverviewHistoricalCube,
  OVERVIEW_DEFAULT_COMPARISON_MODE,
  OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
  OVERVIEW_DEFAULT_MODEL_SCOPE,
  OVERVIEW_DEFAULT_ROW_SCOPE,
  OVERVIEW_PRIMARY_TIER,
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  overviewHistoricalWindow,
  overviewModelsForScope,
  overviewSnapshotDate,
  sliceOverviewCube,
  type OverviewComparisonMode,
  type OverviewCube,
  type OverviewEngineScope,
  type OverviewHardwareRowScope,
  type OverviewModelScope,
  type OverviewPageData,
  type OverviewReferenceHardware,
  type OverviewRowScope,
  type OverviewTier,
} from '@/lib/overview/overview-data';
import { loadFixture } from '@/lib/testing/test-fixtures';

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

/** Null when a history mode has no current snapshot to anchor its window. */
async function buildOverviewCubeForScope(
  engineScope: OverviewEngineScope,
  comparisonMode: OverviewComparisonMode,
  modelScope: OverviewModelScope,
): Promise<OverviewCube | null> {
  const models = overviewModelsForScope(modelScope);
  const currentRowsByModel = FIXTURES_MODE
    ? loadFixture<Record<string, BenchmarkRow[]>>('overview-rows')
    : await loadRowsByModel(models, getCachedBenchmarks);
  if (comparisonMode === 'hardware') {
    return buildOverviewCube(currentRowsByModel, engineScope, modelScope);
  }

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
  if (snapshotDate === null) return null;

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

  return buildOverviewHistoricalCube(
    currentRowsByModel,
    baselineRowsByModel,
    window,
    engineScope,
    modelScope,
  );
}

// Tier, reference and the row scopes only slice a cube, so 20 cached cubes
// serve every selector combination.
const getCachedOverviewCube = cachedDerivedData(buildOverviewCubeForScope, 'overview-cube-v1');

export async function getOverviewPageData(
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
  rowScope: OverviewRowScope = OVERVIEW_DEFAULT_ROW_SCOPE,
  hardwareRowScope: OverviewHardwareRowScope = OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
): Promise<OverviewPageData> {
  const loader = FIXTURES_MODE ? buildOverviewCubeForScope : getCachedOverviewCube;
  const cube = await loader(engineScope, comparisonMode, modelScope);
  if (cube === null) {
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
  return applyOverviewHardwareRowScope(
    applyOverviewRowScope(sliceOverviewCube(cube, tier, referenceHardware), rowScope),
    hardwareRowScope,
  );
}
