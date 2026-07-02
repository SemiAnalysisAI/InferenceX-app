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
  ): Promise<ConversationList | null> =>
    listConversations(getDb(), slug, {
      search: search || undefined,
      limit,
      offset,
      sort: sort as ListConversationsOpts['sort'],
    }),
  'dataset-conversations',
);

/**
 * GET /api/v1/datasets/[slug]/conversations?search=&limit=&offset=&sort=
 * Paginated conversation list (counts only, no flamegraph structure).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sp = request.nextUrl.searchParams;
  const search = sp.get('search') ?? '';
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
