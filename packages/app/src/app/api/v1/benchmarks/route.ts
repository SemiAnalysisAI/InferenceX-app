import { type NextRequest, NextResponse } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson } from '@/lib/cache/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmarks/benchmark-api-view';
import {
  getCachedBenchmarks,
  getCachedBenchmarksForRun,
  getCachedCalculatorBenchmarks,
} from '@/lib/benchmarks/benchmark-query-cache.server';
import {
  filterByPowerValidity,
  parsePowerValidityFilter,
} from '@/lib/benchmarks/benchmark-power-validity';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { agenticWorkflowMetadataOnly } from '@/lib/benchmarks/agentic-workflow-metadata';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const model = params.get('model') ?? '';
  const date = params.get('date') ?? undefined;
  const exact = params.get('exact') === 'true';
  const runIdParam = params.get('runId');
  const runId = runIdParam && /^\d+$/u.test(runIdParam) ? runIdParam : undefined;
  const exactRun = params.get('exactRun') === 'true';
  const view = params.get('view');
  const sequence = params.get('sequence') ?? '';
  const powerValidFilter = parsePowerValidityFilter(params.get('powerValid'));
  const dbModelKeys = DISPLAY_MODEL_TO_DB[model];
  if (!dbModelKeys || dbModelKeys.length === 0) {
    return publicApiError(PUBLIC_API_ERRORS.unknownModel, 400);
  }
  if (view === 'calculator' && !['1k/1k', '1k/8k', '8k/1k', 'agentic-traces'].includes(sequence)) {
    return NextResponse.json({ error: 'Unknown calculator sequence' }, { status: 400 });
  }
  if (powerValidFilter === undefined) {
    return NextResponse.json({ error: 'Unknown powerValid filter' }, { status: 400 });
  }
  if (view === 'calculator' && powerValidFilter !== null) {
    return NextResponse.json(
      { error: 'powerValid cannot be combined with view=calculator' },
      { status: 400 },
    );
  }
  if (FIXTURES_MODE) {
    const fixture = loadFixture<BenchmarkRow[]>('benchmarks');
    return cachedJson(
      view === 'calculator'
        ? toCalculatorBenchmarkRows(fixture, sequence)
        : filterByPowerValidity(fixture, powerValidFilter),
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
      agenticWorkflowMetadataOnly(
        view === 'calculator' ? rows : filterByPowerValidity(rows, powerValidFilter),
      ),
    );
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
