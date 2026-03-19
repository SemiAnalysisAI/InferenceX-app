import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getServerLog } from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedServerLog = cachedQuery(
  async (id: number) => {
    const sql = getDb();
    return getServerLog(sql, id);
  },
  'server-log',
  { blobOnly: true },
);

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get('id'));

  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: 'id is required (benchmark_result_id)' }, { status: 400 });
  }

  try {
    const serverLog = await getCachedServerLog(id);

    if (serverLog === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return cachedJson({ id, serverLog });
  } catch (error) {
    console.error('Error fetching server log:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
