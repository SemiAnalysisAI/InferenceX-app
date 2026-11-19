import { NextResponse } from 'next/server';

import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';
import {
  mergeSubmissionSummaries,
  mergeSubmissionVolumes,
} from '@semianalysisai/inferencex-db/queries/across-dbs';
import {
  getSubmissionSummary,
  getSubmissionVolume,
} from '@semianalysisai/inferencex-db/queries/submissions';

import { cachedJson, cachedQuery } from '@/lib/cache/api-cache';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedSummary = cachedQuery(
  async () => mergeSubmissionSummaries(await readEachDb(getSubmissionSummary)),
  'submissions-summary',
);

const getCachedVolume = cachedQuery(
  async () => mergeSubmissionVolumes(await readEachDb(getSubmissionVolume)),
  'submissions-volume',
);

export async function GET(request: Request) {
  if (FIXTURES_MODE) return cachedJson(request, loadFixture('submissions'));
  try {
    const [summary, volume] = await Promise.all([getCachedSummary(), getCachedVolume()]);
    return cachedJson(request, { summary, volume });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
