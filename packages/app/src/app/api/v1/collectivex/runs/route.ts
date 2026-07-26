import { type NextRequest, NextResponse } from 'next/server';

import { parseCollectiveXVersion } from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE, getCollectiveXDb } from '@semianalysisai/inferencex-db/connection';
import { listCollectiveXRuns } from '@semianalysisai/inferencex-db/queries/collectivex';

import { COLLECTIVEX_CACHE_CONTROL, cachedJson, collectiveXCacheTag } from '@/lib/api-cache';
import {
  collectiveXSweepErrorStatus,
  ensureCollectiveXRunsList,
} from '@/lib/collectivex-lazy-ingest';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }
  if (FIXTURES_MODE) return cachedJson(loadFixture('collectivex-runs'));

  // Backfill failures must not take the picker down — serve the stored list
  // and only surface the error when there is nothing at all to show.
  let ensureError: unknown = null;
  try {
    await ensureCollectiveXRunsList(version);
  } catch (error) {
    ensureError = error;
  }

  try {
    const runs = await listCollectiveXRuns(getCollectiveXDb(), version);
    if (runs.length === 0 && ensureError) {
      console.error('CollectiveX run backfill failed with no stored fallback:', ensureError);
      const status = collectiveXSweepErrorStatus(ensureError) ?? 502;
      return NextResponse.json({ error: 'Unavailable' }, { status });
    }
    if (ensureError) {
      console.error('CollectiveX run backfill failed; serving stored list:', ensureError);
    }
    return cachedJson(
      { version, runs },
      { tag: collectiveXCacheTag(), cacheControl: COLLECTIVEX_CACHE_CONTROL },
    );
  } catch (error) {
    console.error('Error listing CollectiveX runs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
