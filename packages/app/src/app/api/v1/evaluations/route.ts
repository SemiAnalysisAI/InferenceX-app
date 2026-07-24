import { NextResponse } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import { getAllEvalResults } from '@semianalysisai/inferencex-db/queries/evaluations';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedEvaluations = cachedQuery(() => getAllEvalResults(getDb()), 'evaluations');

export async function GET() {
  if (FIXTURES_MODE) return cachedJson(loadFixture('evaluations'));
  try {
    const rows = await getCachedEvaluations();
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
