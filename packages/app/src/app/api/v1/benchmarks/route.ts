import { type NextRequest } from 'next/server';

import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson } from '@/lib/cache/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmarks/benchmark-api-view';
import {
  getCachedBenchmarks,
  getCachedBenchmarksForRun,
  getCachedCalculatorBenchmarks,
} from '@/lib/benchmarks/benchmark-query-cache.server';
import { filterByPowerValidity } from '@/lib/benchmarks/benchmark-power-validity';
import { parseBenchmarkRequest } from '@/lib/benchmarks/benchmark-request-params';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { agenticWorkflowMetadataOnly } from '@/lib/benchmarks/agentic-workflow-metadata';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

// Plain JSON without `Vary: Accept-Encoding`: the CDN keeps one entry per URL
// and compresses it per client. Origin compression made every distinct
// Accept-Encoding string its own CDN entry and its own origin miss.
const CACHE_OPTIONS = { compression: 'cdn' } as const;

export async function GET(request: NextRequest) {
  const parsed = parseBenchmarkRequest(request.nextUrl.searchParams);
  if (!parsed.ok) return publicApiError(parsed.error, 400);
  const { dbModelKeys, date, exact, runId, exactRun, view, sequence, powerValid } = parsed.params;

  if (FIXTURES_MODE) {
    const fixture = loadFixture<BenchmarkRow[]>('benchmarks');
    return cachedJson(
      request,
      view === 'calculator'
        ? toCalculatorBenchmarkRows(fixture, sequence)
        : filterByPowerValidity(fixture, powerValid),
      CACHE_OPTIONS,
    );
  }

  try {
    const rows =
      view === 'calculator'
        ? await getCachedCalculatorBenchmarks(dbModelKeys, sequence, date)
        : exactRun && runId
          ? await getCachedBenchmarksForRun(dbModelKeys, runId)
          : await getCachedBenchmarks(dbModelKeys, date, exact || undefined, runId);
    return cachedJson(
      request,
      agenticWorkflowMetadataOnly(
        view === 'calculator' ? rows : filterByPowerValidity(rows, powerValid),
      ),
      CACHE_OPTIONS,
    );
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
