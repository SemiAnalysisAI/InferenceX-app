import { NextResponse } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { agenticWorkflowMetadataOnly } from '@/lib/benchmarks/agentic-workflow-metadata';
import { toCalculatorBenchmarkRows } from '@/lib/benchmarks/benchmark-api-view';
import {
  filterByPowerValidity,
  type PowerValidityFilter,
  parsePowerValidityFilter,
} from '@/lib/benchmarks/benchmark-power-validity';
import {
  getCachedBenchmarks,
  getCachedBenchmarksForRun,
  getCachedCalculatorBenchmarks,
} from '@/lib/benchmarks/benchmark-query-cache.server';
import { loadFixture } from '@/lib/testing/test-fixtures';

export interface BenchmarksQuery {
  dbModelKeys: string[];
  date?: string;
  exact: boolean;
  runId?: string;
  exactRun: boolean;
  calculator: boolean;
  sequence: string;
  powerValidFilter: PowerValidityFilter | null;
}

export function parseBenchmarksQuery(params: URLSearchParams): BenchmarksQuery | Response {
  const model = params.get('model') ?? '';
  const runIdParam = params.get('runId');
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
  return {
    dbModelKeys,
    date: params.get('date') ?? undefined,
    exact: params.get('exact') === 'true',
    runId: runIdParam && /^\d+$/u.test(runIdParam) ? runIdParam : undefined,
    exactRun: params.get('exactRun') === 'true',
    calculator: view === 'calculator',
    sequence,
    powerValidFilter,
  };
}

export async function loadBenchmarks(query: BenchmarksQuery): Promise<BenchmarkRow[]> {
  const { dbModelKeys, date, runId, sequence, powerValidFilter } = query;
  if (FIXTURES_MODE) {
    const fixture = loadFixture<BenchmarkRow[]>('benchmarks');
    return query.calculator
      ? toCalculatorBenchmarkRows(fixture, sequence)
      : filterByPowerValidity(fixture, powerValidFilter);
  }
  if (query.calculator) {
    return agenticWorkflowMetadataOnly(
      await getCachedCalculatorBenchmarks(dbModelKeys, sequence, date),
    );
  }
  const rows =
    query.exactRun && runId
      ? await getCachedBenchmarksForRun(dbModelKeys, runId)
      : await getCachedBenchmarks(dbModelKeys, date, query.exact, runId);
  return agenticWorkflowMetadataOnly(filterByPowerValidity(rows, powerValidFilter));
}
