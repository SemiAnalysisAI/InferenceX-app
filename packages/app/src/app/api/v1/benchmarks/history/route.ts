import type { NextRequest } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import { getAllBenchmarksForHistory } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/public-api-errors';
import { loadFixture } from '@/lib/test-fixtures';
import { agenticWorkflowMetadataOnly } from '@/lib/agentic-workflow-metadata';

export const dynamic = 'force-dynamic';

const getCachedBenchmarkHistory = cachedQuery(
  (modelKeys: string[], isl: number, osl: number) =>
    getAllBenchmarksForHistory(getDb(), modelKeys, isl, osl),
  'benchmark-history',
  { blobOnly: true },
);
const getCachedAgenticBenchmarkHistory = cachedQuery(
  (modelKeys: string[]) =>
    getAllBenchmarksForHistory(getDb(), modelKeys, null, null, 'agentic_traces'),
  'benchmark-history-agentic',
  { blobOnly: true },
);

export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get('model') ?? '';
  const rawIsl = request.nextUrl.searchParams.get('isl');
  const rawOsl = request.nextUrl.searchParams.get('osl');
  const benchmarkType = request.nextUrl.searchParams.get('benchmarkType') ?? undefined;
  const isl = rawIsl === null ? null : Number(rawIsl);
  const osl = rawOsl === null ? null : Number(rawOsl);
  const isAgentic = benchmarkType === 'agentic_traces';

  if (!model) {
    return publicApiError(PUBLIC_API_ERRORS.benchmarkHistoryParameters, 400);
  }
  if (!isAgentic && (!isl || !osl)) {
    return publicApiError(PUBLIC_API_ERRORS.benchmarkHistoryParameters, 400);
  }
  if (FIXTURES_MODE) return cachedJson(loadFixture('benchmarks-history'));

  try {
    const modelKeys = DISPLAY_MODEL_TO_DB[model];
    if (!modelKeys || modelKeys.length === 0) {
      return publicApiError(PUBLIC_API_ERRORS.unknownModel, 400);
    }
    const rows = isAgentic
      ? await getCachedAgenticBenchmarkHistory(modelKeys)
      : await getCachedBenchmarkHistory(modelKeys, isl!, osl!);
    return cachedJson(agenticWorkflowMetadataOnly(rows));
  } catch (error) {
    console.error('Error fetching benchmark history:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
