import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getBenchmarkSiblings,
  type BenchmarkSiblings,
} from '@semianalysisai/inferencex-db/queries/benchmark-siblings';

import { cachedQuery } from '@/lib/api-cache';

import { idQueryRoute } from '../id-routes';

export const dynamic = 'force-dynamic';

const getCachedSiblings = cachedQuery(
  (id: number): Promise<BenchmarkSiblings | null> => getBenchmarkSiblings(getDb(), id),
  'benchmark-siblings',
);

/**
 * GET /api/v1/benchmark-siblings?id=N
 *
 * Returns the SKU (hw/framework/model/precision/spec/benchmark_type) of the
 * benchmark_result + all sibling rows that share that SKU within the same
 * workflow_run. Used by the agentic detail page to render a navigator.
 */
export const GET = idQueryRoute({
  logLabel: 'benchmark siblings',
  fetch: getCachedSiblings,
});
