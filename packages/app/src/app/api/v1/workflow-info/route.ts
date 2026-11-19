import type { NextRequest } from 'next/server';

import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import { mergeDistinctRows } from '@semianalysisai/inferencex-db/lib/distinct-by';
import { readEachDb } from '@semianalysisai/inferencex-db/lib/payload-db';

import { mergeWorkflowRuns } from '@semianalysisai/inferencex-db/queries/across-dbs';
import {
  getChangelogByDate,
  getDateConfigs,
  getRunConfigsByDate,
  getWorkflowRunsByDate,
} from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson, cachedQuery } from '@/lib/cache/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

async function loadWorkflowInfo(date: string, benchmarkType?: 'agentic_traces') {
  const parts = await readEachDb((sql) =>
    Promise.all([
      getWorkflowRunsByDate(sql, date),
      getChangelogByDate(sql, date),
      getDateConfigs(sql, date),
      benchmarkType
        ? getRunConfigsByDate(sql, date, benchmarkType)
        : getRunConfigsByDate(sql, date),
    ]),
  );
  return {
    runs: mergeWorkflowRuns(parts.map((part) => part[0])),
    changelogs: parts.flatMap((part) => part[1]),
    configs: mergeDistinctRows(parts.map((part) => part[2])),
    runConfigs: mergeDistinctRows(parts.map((part) => part[3])),
  };
}

// Scenario is an explicit cache dimension: fixed-sequence and Agentic Traces
// requests for the same date must never share a cached runConfigs payload.
const getCachedWorkflowInfo = cachedQuery(loadWorkflowInfo, 'workflow-info-v2');

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? '';
  const benchmarkType =
    request.nextUrl.searchParams.get('benchmarkType') === 'agentic_traces'
      ? 'agentic_traces'
      : undefined;
  // Every query casts date to SQL date, so a missing date is a client error, not a 500.
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return publicApiError(PUBLIC_API_ERRORS.invalidDate, 400);
  }
  if (FIXTURES_MODE) return cachedJson(request, loadFixture('workflow-info'));

  try {
    const data = await getCachedWorkflowInfo(date, benchmarkType);
    return cachedJson(request, data);
  } catch (error) {
    console.error('Error fetching workflow info:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
