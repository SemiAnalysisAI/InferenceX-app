import { NextResponse } from 'next/server';

import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { listDatasets, type DatasetRecord } from '@semianalysisai/inferencex-db/queries/datasets';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedDatasets = cachedQuery((): Promise<DatasetRecord[]> => {
  if (JSON_MODE) return Promise.resolve(jsonProvider.listDatasets());
  return listDatasets(getDb());
}, 'datasets');

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
