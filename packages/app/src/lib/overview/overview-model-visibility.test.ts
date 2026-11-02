import { describe, expect, it } from 'vitest';

import { Model } from '@/lib/catalog/data-mappings';
import {
  assembleOverviewPageData,
  buildOverviewModelSummary,
  type OverviewComparisonMode,
  type OverviewPageData,
} from './overview-data';
import { overviewDataForModelVisibility } from './overview-model-visibility';

function fullMatrix(comparisonMode: OverviewComparisonMode): OverviewPageData {
  const models = [Model.Kimi_K3, Model.GLM_5_2, Model.GLM_5_3_Flash].map((model) =>
    buildOverviewModelSummary(model, [], 50, 'community', 'agentx'),
  );
  models[0].platforms[0].costPerMtok = 1;
  models[0].platforms[0].historicalComparison = {
    status: 'comparable',
    baselineCostPerMtok: 2,
    costDeltaPct: -50,
    baselineDate: '2026-10-01',
    baselineConfig: null,
  };
  return { ...assembleOverviewPageData({}), models, comparisonMode };
}

describe('overview UI model visibility before row scopes', () => {
  it.each(['hardware', '30d'] as const)(
    'keeps all→filtered→all counts correct while unlocking/relocking in %s',
    (mode) => {
      const full = fullMatrix(mode);
      const count = (data: OverviewPageData) =>
        mode === 'hardware' ? data.emptyRowCount : data.unchangedRowCount;
      const lockedAll = overviewDataForModelVisibility(full, false);
      expect(lockedAll.models).toHaveLength(2);
      expect(count(lockedAll)).toBe(1);
      const filtered = { ...full, rowScope: 'changed', hardwareRowScope: 'priced' } as const;
      const lockedFiltered = overviewDataForModelVisibility(filtered, false);
      expect(lockedFiltered.models.map((row) => row.model)).toEqual([Model.Kimi_K3]);
      expect(count(lockedFiltered)).toBe(1);
      const unlockedFiltered = overviewDataForModelVisibility(filtered, true);
      expect(unlockedFiltered.models.map((row) => row.model)).toEqual([Model.Kimi_K3]);
      expect(count(unlockedFiltered)).toBe(2);
      expect(count(overviewDataForModelVisibility(filtered, false))).toBe(1);
      expect(overviewDataForModelVisibility(full, true).models).toHaveLength(3);
      expect(overviewDataForModelVisibility(full, false).models).toHaveLength(2);
      expect(full.models).toHaveLength(3);
      expect(full.rowScope).toBe('all');
      expect(full.hardwareRowScope).toBe('all');
    },
  );

  it('counts every gated scenario rather than subtracting one model', () => {
    const full = fullMatrix('hardware');
    full.models.push({ ...full.models[2], scenario: 'single_turn_8k1k' });
    expect(overviewDataForModelVisibility(full, true).emptyRowCount).toBe(3);
    expect(overviewDataForModelVisibility(full, false).emptyRowCount).toBe(1);
  });

  it('retains the all-rows fallback when only the gated model has a price', () => {
    const full = fullMatrix('hardware');
    full.models[0].platforms[0].costPerMtok = null;
    full.models[2].platforms[0].costPerMtok = 1;
    full.hardwareRowScope = 'priced';
    const locked = overviewDataForModelVisibility(full, false);
    expect(locked.models).toHaveLength(2);
    expect(locked.hardwareRowScope).toBe('all');
    expect(locked.emptyRowCount).toBe(0);
    expect(overviewDataForModelVisibility(full, true).models.map((row) => row.model)).toEqual([
      Model.GLM_5_3_Flash,
    ]);
  });
});
