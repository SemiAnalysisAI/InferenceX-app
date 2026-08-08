import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson } from '@/lib/api-cache';
import {
  resolveOverviewComparisonMode,
  resolveOverviewEngineScope,
  resolveOverviewModelScope,
  resolveOverviewReferenceHardware,
  resolveOverviewTier,
} from '@/lib/overview-data';
import { getOverviewPageData } from '@/lib/overview-data.server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const data = await getOverviewPageData(
      resolveOverviewTier(params.get('tier') ?? undefined),
      resolveOverviewEngineScope(params.get('engine') ?? undefined),
      resolveOverviewComparisonMode(params.get('compare') ?? undefined),
      resolveOverviewReferenceHardware(params.get('ref') ?? undefined),
      resolveOverviewModelScope(params.get('models') ?? undefined),
    );
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching overview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
