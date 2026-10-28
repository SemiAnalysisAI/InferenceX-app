import { type NextRequest, NextResponse } from 'next/server';

import {
  type CollectiveXDataset,
  type CollectiveXRunSummary,
  parseCollectiveXVersion,
} from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE, getCollectiveXWriteDb } from '@semianalysisai/inferencex-db/connection';
import {
  collectiveXDatasetFromRow,
  getCollectiveXRun,
} from '@semianalysisai/inferencex-db/queries/collectivex';

import { collectiveXCacheTag, cachedJson } from '@/lib/cache/api-cache';
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
    if (latest.run.run_id === runId) return cachedJson(request, latest);
    return cachedJson(request, loadFixture<CollectiveXDataset>(`collectivex-run-${runId}`));
  }

  try {
    const row = await getCollectiveXRun(getCollectiveXWriteDb(), version, runId);
    if (row === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return cachedJson(request, collectiveXDatasetFromRow(row), { tag: collectiveXCacheTag() });
  } catch (error) {
    console.error('Error fetching CollectiveX run:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
