import { type NextRequest, NextResponse } from 'next/server';

import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import { getEvalSamples } from '@semianalysisai/inferencex-db/queries/eval-samples';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { extractDemonstrations } from '@/lib/eval-sample-utils';
import { loadFixture } from '@/lib/test-fixtures';

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

  if (FIXTURES_MODE) {
    // The fixture is captured for filter='all'. Recompute the per-filter view
    // (samples + total) here so chip counts and the filter chip itself match
    // what the live route would return.
    const fx = loadFixture<{
      samples: {
        docId: number;
        prompt: string | null;
        target: string | null;
        response: string | null;
        rawResponse: string | null;
        demonstrations: { question: string; answer: string }[] | null;
        passed: boolean | null;
        score: number | null;
        metrics: Record<string, number>;
      }[];
      total: number;
      passedTotal: number;
      failedTotal: number;
      source: 'db' | 'github_artifact';
    }>('eval-samples');
    const filtered =
      filter === 'all'
        ? fx.samples
        : fx.samples.filter((s) => (filter === 'passed' ? s.passed === true : s.passed === false));
    const sliced = filtered.slice(offset, offset + limit);
    return cachedJson({
      samples: sliced,
      total: filter === 'all' ? fx.total : filter === 'passed' ? fx.passedTotal : fx.failedTotal,
      passedTotal: fx.passedTotal,
      failedTotal: fx.failedTotal,
      source: fx.source,
    });
  }

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
