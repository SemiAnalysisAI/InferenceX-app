import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import {
  type BenchmarkRow,
  getLatestBenchmarks,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedQuery } from '@/lib/api-cache';
import { agenticWorkflowMetadataOnly } from '@/lib/agentic-workflow-metadata';
import { loadFixture } from '@/lib/test-fixtures';

/** Cache slot is keyed on the dbKeys array. Both `/compare/<slug>` and
 *  `/compare-per-dollar/<slug>` for the same model hit the same blob entry —
 *  the per-dollar route doesn't duplicate the fetch or the cache. */
export const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[]) => {
    if (FIXTURES_MODE) return Promise.resolve(loadFixture<BenchmarkRow[]>('benchmarks'));

    return getLatestBenchmarks(getDb(), dbModelKeys).then(agenticWorkflowMetadataOnly);
  },
  'benchmarks-agentic-run-metadata',
  { blobOnly: true },
);

/** Historical overview snapshots use the same line-level as-of semantics as
 * the dashboard, cached separately from the absolute-latest read. */
export const getCachedBenchmarksAsOf = cachedQuery(
  (dbModelKeys: string[], date: string) => {
    if (FIXTURES_MODE) return Promise.resolve(loadFixture<BenchmarkRow[]>('benchmarks'));

    return getLatestBenchmarks(getDb(), dbModelKeys, date).then(agenticWorkflowMetadataOnly);
  },
  'benchmarks-as-of-agentic-run-metadata',
  { blobOnly: true },
);
