import { type NextRequest, NextResponse } from 'next/server';

import { JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import { getEvalSamples } from '@semianalysisai/inferencex-db/queries/eval-samples';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { extractDemonstrations } from '@/lib/eval-sample-utils';

export const dynamic = 'force-dynamic';

const ALLOWED_FILTERS = new Set(['all', 'passed', 'failed']);
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const getCachedEvalSamples = cachedQuery(
  (evalResultId: number, filter: 'all' | 'passed' | 'failed', offset: number, limit: number) => {
    if (JSON_MODE) {
      // JSON dump mode has no eval_samples — return an empty result so the UI
      // renders cleanly when run against a static build.
      return Promise.resolve({ samples: [], total: 0, passedTotal: 0, failedTotal: 0 });
    }
    return getEvalSamples(getDb(), evalResultId, filter, offset, limit);
  },
  'eval-samples',
);

/**
 * GET /api/v1/eval-samples?eval_result_id=N&filter=all|passed|failed&offset=0&limit=200
 *
 * Returns a paginated slice of per-prompt samples for one `eval_results` row,
 * plus passed/failed totals for the filter-chip badges. Drawer use only —
 * agg metrics live on `/api/v1/evaluations`.
 *
 * For unofficial / un-ingested runs the live-fetch fallback (TODO) will be
 * added in a follow-up; this v1 covers the DB path only.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const evalResultId = Number(params.get('eval_result_id'));
  const filterParam = params.get('filter') ?? 'all';
  const offset = Math.max(0, Math.trunc(Number(params.get('offset') ?? '0')));
  const requestedLimit = Math.trunc(Number(params.get('limit') ?? String(DEFAULT_LIMIT)));
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit || DEFAULT_LIMIT));

  if (!evalResultId || !Number.isFinite(evalResultId) || evalResultId <= 0) {
    return NextResponse.json(
      { error: 'eval_result_id is required and must be a positive integer' },
      { status: 400 },
    );
  }
  if (!ALLOWED_FILTERS.has(filterParam)) {
    return NextResponse.json(
      { error: `filter must be one of: ${[...ALLOWED_FILTERS].join(', ')}` },
      { status: 400 },
    );
  }
  const filter = filterParam as 'all' | 'passed' | 'failed';

  try {
    const result = await getCachedEvalSamples(evalResultId, filter, offset, limit);

    return cachedJson({
      samples: result.samples.map((s) => ({
        docId: s.doc_id,
        prompt: s.prompt,
        target: s.target,
        response: s.response,
        rawResponse: s.raw_response,
        demonstrations: extractDemonstrations(s.arguments_data),
        passed: s.passed,
        score: s.score === null ? null : Number(s.score),
        metrics: s.metrics ?? {},
      })),
      total: result.total,
      passedTotal: result.passedTotal,
      failedTotal: result.failedTotal,
      source: 'db' as const,
    });
  } catch (error) {
    console.error('Error fetching eval samples:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
