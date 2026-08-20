import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';

import { getServerLog, getServerLogChunk } from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedServerLog = cachedQuery((id: number) => getServerLog(getDb(), id), 'server-log', {
  blobOnly: true,
});
const getCachedServerLogChunk = cachedQuery(
  (id: number, offset: number, limit: number) => getServerLogChunk(getDb(), id, offset, limit),
  'server-log-chunk',
);

export const DEFAULT_SERVER_LOG_CHUNK_SIZE = 64 * 1024;
export const MAX_SERVER_LOG_CHUNK_SIZE = 256 * 1024;
const MAX_SERVER_LOG_OFFSET = 2_000_000_000;

function parseIntegerParam(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get('id'));

  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: 'id is required (benchmark_result_id)' }, { status: 400 });
  }

  try {
    const wantsChunk =
      request.nextUrl.searchParams.has('offset') || request.nextUrl.searchParams.has('limit');
    if (wantsChunk) {
      const offset = parseIntegerParam(
        request.nextUrl.searchParams.get('offset'),
        0,
        0,
        MAX_SERVER_LOG_OFFSET,
      );
      const limit = parseIntegerParam(
        request.nextUrl.searchParams.get('limit'),
        DEFAULT_SERVER_LOG_CHUNK_SIZE,
        1,
        MAX_SERVER_LOG_CHUNK_SIZE,
      );
      if (offset === null || limit === null) {
        return NextResponse.json(
          {
            error: `offset must be 0-${MAX_SERVER_LOG_OFFSET}; limit must be 1-${MAX_SERVER_LOG_CHUNK_SIZE}`,
          },
          { status: 400 },
        );
      }

      const chunk = await getCachedServerLogChunk(id, offset, limit);
      if (chunk === null) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return cachedJson({ id, ...chunk });
    }

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
