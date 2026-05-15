import { type NextRequest, NextResponse } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getAllBenchmarksForHistory } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedBenchmarkHistory = cachedQuery(
  (modelKeys: string[], isl: number, osl: number) => {
    if (JSON_MODE)
      return Promise.resolve(jsonProvider.getAllBenchmarksForHistory(modelKeys, isl, osl));
    return getAllBenchmarksForHistory(getDb(), modelKeys, isl, osl);
  },
  'benchmark-history',
  { blobOnly: true },
);

export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get('model') ?? '';
  const isl = Number(request.nextUrl.searchParams.get('isl'));
  const osl = Number(request.nextUrl.searchParams.get('osl'));

  if (!model || !isl || !osl) {
    return NextResponse.json({ error: 'model, isl, and osl are required' }, { status: 400 });
  }
  if (FIXTURES_MODE) return cachedJson(loadFixture('benchmarks-history'));

  try {
    const modelKeys = DISPLAY_MODEL_TO_DB[model];
    if (!modelKeys || modelKeys.length === 0) {
      return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
    }
    const rows = await getCachedBenchmarkHistory(modelKeys, isl, osl);
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching benchmark history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
