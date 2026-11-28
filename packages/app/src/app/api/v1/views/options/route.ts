import type { NextRequest } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import { buildOptionsPayload } from '@/lib/views-api/options-view';
import { validateParams as validateViewParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/options
 *
 * Static discovery endpoint for the views API: every option domain the other
 * `/api/v1/views/*` endpoints accept. No database access, JSON only.
 */
export function GET(request: NextRequest) {
  return runViewsRoute('options', () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['options']);
    const format = request.nextUrl.searchParams.get('format');
    if (format !== null && format !== 'json') {
      throw new ViewsApiParamError('format', `Unsupported format: ${format}`, ['json']);
    }

    return Promise.resolve(
      cachedJson(request, {
        view: 'options',
        apiVersion: 'v1',
        params: { format: 'json' },
        ...buildOptionsPayload(),
      }),
    );
  });
}
