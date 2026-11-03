import type { NextRequest } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api/api';
import { compactTrendHistory } from '@/components/inference/hooks/trend-history-rows';
import { cachedJson } from '@/lib/cache/api-cache';
import {
  getCachedAgenticBenchmarkHistory,
  getCachedBenchmarkHistory,
} from '@/lib/benchmarks/benchmark-query-cache.server';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { loadFixture } from '@/lib/testing/test-fixtures';
import { agenticWorkflowMetadataOnly } from '@/lib/benchmarks/agentic-workflow-metadata';

export const dynamic = 'force-dynamic';

/**
 * The Historical Trends page's input: the `/api/v1/benchmarks/history` rows for the
 * same parameters, reduced to what a trend reads by `compactTrendHistory`. It reads
 * the cache slots the published route owns, so both share one query.
 */
export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get('model') ?? '';
  const rawIsl = request.nextUrl.searchParams.get('isl');
  const rawOsl = request.nextUrl.searchParams.get('osl');
  const isAgentic = request.nextUrl.searchParams.get('benchmarkType') === 'agentic_traces';
  const isl = Number(rawIsl);
  const osl = Number(rawOsl);

  if (!model || (!isAgentic && (!isl || !osl))) {
    return publicApiError(PUBLIC_API_ERRORS.benchmarkHistoryParameters, 400);
  }
  if (FIXTURES_MODE) {
    return cachedJson(
      request,
      compactTrendHistory(loadFixture<BenchmarkRow[]>('benchmarks-history')),
    );
  }

  try {
    const modelKeys = DISPLAY_MODEL_TO_DB[model];
    if (!modelKeys || modelKeys.length === 0) {
      return publicApiError(PUBLIC_API_ERRORS.unknownModel, 400);
    }
    const rows = isAgentic
      ? await getCachedAgenticBenchmarkHistory(modelKeys)
      : await getCachedBenchmarkHistory(modelKeys, isl, osl);
    return cachedJson(request, compactTrendHistory(agenticWorkflowMetadataOnly(rows)));
  } catch (error) {
    console.error('Error fetching trend history:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
