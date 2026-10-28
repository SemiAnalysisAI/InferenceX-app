import { after, type NextRequest, NextResponse } from 'next/server';

import {
  type CollectiveXRunSummary,
  type CollectiveXVersion,
  parseCollectiveXVersion,
} from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE, getCollectiveXWriteDb } from '@semianalysisai/inferencex-db/connection';
import { listCollectiveXRuns } from '@semianalysisai/inferencex-db/queries/collectivex';

import { COLLECTIVEX_CACHE_CONTROL, cachedJson, collectiveXCacheTag } from '@/lib/cache/api-cache';
import {
  collectiveXSweepErrorStatus,
  ensureCollectiveXRunsList,
  lastCollectiveXRunsListOutcome,
} from '@/lib/collectivex/collectivex-lazy-ingest';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCOVERY_CACHE_CONTROL = 'private, no-store';

function runsResponse(
  request: NextRequest,
  version: CollectiveXVersion,
  runs: CollectiveXRunSummary[],
  discoveryComplete: boolean,
): Response {
  return cachedJson(
    request,
    { version, runs, discovery_complete: discoveryComplete },
    {
      tag: collectiveXCacheTag(),
      cacheControl: discoveryComplete ? COLLECTIVEX_CACHE_CONTROL : DISCOVERY_CACHE_CONTROL,
    },
  );
}

export async function GET(request: NextRequest) {
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }
  if (FIXTURES_MODE) return cachedJson(request, loadFixture('collectivex-runs'));

  let stored: CollectiveXRunSummary[];
  try {
    stored = await listCollectiveXRuns(getCollectiveXWriteDb(), version);
  } catch (error) {
    console.error('Error listing CollectiveX runs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (stored.length > 0) {
    // Serve the stored list without waiting on GitHub. Discovery continues
    // after the response, and runs it persists appear on the next CDN refresh.
    // The list reads as complete only once a pass on this instance finished
    // with nothing left to do, so a cold instance never stops client polling.
    after(() =>
      ensureCollectiveXRunsList(version).catch((error: unknown) => {
        console.error('CollectiveX background run discovery failed:', error);
      }),
    );
    return runsResponse(request, version, stored, lastCollectiveXRunsListOutcome(version) === true);
  }

  // Nothing stored yet: wait for the first pass, and surface a backfill
  // failure only when it leaves nothing at all to show.
  let ensureError: unknown = null;
  let discoveryComplete: boolean;
  try {
    discoveryComplete = await ensureCollectiveXRunsList(version);
  } catch (error) {
    ensureError = error;
    discoveryComplete = false;
  }

  try {
    // Backfill may have persisted runs, so read from the same primary.
    const runs = await listCollectiveXRuns(getCollectiveXWriteDb(), version);
    if (runs.length === 0 && ensureError) {
      console.error('CollectiveX run backfill failed with no stored fallback:', ensureError);
      const status = collectiveXSweepErrorStatus(ensureError) ?? 502;
      return NextResponse.json({ error: 'Unavailable' }, { status });
    }
    if (ensureError) {
      console.error('CollectiveX run backfill failed; serving stored list:', ensureError);
    }
    return runsResponse(request, version, runs, discoveryComplete);
  } catch (error) {
    console.error('Error listing CollectiveX runs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
