import { getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getAllBenchmarksForHistory,
  getBenchmarksForRun,
  getLatestBenchmarks,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedQuery } from '@/lib/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmark-api-view';

/**
 * Cached raw-row reads shared by the page endpoints (`/api/v1/benchmarks`,
 * `/api/v1/benchmarks/history`) and the read-only views that project the same
 * rows (`/api/v1/views/{inference,calculator,historical,fleet}`).
 *
 * One declaration per query keeps every consumer on one cache slot: a view that
 * re-declared its own wrapper "with the same key" drifted the moment the page
 * endpoint rolled its key (`benchmark-history-agentic` vs
 * `benchmark-history-agentic-curve-scope-v2`) and silently doubled the cache.
 * Post-cache trims (`agenticWorkflowMetadataOnly`, power-validity filters,
 * calculator allowlists for run snapshots) stay in the callers.
 */

export const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[], date?: string, exact?: boolean, runId?: string) =>
    getLatestBenchmarks(getDb(), dbModelKeys, date, exact, runId),
  'benchmarks-agentic-curve-scope-v2',
  { blobOnly: true },
);

// One logical run snapshot (GPU comparison of individual same-day runs). For an
// append-only run this includes its same-image predecessor chain. Cached under a
// distinct key prefix so it never collides with the latest/as-of query.
export const getCachedBenchmarksForRun = cachedQuery(
  (dbModelKeys: string[], runId: string) => getBenchmarksForRun(getDb(), dbModelKeys, runId),
  'benchmarks-run-agentic-curve-scope-v2',
  { blobOnly: true },
);

/** Latest/as-of rows already trimmed to the calculator's metric allowlist. */
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
