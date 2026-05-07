import { NextResponse } from 'next/server';

import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getAvailabilityData } from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedAvailability = cachedQuery(() => {
  if (JSON_MODE) return Promise.resolve(jsonProvider.getAvailabilityData());
  return getAvailabilityData(getDb());
}, 'availability');

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
