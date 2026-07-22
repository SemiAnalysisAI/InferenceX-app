import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import {
  type BenchmarkRow,
  getLatestBenchmarks,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

/** Cache slot is keyed on the dbKeys array. Both `/compare/<slug>` and
 *  `/compare-per-dollar/<slug>` for the same model hit the same blob entry —
 *  the per-dollar route doesn't duplicate the fetch or the cache. */
export const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[]) => {
    if (FIXTURES_MODE) return Promise.resolve(loadFixture<BenchmarkRow[]>('benchmarks'));

    return getLatestBenchmarks(getDb(), dbModelKeys);
  },
  'benchmarks',
  { blobOnly: true },
);
