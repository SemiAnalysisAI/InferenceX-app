import { NextRequest, NextResponse } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getAllBenchmarksForHistory } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedBenchmarkHistory = cachedQuery(
  async (modelKey: string, isl: number, osl: number) => {
    if (JSON_MODE) return jsonProvider.getAllBenchmarksForHistory(modelKey, isl, osl);
    return getAllBenchmarksForHistory(getDb(), modelKey, isl, osl);
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

  try {
    const modelKey = DISPLAY_MODEL_TO_DB[model];
    if (!modelKey) {
      return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
    }
    const rows = await getCachedBenchmarkHistory(modelKey, isl, osl);
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching benchmark history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
