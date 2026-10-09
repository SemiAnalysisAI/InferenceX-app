import { UBENCHX_RUNS } from '@/components/ubenchx/ubenchx-data';
import { transformUbenchxRun } from '@/components/ubenchx/ubenchx-transform';
import { cachedJson } from '@/lib/api-cache';
import { runViewsRoute } from '@/lib/views-api/errors';
import { parseEnumParam, validateParams as validateViewParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return runViewsRoute('ubenchx', () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS.ubenchx);
    const s = request.nextUrl.searchParams;
    const gpuKeys = Object.keys(UBENCHX_RUNS);
    const gpu = parseEnumParam(s.get('gpu'), 'gpu', ['all', ...gpuKeys], gpuKeys[0]);

    const results =
      gpu === 'all'
        ? Object.entries(UBENCHX_RUNS).map(([key, run]) => transformUbenchxRun(key, run))
        : [transformUbenchxRun(gpu, UBENCHX_RUNS[gpu])];

    return Promise.resolve(
      cachedJson({
        apiVersion: 'v1',
        view: 'ubenchx',
        params: { gpu },
        gpus: results,
      }),
    );
  });
}
