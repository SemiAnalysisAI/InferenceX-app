import { type NextRequest, NextResponse } from 'next/server';

import { getCachedDataset } from '@/lib/agentx/dataset-detail.server';
import { cachedJson } from '@/lib/cache/api-cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/datasets/[slug] — one dataset incl. precomputed chart_data. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const data = await getCachedDataset(slug);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return cachedJson(request, data);
  } catch (error) {
    console.error('Error fetching dataset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
