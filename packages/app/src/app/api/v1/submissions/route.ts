import { NextResponse } from 'next/server';

import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getSubmissionSummary,
  getSubmissionVolume,
} from '@semianalysisai/inferencex-db/queries/submissions';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedSummary = cachedQuery(async () => {
  if (JSON_MODE) return [];
  return getSubmissionSummary(getDb());
}, 'submissions-summary');

const getCachedVolume = cachedQuery(async () => {
  if (JSON_MODE) return [];
  return getSubmissionVolume(getDb());
}, 'submissions-volume');

export async function GET() {
  try {
    const [summary, volume] = await Promise.all([getCachedSummary(), getCachedVolume()]);
    return cachedJson({ summary, volume });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
