import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { publicApiError } from '@/lib/api/public-api-errors';
import { agenticWorkflowMetadataOnly } from '@/lib/benchmarks/agentic-workflow-metadata';
import { toCalculatorBenchmarkRows } from '@/lib/benchmarks/benchmark-api-view';
import { filterByPowerValidity } from '@/lib/benchmarks/benchmark-power-validity';
import {
  getCachedBenchmarks,
  getCachedBenchmarksForRun,
  getCachedCalculatorBenchmarks,
} from '@/lib/benchmarks/benchmark-query-cache.server';
import {
  type BenchmarkRequestParams,
  parseBenchmarkRequest,
} from '@/lib/benchmarks/benchmark-request-params';
import { loadFixture } from '@/lib/testing/test-fixtures';

export function parseBenchmarksQuery(params: URLSearchParams): BenchmarkRequestParams | Response {
  const parsed = parseBenchmarkRequest(params);
  return parsed.ok ? parsed.params : publicApiError(parsed.error, 400);
}

export async function loadBenchmarks(query: BenchmarkRequestParams): Promise<BenchmarkRow[]> {
  const { dbModelKeys, date, runId, sequence, powerValid } = query;
  if (FIXTURES_MODE) {
    const fixture = loadFixture<BenchmarkRow[]>('benchmarks');
    return query.view === 'calculator'
      ? toCalculatorBenchmarkRows(fixture, sequence)
      : filterByPowerValidity(fixture, powerValid);
  }
  if (query.view === 'calculator') {
    return agenticWorkflowMetadataOnly(
      await getCachedCalculatorBenchmarks(dbModelKeys, sequence, date),
    );
  }
  const rows =
    query.exactRun && runId
      ? await getCachedBenchmarksForRun(dbModelKeys, runId)
      : await getCachedBenchmarks(dbModelKeys, date, query.exact, runId);
  return agenticWorkflowMetadataOnly(filterByPowerValidity(rows, powerValid));
}
