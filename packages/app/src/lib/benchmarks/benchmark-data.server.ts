import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import {
  type BenchmarkRow,
  getLatestBenchmarks,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedQuery } from '@/lib/cache/api-cache';
import { agenticWorkflowMetadataOnly } from '@/lib/benchmarks/agentic-workflow-metadata';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[]) => {
    if (FIXTURES_MODE) return Promise.resolve(loadFixture<BenchmarkRow[]>('benchmarks'));

    return getLatestBenchmarks(getDb(), dbModelKeys).then(agenticWorkflowMetadataOnly);
  },
  'benchmarks-agentic-curve-scope-v2',
  { blobOnly: true },
);

export const getCachedBenchmarksAsOf = cachedQuery(
  (dbModelKeys: string[], date: string) => {
    if (FIXTURES_MODE) return Promise.resolve(loadFixture<BenchmarkRow[]>('benchmarks'));

    return getLatestBenchmarks(getDb(), dbModelKeys, date).then(agenticWorkflowMetadataOnly);
  },
  'benchmarks-as-of-agentic-curve-scope-v2',
  { blobOnly: true },
);
