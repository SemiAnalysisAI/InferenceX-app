import { type NextRequest, NextResponse } from 'next/server';

import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import {
  getConversation,
  type ConversationDetail,
} from '@semianalysisai/inferencex-db/queries/datasets';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedConversation = cachedQuery(
  (slug: string, convId: string): Promise<ConversationDetail | null> => {
    if (JSON_MODE) return Promise.resolve(jsonProvider.getConversation(slug, convId));
    return getConversation(getDb(), slug, convId);
  },
  'dataset-conversation',
);

/** GET /api/v1/datasets/[slug]/conversations/[convId] — flamegraph structure. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; convId: string }> },
) {
  const { slug, convId } = await params;
  try {
    // App Router has already decoded the `[convId]` segment exactly once, so
    // `convId` is the raw conversation id. The client (useDatasetConversation)
    // encodeURIComponent-encodes it before the fetch; decoding again here would
    // over-decode and mis-key ids containing '%' / '/'. Decode exactly once.
    const data = await getCachedConversation(slug, convId);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching dataset conversation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
