import { type NextRequest, NextResponse } from 'next/server';

import {
  type CollectiveXDataset,
  type CollectiveXRunSummary,
  parseCollectiveXVersion,
} from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE, getCollectiveXWriteDb } from '@semianalysisai/inferencex-db/connection';
import {
  collectiveXDatasetFromRow,
  deleteCollectiveXRun,
  getCollectiveXRun,
} from '@semianalysisai/inferencex-db/queries/collectivex';

import {
  COLLECTIVEX_CACHE_CONTROL,
  collectiveXCacheTag,
  cachedJson,
  purgeCollectiveX,
} from '@/lib/cache/api-cache';
import { bearerMatches } from '@/lib/api/bearer-auth';
import {
  collectiveXSweepErrorStatus,
  ensureCollectiveXRun,
} from '@/lib/collectivex/collectivex-lazy-ingest';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RUN_ID = /^[1-9][0-9]*$/u;

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version || !RUN_ID.test(runId)) {
    return NextResponse.json({ error: 'Unknown version or run id' }, { status: 400 });
  }
  if (FIXTURES_MODE) {
    const fixtureList = loadFixture<{ version: number; runs: CollectiveXRunSummary[] }>(
      'collectivex-runs',
    );
    if (fixtureList.version !== version || !fixtureList.runs.some((run) => run.run_id === runId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const latest = loadFixture<CollectiveXDataset>('collectivex-latest');
    if (latest.run.run_id === runId) return cachedJson(latest);
    return cachedJson(loadFixture<CollectiveXDataset>(`collectivex-run-${runId}`));
  }

  let ensureError: unknown = null;
  try {
    await ensureCollectiveXRun(version, runId);
  } catch (error) {
    ensureError = error;
  }

  try {
    const row = await getCollectiveXRun(getCollectiveXWriteDb(), version, runId);
    if (row === null) {
      if (ensureError) {
        const status = collectiveXSweepErrorStatus(ensureError);
        if (status !== null) {
          return NextResponse.json(
            { error: status === 404 ? 'Not found' : 'Unavailable' },
            { status },
          );
        }
        throw ensureError;
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (ensureError) {
      console.error('CollectiveX run refresh failed; serving stored run:', ensureError);
    }
    return cachedJson(collectiveXDatasetFromRow(row), {
      tag: collectiveXCacheTag(),
      cacheControl: COLLECTIVEX_CACHE_CONTROL,
    });
  } catch (error) {
    console.error('Error fetching CollectiveX run:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const secret = process.env.COLLECTIVEX_ADMIN_SECRET;
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!secret || !bearerMatches(authHeader, secret)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { runId } = await context.params;
  if (!RUN_ID.test(runId)) {
    return NextResponse.json({ error: 'Unknown run id' }, { status: 400 });
  }

  try {
    const deleted = await deleteCollectiveXRun(getCollectiveXWriteDb(), runId);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    purgeCollectiveX();
    return NextResponse.json({ deleted: true, runId });
  } catch (error) {
    console.error('Error deleting CollectiveX run:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
