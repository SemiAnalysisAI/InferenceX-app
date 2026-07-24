import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api';
import { getCachedBenchmarks } from '@/lib/benchmark-data.server';
import { DEFAULT_MODELS } from '@/lib/data-mappings';
import {
  assembleOverviewPageData,
  OVERVIEW_PRIMARY_TIER,
  type OverviewPageData,
  type OverviewTier,
} from '@/lib/overview-data';
import { loadFixture } from '@/lib/test-fixtures';

export async function getOverviewPageData(
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
): Promise<OverviewPageData> {
  // Synthetic rows go through the same assembler as the live path, so a
  // contract drift breaks the fixture tests instead of stranding the page.
  if (FIXTURES_MODE) {
    return assembleOverviewPageData(
      loadFixture<Record<string, BenchmarkRow[]>>('overview-rows'),
      tier,
    );
  }

  const entries = await Promise.all(
    [...DEFAULT_MODELS].map(async (model) => {
      const keys = DISPLAY_MODEL_TO_DB[model] ?? [];
      const rows = keys.length > 0 ? await getCachedBenchmarks(keys) : [];
      return [model, rows] as const;
    }),
  );

  return assembleOverviewPageData(Object.fromEntries(entries), tier);
}
