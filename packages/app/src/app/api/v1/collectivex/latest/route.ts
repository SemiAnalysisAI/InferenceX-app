import { type NextRequest, NextResponse } from 'next/server';

import { parseCollectiveXVersion } from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE, getCollectiveXDb } from '@semianalysisai/inferencex-db/connection';
import {
  collectiveXDatasetFromRow,
  getLatestCollectiveXRun,
} from '@semianalysisai/inferencex-db/queries/collectivex';

import { COLLECTIVEX_CACHE_CONTROL, cachedJson, collectiveXCacheTag } from '@/lib/api-cache';
import {
  collectiveXSweepErrorStatus,
  ensureLatestCollectiveXRun,
} from '@/lib/collectivex-lazy-ingest';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }
  if (FIXTURES_MODE) return cachedJson(loadFixture('collectivex-latest'));

  // Discovery failures must not take the page down — serve whatever the DB
  // already holds and only surface the error when there is no fallback.
  let ensureError: unknown = null;
  try {
    await ensureLatestCollectiveXRun(version);
  } catch (error) {
    ensureError = error;
  }

  try {
    const row = await getLatestCollectiveXRun(getCollectiveXDb(), version);
    if (row !== null) {
      if (ensureError)
        console.error('CollectiveX discovery failed; serving stored run:', ensureError);
      return cachedJson(collectiveXDatasetFromRow(row), {
        tag: collectiveXCacheTag(),
        cacheControl: COLLECTIVEX_CACHE_CONTROL,
      });
    }
    if (ensureError) {
      console.error('CollectiveX discovery failed with no stored fallback:', ensureError);
      const status = collectiveXSweepErrorStatus(ensureError) ?? 502;
      return NextResponse.json({ error: 'Unavailable' }, { status });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('Error fetching CollectiveX latest run:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
