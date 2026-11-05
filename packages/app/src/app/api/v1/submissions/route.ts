import { NextResponse } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getSubmissionSummary,
  getSubmissionVolume,
} from '@semianalysisai/inferencex-db/queries/submissions';

import { withSupplementalSubmissions } from '@/lib/benchmarks/supplemental-benchmarks';
import { cachedJson, cachedQuery } from '@/lib/cache/api-cache';
import type { SubmissionsResponse } from '@/lib/submissions/submissions-types';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedSummary = cachedQuery(() => getSubmissionSummary(getDb()), 'submissions-summary');

const getCachedVolume = cachedQuery(() => getSubmissionVolume(getDb()), 'submissions-volume');

export async function GET(request: Request) {
  if (FIXTURES_MODE) {
    return cachedJson(
      request,
      withSupplementalSubmissions(loadFixture<SubmissionsResponse>('submissions')),
    );
  }
  try {
    const [summary, volume] = await Promise.all([getCachedSummary(), getCachedVolume()]);
    return cachedJson(request, withSupplementalSubmissions({ summary, volume }));
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
