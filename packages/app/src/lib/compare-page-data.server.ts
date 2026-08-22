import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api';
import { cachedDerivedData } from '@/lib/api-cache';
import { getCachedBenchmarks } from '@/lib/benchmark-data.server';
import { pickPairDefaults } from '@/lib/compare-pair-defaults';
import {
  computeCompareTableData,
  dateRangeForPair,
  summarize,
  type PairSummary,
  type SsrInterpolatedRow,
} from '@/lib/compare-ssr';

export interface ComparePageDerivedData {
  sequence: string | null;
  precision: string | null;
  summaryA: PairSummary;
  summaryB: PairSummary;
  defaultTargets: number[];
  ssrRows: SsrInterpolatedRow[];
  interactivityRange: { min: number; max: number };
  oldest?: string;
  newest?: string;
  /** Full-shape rows limited to the fixed GPU pair for scoped chart hydration. */
  initialPairBenchmarkRows: BenchmarkRow[];
}

export function initialCompareBenchmarkRows(
  slugModel: string,
  effectiveModel: string,
  pairRows: BenchmarkRow[],
): BenchmarkRow[] | undefined {
  return effectiveModel === slugModel ? pairRows : undefined;
}

async function loadComparePairRows(
  dbModelKeys: string[],
  a: string,
  b: string,
): Promise<BenchmarkRow[]> {
  const rows = await getCachedBenchmarks(dbModelKeys);
  return rows.filter((row) => row.hardware === a || row.hardware === b);
}

const getCachedComparePairRows = cachedDerivedData(loadComparePairRows, 'compare-pair-rows-v1');

function buildComparePageDerivedData(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  requestedSequence: string | null,
  requestedPrecision: string | null,
  fallbackSequence: string | null,
): Omit<ComparePageDerivedData, 'initialPairBenchmarkRows'> {
  const defaults = pickPairDefaults(rows, a, b, fallbackSequence ?? undefined);
  const sequence = requestedSequence ?? defaults.sequence;
  const precision = requestedPrecision ?? defaults.precision;
  const { defaultTargets, ssrRows, interactivityRange } = computeCompareTableData(
    rows,
    a,
    b,
    sequence,
    precision,
  );
  const { oldest, newest } = dateRangeForPair(rows, a, b);

  return {
    sequence,
    precision,
    summaryA: summarize(rows, a),
    summaryB: summarize(rows, b),
    defaultTargets,
    ssrRows,
    interactivityRange,
    oldest,
    newest,
  };
}

/**
 * Assemble the compact server-owned comparison payload from one cached,
 * pair-filtered row set. Selector transforms stay pure and cheap per request;
 * caching them separately would either nest unstable_cache calls or duplicate
 * the full pair payload in every sequence/precision entry.
 */
export async function getComparePageDerivedData(
  dbModelKeys: readonly string[],
  a: string,
  b: string,
  requestedSequence?: string | null,
  requestedPrecision?: string | null,
  fallbackSequence?: string | null,
): Promise<ComparePageDerivedData> {
  const keys = [...dbModelKeys];
  const pairRowsLoader = FIXTURES_MODE ? loadComparePairRows : getCachedComparePairRows;
  const initialPairBenchmarkRows = await pairRowsLoader(keys, a, b);
  return {
    ...buildComparePageDerivedData(
      initialPairBenchmarkRows,
      a,
      b,
      requestedSequence ?? null,
      requestedPrecision ?? null,
      fallbackSequence ?? null,
    ),
    initialPairBenchmarkRows,
  };
}
