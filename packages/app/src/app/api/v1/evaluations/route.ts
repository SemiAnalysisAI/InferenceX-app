import { NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getAllEvalResults } from '@semianalysisai/inferencex-db/queries/evaluations';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedEvaluations = cachedQuery(async () => {
  const sql = getDb();
  return getAllEvalResults(sql);
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
