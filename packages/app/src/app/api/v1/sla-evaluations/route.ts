import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { getSlaPointEvaluations, SLA_EVALUATION_MAX_IDS } from '@/lib/sla-targets/dataset.server';
import { parseSlaLatencyTargets } from '@/lib/sla-targets/evaluation';

import { parseIdsParam } from '../id-routes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/sla-evaluations?ids=1,2,3&ttft=1000&tpot=50&e2e=30
 *
 * Evaluates benchmark load points against latency targets on the server and
 * returns, per point, the attempt accounting and the counts of passing, not
 * passing and indeterminate attempts. Targets are used exactly as given:
 * `ttft` and `tpot` in milliseconds, `e2e` in seconds and optional. A target
 * that cannot be evaluated is a 400 with a message, never rounded.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const ids = parseIdsParam(request, SLA_EVALUATION_MAX_IDS);
  if (ids instanceof NextResponse) return ids;
  const parsed = parseSlaLatencyTargets(request.nextUrl.searchParams);
  if ('error' in parsed) return publicApiError(parsed.error, 400);
  try {
    return cachedJson(request, await getSlaPointEvaluations(ids, parsed.targets));
  } catch (error) {
    console.error('Error evaluating SLA targets:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
