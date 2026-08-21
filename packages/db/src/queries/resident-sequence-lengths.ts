import {
  mergeTokenLengthSketches,
  type TokenLengthSketch,
} from '@semianalysisai/inferencex-constants';

import type { DbClient } from '../connection.js';
import { fetchAggregateStatsRows, STATS_VERSION } from './agentic-shared';

interface StoredStats {
  version: number;
  sequenceLengths?: {
    isl: TokenLengthSketch | null;
    osl: TokenLengthSketch | null;
  };
}

export interface ResidentSequenceLengthSketches {
  isl: TokenLengthSketch | null;
  osl: TokenLengthSketch | null;
  /** Resident benchmark points represented by current-version sketches. */
  coveredPoints: number;
  requestedPoints: number;
}

/**
 * Merge the precomputed request-length sketches for a bounded set of chart
 * points. There is deliberately no raw-blob fallback here: a stale row is
 * omitted until the versioned backfill reaches it rather than making a chart
 * load decompress multi-megabyte request profiles.
 */
export async function getResidentSequenceLengthSketches(
  sql: DbClient,
  benchmarkResultIds: number[],
): Promise<ResidentSequenceLengthSketches> {
  if (benchmarkResultIds.length === 0) {
    return { isl: null, osl: null, coveredPoints: 0, requestedPoints: 0 };
  }

  const rows = await fetchAggregateStatsRows<StoredStats>(sql, benchmarkResultIds);
  const current = rows.filter(
    (row) =>
      row.stats?.version === STATS_VERSION &&
      Boolean(row.stats.sequenceLengths?.isl || row.stats.sequenceLengths?.osl),
  );

  return {
    isl: mergeTokenLengthSketches(current.map((row) => row.stats?.sequenceLengths?.isl)),
    osl: mergeTokenLengthSketches(current.map((row) => row.stats?.sequenceLengths?.osl)),
    coveredPoints: current.length,
    requestedPoints: benchmarkResultIds.length,
  };
}
