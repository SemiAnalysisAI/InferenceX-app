import type { NextRequest } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getReliabilityStats,
  type ReliabilityRow,
} from '@semianalysisai/inferencex-db/queries/reliability';

import {
  aggregateByDateRange,
  DEFAULT_RELIABILITY_RANGE,
  RELIABILITY_RANGES,
} from '@/components/reliability/aggregate';
import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { getModelSortIndex } from '@/lib/constants';
import { hardwareLegendLabel } from '@/lib/views-api/legend';
import { loadFixture } from '@/lib/test-fixtures';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute } from '@/lib/views-api/errors';
import { parseEnumParam, parseFormatParam } from '@/lib/views-api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/reliability
 *
 * Aggregated benchmark-run success rates per hardware over a date-range
 * preset — the same numbers the `/reliability` dashboard chart renders,
 * computed by the shared `aggregateByDateRange` (components/reliability).
 *
 * Query params:
 * - range  — `last-3-days|last-7-days|last-month|last-3-months|all-time`
 *            (default `last-3-months`).
 * - format — `json` (default) or `csv` (one flat row per hardware).
 */

// Same cache key as /api/v1/reliability: both routes read the identical raw
// run_stats rows, so they intentionally share one cached payload.
const getCachedReliabilityRows = cachedQuery(() => getReliabilityStats(getDb()), 'reliability');

export function GET(request: NextRequest) {
  return runViewsRoute('reliability', async () => {
    const search = request.nextUrl.searchParams;
    const range = parseEnumParam(
      search.get('range'),
      'range',
      RELIABILITY_RANGES,
      DEFAULT_RELIABILITY_RANGE,
    );
    const format = parseFormatParam(search.get('format'));

    const rows = FIXTURES_MODE
      ? loadFixture<ReliabilityRow[]>('reliability')
      : await getCachedReliabilityRows();

    // Wall-clock cutoffs mirror the dashboard; the cache key covers only the
    // raw rows, so `now` never leaks into a cache key.
    const bucket = aggregateByDateRange(rows)[range] ?? {};
    const hardware = Object.entries(bucket)
      .map(([key, stats]) => ({
        key,
        label: hardwareLegendLabel(key),
        successRate: stats.rate,
        successes: stats.n_success,
        total: stats.total,
      }))
      .toSorted(
        (a, b) => getModelSortIndex(a.key) - getModelSortIndex(b.key) || a.key.localeCompare(b.key),
      );

    let firstDate: string | null = null;
    let lastDate: string | null = null;
    for (const row of rows) {
      if (firstDate === null || row.date < firstDate) firstDate = row.date;
      if (lastDate === null || row.date > lastDate) lastDate = row.date;
    }

    if (format === 'csv') {
      return csvResponse(hardware.map((row) => ({ range, ...row })));
    }

    return cachedJson({
      view: 'reliability',
      apiVersion: 'v1',
      params: { range, format },
      range,
      hardware,
      generatedFrom: { firstDate, lastDate },
    });
  });
}
