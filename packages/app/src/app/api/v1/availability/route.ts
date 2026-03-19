import { NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getAvailabilityData } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedAvailability = cachedQuery(async () => {
  const sql = getDb();
  return getAvailabilityData(sql);
}, 'availability');

export async function GET() {
  try {
    const rows = await getCachedAvailability();
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
