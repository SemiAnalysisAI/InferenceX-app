import { NextRequest, NextResponse } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getLatestBenchmarks } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedBenchmarks = cachedQuery(
  async (dbModelKey: string, date?: string, exact?: boolean) => {
    const sql = getDb();
    return getLatestBenchmarks(sql, dbModelKey, date, exact);
  },
  'benchmarks',
  { blobOnly: true },
);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const model = params.get('model') ?? '';
  const date = params.get('date') ?? undefined;
  const exact = params.get('exact') === 'true';
  const dbModelKey = DISPLAY_MODEL_TO_DB[model];
  if (!dbModelKey) {
    return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
  }

  try {
    const rows = await getCachedBenchmarks(dbModelKey, date, exact || undefined);
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
