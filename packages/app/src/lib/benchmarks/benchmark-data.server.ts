import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { agenticWorkflowMetadataOnly } from '@/lib/benchmarks/agentic-workflow-metadata';
import { getCachedBenchmarks as getCachedLatestBenchmarks } from '@/lib/benchmarks/benchmark-query-cache.server';
import { loadFixture } from '@/lib/testing/test-fixtures';

export async function getCachedBenchmarks(dbModelKeys: string[]): Promise<BenchmarkRow[]> {
  if (FIXTURES_MODE) return loadFixture<BenchmarkRow[]>('benchmarks');
  return agenticWorkflowMetadataOnly(await getCachedLatestBenchmarks(dbModelKeys));
}

export async function getCachedBenchmarksAsOf(
  dbModelKeys: string[],
  date: string,
): Promise<BenchmarkRow[]> {
  if (FIXTURES_MODE) return loadFixture<BenchmarkRow[]>('benchmarks');
  return agenticWorkflowMetadataOnly(await getCachedLatestBenchmarks(dbModelKeys, date));
}
