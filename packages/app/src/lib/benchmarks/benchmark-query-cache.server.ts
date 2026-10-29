import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getAllBenchmarksForHistory,
  getBenchmarksForRun,
  getLatestBenchmarks,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedQuery } from '@/lib/cache/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmarks/benchmark-api-view';

export const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[], date?: string, exact?: boolean, runId?: string) =>
    getLatestBenchmarks(getDb(), dbModelKeys, date, exact, runId),
  'benchmarks-agentic-curve-scope-v2',
  { blobOnly: true },
);

export const getCachedBenchmarksForRun = cachedQuery(
  (dbModelKeys: string[], runId: string) => getBenchmarksForRun(getDb(), dbModelKeys, runId),
  'benchmarks-run-agentic-curve-scope-v2',
  { blobOnly: true },
);

export const getCachedCalculatorBenchmarks = cachedQuery(
  async (dbModelKeys: string[], sequence: string, date?: string) =>
    toCalculatorBenchmarkRows(await getLatestBenchmarks(getDb(), dbModelKeys, date), sequence),
  'benchmarks-calculator-agentic-curve-scope-v2',
  { blobOnly: true },
);

export const getCachedBenchmarkHistory = cachedQuery(
  (modelKeys: string[], isl: number, osl: number) =>
    getAllBenchmarksForHistory(getDb(), modelKeys, isl, osl),
  'benchmark-history',
  { blobOnly: true },
);

export const getCachedAgenticBenchmarkHistory = cachedQuery(
  (modelKeys: string[]) =>
    getAllBenchmarksForHistory(getDb(), modelKeys, null, null, 'agentic_traces'),
  'benchmark-history-agentic-curve-scope-v2',
  { blobOnly: true },
);
