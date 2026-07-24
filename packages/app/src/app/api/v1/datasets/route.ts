import { NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';

import { listDatasets, type DatasetRecord } from '@semianalysisai/inferencex-db/queries/datasets';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedDatasets = cachedQuery(
  (): Promise<DatasetRecord[]> => listDatasets(getDb()),
  'datasets',
);

/** GET /api/v1/datasets — all ingested cc-traces-weka datasets (registry cards). */
export async function GET() {
  try {
    const data = await getCachedDatasets();
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching datasets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
