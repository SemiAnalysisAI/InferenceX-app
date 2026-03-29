import { NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getLatestImages } from '@semianalysisai/inferencex-db/queries/latest-images';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedLatestImages = cachedQuery(
  async () => {
    const sql = getDb();
    return getLatestImages(sql);
  },
  'latest-images',
  { blobOnly: true },
);

export async function GET() {
  try {
    const rows = await getCachedLatestImages();
    return cachedJson(rows);
  } catch (error) {
    console.error('Error fetching latest images:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
