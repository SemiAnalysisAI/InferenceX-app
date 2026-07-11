import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  listConversations,
  type ConversationList,
  type ListConversationsOpts,
} from '@semianalysisai/inferencex-db/queries/datasets';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const SORTS = new Set(['tokens', 'turns', 'subagents', 'id']);

const getCachedConversations = cachedQuery(
  (
    slug: string,
    search: string,
    limit: number,
    offset: number,
    sort: string,
  ): Promise<ConversationList | null> => {
    const opts: ListConversationsOpts = {
      search: search || undefined,
      limit,
      offset,
      sort: sort as ListConversationsOpts['sort'],
    };

    return listConversations(getDb(), slug, opts);
  },
  'dataset-conversations',
);

// Maximum search string length accepted. Longer strings are rejected with 400
// rather than being forwarded to the DB: an ILIKE on an unindexed conv_id column
// with a very long pattern (or many stacked wildcards) can exhaust Neon's
// statement timeout and return a 500. 100 chars is generous for any real
// conversation-id prefix while keeping the attack surface small.
const MAX_SEARCH_LENGTH = 100;

/**
 * GET /api/v1/datasets/[slug]/conversations?search=&limit=&offset=&sort=
 * Paginated conversation list (counts only, no flamegraph structure).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sp = request.nextUrl.searchParams;
  const rawSearch = sp.get('search') ?? '';
  const search = rawSearch.trim();

  // Reject search strings that exceed the length cap before touching the DB.
  if (search.length > MAX_SEARCH_LENGTH) {
    return NextResponse.json({ error: 'search too long' }, { status: 400 });
  }

  const limit = Math.min(200, Math.max(1, Number(sp.get('limit')) || 50));
  const offset = Math.max(0, Number(sp.get('offset')) || 0);
  const sortParam = sp.get('sort') ?? 'tokens';
  const sort = SORTS.has(sortParam) ? sortParam : 'tokens';
  try {
    const data = await getCachedConversations(slug, search, limit, offset, sort);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching dataset conversations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
