import { NextResponse } from 'next/server';

import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getReliabilityStats } from '@semianalysisai/inferencex-db/queries/reliability';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedReliability = cachedQuery(() => {
  if (JSON_MODE) return Promise.resolve(jsonProvider.getReliabilityStats());
  return getReliabilityStats(getDb());
}, 'reliability');

export async function GET() {
  if (FIXTURES_MODE) return cachedJson(loadFixture('reliability'));
  try {
    const rows = await getCachedReliability();
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching reliability stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
