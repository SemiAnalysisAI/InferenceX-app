import { type NextRequest, NextResponse } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getBenchmarksForRun,
  getLatestBenchmarks,
  type BenchmarkRow,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmark-api-view';
import { filterByPowerValidity, parsePowerValidityFilter } from '@/lib/benchmark-power-validity';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/public-api-errors';
import { agenticWorkflowMetadataOnly } from '@/lib/agentic-workflow-metadata';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[], date?: string, exact?: boolean, runId?: string) =>
    getLatestBenchmarks(getDb(), dbModelKeys, date, exact, runId),
  'benchmarks-agentic-run-metadata',
  { blobOnly: true },
);

// One logical run snapshot (GPU comparison of individual same-day runs). For an
// append-only run this includes its same-image predecessor chain. Cached under a
// distinct key prefix so it never collides with the latest/as-of query.
const getCachedBenchmarksForRun = cachedQuery(
  (dbModelKeys: string[], runId: string) => getBenchmarksForRun(getDb(), dbModelKeys, runId),
  'benchmarks-run-agentic-run-metadata',
  { blobOnly: true },
);

const getCachedCalculatorBenchmarks = cachedQuery(
  async (dbModelKeys: string[], sequence: string, date?: string) =>
    toCalculatorBenchmarkRows(await getLatestBenchmarks(getDb(), dbModelKeys, date), sequence),
  'benchmarks-calculator-agentic-run-metadata',
  { blobOnly: true },
);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const model = params.get('model') ?? '';
  const date = params.get('date') ?? undefined;
  const exact = params.get('exact') === 'true';
  // Numeric GitHub run id only — anything else is ignored (treated as "latest").
  const runIdParam = params.get('runId');
  const runId = runIdParam && /^\d+$/u.test(runIdParam) ? runIdParam : undefined;
  // exactRun=true → return exactly this run's results (GPU comparison of same-day runs).
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
  // The calculator cache stores rows already trimmed to an allowlist that
  // excludes power_valid, so post-cache filtering cannot work there.
  if (view === 'calculator' && powerValidFilter !== 'any') {
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
