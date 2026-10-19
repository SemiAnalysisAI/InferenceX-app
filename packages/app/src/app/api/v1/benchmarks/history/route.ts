import type { NextRequest } from 'next/server';

import { DISPLAY_MODEL_TO_DB, islOslToSequence } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import { cachedJson } from '@/lib/cache/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmarks/benchmark-api-view';
import {
  getCachedAgenticBenchmarkHistory,
  getCachedBenchmarkHistory,
} from '@/lib/benchmarks/benchmark-query-cache.server';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { loadFixture } from '@/lib/testing/test-fixtures';
import { agenticWorkflowMetadataOnly } from '@/lib/benchmarks/agentic-workflow-metadata';

export const dynamic = 'force-dynamic';

function applyCalculatorView<
  T extends {
    benchmark_type: string;
    isl: number | null;
    osl: number | null;
    metrics: Record<string, unknown>;
  },
>(rows: T[], isl: number | null, osl: number | null): T[] {
  if (isl === null || osl === null) return rows;
  const sequence = islOslToSequence(isl, osl);
  if (!sequence) return rows;
  return toCalculatorBenchmarkRows(rows, sequence);
}

export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get('model') ?? '';
  const rawIsl = request.nextUrl.searchParams.get('isl');
  const rawOsl = request.nextUrl.searchParams.get('osl');
  const benchmarkType = request.nextUrl.searchParams.get('benchmarkType') ?? undefined;
  const isl = rawIsl === null ? null : Number(rawIsl);
  const osl = rawOsl === null ? null : Number(rawOsl);
  const isAgentic = benchmarkType === 'agentic_traces';
  const calculatorView = request.nextUrl.searchParams.get('view') === 'calculator';

  if (!model) {
    return publicApiError(PUBLIC_API_ERRORS.benchmarkHistoryParameters, 400);
  }
  if (!isAgentic && (!isl || !osl)) {
    return publicApiError(PUBLIC_API_ERRORS.benchmarkHistoryParameters, 400);
  }
  if (FIXTURES_MODE) {
    const fixture = loadFixture('benchmarks-history');
    return cachedJson(
      calculatorView && Array.isArray(fixture) ? applyCalculatorView(fixture, isl, osl) : fixture,
    );
  }

  try {
    const modelKeys = DISPLAY_MODEL_TO_DB[model];
    if (!modelKeys || modelKeys.length === 0) {
      return publicApiError(PUBLIC_API_ERRORS.unknownModel, 400);
    }
    const rows = isAgentic
      ? await getCachedAgenticBenchmarkHistory(modelKeys)
      : await getCachedBenchmarkHistory(modelKeys, isl!, osl!);
    const trimmed = agenticWorkflowMetadataOnly(rows);
    return cachedJson(calculatorView ? applyCalculatorView(trimmed, isl, osl) : trimmed);
  } catch (error) {
    console.error('Error fetching benchmark history:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
