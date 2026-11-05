import { type NextRequest, NextResponse } from 'next/server';

import { parseCollectiveXVersion } from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE, getCollectiveXWriteDb } from '@semianalysisai/inferencex-db/connection';
import {
  collectiveXDatasetFromRow,
  getLatestCollectiveXRun,
} from '@semianalysisai/inferencex-db/queries/collectivex';

import { cachedJson, collectiveXCacheTag } from '@/lib/cache/api-cache';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }
  if (FIXTURES_MODE) return cachedJson(request, loadFixture('collectivex-latest'));

  try {
    // The primary, so a response cached right after an ingest's purge is never a stale replica read.
    const row = await getLatestCollectiveXRun(getCollectiveXWriteDb(), version);
    if (row === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return cachedJson(request, collectiveXDatasetFromRow(row), { tag: collectiveXCacheTag() });
  } catch (error) {
    console.error('Error fetching CollectiveX latest run:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
