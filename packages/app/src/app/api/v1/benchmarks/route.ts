import { type NextRequest, NextResponse } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getLatestBenchmarks } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[], date?: string, exact?: boolean, runId?: string) => {
    if (JSON_MODE)
      return Promise.resolve(jsonProvider.getLatestBenchmarks(dbModelKeys, date, exact, runId));
    return getLatestBenchmarks(getDb(), dbModelKeys, date, exact, runId);
  },
  'benchmarks',
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
  const dbModelKeys = DISPLAY_MODEL_TO_DB[model];
  if (!dbModelKeys || dbModelKeys.length === 0) {
    return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
  }
  if (FIXTURES_MODE) return cachedJson(loadFixture('benchmarks'));

  try {
    const rows = await getCachedBenchmarks(dbModelKeys, date, exact || undefined, runId);
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
