import type { NextRequest } from 'next/server';
import { getAgenticCatalogGroups } from '@/lib/agentic-catalog';
import { cachedJson } from '@/lib/api-cache';
import { runViewsRoute } from '@/lib/views-api/errors';
import { validateParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return runViewsRoute('agentx-catalog', async () => {
    validateParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['agentx-catalog']);
    const groups = await getAgenticCatalogGroups();
    return cachedJson({
      view: 'agentx-catalog',
      apiVersion: 'v1',
      params: {},
      groups,
      configCount: groups.reduce((n, group) => n + group.cards.length, 0),
      pointCount: groups.reduce((n, group) => n + group.totalPoints, 0),
    });
  });
}
