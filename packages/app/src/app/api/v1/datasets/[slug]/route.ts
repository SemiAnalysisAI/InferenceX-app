import { type NextRequest, NextResponse } from 'next/server';

import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getDataset, type DatasetDetail } from '@semianalysisai/inferencex-db/queries/datasets';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedDataset = cachedQuery((slug: string): Promise<DatasetDetail | null> => {
  if (JSON_MODE) return Promise.resolve(jsonProvider.getDataset(slug));
  return getDataset(getDb(), slug);
}, 'dataset');

/** GET /api/v1/datasets/[slug] — one dataset incl. precomputed chart_data. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const data = await getCachedDataset(slug);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching dataset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
