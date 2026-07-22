import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api';
import { getCachedBenchmarks } from '@/lib/benchmark-data.server';
import { DEFAULT_MODELS } from '@/lib/data-mappings';
import { assembleOverviewPageData, type OverviewPageData } from '@/lib/overview-data';
import { loadFixture } from '@/lib/test-fixtures';

export async function getOverviewPageData(): Promise<OverviewPageData> {
  // E2E fixtures mode serves a small synthetic rows-by-display-model fixture
  // through the same assembler the live path uses, so a contract drift breaks
  // the fixture tests instead of silently stranding the page's data.
  if (FIXTURES_MODE) {
    return assembleOverviewPageData(loadFixture<Record<string, BenchmarkRow[]>>('overview-rows'));
  }

  // Fetch rows per db model, concatenated per display model (one display model
  // can span several db buckets), then hand the same shape to the assembler.
  const entries = await Promise.all(
    [...DEFAULT_MODELS].map(async (model) => {
      const keys = DISPLAY_MODEL_TO_DB[model] ?? [];
      const rows = keys.length > 0 ? await getCachedBenchmarks(keys) : [];
      return [model, rows] as const;
    }),
  );

  return assembleOverviewPageData(Object.fromEntries(entries));
}
