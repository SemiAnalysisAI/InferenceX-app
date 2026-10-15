import { type NextRequest, NextResponse } from 'next/server';

import { parseCollectiveXVersion } from '@semianalysisai/inferencex-db/collectivex/types';

import { cachedJson } from '@/lib/cache/api-cache';
import { loadCollectiveXSnapshot } from '@/lib/collectivex/snapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version) {
    return NextResponse.json({ error: 'Unknown version' }, { status: 400 });
  }

  try {
    const snapshot = await loadCollectiveXSnapshot();
    if (snapshot === null) {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    // A deployment serves one snapshot run, so the list is always complete.
    const runs = snapshot.dataset.version === version ? [snapshot.summary] : [];
    return cachedJson({ version, runs, discovery_complete: true });
  } catch (error) {
    console.error('Error reading the CollectiveX snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
