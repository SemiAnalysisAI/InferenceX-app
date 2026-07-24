import { NextResponse } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import { getAvailabilityData } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedAvailability = cachedQuery(() => getAvailabilityData(getDb()), 'availability');

export async function GET() {
  if (FIXTURES_MODE) return cachedJson(loadFixture('availability'));
  try {
    const rows = await getCachedAvailability();
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
