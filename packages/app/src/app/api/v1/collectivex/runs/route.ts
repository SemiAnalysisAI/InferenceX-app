import { type NextRequest, NextResponse } from 'next/server';

import { parseCollectiveXVersion } from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE, getCollectiveXWriteDb } from '@semianalysisai/inferencex-db/connection';
import { listCollectiveXRuns } from '@semianalysisai/inferencex-db/queries/collectivex';

import { cachedJson, collectiveXCacheTag } from '@/lib/cache/api-cache';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }
  if (FIXTURES_MODE) return cachedJson(loadFixture('collectivex-runs'));

  try {
    const runs = await listCollectiveXRuns(getCollectiveXWriteDb(), version);
    // Every run is ingested ahead of time, so the stored list is always complete.
    return cachedJson({ version, runs, discovery_complete: true }, { tag: collectiveXCacheTag() });
  } catch (error) {
    console.error('Error listing CollectiveX runs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
