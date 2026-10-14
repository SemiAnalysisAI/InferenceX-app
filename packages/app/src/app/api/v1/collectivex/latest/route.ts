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
    if (snapshot.dataset.version !== version) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return cachedJson(snapshot.dataset);
  } catch (error) {
    console.error('Error reading the CollectiveX snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
