import { NextResponse } from 'next/server';

import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getAllEvalResults } from '@semianalysisai/inferencex-db/queries/evaluations';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedEvaluations = cachedQuery(() => {
  if (JSON_MODE) return Promise.resolve(jsonProvider.getAllEvalResults());
  return getAllEvalResults(getDb());
}, 'evaluations');

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
