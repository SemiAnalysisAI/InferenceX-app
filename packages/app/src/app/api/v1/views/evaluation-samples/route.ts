import { NextResponse, type NextRequest } from 'next/server';
import { GET as stored } from '@/app/api/v1/eval-samples/route';
import { GET as live } from '@/app/api/v1/eval-samples-live/route';
import { filterEvalSamplePage } from '@/lib/eval-sample-search';
import type { EvalSamplesResponse } from '@/lib/api';
import { integerParam, requiredText } from '@/lib/views-api/detail-params';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import { parseBoolParam, parseEnumParam, validateParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse, sourceRequest } from '@/lib/views-api/source';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return runViewsRoute('evaluation-samples', async () => {
    const s = request.nextUrl.searchParams;
    validateParams(s, VIEW_QUERY_PARAMS['evaluation-samples']);
    const filter = parseEnumParam(s.get('filter'), 'filter', ['all', 'passed', 'failed'], 'all');
    const offset = integerParam(s, 'offset', 0);
    const limit = integerParam(s, 'limit', 50, 1, 500);
    const search = s.get('search')?.trim() ?? '';
    if (search.length > 512)
      throw new ViewsApiParamError('search', 'search is limited to 512 characters');
    if (s.has('evalResultId') === s.has('runId')) {
      throw new ViewsApiParamError('evalResultId', 'Select exactly one of evalResultId or runId');
    }
    const upstream: Record<string, string> = {
      filter,
      offset: String(offset),
      limit: String(limit),
    };
    const params: Record<string, unknown> = { filter, offset, limit, search };
    let response: Response;
    if (s.has('evalResultId')) {
      for (const key of [
        'task',
        'model',
        'framework',
        'hardware',
        'precision',
        'specMethod',
        'disagg',
        'concurrency',
      ]) {
        if (s.has(key)) throw new ViewsApiParamError(key, 'Live selectors require runId');
      }
      params.evalResultId = integerParam(s, 'evalResultId', undefined, 1);
      upstream.eval_result_id = String(params.evalResultId);
      if (s.has('docId')) {
        params.docId = integerParam(s, 'docId');
        upstream.doc_id = String(params.docId);
        params.filter = 'all';
      }
      response = await stored(sourceRequest(request, '/api/v1/eval-samples', upstream));
    } else {
      if (s.has('docId'))
        throw new ViewsApiParamError('docId', 'docId requires a stored evalResultId');
      params.runId = integerParam(s, 'runId', undefined, 1);
      upstream.run_id = String(params.runId);
      for (const key of ['task', 'model', 'framework', 'hardware', 'precision', 'specMethod']) {
        params[key] = requiredText(s, key);
        upstream[key === 'specMethod' ? 'spec_method' : key] = String(params[key]);
      }
      params.disagg = parseBoolParam(s.get('disagg'), 'disagg', false);
      upstream.disagg = String(params.disagg);
      params.concurrency = s.has('concurrency')
        ? integerParam(s, 'concurrency', undefined, 1)
        : null;
      if (params.concurrency !== null) upstream.conc = String(params.concurrency);
      response = await live(sourceRequest(request, '/api/v1/eval-samples-live', upstream));
    }
    const page = await readResponse<EvalSamplesResponse>(response);
    params.offset = page.offset ?? offset;
    return NextResponse.json(
      {
        view: 'evaluation-samples',
        apiVersion: 'v1',
        params,
        ...page,
        pageCount: page.samples.length,
        samples: filterEvalSamplePage(page.samples, search),
        searchScope: 'current-page',
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}
