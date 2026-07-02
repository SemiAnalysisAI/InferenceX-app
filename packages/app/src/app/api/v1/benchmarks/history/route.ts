import { type NextRequest } from 'next/server';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getAllBenchmarksForHistory } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson } from '@/lib/api-cache';
import { createCachedRoute } from '@/lib/create-cached-route';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const _handle = createCachedRoute(
  (modelKeys: string[], isl: number, osl: number) => {
    if (JSON_MODE)
      return Promise.resolve(jsonProvider.getAllBenchmarksForHistory(modelKeys, isl, osl));
    return getAllBenchmarksForHistory(getDb(), modelKeys, isl, osl);
  },
  'benchmark-history',
  {
    resource: 'benchmark history',
    cacheOptions: { blobOnly: true },
    parseParams: (request: NextRequest) => {
      const model = request.nextUrl.searchParams.get('model') ?? '';
      const isl = Number(request.nextUrl.searchParams.get('isl'));
      const osl = Number(request.nextUrl.searchParams.get('osl'));

      if (!model || !isl || !osl) {
        return { error: 'model, isl, and osl are required', status: 400 };
      }

      const modelKeys = DISPLAY_MODEL_TO_DB[model];
      if (!modelKeys || modelKeys.length === 0) {
        return { error: 'Unknown model', status: 400 };
      }

      return { args: [modelKeys, isl, osl] as [string[], number, number] };
    },
  },
);

export function GET(request: NextRequest): Promise<Response> {
  if (FIXTURES_MODE) return Promise.resolve(cachedJson(loadFixture('benchmarks-history')));
  return _handle(request);
}
