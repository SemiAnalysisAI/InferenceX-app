import { NextResponse } from 'next/server';

import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getAllEvalResults } from '@semianalysisai/inferencex-db/queries/evaluations';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedEvaluations = cachedQuery(async () => {
  if (JSON_MODE) return jsonProvider.getAllEvalResults();
  return getAllEvalResults(getDb());
}, 'evaluations');

export async function GET() {
  try {
    const rows = await getCachedEvaluations();
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
