import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import { searchServerLogs } from '@semianalysisai/inferencex-db/queries/server-logs';

import { cachedJson } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const DEFAULT_RESULT_LIMIT = 50;
const MAX_RESULT_LIMIT = 100;
const MAX_SEARCH_LENGTH = 256;

function parseLimit(value: string | null): number | null {
  if (value === null) return DEFAULT_RESULT_LIMIT;
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_RESULT_LIMIT ? parsed : null;
}

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: 'id is required (benchmark_result_id)' }, { status: 400 });
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length === 0 || query.length > MAX_SEARCH_LENGTH || query.includes('\u0000')) {
    return NextResponse.json(
      { error: `q must contain 1-${MAX_SEARCH_LENGTH} characters` },
      { status: 400 },
    );
  }

  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
  if (limit === null) {
    return NextResponse.json({ error: `limit must be 1-${MAX_RESULT_LIMIT}` }, { status: 400 });
  }

  try {
    return cachedJson({ id, query, ...(await searchServerLogs(getDb(), id, query, limit)) });
  } catch (error) {
    console.error('Error searching server logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
