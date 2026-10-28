import { rowToSequence } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@/lib/api/api';
import { cachedDerivedData } from '@/lib/cache/api-cache';
import { getCachedBenchmarks } from '@/lib/benchmarks/benchmark-data.server';
import { pickPairDefaults } from '@/lib/compare/compare-pair-defaults';
import {
  computeCompareTableData,
  dateRangeForPair,
  summarize,
  type PairSummary,
  type SsrInterpolatedRow,
} from '@/lib/compare/compare-ssr';

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
  initialPairBenchmarkRows: BenchmarkRow[];
}

/**
 * Rows embedded in the compare page HTML to seed the chart and table. Only the
 * page's default sequence is sent; the chart fetches the full model rows when
 * the reader switches to another sequence. A null sequence (no pair data)
 * keeps every row so the seed still covers whatever the client selects.
 */
export function initialCompareBenchmarkRows(
  pairRows: BenchmarkRow[],
  sequence: string | null,
): BenchmarkRow[] {
  if (!sequence) return pairRows;
  return pairRows.filter((row) => rowToSequence(row) === sequence);
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
