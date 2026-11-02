import { type NextRequest, NextResponse } from 'next/server';

import { parseCollectiveXVersion } from '@semianalysisai/inferencex-db/collectivex/types';
import { FIXTURES_MODE, getCollectiveXWriteDb } from '@semianalysisai/inferencex-db/connection';
import { listCollectiveXChangelog } from '@semianalysisai/inferencex-db/queries/collectivex';

import { cachedJson, collectiveXCacheTag } from '@/lib/cache/api-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }
  if (FIXTURES_MODE) return cachedJson(request, { version, entries: [] });

  try {
    const entries = await listCollectiveXChangelog(getCollectiveXWriteDb(), version);
    return cachedJson(request, { version, entries }, { tag: collectiveXCacheTag() });
  } catch (error) {
    console.error('Error listing the CollectiveX changelog:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
