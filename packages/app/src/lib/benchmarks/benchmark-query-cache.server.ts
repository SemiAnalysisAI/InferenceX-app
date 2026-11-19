import { getReadDbs, getRunDb, readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import {
  getLatestBenchmarksAcross,
  mergeBenchmarkHistory,
} from '@semianalysisai/inferencex-db/queries/across-dbs';
import {
  type BenchmarkRow,
  getAllBenchmarksForHistory,
  getBenchmarksForRun,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedQuery } from '@/lib/cache/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmarks/benchmark-api-view';

const getCachedLatestBenchmarks = cachedQuery(
  async (dbModelKeys: string[], date: string | null, exact: boolean, runId: string | null) =>
    getLatestBenchmarksAcross(
      await getReadDbs(),
      dbModelKeys,
      date ?? undefined,
      exact || undefined,
      runId ?? undefined,
    ),
  'benchmarks-agentic-curve-scope-v2',
  { blobOnly: true },
);

export function getCachedBenchmarks(
  dbModelKeys: string[],
  date?: string,
  exact?: boolean,
  runId?: string,
): Promise<BenchmarkRow[]> {
  if (!date) return getCachedLatestBenchmarks(dbModelKeys, null, false, null);
  return getCachedLatestBenchmarks(
    dbModelKeys,
    date,
    exact === true,
    exact ? null : (runId ?? null),
  );
}

export const getCachedBenchmarksForRun = cachedQuery(
  async (dbModelKeys: string[], runId: string) =>
    getBenchmarksForRun(await getRunDb(Number(runId)), dbModelKeys, runId),
  'benchmarks-run-agentic-curve-scope-v2',
  { blobOnly: true },
);

export const getCachedCalculatorBenchmarks = cachedQuery(
  async (dbModelKeys: string[], sequence: string, date?: string) =>
    toCalculatorBenchmarkRows(await getCachedBenchmarks(dbModelKeys, date), sequence),
  'benchmarks-calculator-agentic-curve-scope-v2',
  { blobOnly: true },
);

export const getCachedBenchmarkHistory = cachedQuery(
  (modelKeys: string[], isl: number, osl: number) =>
    readEachDb((sql) => getAllBenchmarksForHistory(sql, modelKeys, isl, osl)).then(
      mergeBenchmarkHistory,
    ),
  'benchmark-history',
  { blobOnly: true },
);

export const getCachedAgenticBenchmarkHistory = cachedQuery(
  (modelKeys: string[]) =>
    readEachDb((sql) =>
      getAllBenchmarksForHistory(sql, modelKeys, null, null, 'agentic_traces'),
    ).then(mergeBenchmarkHistory),
  'benchmark-history-agentic-curve-scope-v2',
  { blobOnly: true },
);
