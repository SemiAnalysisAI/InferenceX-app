import type { NextRequest } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import { getSlaPointEvaluations, getSlaTargetsDataset } from '@/lib/sla-targets/dataset.server';
import {
  buildSlaPublicView,
  parseSlaPublicTargets,
  resolveSlaSequence,
} from '@/lib/sla-targets/public-view';
import { slaEvaluationIds } from '@/lib/sla-targets/view';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import { validateParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/sla-targets
 *
 * The SLA Targets comparison as data: every serving configuration of one model
 * and workload evaluated against latency targets and a required attainment,
 * by the same function the page runs. Observed counts and metrics are returned
 * apart from the qualification status of each load point.
 *
 * Query params:
 * - model      — display model name; the dataset's first model when left out.
 * - sequence   — workload; the first one the model has when left out.
 * - ttft, tpot — maximum TTFT and TPOT, ms (defaults 1000 and 50).
 * - e2e        — maximum end-to-end latency, s; left out or `off` for none.
 * - attainment — required share of attempts within every target, percent (default 99).
 * - cost       — `hyperscaler` (default) or `rental` $/GPU-hour.
 *
 * Targets are evaluated exactly as given. A value that cannot be evaluated is
 * a 400, never rounded to a supported one.
 */
export function GET(request: NextRequest) {
  return runViewsRoute('sla-targets', async () => {
    const search = request.nextUrl.searchParams;
    validateParams(search, VIEW_QUERY_PARAMS['sla-targets']);
    const { targets, cost } = parseSlaPublicTargets(search);

    const requestedModel = search.get('model');
    const dataset = await getSlaTargetsDataset(requestedModel);
    if (requestedModel && dataset.model !== requestedModel) {
      throw new ViewsApiParamError('model', `Unknown model: ${requestedModel}`, dataset.models);
    }
    const sequence = resolveSlaSequence(dataset, search.get('sequence'));

    const ids = slaEvaluationIds(dataset.configs.filter((config) => config.workload === sequence));
    const evaluations = await getSlaPointEvaluations(ids, targets);
    return cachedJson(request, buildSlaPublicView(dataset, sequence, evaluations, targets, cost));
  });
}
