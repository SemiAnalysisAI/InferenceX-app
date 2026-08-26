import type { NextRequest } from 'next/server';

import { DISPLAY_MODEL_TO_DB, islOslToSequence } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import { getAllBenchmarksForHistory } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmark-api-view';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/public-api-errors';
import { loadFixture } from '@/lib/test-fixtures';
import { agenticWorkflowMetadataOnly } from '@/lib/agentic-workflow-metadata';

export const dynamic = 'force-dynamic';

const getCachedBenchmarkHistory = cachedQuery(
  (modelKeys: string[], isl: number, osl: number) =>
    getAllBenchmarksForHistory(getDb(), modelKeys, isl, osl),
  'benchmark-history',
  { blobOnly: true },
);
const getCachedAgenticBenchmarkHistory = cachedQuery(
  (modelKeys: string[]) =>
    getAllBenchmarksForHistory(getDb(), modelKeys, null, null, 'agentic_traces'),
  'benchmark-history-agentic',
  { blobOnly: true },
);

/**
 * Trim a history response to the calculator's metric allowlist.
 *
 * Opt-in only. `CALCULATOR_METRIC_KEYS` excludes the measured-power metrics
 * (`measured_avg_power_w`, `joules_per_output_token`, …) that Historical Trends
 * plots, so applying this to every history response would silently blank those
 * charts. The sequence is derived from the route's own isl/osl rather than
 * taken as a parameter, so the two can never disagree.
 *
 * Agentic requests carry no isl/osl and so have no sequence to key on. Those
 * responses pass through untrimmed rather than guessing a sequence — the trim is
 * a payload optimisation, and the agentic payload is a fraction of a fixed one.
 * The calculator's lifecycle section consumes them either way.
 */
function applyCalculatorView<
  T extends {
    benchmark_type: string;
    isl: number | null;
    osl: number | null;
    metrics: Record<string, unknown>;
  },
>(rows: T[], isl: number | null, osl: number | null): T[] {
  if (isl === null || osl === null) return rows;
  const sequence = islOslToSequence(isl, osl);
  if (!sequence) return rows;
  return toCalculatorBenchmarkRows(rows, sequence);
}

export async function GET(request: NextRequest) {
  const model = request.nextUrl.searchParams.get('model') ?? '';
  const rawIsl = request.nextUrl.searchParams.get('isl');
  const rawOsl = request.nextUrl.searchParams.get('osl');
  const benchmarkType = request.nextUrl.searchParams.get('benchmarkType') ?? undefined;
  const isl = rawIsl === null ? null : Number(rawIsl);
  const osl = rawOsl === null ? null : Number(rawOsl);
  const isAgentic = benchmarkType === 'agentic_traces';
  const calculatorView = request.nextUrl.searchParams.get('view') === 'calculator';

  if (!model) {
    return publicApiError(PUBLIC_API_ERRORS.benchmarkHistoryParameters, 400);
  }
  if (!isAgentic && (!isl || !osl)) {
    return publicApiError(PUBLIC_API_ERRORS.benchmarkHistoryParameters, 400);
  }
  if (FIXTURES_MODE) {
    const fixture = loadFixture('benchmarks-history');
    return cachedJson(
      calculatorView && Array.isArray(fixture) ? applyCalculatorView(fixture, isl, osl) : fixture,
    );
  }

  try {
    const modelKeys = DISPLAY_MODEL_TO_DB[model];
    if (!modelKeys || modelKeys.length === 0) {
      return publicApiError(PUBLIC_API_ERRORS.unknownModel, 400);
    }
    const rows = isAgentic
      ? await getCachedAgenticBenchmarkHistory(modelKeys)
      : await getCachedBenchmarkHistory(modelKeys, isl!, osl!);
    // Both trims run after the cache, so every view shares one cached query.
    const trimmed = agenticWorkflowMetadataOnly(rows);
    return cachedJson(calculatorView ? applyCalculatorView(trimmed, isl, osl) : trimmed);
  } catch (error) {
    console.error('Error fetching benchmark history:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
