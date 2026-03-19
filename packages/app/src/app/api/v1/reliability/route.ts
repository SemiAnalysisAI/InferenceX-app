import { NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getReliabilityStats } from '@semianalysisai/inferencex-db/queries/reliability';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedReliability = cachedQuery(async () => {
  const sql = getDb();
  return getReliabilityStats(sql);
}, 'reliability');

export async function GET() {
  try {
    const rows = await getCachedReliability();
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching reliability stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
