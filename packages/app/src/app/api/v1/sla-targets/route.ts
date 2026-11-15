import type { NextRequest } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { getSlaTargetsDataset } from '@/lib/sla-targets/dataset.server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/sla-targets?model=DeepSeek-V4-Pro
 *
 * Serving configurations of one model with their tested load points, for the
 * SLA Targets page. Points are evaluated against targets separately, by
 * `/api/v1/sla-evaluations`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    return cachedJson(
      request,
      await getSlaTargetsDataset(request.nextUrl.searchParams.get('model')),
    );
  } catch (error) {
    console.error('Error fetching SLA targets dataset:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
