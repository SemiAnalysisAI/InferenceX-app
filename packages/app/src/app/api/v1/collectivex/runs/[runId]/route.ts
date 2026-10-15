import { type NextRequest, NextResponse } from 'next/server';

import { parseCollectiveXVersion } from '@semianalysisai/inferencex-db/collectivex/types';

import { cachedJson } from '@/lib/cache/api-cache';
import { loadCollectiveXSnapshot } from '@/lib/collectivex/snapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RUN_ID = /^[1-9][0-9]*$/u;

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const version = parseCollectiveXVersion(request.nextUrl.searchParams.get('version') ?? '');
  if (!version || !RUN_ID.test(runId)) {
    return NextResponse.json({ error: 'Unknown version or run id' }, { status: 400 });
  }

  try {
    const snapshot = await loadCollectiveXSnapshot();
    if (snapshot === null) {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    const { dataset } = snapshot;
    if (dataset.version !== version || dataset.run.run_id !== runId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return cachedJson(dataset);
  } catch (error) {
    console.error('Error reading the CollectiveX snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
